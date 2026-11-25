import importlib.util
from contextlib import closing, contextmanager
import os
from pathlib import Path
import sqlite3
import tarfile
import tempfile
import time
import unittest
import datetime as dt
import json
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('maintenance', Path(__file__).with_name('maintenance.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
# What production backs up, before the tests below put their own folders in its place.
DATABASES, ASSETS, WRITTEN_ONCE = dict(m.DATABASES), dict(m.ASSETS), set(m.WRITTEN_ONCE)

class SiteMoveChecks(unittest.TestCase):
    def test_a_new_host_is_a_move_but_www_and_https_are_not(self):
        self.assertEqual(m.moved_host('https://lawebs.co.il/alenu/', 'https://alenu.co.il/'), 'alenu.co.il')
        self.assertEqual(m.moved_host('https://dfusreuven.co.il/', 'https://www.dfusreuven.co.il/'), '')
        self.assertEqual(m.moved_host('http://alenu.co.il/', 'https://alenu.co.il/'), '')

    def test_traffic_on_an_unmonitored_domain_is_reported_once_it_is_real(self):
        with tempfile.TemporaryDirectory() as folder:
            log = Path(folder) / 'access.log'
            line = '1.2.3.4 - - [04/Nov/2026:21:00:00 +0200] "GET / HTTP/2.0" 200 1 "-" "x" "{}"\n'
            log.write_text('skipped partial line\n' + line.format('new-site.co.il') * 3 + line.format('www.owned.co.il') * 3 + line.format('rare.co.il') + line.replace('" 200 ', '" 410 ').format('retired.co.il') * 3 + line.replace('" 200 ', '" 301 ').format('retired.co.il') * 3)
            self.assertEqual(m.unowned_hosts({'owned.co.il'}, log, 3), ['No monitored site owns new-site.co.il (3 recent requests)'])

    def test_a_named_gift_is_not_a_site_of_its_own(self):
        with tempfile.TemporaryDirectory() as folder:
            log = Path(folder) / 'access.log'
            line = '1.2.3.4 - - [24/Nov/2026:21:00:00 +0200] "GET / HTTP/2.0" 200 1 "-" "x" "{}"\n'
            log.write_text('skipped partial line\n' + ''.join(line.format(host) for host in
                           ('noa.bestpresent.co.il', 'bestpresent.co.il', 'notbestpresent.co.il', 'monitor.vee-app.co.il')))
            self.assertEqual(m.unowned_hosts({'bestpresent.co.il'}, log, 1), ['No monitored site owns notbestpresent.co.il (1 recent requests)'])
            # The domain itself still needs an owner in the catalog.
            self.assertEqual(len(m.unowned_hosts(set(), log, 1)), 2)

class Backups(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        m.STATE = self.root / 'state'
        m.BACKUPS = m.STATE / 'backups'
        m.BACKUPS.mkdir(parents=True)
        m.ASSETS = {}
        self.key_patches = [patch.object(m, 'AUTH_KEY', self.root / 'auth.key'), patch.object(m, 'AUTH_KEY_BACKUP', self.root / 'keys/auth.key')]
        for item in self.key_patches: item.start()

    def tearDown(self):
        for item in self.key_patches: item.stop()
        self.temp.cleanup()

    def test_authentication_key_is_verified_separately_from_database_manifest(self):
        m.DATABASES = {}
        m.AUTH_KEY.write_bytes(b'x' * 32)
        saved = Path(m.snapshot())
        self.assertEqual(m.AUTH_KEY_BACKUP.read_bytes(), b'x' * 32)
        self.assertEqual(m.AUTH_KEY_BACKUP.stat().st_mode & 0o777, 0o600)
        self.assertNotIn('auth.key', json.loads((saved / 'manifest.json').read_text()))

    def test_live_wal_data_restores(self):
        source = self.root / 'source.sqlite'
        db = sqlite3.connect(source)
        try:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('CREATE TABLE important(value TEXT)')
            db.execute("INSERT INTO important VALUES ('committed WAL data')")
            db.commit()
            m.DATABASES = {'test': str(source)}
            saved = Path(m.snapshot())
            with sqlite3.connect(saved / 'test.sqlite') as restored:
                self.assertEqual(restored.execute('SELECT value FROM important').fetchone(), ('committed WAL data',))
            self.assertTrue((saved / 'manifest.json').is_file())
        finally:
            db.close()

    def test_monitor_database_is_stored_compressed_and_restores(self):
        import gzip
        source = self.root / 'monitor.db'
        with closing(sqlite3.connect(source)) as db:
            db.execute('CREATE TABLE vault(value TEXT)')
            db.execute("INSERT INTO vault VALUES ('encrypted entry')")
            db.commit()
        m.DATABASES = {'server-monitor': str(source)}
        saved = Path(m.snapshot())
        manifest = json.loads((saved / 'manifest.json').read_text())
        self.assertEqual(list(manifest), ['server-monitor.sqlite.gz'])
        self.assertFalse((saved / 'server-monitor.sqlite').exists())
        restored = self.root / 'restored.sqlite'
        restored.write_bytes(gzip.decompress((saved / 'server-monitor.sqlite.gz').read_bytes()))
        with closing(sqlite3.connect(restored)) as db:
            self.assertEqual(db.execute('SELECT value FROM vault').fetchone(), ('encrypted entry',))

    def test_failed_compression_keeps_nothing_partial(self):
        source = self.root / 'snapshot.sqlite'
        source.write_bytes(b'data')
        with patch.object(m, 'sha256', return_value='mismatch'), self.assertRaises(RuntimeError):
            m.compress_verified(source)
        self.assertTrue(source.exists())
        self.assertFalse(source.with_name('snapshot.sqlite.gz').exists())

    def test_failed_backup_does_not_publish_or_prune(self):
        old = m.BACKUPS / '20200101T000000Z'
        old.mkdir()
        (old / 'manifest.json').write_text('{}')
        m.DATABASES = {'missing': str(self.root / 'missing.sqlite')}
        with self.assertRaises(RuntimeError):
            m.snapshot()
        self.assertTrue(old.is_dir())
        self.assertFalse((m.STATE / 'backup-status.json').exists())
        self.assertEqual(list(m.BACKUPS.iterdir()), [old])

    def test_dfus_archive_restores_files_with_separate_verified_supplier_snapshot(self):
        import tarfile
        store = self.root / 'store'
        store.mkdir()
        (store / 'store.json').write_text('{"orders":[],"contacts":[]}')
        (store / 'prices.json').write_text('{"version":1}')
        (store / 'uploads').mkdir()
        (store / 'uploads' / 'design.txt').write_text('customer design')
        source = store / 'suppliers.db'
        db = sqlite3.connect(source)
        try:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('CREATE TABLE suppliers(id INTEGER)')
            db.execute('INSERT INTO suppliers VALUES (7)')
            db.commit()
            m.DATABASES = {'dfus-suppliers': str(source)}
            m.ASSETS = {'dfus-store': store}
            saved = Path(m.snapshot())
            with tarfile.open(saved / 'dfus-store.tar.gz') as archive:
                names = archive.getnames()
                self.assertIn('./store.json', names)
                self.assertIn('./uploads/design.txt', names)
                self.assertFalse(any('suppliers.db' in name for name in names))
            with sqlite3.connect(saved / 'dfus-suppliers.sqlite') as restored:
                self.assertEqual(restored.execute('SELECT id FROM suppliers').fetchone(), (7,))
        finally:
            db.close()

    def test_retention_preserves_recent_and_unacknowledged(self):
        now = dt.datetime.now(dt.timezone.utc)
        folders = {}
        for age in range(32):
            name = (now - dt.timedelta(days=age)).strftime('%Y%m%dT%H%M%SZ')
            p = m.BACKUPS / name
            p.mkdir()
            (p / 'manifest.json').write_text('{}')
            folders[age] = p
        ack = m.STATE / 'pc-acknowledgements'
        ack.mkdir()
        (ack / (folders[10].name + '.json')).write_text(json.dumps({'manifest_sha256': m.sha256(folders[10] / 'manifest.json')}))
        m.prune_snapshots()
        self.assertTrue(folders[0].exists())
        self.assertTrue(folders[6].exists())
        self.assertTrue(folders[12].exists())
        self.assertFalse(folders[10].exists())
        self.assertFalse(folders[31].exists())

    def test_bestpresent_database_and_pictures_are_in_the_snapshot(self):
        self.assertEqual(DATABASES['bestpresent'], '/var/lib/bestpresent/bestpresent.db')
        self.assertEqual(ASSETS['bestpresent-uploads'], Path('/var/lib/bestpresent/uploads'))
        # Like every other app's: a path that is not there is an error, never a snapshot without it.
        m.DATABASES, m.ASSETS = {}, {'bestpresent-uploads': self.root / 'missing'}
        with self.assertRaisesRegex(RuntimeError, 'Missing required assets'):
            m.snapshot()
        self.assertEqual(list(m.BACKUPS.iterdir()), [])

    def test_one_changed_bit_in_a_picture_fails_the_snapshot(self):
        pictures = self.root / 'pictures'
        pictures.mkdir()
        # Random as a real picture is, so gzip stores it as it is; and the archive is 5 MiB to the byte, so reading up to
        # tar's end marker does not happen to meet the end of the gzip stream as well.
        (pictures / 'photo.webp').write_bytes(os.urandom(5 * 1024**2 - 2048))
        m.DATABASES, m.ASSETS = {}, {'pictures': pictures}
        def flip(share):
            return lambda data: data[:int(len(data) * share)] + bytes([data[int(len(data) * share)] ^ 4]) + data[int(len(data) * share) + 1:]
        real = m.archive_folder
        # The last two are gzip's own checksum, after the end of tar's data: wrong, and cut off.
        for spoil in (flip(.1), flip(.5), flip(.9), lambda data: data[:-8] + bytes([data[-8] ^ 1]) + data[-7:], lambda data: data[:-8]):
            def spoiled(source, dest, *rest):
                real(source, dest, *rest)
                dest.write_bytes(spoil(dest.read_bytes()))
                return []
            with patch.object(m, 'archive_folder', spoiled), self.assertRaisesRegex(RuntimeError, 'Backup archive damaged: pictures.tar.gz'):
                m.snapshot()
            self.assertEqual(list(m.BACKUPS.iterdir()), [])
        self.assertTrue(Path(m.snapshot()).is_dir())

    def test_a_damaged_database_fails_the_snapshot(self):
        source = self.root / 'gifts.sqlite'
        with closing(sqlite3.connect(source)) as db:
            db.execute('CREATE TABLE gifts(name TEXT)')
            db.execute('CREATE INDEX names ON gifts(name)')
            db.executemany('INSERT INTO gifts VALUES (?)', [(f'gift {n}',) for n in range(50)])
            db.commit()
            page = db.execute("SELECT rootpage FROM sqlite_master WHERE name = 'names'").fetchone()[0]
            size = db.execute('PRAGMA page_size').fetchone()[0]
        data = bytearray(source.read_bytes())
        data[page * size - 100:page * size] = bytes(100)
        source.write_bytes(data)
        m.DATABASES = {'gifts': str(source)}
        # SQLite answers the check with a list of faults, or not at all.
        with self.assertRaisesRegex((RuntimeError, sqlite3.DatabaseError), 'Backup integrity failure: gifts|malformed'):
            m.snapshot()
        self.assertEqual(list(m.BACKUPS.iterdir()), [])

    def test_a_copy_that_would_fill_the_disk_is_refused(self):
        from types import SimpleNamespace
        source, folder = self.root / 'a.sqlite', self.root / 'uploads/gift'
        with closing(sqlite3.connect(source)) as db:
            db.execute('CREATE TABLE a(b)')
            db.commit()
        folder.mkdir(parents=True)
        (folder / 'photo.webp').write_bytes(b'x' * 3000000)
        m.DATABASES, m.ASSETS = {'a': str(source)}, {'uploads': folder.parent}
        needed = source.stat().st_size + 3000000
        self.assertEqual(m.source_bytes(), needed)
        wal = self.root / 'a.sqlite-wal'
        wal.write_bytes(b'x' * 1000)
        self.assertEqual(m.source_bytes(), needed + 1000)
        wal.unlink()
        with patch.object(m.shutil, 'disk_usage', return_value=SimpleNamespace(free=m.FREE_FLOOR + needed - 1)):
            with self.assertRaisesRegex(RuntimeError, r'Less than 514 MiB free \(2 MiB to copy\); backup refused'):
                m.snapshot()
        self.assertEqual(list(m.BACKUPS.iterdir()), [])
        with patch.object(m.shutil, 'disk_usage', return_value=SimpleNamespace(free=m.FREE_FLOOR + needed)):
            self.assertTrue(Path(m.snapshot()).is_dir())

    def test_the_daily_run_and_the_health_check_name_a_folder_that_never_rested(self):
        def snapshot(changed):
            m.write_json(m.STATE / 'backup-status.json', {'completed': time.time(), 'path': 'x', 'files': {}, 'changed_while_copied': changed})
            return 'x'
        quiet = {'cleanup': lambda *a, **k: {'errors': [], 'files': []}, 'housekeeping': lambda: [], 'updates_status': lambda: {},
                 'dedupe_release_dependencies': lambda: [], 'run': lambda *a, **k: '', 'write_summary': lambda result: None}
        for changed, warnings in (({'bestpresent-uploads': 2, 'koral-uploads': 1}, ['Newest backup was copied while these changed: bestpresent-uploads, koral-uploads']), ({}, [])):
            with patch.multiple(m, **quiet, snapshot=lambda: snapshot(changed)):
                m.daily()
            self.assertEqual(json.loads((m.STATE / 'daily-status.json').read_text())['changed_while_copied'], changed)
            self.assertEqual(m.backup_health(), ([], warnings))
        self.assertEqual(m.backup_health(time.time() + 37 * 3600)[0], ['Last successful backup is older than 36 hours'])
        (m.STATE / 'backup-status.json').unlink()
        self.assertEqual(m.backup_health()[0], ['No successful verified backup recorded'])

    def test_snapshots_over_their_budget_are_a_warning(self):
        m.write_json(m.STATE / 'backup-status.json', {'completed': time.time()})
        self.assertEqual(m.backup_health(), ([], []))
        (m.BACKUPS / '20261101T000000Z').mkdir()
        (m.BACKUPS / '20261101T000000Z/manifest.json').write_text('{}')
        m.prune_snapshots()
        self.assertEqual(m.backup_health(), ([], []))
        with patch.object(m, 'BACKUP_BUDGET', 1):
            m.prune_snapshots()
        self.assertEqual(m.backup_health(), ([], ['Backups take 0.0 GiB, over their budget of 2 GiB']))


class LiveFolders(unittest.TestCase):
    """The real GNU tar, and a folder that changes at a set moment: tar's own checkpoint runs a script while it reads."""
    HOOK = "--sort=name --checkpoint=1 '--checkpoint-action=exec=. \"$LIVE_CHANGE\"'"
    # Once in each run of tar: a picture still being written, one deleted, a whole gift deleted, a new one uploaded.
    BUSY = '''if [ "$(cat "$LIVE.seen" 2>/dev/null)" != "$PPID" ]; then
        echo "$PPID" > "$LIVE.seen"
        echo more >> "$LIVE/a.webp"
        set -- "$LIVE"/b-*.webp; rm -f "$1"
        set -- "$LIVE"/gift-*; rm -rf "$1"
        echo new > "$LIVE/new-$PPID.webp"
    fi'''
    # Once in each run: a file cut short in the middle of it, and long again before the next run.
    CUT = '''if [ "$(cat "$LIVE.seen" 2>/dev/null)" != "$PPID" ]; then
        echo "$PPID" > "$LIVE.seen"; echo run >> "$LIVE.runs"; : > "$LIVE/a.webp"
    else head -c 60000 /dev/zero > "$LIVE/a.webp"; fi'''

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.live, self.quiet = self.root / 'live', self.root / 'quiet'
        for name in ('gift-1', 'gift-2', 'kept'):
            (self.live / name).mkdir(parents=True)
            (self.live / name / 'photo.webp').write_bytes(name.encode() * 5000)
        (self.live / 'a.webp').write_bytes(b'x' * 60000)  # long enough to be caught in the middle of it
        for name in ('b-1.webp', 'b-2.webp'):
            (self.live / name).write_bytes(b'picture')
        self.quiet.mkdir()
        (self.quiet / 'orders.json').write_text('{"orders":[1]}')
        state = self.root / 'state'
        (state / 'backups').mkdir(parents=True)
        values = {'STATE': state, 'BACKUPS': state / 'backups', 'DATABASES': {}, 'ASSETS': {'live': self.live, 'quiet': self.quiet}, 'WRITTEN_ONCE': {'live'},
                  'AUTH_KEY': self.root / 'auth.key', 'AUTH_KEY_BACKUP': self.root / 'keys/auth.key'}
        self.patches = [patch.object(m, name, value) for name, value in values.items()]
        for item in self.patches: item.start()
        # The pauses between two runs of tar are whole seconds; on Linux subprocess naps by fractions while it waits.
        self.pauses = []
        nap = m.time.sleep
        self.patches.append(patch.object(m.time, 'sleep', lambda pause: self.pauses.append(pause) if isinstance(pause, int) else nap(pause)))
        self.patches[-1].start()

    def tearDown(self):
        for item in self.patches: item.stop()
        self.temp.cleanup()

    @contextmanager
    def during(self, script):
        path = self.root / 'change.sh'
        path.write_text(script + '\n', newline='\n')
        with patch.dict(os.environ, {'TAR_OPTIONS': self.HOOK, 'LIVE': self.live.as_posix(), 'LIVE_CHANGE': path.as_posix()}):
            yield

    def files(self, path):
        with tarfile.open(path) as archive:
            return {member.name: archive.extractfile(member).read() for member in archive if member.isfile()}

    def status(self):
        return json.loads((m.STATE / 'backup-status.json').read_text())

    def test_a_folder_that_never_rests_does_not_cost_the_snapshot(self):
        with self.during(self.BUSY):
            saved = Path(m.snapshot())
        # The record travels with the snapshot: it is hashed in the manifest, so the PC copies it too.
        self.assertEqual(set(json.loads((saved / 'manifest.json').read_text())), {'live.tar.gz', 'quiet.tar.gz', 'changed-while-copied.json'})
        record = json.loads((saved / 'changed-while-copied.json').read_text())
        self.assertEqual(list(record), ['live.tar.gz'])
        self.assertIn('tar: ./a.webp: file changed as we read it', record['live.tar.gz'])
        files = self.files(saved / 'live.tar.gz')
        self.assertEqual(files['./kept/photo.webp'], b'kept' * 5000)
        self.assertEqual(files['./a.webp'][:60000], b'x' * 60000)
        # Both runs met changes, so both pictures and both gifts are gone; the count says which folder it was.
        self.assertFalse([name for name in files if name.startswith(('./b-', './gift-'))])
        self.assertEqual(self.status()['changed_while_copied'], {'live': len(record['live.tar.gz'])})
        self.assertGreaterEqual(len(record['live.tar.gz']), 3)
        self.assertEqual(self.files(saved / 'quiet.tar.gz'), {'./orders.json': b'{"orders":[1]}'})

    def test_a_folder_that_settles_is_archived_again_whole(self):
        with self.during('if [ ! -e "$LIVE.seen" ]; then echo 1 > "$LIVE.seen"; echo more >> "$LIVE/a.webp"; echo new > "$LIVE/new.webp"; fi'):
            saved = Path(m.snapshot())
        files = self.files(saved / 'live.tar.gz')
        self.assertEqual(files['./a.webp'], b'x' * 60000 + b'more\n')
        self.assertEqual(files['./new.webp'], b'new\n')
        self.assertEqual(self.status()['changed_while_copied'], {})
        self.assertFalse((saved / 'changed-while-copied.json').exists())

    def test_a_store_that_is_rewritten_in_place_is_kept_only_from_a_quiet_moment(self):
        m.ASSETS = {'store': self.live}
        with self.during(self.BUSY), self.assertRaisesRegex(RuntimeError, r'(?s)tar failed \(1\).*file changed as we read it'):
            m.snapshot()
        self.assertEqual(list(m.BACKUPS.iterdir()), [])
        self.assertEqual(self.pauses, [0, 2, 20])
        # Two runs met a write and the third did not.
        self.pauses.clear()
        twice = 'grep -qx "$PPID" "$LIVE.n" 2>/dev/null || echo "$PPID" >> "$LIVE.n"; [ "$(wc -l < "$LIVE.n")" -gt 2 ] || echo more >> "$LIVE/a.webp"'
        with self.during(twice):
            saved = Path(m.snapshot())
        self.assertEqual(self.pauses, [0, 2, 20])
        self.assertEqual(self.files(saved / 'store.tar.gz')['./a.webp'], (self.live / 'a.webp').read_bytes())
        self.assertEqual(self.status()['changed_while_copied'], {})

    def test_the_folders_whose_files_are_written_once(self):
        # A name put here accepts copies of a folder that was changing: its app must never write a file over.
        self.assertEqual(WRITTEN_ONCE, {'koral-uploads', 'koral2-uploads', 'yomuledet-uploads', 'bestpresent-uploads'})
        self.assertLessEqual(WRITTEN_ONCE, set(ASSETS))

    def test_a_damaged_copy_fails_the_snapshot(self):
        # A file cut short while tar reads it is also exit status 1, and is filled up with zeros.
        with self.during(self.CUT), self.assertRaisesRegex(RuntimeError, r'(?s)tar failed \(1\).*File shrank'):
            m.snapshot()
        self.assertEqual((self.root / 'live.runs').read_text().split(), ['run'] * 3)
        self.assertEqual(list(m.BACKUPS.iterdir()), [])
        self.assertFalse((m.STATE / 'backup-status.json').exists())

    def test_a_copy_damaged_once_is_made_again(self):
        with self.during('[ -e "$LIVE.seen" ] || { echo 1 > "$LIVE.seen"; : > "$LIVE/a.webp"; }'):
            saved = Path(m.snapshot())
        self.assertEqual(self.files(saved / 'live.tar.gz')['./a.webp'], b'')
        self.assertEqual(self.files(saved / 'live.tar.gz')['./kept/photo.webp'], b'kept' * 5000)
        self.assertEqual(self.status()['changed_while_copied'], {})

    def test_any_other_complaint_fails_even_beside_a_change(self):
        dest = self.root / 'x.tar.gz'
        with self.during(self.BUSY), self.assertRaisesRegex(RuntimeError, r'(?s)tar failed \(2\).*Cannot stat.*file changed as we read it'):
            m.archive_folder(self.live, dest, ['--add-file=./absent'], True)
        self.assertEqual(self.pauses, [0])
        for source, dest in ((self.root / 'absent', dest), (self.live, self.root / 'absent/x.tar.gz')):
            with self.assertRaisesRegex(RuntimeError, 'tar failed'):
                m.archive_folder(source, dest)

    def test_the_complaint_must_be_the_whole_line(self):
        for line in ('tar: ./a.webp: file changed as we read it', 'tar: ./gift: File removed before we read it', 'tar: .: file changed as we read it'):
            self.assertTrue(m.FOLDER_IN_USE.fullmatch(line), line)
        for line in ('tar: ./a: file changed as we read it: Cannot open: Permission denied', 'tar: ./a: File shrank by 5 bytes; padding with zeros',
                     'tar: ./a: Cannot stat: No such file or directory', 'gzip: stdout: No space left on device', 'tar: Exiting with failure status due to previous errors'):
            self.assertFalse(m.FOLDER_IN_USE.fullmatch(line), line)


class Updates(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        m.STATE = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def test_security_updates_keep_their_first_seen_time_until_installed(self):
        def listing(security):
            lines = ['Inst vim [9.1] (9.1.1 Ubuntu:24.04/noble-updates [amd64])', 'Conf vim']
            if security:
                lines.insert(0, 'Inst libc6 [2.39] (2.39.1 Ubuntu:24.04/noble-security [amd64])')
            return lambda: '\n'.join(lines)
        first = m.updates_status(listing(True), now=1000)
        self.assertEqual((first['pending'], first['security'], first['security_since']), (2, 1, 1000))
        later = m.updates_status(listing(True), now=90000)
        self.assertEqual(later['security_since'], 1000)
        cleared = m.updates_status(listing(False), now=180000)
        self.assertEqual((cleared['pending'], cleared['security'], cleared['security_since']), (1, 0, None))

class Cleanup(unittest.TestCase):
    def setUp(self):
        from unittest.mock import patch
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.base = self.root / 'app'
        (self.base / 'releases').mkdir(parents=True)
        (self.base / 'incoming').mkdir()
        self.patches = [patch.object(m, 'RELEASE_BASES', [self.base]), patch.object(m, 'BUILD_ROOTS', []),
                        patch.object(m, 'NPX_ROOT', self.root / 'npx'), patch.object(m, 'process_paths', lambda: set()),
                        patch.object(m, 'RETENTION_GROUPS', []), patch.object(m, 'LIVE_COPY_ROOTS', []),
                        patch.object(m, 'LEGACY_BACKUP_ROOT', self.root / 'legacy')]
        for item in self.patches: item.start()

    def tearDown(self):
        for item in self.patches: item.stop()
        self.temp.cleanup()

    def versions(self):
        import os, time
        versions = []
        for i in range(6):
            version = self.base / 'releases' / (str(i) * 40)
            version.mkdir()
            (version / 'code').write_text('keep or delete')
            os.utime(version, (time.time() - (i + 2) * 86400,) * 2)
            versions.append(version)
        (self.base / 'current').symlink_to(versions[-1], target_is_directory=True)
        return versions

    def test_preserves_live_latest_three_and_running_release(self):
        from unittest.mock import patch
        versions = self.versions()
        with patch.object(m, 'process_paths', lambda: {versions[4]}):
            plan = m.cleanup(False)
            self.assertEqual([x['path'] for x in plan['files']], [str(versions[3])])
            self.assertTrue(versions[3].exists())
            result = m.cleanup(True)
        self.assertFalse(result['errors'])
        self.assertFalse(versions[3].exists())
        for i in [0,1,2,4,5]: self.assertTrue(versions[i].exists())

    def test_symlink_escape_is_never_removed(self):
        outside = self.root / 'important'
        outside.mkdir()
        link = self.base / 'alias'
        link.symlink_to(outside, target_is_directory=True)
        with self.assertRaises(RuntimeError): m.remove_candidate(link, self.base, True)
        self.assertTrue(outside.exists())

    def test_pre_backup_cleanup_keeps_releases_and_image_cache(self):
        versions = self.versions()
        cache = versions[3] / '.next/cache'
        (cache / 'webpack').mkdir(parents=True)
        (cache / 'images').mkdir()
        (cache / 'webpack/data').write_text('build cache')
        (cache / 'images/data').write_text('runtime image')
        result = m.cleanup(True, releases=False)
        self.assertFalse(result['errors'])
        self.assertTrue(versions[3].exists())
        self.assertTrue((cache / 'images/data').exists())
        self.assertFalse((cache / 'webpack').exists())

    def test_cache_cleanup_runs_before_failed_backup_and_no_release_pruning(self):
        from unittest.mock import patch
        calls = []
        def cleanup(apply, releases):
            calls.append(('cleanup', releases))
            return {'errors': []}
        with patch.object(m, 'cleanup', cleanup), patch.object(m, 'housekeeping', lambda: []), patch.object(m, 'snapshot', side_effect=RuntimeError('full')):
            with self.assertRaises(RuntimeError): m.daily()
        self.assertEqual(calls, [('cleanup', False)])

class DeploymentRetention(unittest.TestCase):
    def test_keep_three_and_protect_running_dependencies_and_unknown_names(self):
        import os, time
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            copies = []
            for i in range(6):
                copy = root / f'Seder.previous-20261004-11000{5-i}-abcdef12'
                (copy / 'node_modules').mkdir(parents=True)
                (copy / 'file').write_text('deployment')
                os.utime(copy, (time.time() - (i+2)*86400,) * 2)
                copies.append(copy)
            live = root / 'Seder'
            live.mkdir()
            (live / 'node_modules').symlink_to(copies[4] / 'node_modules', target_is_directory=True)
            unknown = root / 'Seder.previous-important-data'
            unknown.mkdir()
            with patch.object(m, 'RETENTION_GROUPS', [(root, r'Seder\.previous-\d{8}-\d{6}-[0-9a-f]{8}', 3)]), patch.object(m, 'LIVE_COPY_ROOTS', [live]), patch.object(m, 'LEGACY_BACKUP_ROOT', root / 'absent'):
                plan, errors = m.prune_deployment_artifacts({copies[5]}, False)
                self.assertEqual([x['path'] for x in plan], [str(copies[3])])
                self.assertTrue(copies[3].exists())
                applied, errors = m.prune_deployment_artifacts({copies[5]}, True)
            self.assertFalse(errors)
            self.assertFalse(copies[3].exists())
            self.assertTrue(unknown.exists())
            for i in (0,1,2,4,5): self.assertTrue(copies[i].exists())

    def test_release_dates_control_retention_when_renames_preserve_old_mtimes(self):
        import os, time
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            copies = []
            for i in range(4):
                copy = root / f'Seder.previous-2026090{i+1}-110000-abcdef12'
                copy.mkdir()
                os.utime(copy, (time.time() - (i+2)*86400,) * 2)
                copies.append(copy)
            invalid = root / 'Seder.previous-20261999-000000-abcdef12'
            invalid.mkdir()
            os.utime(invalid, (time.time() - 20*86400,) * 2)
            with patch.object(m, 'RETENTION_GROUPS', [(root, r'Seder\.previous-\d{8}-\d{6}-[0-9a-f]{8}', 3)]), patch.object(m, 'LIVE_COPY_ROOTS', []), patch.object(m, 'LEGACY_BACKUP_ROOT', root / 'absent'):
                files, errors = m.prune_deployment_artifacts(set(), True)
            self.assertEqual([x['path'] for x in files], [str(copies[0])])
            self.assertFalse(errors)
            self.assertTrue(invalid.exists())
            for copy in copies[1:]: self.assertTrue(copy.exists())

    def test_legacy_backup_age_and_symlink_guard(self):
        import os, time
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            old = root / 'server_monitor_20260916_030004.sqlite.gz'
            old.write_text('old')
            os.utime(old, (time.time() - 8*86400,) * 2)
            recent = root / 'server_monitor_20261007_030004.sqlite.gz'
            recent.write_text('recent')
            unknown = root / 'customer.sqlite.gz'
            unknown.write_text('important')
            alias = root / 'vee_database_20260916_030004.sqlite.gz'
            alias.symlink_to(unknown)
            with patch.object(m, 'RETENTION_GROUPS', []), patch.object(m, 'LIVE_COPY_ROOTS', []), patch.object(m, 'LEGACY_BACKUP_ROOT', root):
                files, errors = m.prune_deployment_artifacts(set(), True)
            self.assertEqual([x['path'] for x in files], [str(old)])
            self.assertFalse(errors)
            self.assertTrue(recent.exists())
            self.assertTrue(alias.is_symlink())
            self.assertTrue(unknown.exists())

    def test_retention_never_runs_before_verified_backup(self):
        with patch.object(m, 'RELEASE_BASES', []), patch.object(m, 'BUILD_ROOTS', []), patch.object(m, 'NPX_ROOT', Path('/absent')), patch.object(m, 'process_paths', lambda:set()), patch.object(m, 'prune_deployment_artifacts') as prune:
            m.cleanup(False, releases=False)
            prune.assert_not_called()

class CatalogHealth(unittest.TestCase):
    def test_all_catalog_urls_and_workers_are_checked_and_legacy_is_visible(self):
        with tempfile.TemporaryDirectory() as folder:
            db_path = Path(folder) / 'catalog.sqlite'
            with sqlite3.connect(db_path) as db:
                db.execute('CREATE TABLE apps(name,pm2_name,systemd_unit,url,health_url,alerts_enabled,log_host)')
                db.executemany('INSERT INTO apps(name,pm2_name,systemd_unit,url,health_url,alerts_enabled) VALUES(?,?,?,?,?,?)', [
                    ('New calendar', 'seder-calendar', None, None, None, 1),
                    ('Static site', None, None, 'https://example.test/', 'http://127.0.0.1/health', 1),
                    ('Legacy sender', 'legacy-worker', None, None, None, 0)])
            with patch.object(m, 'run') as run:
                errors, warnings = m.catalog_health({'seder-calendar':'online', 'new-unmapped':'online', 'pm2-logrotate':'online'}, db_path)
            self.assertIn('new-unmapped', errors[0])
            self.assertEqual(len(errors), 1)
            self.assertIn('legacy-worker', warnings[0])
            self.assertEqual(run.call_count, 2)
            self.assertTrue(all('--max-time' in call.args[0] for call in run.call_args_list))

    def test_failed_runtime_and_url_are_reported(self):
        with tempfile.TemporaryDirectory() as folder:
            db_path = Path(folder) / 'catalog.sqlite'
            with sqlite3.connect(db_path) as db:
                db.execute('CREATE TABLE apps(name,pm2_name,systemd_unit,url,health_url,alerts_enabled,log_host)')
                db.execute('INSERT INTO apps(name,pm2_name,systemd_unit,url,health_url,alerts_enabled) VALUES(?,?,?,?,?,?)', ('Broken','worker',None,'https://example.test/',None,1))
            with patch.object(m, 'run', side_effect=RuntimeError('failed')), patch.object(m, 'unowned_hosts', return_value=[]):
                errors, warnings = m.catalog_health({}, db_path)
            self.assertEqual(len(errors), 2)
            self.assertEqual(warnings, [])

class VisitorHealth(unittest.TestCase):
    def test_detects_stalled_ingestion_without_treating_zero_traffic_as_failure(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            log = root / 'access.log'
            log.write_text('')
            db_path = root / 'monitor.sqlite'
            with sqlite3.connect(db_path) as db:
                db.executescript('CREATE TABLE apps(id INTEGER, name TEXT, log_path TEXT, analytics_enabled INTEGER); CREATE TABLE visitor_ingestion_state(app_id INTEGER, last_ingested_at TEXT);')
                db.execute('INSERT INTO apps VALUES(1, ?, ?, 1)', ('Empty but healthy', str(log)))
                db.execute('INSERT INTO visitor_ingestion_state VALUES(1, ?)', ('2026-09-18 06:00:00',))
            now = dt.datetime(2026, 9, 18, 6, 1, tzinfo=dt.timezone.utc).timestamp()
            self.assertEqual(m.visitor_health(db_path, now), [])
            self.assertIn('stalled', m.visitor_health(db_path, now + 600)[0])

    def test_browser_visits_without_logged_pages_mean_a_logging_gap(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            log = root / 'access.log'
            log.write_text('')
            db_path = root / 'monitor.sqlite'
            recent = dt.datetime.now(dt.timezone.utc).isoformat()
            with sqlite3.connect(db_path) as db:
                db.executescript('''CREATE TABLE apps(id INTEGER, name TEXT, log_path TEXT, analytics_enabled INTEGER);
                    CREATE TABLE visitor_ingestion_state(app_id INTEGER, last_ingested_at TEXT);
                    CREATE TABLE browser_signals(app_id INTEGER, automation_hint INTEGER, occurred_at TEXT);
                    CREATE TABLE visitor_events(app_id INTEGER, is_page_view INTEGER, occurred_at TEXT);''')
                db.execute('INSERT INTO apps VALUES(1, ?, ?, 1)', ('Own log only', str(log)))
                db.execute('INSERT INTO visitor_ingestion_state VALUES(1, ?)', (time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime()),))
                db.executemany('INSERT INTO browser_signals VALUES(1, 0, ?)', [(recent,)] * 20)
            self.assertEqual(m.visitor_health(db_path), ['Server log records no pages: Own log only'])
            with sqlite3.connect(db_path) as db:
                db.execute('INSERT INTO visitor_events VALUES(1, 1, ?)', (recent,))
            self.assertEqual(m.visitor_health(db_path), [])

class BrowserHealth(unittest.TestCase):
    def test_six_hour_schedule_and_forced_deployment_check(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(m, 'STATE', Path(folder)), patch.object(m, 'run') as run:
            result = m.STATE / 'browser-check.json'
            now = m.time.time() * 1000
            m.write_json(result, {'checked': now - 5 * 3600000, 'errors': []})
            self.assertEqual(m.browser_health(), [])
            run.assert_not_called()
            m.browser_health(force=True)
            run.assert_called_once_with(['systemctl', 'start', 'lawebs-browser-check.service'], timeout=210)
            run.reset_mock()
            m.write_json(result, {'checked': now - 6.1 * 3600000, 'errors': []})
            m.browser_health()
            run.assert_called_once()

    def test_killed_browser_replaces_old_success_and_does_not_retry_every_tick(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(m, 'STATE', Path(folder)), patch.object(m, 'run', side_effect=RuntimeError('killed')) as run:
            result = m.STATE / 'browser-check.json'
            m.write_json(result, {'checked': m.time.time() * 1000 - 8 * 3600000, 'errors': []})
            warnings = []
            # A killed checker is a warning while the sites were verified within two runs.
            self.assertEqual(m.browser_health(warnings=warnings), [])
            self.assertIn('could not run', warnings[0])
            self.assertIn('did not complete', json.loads(result.read_text())['errors'][0])
            self.assertEqual(m.browser_health(), [])
            run.assert_called_once()
            self.assertTrue(m.browser_health(force=True))

    def test_checker_fault_alerts_after_two_unverified_runs(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(m, 'STATE', Path(folder)):
            now = m.time.time() * 1000
            m.write_json(m.STATE / 'browser-check.json', {'checked': now, 'verified': now - 14 * 3600000, 'errors': ['runner: x'],
                                                         'failures': [{'check': 'runner', 'area': 'checker', 'site': None}]})
            self.assertEqual(m.browser_health(), ['Browser check has not completed for 14 hours'])

    def test_failures_name_the_site_or_dashboard_screen(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(m, 'STATE', Path(folder)):
            m.write_json(m.STATE / 'browser-check.json', {'checked': m.time.time() * 1000, 'errors': ['a', 'b', 'c'], 'failures': [
                {'check': 'site-browser-signal-Alenu', 'area': 'site', 'site': 'Alenu'},
                {'check': 'portfolio-project-sos', 'area': 'site', 'site': 'LA webs'},
                {'check': 'monitor-390/visitors', 'area': 'monitor', 'site': None}]})
            self.assertEqual(m.browser_health(), ['Site browser check failed: Alenu, LA webs',
                                                  'Monitor dashboard check failed: monitor-390/visitors'])

    def test_preserves_browser_failure_details(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(m, 'STATE', Path(folder)):
            def fail(*args, **kwargs):
                m.write_json(m.STATE / 'browser-check.json', {'checked': m.time.time() * 1000, 'errors': ['missing tracking receipt']})
                raise RuntimeError('failed')
            with patch.object(m, 'run', side_effect=fail):
                self.assertTrue(m.browser_health(force=True))
            self.assertEqual(json.loads((m.STATE / 'browser-check.json').read_text())['errors'], ['missing tracking receipt'])

    def test_dependency_dedupe_links_only_release_dependency_trees(self):
        with tempfile.TemporaryDirectory() as folder:
            base = Path(folder) / 'app'
            for name in ('20261001T000000Z', '20261002T000000Z', 'scratch'):
                (base / 'releases' / name / 'node_modules').mkdir(parents=True)
            (base / 'releases' / '20261002T000000Z' / '.next/standalone/node_modules').mkdir(parents=True)
            with patch.object(m, 'RELEASE_BASES', [base]), patch.object(m.shutil, 'which', return_value='/usr/bin/hardlink'), patch.object(m, 'run') as run:
                self.assertEqual(m.dedupe_release_dependencies(), [{'base': str(base), 'ok': True}])
            args = run.call_args[0][0]
            self.assertIn('--ignore-time', args)
            self.assertNotIn('--dry-run', args)
            linked = [a for a in args if a.startswith(str(base))]
            self.assertEqual(len(linked), 3)
            self.assertFalse(any('scratch' in a for a in linked))

if __name__ == '__main__':
    unittest.main()
