import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest
import datetime as dt
import json

spec = importlib.util.spec_from_file_location('maintenance', Path(__file__).with_name('maintenance.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class Backups(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        m.STATE = self.root / 'state'
        m.BACKUPS = m.STATE / 'backups'
        m.BACKUPS.mkdir(parents=True)
        m.ASSETS = {}

    def tearDown(self):
        self.temp.cleanup()

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



class Cleanup(unittest.TestCase):
    def setUp(self):
        from unittest.mock import patch
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.base = self.root / 'app'
        (self.base / 'releases').mkdir(parents=True)
        (self.base / 'incoming').mkdir()
        self.patches = [patch.object(m, 'RELEASE_BASES', [self.base]), patch.object(m, 'BUILD_ROOTS', []),
                        patch.object(m, 'NPX_ROOT', self.root / 'npx'), patch.object(m, 'process_paths', lambda: set())]
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

if __name__ == '__main__':
    unittest.main()
