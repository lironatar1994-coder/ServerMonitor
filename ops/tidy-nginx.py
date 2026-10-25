#!/usr/bin/env python3
"""Keeps `nginx -t` free of avoidable warnings so a real one stands out (run by deployment).

- Installs ../nginx-tuning.conf (proxy header table size) into conf.d.
- Gives every `listen ... 443 ssl` line the same options: all server blocks share one socket, and
  Nginx already applies the first block's `http2` to every site, so adding it elsewhere and dropping
  the default `ipv6only=on` changes nothing but the "protocol options redefined" warnings.

Backs up every file it changes, validates, and restores everything on a failed validation.
`--check` only prints what would change.
"""
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
TUNING = Path('/etc/nginx/conf.d/server-monitor-tuning.conf')
SITES = Path('/etc/nginx/sites-enabled')
LISTEN = re.compile(r'^(\s*listen\s+(?:\[::\]:)?443\s+ssl)([^;#]*)(;.*)$')


def normalize(line):
    match = LISTEN.match(line)
    if not match:
        return line
    head, options, tail = match.groups()
    words = [word for word in options.split() if word not in ('http2', 'ipv6only=on')]
    return f"{head} {' '.join(words + ['http2'])}{tail}"


def main():
    changes = {}
    wanted = (ROOT / 'nginx-tuning.conf').read_text()
    if not TUNING.exists() or TUNING.read_text() != wanted:
        changes[TUNING] = wanted
    for link in sorted(SITES.iterdir()) if SITES.is_dir() else []:
        path = link.resolve()
        if not path.is_file():
            continue
        text = path.read_text()
        fixed = '\n'.join(normalize(line) for line in text.split('\n'))
        if fixed != text:
            changes[path] = fixed
    if not changes:
        print('[INFO] Nginx configuration already tidy')
        return 0
    if '--check' in sys.argv:
        for path, content in changes.items():
            before = path.read_text().split('\n') if path.exists() else []
            after = content.split('\n')
            print(f'would change {path}:')
            for old, new in zip(before, after):
                if old != new:
                    print(f'  - {old.strip()}\n  + {new.strip()}')
            if not before:
                print('  (new file)')
        return 0
    backup = Path('/root/server-monitor-backups') / ('nginx-tidy-' + time.strftime('%Y%m%d-%H%M%S'))
    backup.mkdir(mode=0o700, parents=True)
    originals = {}
    for path, content in changes.items():
        originals[path] = path.read_text() if path.exists() else None
        if path.exists():
            shutil.copy2(path, backup / str(path).replace('/', '_'))
        path.write_text(content)
        if path == TUNING:
            path.chmod(0o644)
    check = subprocess.run(['nginx', '-t'], capture_output=True, text=True)
    if check.returncode != 0:
        for path, original in originals.items():
            if original is None:
                path.unlink(missing_ok=True)
            else:
                path.write_text(original)
        print('[ERROR] Nginx tidy failed validation; restored the previous files', file=sys.stderr)
        print(check.stderr, file=sys.stderr)
        return 1
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    warnings = [line for line in check.stderr.splitlines() if '[warn]' in line]
    print(f'[INFO] Nginx tidied: {len(changes)} file(s), {len(warnings)} warning(s) left')
    for line in warnings:
        print('       ' + line.split('[warn]', 1)[1].strip())
    return 0


if __name__ == '__main__':
    sys.exit(main())
