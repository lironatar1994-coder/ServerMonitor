#!/usr/bin/env python3
"""Install missing public-site signals without changing application builds or CMS data."""
from pathlib import Path
import re
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
SITES = [
    ('libidiamonds.co.il.conf', ['libidiamonds.co.il', 'www.libidiamonds.co.il'], '', 'https://www.libidiamonds.co.il/', False),
    ('pinhasratzon.co.il.conf', ['pinhasratzon.co.il', 'www.pinhasratzon.co.il'], '', 'https://pinhasratzon.co.il/', False),
    ('lawebs.co.il.conf', ['lawebs.co.il', 'www.lawebs.co.il'], '/Koralevents2', 'https://lawebs.co.il/Koralevents2', False),
    ('lawebs.co.il.conf', ['lawebs.co.il', 'www.lawebs.co.il'], '/Koralevents', 'https://lawebs.co.il/Koralevents', False),
    ('lawebs.co.il.conf', ['lawebs.co.il', 'www.lawebs.co.il'], '', 'https://lawebs.co.il/', False),
    ('vee-app.co.il.conf', ['vee-app.co.il', 'www.vee-app.co.il'], '/DfusReuven', 'https://vee-app.co.il/DfusReuven', False),
    ('vee-app.co.il.conf', ['vee-app.co.il', 'www.vee-app.co.il'], '/LibiDiamonds2', 'https://vee-app.co.il/LibiDiamonds2', True),
]

def server_blocks(text):
    # Track braces while ignoring quoted strings/comments in the Nginx syntax.
    tokens = list(re.finditer(r'"(?:\\.|[^"\\])*"|\x27(?:\\.|[^\x27\\])*\x27|\#[^\n]*|\bserver\s*\{|[{}]', text))
    depth, start = 0, None
    for token in tokens:
        value = token.group()
        if value.startswith('server') and depth == 0:
            start = token.start(); depth = 1
        elif value == '{' and start is not None: depth += 1
        elif value == '}' and start is not None:
            depth -= 1
            if depth == 0:
                yield start, token.end()
                start = None

def main():
    key = Path('/root/.visitor-signal-key').read_text().strip()
    if not re.fullmatch('[0-9a-fA-F]{64}', key): raise RuntimeError('Invalid signal key')
    backup = Path('/root/server-monitor-backups') / ('visitor-coverage-' + time.strftime('%Y%m%d-%H%M%S'))
    backup.mkdir(mode=0o700, parents=True)
    originals = {}
    def write(path, content, mode=None):
        path = Path(path)
        if path not in originals:
            originals[path] = path.read_bytes() if path.exists() else None
            if path.exists(): shutil.copy2(path, backup / str(path).replace('/', '_'))
        path.write_text(content)
        if mode is not None: path.chmod(mode)
    try:
        asset = Path('/var/lib/server-monitor')
        asset.mkdir(mode=0o755, exist_ok=True)
        write(asset / 'visitor-tracker.js', (ROOT / 'ops/visitor-tracker.js').read_text(), 0o644)
        maps = ['map "$host:$uri" $monitor_navigation_tag {', '    default "";',
                '    ~^((www\\.)?lawebs\\.co\\.il):/(seder|PinhasRatzon|pinhasratzon)(/|$) "";']
        for config, hosts, prefix, site, native in SITES:
            host_pattern = '(?:' + '|'.join(re.escape(host) for host in hosts) + ')'
            suffix = re.escape(prefix) + '(?:/|$)' if prefix else '/'
            tag = f'<script src="/.well-known/server-monitor-visitor.js" data-prefix="{prefix}" data-native-rewrite="{int(native)}"></script>'
            maps.append(f"    ~^{host_pattern}:{suffix} '{tag}';")
        maps.append('}')
        write('/etc/nginx/conf.d/server-monitor-navigation.conf', '\n'.join(maps) + '\n', 0o644)
        configs = sorted(set(row[0] for row in SITES))
        patched_proxies = set()
        def uncompress(path):
            path = Path(path)
            if path in patched_proxies: return
            patched_proxies.add(path)
            text = path.read_text()
            # Explicit per-location header survives other proxy_set_header directives.
            pattern = r'(proxy_pass\s+[^;]+;)(?!\n\s*proxy_set_header Accept-Encoding)'
            updated = re.sub(pattern, r'\1\n    proxy_set_header Accept-Encoding "";', text)
            if updated != text: write(path, updated)
            for include in re.findall(r'include\s+(/etc/nginx/snippets/[^;*]+);', text):
                if 'visitor-signal' not in include and 'monitor-navigation' not in include: uncompress(include)
        for config in configs:
            snippet = Path('/etc/nginx/snippets') / ('monitor-navigation-' + config)
            rows = [row for row in SITES if row[0] == config]
            content = ['sub_filter_once on;', "sub_filter '<head>' '<head>$monitor_navigation_tag';",
                       'location = /.well-known/server-monitor-visitor.js {',
                       '    alias /var/lib/server-monitor/visitor-tracker.js;',
                       '    default_type application/javascript;',
                       '    add_header Cache-Control "no-cache";', '}']
            for _, hosts, prefix, site, native in rows:
                content += [f'location = {prefix}/.well-known/vee-visitor-signal {{',
                    '    limit_except POST { deny all; }', '    client_max_body_size 16k;',
                    '    proxy_pass http://127.0.0.1:4010/serve-monitor/api/browser-signals/site;',
                    '    proxy_set_header Content-Type application/json;',
                    f'    proxy_set_header X-Visitor-Signal-Key "{key}";',
                    f'    proxy_set_header X-Visitor-Site-Url "{site}";',
                    '    proxy_set_header X-Visitor-IP $remote_addr;',
                    '    proxy_set_header X-Visitor-User-Agent $http_user_agent;', '}']
            write(snippet, '\n'.join(content) + '\n', 0o600)
            conf = Path('/etc/nginx/sites-available') / config
            text = conf.read_text()
            include = f'    include {snippet};'
            blocks = list(server_blocks(text))
            for start, end in reversed(blocks):
                block = text[start:end]
                if re.search(r'listen\s+[^;]*443', block) and 'location ' in block and include not in block:
                    block = block[:-1] + '\n' + include + '\n}'
                    text = text[:start] + block + text[end:]
            if include not in text: raise RuntimeError('No serving TLS block found: ' + config)
            write(conf, text)
            uncompress(conf)
        subprocess.run(['nginx', '-t'], check=True, capture_output=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
        print('Visitor coverage installed for seven sites; backup: ' + str(backup))
    except BaseException:
        for path, original in originals.items():
            if original is None: path.unlink(missing_ok=True)
            else: path.write_bytes(original)
        subprocess.run(['nginx', '-t'], check=False, capture_output=True)
        raise

if __name__ == '__main__': main()
