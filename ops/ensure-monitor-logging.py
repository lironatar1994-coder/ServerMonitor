#!/usr/bin/env python3
"""Keep every site in the monitor's shared access log.

An `access_log` directive inside a server block replaces the inherited http-level logs, so
that site silently disappears from visitor monitoring. For each enabled site config, every
server block that declares its own log (other than `off`) also gets the monitor log with the
internal-visit filter; existing monitor lines without the filter are upgraded. Backs up
changed files, validates, reloads, and restores everything on failure.
"""
from pathlib import Path
import importlib.util
import re
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('visitor_install', ROOT / 'ops/install-visitor-coverage.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)

MONITOR = 'access_log /var/log/nginx/monitor_host_access.log monitor_host_combined if=$monitor_public_request;'
OWN_LOG = re.compile(r'^([ \t]*)access_log\s+(?!off\b)(?!/var/log/nginx/monitor_host_access\.log)[^\s;]+[^;\n]*;', re.M)
MONITOR_LINE = re.compile(r'access_log\s+/var/log/nginx/monitor_host_access\.log\s+monitor_host_combined\s*;')


def patch(text):
    for start, end in reversed(list(helper.server_blocks(text))):
        block = text[start:end]
        updated = MONITOR_LINE.sub(MONITOR, block)
        if 'monitor_host_access.log' not in updated:
            match = OWN_LOG.search(updated)
            if match:
                updated = updated[:match.end()] + '\n' + match.group(1) + MONITOR + updated[match.end():]
        text = text[:start] + updated + text[end:]
    return text


def main():
    backup = Path('/root/server-monitor-backups') / ('monitor-logging-' + time.strftime('%Y%m%d-%H%M%S'))
    originals = {}
    try:
        for link in sorted(Path('/etc/nginx/sites-enabled').iterdir()):
            conf = link.resolve()
            if not conf.is_file():
                continue
            text = conf.read_text()
            updated = patch(text)
            if updated != text:
                backup.mkdir(mode=0o700, parents=True, exist_ok=True)
                shutil.copy2(conf, backup / conf.name)
                originals[conf] = text
                conf.write_text(updated)
        if not originals:
            print('Monitor logging already covers every site')
            return
        result = subprocess.run(['nginx', '-t'], capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError('Nginx validation failed: ' + result.stderr[-1500:])
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
        print('Monitor logging added to: ' + ', '.join(conf.name for conf in originals) + f'; backup: {backup}')
    except BaseException:
        for conf, text in originals.items():
            conf.write_text(text)
        subprocess.run(['nginx', '-t'], capture_output=True)
        raise


if __name__ == '__main__':
    main()
