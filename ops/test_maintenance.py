import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import time
import unittest
import datetime as dt
import json
from unittest.mock import patch

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
                db.execute('CREATE TABLE apps(name,pm2_name,systemd_unit,url,health_url,alerts_enabled)')
                db.executemany('INSERT INTO apps VALUES(?,?,?,?,?,?)', [
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
                db.execute('CREATE TABLE apps(name,pm2_name,systemd_unit,url,health_url,alerts_enabled)')
                db.execute('INSERT INTO apps VALUES(?,?,?,?,?,?)', ('Broken','worker',None,'https://example.test/',None,1))
            with patch.object(m, 'run', side_effect=RuntimeError('failed')):
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
