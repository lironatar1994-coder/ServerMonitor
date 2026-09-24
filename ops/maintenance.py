#!/usr/bin/env python3
"""Production maintenance: verified snapshots, narrow retention, observable health."""
import argparse
from contextlib import closing
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import tarfile
import time

STATE = Path('/var/lib/lawebs-maintenance')
BACKUPS = STATE / 'backups'
DATABASES = {
    'vee': '/root/Vee/backend/database.sqlite',
    'on-your-way': '/root/OnYourWay/backend/prisma/prod.db',
    'sos': '/root/sos-landing-standalone/data/analytics.db',
    'server-monitor': '/root/ServerMonitor/backend/monitor.db',
    'koralevents': '/opt/koralevents/shared/data/koral.sqlite',
    'koralevents2': '/opt/koralevents2/shared/data/koral.sqlite',
}
ASSETS = {
    'maavar-encrypted': Path('/opt/maavar/shared/export'),
    'manager': Path('/root/Manager_Site/data'),
    'koral-uploads': Path('/opt/koralevents/shared/uploads'),
    'koral2-uploads': Path('/opt/koralevents2/shared/uploads'),
}
SERVICES = ['maavar', 'maavar-worker', 'nginx', 'ssh', 'pm2-root', 'koralevents', 'koralevents2', 'fail2ban']
URLS = ['https://vee-app.co.il/maavar/api/health', 'https://lawebs.co.il/', 'https://lawebs.co.il/Koralevents2/api/health',
        'https://lawebs.co.il/Koralevents/api/health', 'https://vee-app.co.il/']
EXPECTED_PM2 = {'dfus-reuven', 'dfus-reuven-live', 'libi-diamonds-2',
                'libi-diamonds-live', 'manager-site', 'on-your-way-backend',
                'on-your-way-frontend', 'pinhas-ratzon-form', 'seder-live',
                'seder-whatsapp', 'server-monitor', 'sos-landing-standalone', 'vee-app'}
TRACKER_URLS = ['https://www.libidiamonds.co.il/', 'https://pinhasratzon.co.il/',
                'https://lawebs.co.il/', 'https://lawebs.co.il/Koralevents',
                'https://lawebs.co.il/Koralevents2', 'https://vee-app.co.il/DfusReuven',
                'https://vee-app.co.il/LibiDiamonds2']
GROWTH_URLS = ['https://www.libidiamonds.co.il/', 'https://pinhasratzon.co.il/',
               'https://lawebs.co.il/', 'https://lawebs.co.il/Koralevents', 'https://lawebs.co.il/Koralevents2',
               'https://lawebs.co.il/seder', 'https://vee-app.co.il/', 'https://vee-app.co.il/OnYourWay',
               'https://vee-app.co.il/pdf-studio/', 'https://www.dfusreuven.co.il/',
               'https://miryamzelig.co.il/', 'https://sosbaderech.co.il/']

def run(args, timeout=60):
    p = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if p.returncode:
        raise RuntimeError(f'{args[0]} failed ({p.returncode}): {p.stderr[-800:]}')
    return p.stdout.strip()

def write_json(path, data):
    with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, delete=False) as f:
        temp = Path(f.name)
        f.write(json.dumps(data, indent=2) + '\n')
    temp.replace(path)

