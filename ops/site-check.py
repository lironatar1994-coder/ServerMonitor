#!/usr/bin/env python3
"""Read-only checklist for one monitored site, run on the server after adding or changing it.

    python3 ops/site-check.py "Pinhas Ratzon"      (catalog name, app id, or part of the URL)

Checks the catalog record, the public page and its measurement tags, the certificate, the shared
access log, browser and contact signals, the outside view and the reports. It only reads: the
database is opened read-only, the page is fetched once as an internal browser, and the log is read
from its last 8 MB.
"""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import os
import socket
import sqlite3
import ssl
import sys
import time
import urllib.request
from urllib.parse import urlsplit

DB = Path(os.environ.get('MONITOR_DB_PATH') or Path(__file__).resolve().parents[1] / 'backend' / 'monitor.db')
LOG = Path('/var/log/nginx/monitor_host_access.log')
NATIVE = ('Seder', 'PDF Studio', 'Miryam Zelig')  # measure through their own collectors
results = []


def check(ok, label, detail=''):
    results.append(ok)
    mark = {True: 'OK  ', False: 'FAIL', None: 'NOTE'}[ok]
    print(f'  [{mark}] {label}' + (f': {detail}' if detail else ''))


def find_app(db, query):
    rows = db.execute('SELECT * FROM apps WHERE CAST(id AS TEXT) = ? OR name = ?', (query, query)).fetchall()
    if not rows:
        rows = db.execute('SELECT * FROM apps WHERE url LIKE ? OR name LIKE ?', (f'%{query}%', f'%{query}%')).fetchall()
    if len(rows) != 1:
        names = ', '.join(row['name'] for row in rows) or 'none'
        sys.exit(f'Expected one match for "{query}", found: {names}')
    return rows[0]


def certificate_days(host):
    context = ssl.create_default_context()
    with socket.create_connection((host, 443), timeout=8) as raw, context.wrap_socket(raw, server_hostname=host) as tls:
        expires = ssl.cert_time_to_seconds(tls.getpeercert()['notAfter'])
    return round((expires - time.time()) / 86400)


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'ServerMonitor-SiteCheck/1.0', 'Cookie': 'monitor_internal=1'})
    started = time.monotonic()
    with urllib.request.urlopen(request, timeout=10) as response:
        body = response.read(2_000_000).decode('utf-8', 'replace')
        return response.status, round((time.monotonic() - started) * 1000), body


def log_lines(hosts, paths, since):
    if not LOG.exists():
        return None
    with LOG.open('rb') as handle:
        handle.seek(max(0, LOG.stat().st_size - 8_000_000))
        text = handle.read().decode('utf-8', 'replace')
    count = 0
    for line in text.splitlines():
        host = line.rsplit('"', 2)[-2] if line.count('"') >= 2 else ''
        if hosts and host not in hosts:
            continue
        try:
            stamp = datetime.strptime(line.split('[', 1)[1].split(']', 1)[0], '%d/%b/%Y:%H:%M:%S %z')
            path = line.split('"', 2)[1].split(' ')[1]
        except (IndexError, ValueError):
            continue
        if stamp >= since and (not paths or any(path == p or path.startswith(p + '/') for p in paths)):
            count += 1
    return count


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    db = sqlite3.connect(f'file:{DB}?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    app = find_app(db, sys.argv[1])
    day_ago = datetime.now(timezone.utc) - timedelta(days=1)
    print(f'{app["name"]} (id {app["id"]})')

    print('Catalog')
    check(bool(app['url']), 'public address', app['url'] or 'missing')
    check(app['status'] == 'online', 'last monitor status', f'{app["status"]} at {app["last_checked"]}')
    runtime = app['pm2_name'] or app['systemd_unit']
    check(None, 'runtime', runtime or 'static (no process)')
    check(None, 'visitor analytics / client reports', f'{"on" if app["analytics_enabled"] else "off"} / {"on" if app["reporting_enabled"] else "off"}')

    if app['url']:
        print('Public page')
        host = urlsplit(app['url']).hostname
        try:
            status, ms, body = fetch(app['url'])
            check(status < 400, 'answers', f'HTTP {status} in {ms} ms')
            if app['analytics_enabled'] and app['name'] not in NATIVE:
                check('server-monitor-visitor.js' in body, 'visitor measurement tag')
                check('server-monitor-growth.js' in body, 'contact-action tag')
            elif app['analytics_enabled']:
                check(None, 'measurement', 'native collector (tags not expected)')
        except Exception as error:
            check(False, 'answers', type(error).__name__)
        try:
            days = certificate_days(host)
            check(days >= 14, 'certificate', f'{days} days left')
        except Exception as error:
            check(False, 'certificate', type(error).__name__)

    if app['analytics_enabled']:
        print('Measurement, last 24 hours')
        hosts = {h for h in (app['log_host'] or '').split('|') if h}
        paths = [p.rstrip('/') for p in (app['log_filter'] or '').split('|') if p.strip('/')]
        check(bool(hosts), 'log ownership', f'hosts {", ".join(sorted(hosts)) or "missing"}; paths {", ".join(paths) or "all"}')
        lines = log_lines(hosts, paths, day_ago)
        check(bool(lines) if lines is not None else False, 'requests in the monitor access log', 'log missing' if lines is None else str(lines))
        # Real visitors send hint 0; the six-hourly browser check (hint 1) proves the tracker runs.
        week_ago = (day_ago - timedelta(days=6)).isoformat()
        real = db.execute('SELECT COUNT(*) FROM browser_signals WHERE app_id = ? AND occurred_at >= ? AND automation_hint = 0', (app['id'], day_ago.isoformat())).fetchone()[0]
        last_any = db.execute('SELECT MAX(occurred_at) FROM browser_signals WHERE app_id = ? AND occurred_at >= ?', (app['id'], week_ago)).fetchone()[0]
        if real:
            check(True, 'browser navigation signals', str(real))
        elif last_any:
            check(None, 'browser navigation signals', f'none from visitors; the tracker answered checks, last {last_any}')
        else:
            check(False, 'browser navigation signals', 'nothing in a week, not even the automated checks')
        growth = db.execute('SELECT COUNT(*) FROM growth_events WHERE app_id = ? AND occurred_at >= ? AND automation_hint = 0', (app['id'], day_ago.isoformat())).fetchone()[0]
        check(None, 'contact actions from visitors', str(growth))

    outside = db.execute('SELECT source, ok, status_code, error, checked_at FROM external_checks WHERE app_id = ?', (app['id'],)).fetchall() \
        if db.execute("SELECT 1 FROM sqlite_master WHERE name = 'external_checks'").fetchone() else []
    print('Outside view')
    if outside:
        for row in outside:
            check(bool(row['ok']), f'from {row["source"]}', f'{"ok" if row["ok"] else row["error"] or row["status_code"]} at {row["checked_at"]}')
    else:
        check(None, 'from the PC agents', 'not checked yet')

    failed = results.count(False)
    print(f'\n{"All checks passed" if not failed else f"{failed} check(s) need attention"}')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