def sha256(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()

def snapshot():
    if shutil.disk_usage('/').free < 512 * 1024**2:
        raise RuntimeError('Less than 512 MiB free; backup refused')
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    staging = BACKUPS / ('.partial-' + stamp)
    staging.mkdir(mode=0o700)
    try:
        for name, source in DATABASES.items():
            if not Path(source).is_file():
                raise RuntimeError(f'Missing required database: {source}')
            dest = staging / (name + '.sqlite')
            deadline = time.monotonic() + 120
            def progress(status, remaining, total):
                if time.monotonic() > deadline:
                    raise TimeoutError(f'Backup timed out: {name}')
            with closing(sqlite3.connect(Path(source).as_uri() + '?mode=ro', uri=True)) as src:
                with closing(sqlite3.connect(dest)) as dst:
                    src.backup(dst, pages=256, progress=progress, sleep=0.1)
                    if dst.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
                        raise RuntimeError(f'Backup integrity failure: {name}')
        for name, source in ASSETS.items():
            if not source.is_dir():
                raise RuntimeError(f'Missing required assets: {source}')
            dest = staging / (name + '.tar.gz')
            run(['tar', '-czf', str(dest), '-C', str(source), '.'], timeout=180)
            with tarfile.open(dest) as archive:
                for member in archive:
                    if member.isfile():
                        f = archive.extractfile(member)
                        while f.read(1024 * 1024):
                            pass
        manifest = {p.name: {'bytes': p.stat().st_size, 'sha256': sha256(p)}
                    for p in staging.iterdir() if p.is_file()}
        write_json(staging / 'manifest.json', manifest)
        final = BACKUPS / stamp
        staging.rename(final)
        write_json(STATE / 'backup-status.json', {'completed': time.time(), 'path': str(final), 'files': manifest})
        prune_snapshots()
        return str(final)
    except BaseException:
        if staging.exists():
            shutil.rmtree(staging)
        raise

def prune_snapshots():
    previous = sorted((p for p in BACKUPS.iterdir() if re.fullmatch(r'\d{8}T\d{6}Z', p.name)
                       and p.is_dir() and not p.is_symlink() and (p / 'manifest.json').is_file()))
    sizes = {p: sum(f.stat().st_size for f in p.iterdir() if f.is_file()) for p in previous}
    total = sum(sizes.values())
    removed = []
    for p in previous:
        created = dt.datetime.strptime(p.name, '%Y%m%dT%H%M%SZ').replace(tzinfo=dt.timezone.utc).timestamp()
        age = time.time() - created
        if age <= 7 * 86400 or p in previous[-7:]:
            continue
        ack = STATE / 'pc-acknowledgements' / (p.name + '.json')
        acknowledged = False
        if ack.is_file():
            acknowledged = json.loads(ack.read_text()).get('manifest_sha256') == sha256(p / 'manifest.json')
        if acknowledged or age > 30 * 86400 or total > 2 * 1024**3:
            if p.resolve().parent != BACKUPS.resolve():
                raise RuntimeError('Unsafe backup retention path')
            shutil.rmtree(p)
            total -= sizes[p]
            removed.append({'snapshot': p.name, 'pc_verified': acknowledged})
    write_json(STATE / 'retention-status.json', {'checked': time.time(), 'bytes': total,
               'removed': removed, 'over_budget': total > 2 * 1024**3})

RELEASE_BASES = [Path('/opt') / name for name in ('koralevents', 'koralevents2', 'maavar', 'lawebs-portfolio')]
BUILD_ROOTS = [Path(p) for p in (
    '/root/Vee/frontend', '/root/OnYourWay/frontend', '/root/sos-landing-standalone',
    '/root/DfusReuven', '/root/DfusReuven-live', '/root/LibiDiamonds-live',
    '/root/LibiDiamonds2', '/root/Seder', '/root/PDFStudio')]
NPX_ROOT = Path('/root/.npm/_npx')
RELEASE_NAME = re.compile(r'[0-9a-f]{40}(?:-[A-Za-z0-9-]+)?')

def tree_bytes(path):
    if path.is_symlink():
        return 0
    if path.is_file():
        return path.stat().st_size
    return sum(p.stat().st_size for p in path.rglob('*') if p.is_file() and not p.is_symlink())

def process_paths():
    paths = set()
    for proc in Path('/proc').glob('[0-9]*'):
        try:
            paths.add((proc / 'cwd').resolve(strict=True))
            for argument in (proc / 'cmdline').read_bytes().split(b'\0'):
                if argument.startswith(b'/'):
                    candidate = Path(os.fsdecode(argument))
                    if candidate.exists():
                        paths.add(candidate.resolve(strict=True))
        except (OSError, RuntimeError):
            pass
    return paths

def protected_releases(base, processes):
    root = (base / 'releases').resolve(strict=True)
    current = (base / 'current').resolve(strict=True)
    if current.parent != root:
        raise RuntimeError(f'Unexpected live release: {current}')
    protected = {current}
    for target in [*processes, (current / 'node_modules').resolve(), (current / '.next').resolve()]:
        if target.is_relative_to(root) and target != root:
            protected.add(root / target.relative_to(root).parts[0])
    return root, protected

def remove_candidate(path, boundary, apply):
    # Reject a symlink at the target or anywhere between the boundary and target.
    if path.is_symlink() or boundary.is_symlink() or path.resolve() != path.absolute() or not path.resolve().is_relative_to(boundary.resolve()) or path.resolve() == boundary.resolve():
        raise RuntimeError(f'Unsafe cleanup path: {path}')
    item = {'path': str(path), 'bytes': tree_bytes(path)}
    if apply:
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink()
    return item

def cleanup(apply=False, releases=True):
    candidates, errors = [], []
    # Avoid touching caches/release staging while a production build is running.
    for command in Path('/proc').glob('[0-9]*/cmdline'):
        try:
            value = command.read_bytes().replace(b'\0', b' ')
            if re.search(rb'(?:next(?:/dist/bin/next)?|vite) +build|npm +run +build', value):
                return {'applied': apply, 'bytes': 0, 'files': [], 'errors': [], 'skipped': 'build in progress'}
        except (OSError, PermissionError):
            pass
    processes = process_paths()
    for base in RELEASE_BASES:
        if not base.exists():
            continue
        try:
            root, protected = protected_releases(base, processes)
            versions = sorted((p for p in root.iterdir() if RELEASE_NAME.fullmatch(p.name) and p.is_dir() and not p.is_symlink()), key=lambda p: p.stat().st_mtime, reverse=True)
            keep = protected | set(versions[:3])
            if releases:
                for version in versions:
                    if version not in keep and version.stat().st_mtime < time.time() - 86400:
                        candidates.append(remove_candidate(version, root, apply))
            incoming = base / 'incoming'
            if releases and incoming.is_dir() and not incoming.is_symlink():
                files = sorted((p for p in incoming.iterdir() if re.fullmatch(r'[0-9a-f]{40}(?:-[A-Za-z0-9-]+)?\.tar\.gz', p.name) and p.is_file() and not p.is_symlink()), key=lambda p:p.stat().st_mtime, reverse=True)
                protected_hashes = {p.name[:40] for p in keep}
                for archive in files[3:]:
                    if archive.name[:40] not in protected_hashes and archive.stat().st_mtime < time.time() - 86400:
                        candidates.append(remove_candidate(archive, incoming, apply))
            # Only compiler caches; preserve runtime image and fetch caches.
            for version in versions:
                if not version.exists():
                    continue
                for kind in ('webpack', 'swc'):
                    cache = version / '.next/cache' / kind
                    if cache.exists():
                        candidates.append(remove_candidate(cache, root, apply))
        except Exception as exc:
            errors.append(str(exc))
    for base in BUILD_ROOTS:
        for kind in ('webpack', 'swc'):
            cache = base / '.next/cache' / kind
            try:
                if cache.exists():
                    candidates.append(remove_candidate(cache, base, apply))
            except Exception as exc:
                errors.append(str(exc))
    # NPX installations are disposable but keep recently used and running entries.
    npx = NPX_ROOT
    if npx.is_dir() and not npx.is_symlink():
        for directory in npx.iterdir():
            if directory.is_dir() and not directory.is_symlink() and directory.stat().st_mtime < time.time() - 7 * 86400 and not any(p.is_relative_to(directory) for p in processes):
                try:
                    candidates.append(remove_candidate(directory, npx, apply))
                except Exception as exc:
                    errors.append(str(exc))
    return {'applied': apply, 'bytes': sum(p['bytes'] for p in candidates), 'files': candidates, 'errors': errors}

def housekeeping():
    results = []
    commands = [(['journalctl', '--rotate'], 30), (['journalctl', '--vacuum-time=7d', '--vacuum-size=200M'], 60), (['apt-get', 'clean'], 60)]
    cache = Path('/root/.npm/_cacache')
    if cache.exists() and tree_bytes(cache) > 128 * 1024**2:
        commands.append((['npm', 'cache', 'clean', '--force'], 120))
    for args, timeout in commands:
        try:
            run(args, timeout=timeout)
            results.append({'command': args[:2], 'ok': True})
        except Exception as exc:
            results.append({'command': args[:2], 'ok': False, 'error': str(exc)})
    return results

def daily():
    before = shutil.disk_usage('/').free
    # Cache cleanup must work even when free space is too low for a snapshot.
    pre = cleanup(True, releases=False)
    routine = housekeeping()
    location = snapshot()
    post = cleanup(True, releases=True)
    result = {'completed': time.time(), 'backup': location, 'pre_cleanup': pre,
              'cleanup': post, 'housekeeping': routine,
              'net_freed_bytes': shutil.disk_usage('/').free - before}
    write_json(STATE / 'daily-status.json', result)
    errors = pre['errors'] + post['errors'] + [x['error'] for x in routine if not x['ok']]
    if errors:
        raise RuntimeError('Maintenance partially failed: ' + '; '.join(errors))
    (STATE / 'daily-failure.json').unlink(missing_ok=True)
    write_summary(result)
    return result

def write_summary(result=None, error=None):
    lines = ['Server Cleanup Summary', 'Updated: ' + dt.datetime.now(dt.timezone.utc).isoformat()]
    if error:
        lines.append('ERROR: ' + str(error))
    else:
        lines += ['Verified backup: ' + result['backup'],
                  f"Net freed: {result['net_freed_bytes'] / 1024**2:.1f} MiB",
                  f"Removed items: {len(result['pre_cleanup']['files']) + len(result['cleanup']['files'])}",
                  'Current releases, newest three versions and running-process releases preserved.']
    Path('/var/log/server_cleanup_summary.log').write_text('\n'.join(lines) + '\n')

def visitor_health(db_path=Path('/root/ServerMonitor/backend/monitor.db'), now=None):
    errors = []
    now = time.time() if now is None else now
    try:
        with closing(sqlite3.connect(db_path.as_uri() + '?mode=ro', uri=True)) as db:
            rows = db.execute('SELECT a.name, a.log_path, s.last_ingested_at FROM apps a LEFT JOIN visitor_ingestion_state s ON s.app_id=a.id WHERE a.analytics_enabled=1').fetchall()
        for name, log_path, last in rows:
            if not log_path or not Path(log_path).is_file():
                errors.append(f'Visitor log missing: {name}')
            if not last:
                errors.append(f'Visitor ingestion not initialized: {name}')
            elif now - dt.datetime.strptime(last, '%Y-%m-%d %H:%M:%S').replace(tzinfo=dt.timezone.utc).timestamp() > 300:
                errors.append(f'Visitor ingestion stalled: {name}')
    except Exception as exc:
        errors.append(f'Visitor ingestion check failed: {exc}')
    return errors

def health():
    errors, warnings = [], []
    disk = shutil.disk_usage('/')
    fs = os.statvfs('/')
    available = fs.f_bavail * fs.f_frsize
    used = round(100 * disk.used / (disk.used + available), 1)
    if used >= 90:
        errors.append(f'Disk usage {used}%')
    elif used >= 80:
        warnings.append(f'Disk usage {used}%')
    for service in SERVICES:
        try:
            run(['systemctl', 'is-active', service])
        except Exception:
            errors.append(f'Service not active: {service}')
    try:
        apps = json.loads(run(['/usr/bin/pm2', 'jlist']))
        statuses = {p['name']: p['pm2_env']['status'] for p in apps}
        for name in EXPECTED_PM2:
            if statuses.get(name) != 'online':
                errors.append(f'PM2 process not online: {name}')
    except Exception as exc:
        errors.append(f'PM2 inspection: {exc}')
    for url in URLS:
        try:
            code = run(['curl', '--silent', '--show-error', '--location', '--fail',
                        '--retry', '1', '--max-time', '20', '--output', '/dev/null',
                        '--write-out', '%{http_code}', url])
            if code != '200':
                errors.append(f'HTTP {code}: {url}')
        except Exception:
            errors.append(f'HTTP check failed: {url}')
    errors.extend(visitor_health())
    # Reuse this timer; one bounded browser process per hour, no extra scheduler.
    browser_result = STATE / 'browser-check.json'
    try:
        browser_check = json.loads(browser_result.read_text())
    except (FileNotFoundError, ValueError):
        browser_check = {}
    if time.time() * 1000 - browser_check.get('checked', 0) >= 3600000:
        try:
            run(['/usr/bin/node', '/root/ServerMonitor/ops/browser-check.cjs'], timeout=180)
        except Exception:
            errors.append('Portfolio/monitor browser or tracking check failed')
    try:
        browser_check = json.loads(browser_result.read_text())
        if browser_check.get('errors'):
            errors.append('Portfolio/monitor browser or tracking check failed; see browser-check.json')
        if time.time() * 1000 - browser_check.get('checked', 0) > 7200000:
            errors.append('Portfolio/monitor browser check is stale')
    except (FileNotFoundError, ValueError):
        errors.append('Portfolio/monitor browser check result missing')
    for url in set(TRACKER_URLS + GROWTH_URLS):
        try:
            html = run(['curl', '--silent', '--show-error', '--location', '--fail', '--compressed', '--max-time', '10', url], timeout=15)
            if url in TRACKER_URLS and 'src="/.well-known/server-monitor-visitor.js"' not in html:
                errors.append(f'Browser tracker missing: {url}')
            if url in GROWTH_URLS and 'src="/.well-known/server-monitor-growth.js"' not in html:
                errors.append(f'Growth tracker missing: {url}')
        except Exception:
            errors.append(f'Browser tracker check failed: {url}')
    for cert in Path('/etc/letsencrypt/live').glob('*/cert.pem'):
        try:
            run(['openssl', 'x509', '-checkend', str(21 * 86400), '-noout', '-in', str(cert)])
        except Exception:
            errors.append(f'Certificate expires within 21 days: {cert.parent.name}')
    try:
        last = json.loads((STATE / 'backup-status.json').read_text())
        if time.time() - last['completed'] > 36 * 3600:
            errors.append('Last successful backup is older than 36 hours')
    except Exception:
        errors.append('No successful verified backup recorded')
    try:
        failed = json.loads((STATE / 'daily-failure.json').read_text())
        errors.append('Last maintenance failed: ' + failed['error'])
    except FileNotFoundError:
        pass
    try:
        export = Path('/opt/maavar/shared/export/latest.mvbak')
        if time.time() - export.stat().st_mtime > 36 * 3600:
            errors.append('Maavar encrypted export is stale')
    except FileNotFoundError:
        errors.append('Maavar encrypted export missing')
    mem = dict((line.split(':')[0], int(line.split()[1]) * 1024) for line in Path('/proc/meminfo').read_text().splitlines() if len(line.split()) >= 2)
    if mem.get('MemAvailable', 0) < 128 * 1024**2:
        warnings.append('Available RAM below 128 MiB; no automatic process termination or cache drops')
    if Path('/var/run/reboot-required').exists():
        warnings.append('OS reboot required; manual maintenance window needed')
    result = {'checked': time.time(), 'disk_used_percent': used, 'free_bytes': disk.free, 'memory_available_bytes': mem.get('MemAvailable'), 'swap_used_bytes': mem.get('SwapTotal', 0) - mem.get('SwapFree', 0),
              'errors': errors, 'warnings': warnings}
    write_json(STATE / 'health.json', result)
    print(json.dumps(result, indent=2), flush=True)
    return bool(errors)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['daily', 'health', 'plan'])
    args = parser.parse_args()
    os.umask(0o077)
    STATE.mkdir(mode=0o700, exist_ok=True)
    BACKUPS.mkdir(mode=0o700, exist_ok=True)
    with (STATE / (args.mode + '.lock')).open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('Another run already holds the lock')
        if args.mode == 'plan':
            print(json.dumps(cleanup(False), indent=2))
            return 0
        if args.mode == 'daily':
            try:
                result = daily()
                print(json.dumps(result, indent=2), flush=True)
            except Exception as exc:
                write_json(STATE / 'daily-failure.json', {'failed': time.time(), 'error': str(exc)})
                write_summary(error=exc)
                raise
        return int(health())

if __name__ == '__main__':
    sys.exit(main())
