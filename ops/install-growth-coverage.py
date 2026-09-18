#!/usr/bin/env python3
"""Anonymous business actions on canonical public sites; native navigation stays intact."""
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
SITES = [
    ('lawebs.co.il.conf', 'lawebs.co.il', '/Koralevents2', 'https://lawebs.co.il/Koralevents2'),
    ('lawebs.co.il.conf', 'lawebs.co.il', '/Koralevents', 'https://lawebs.co.il/Koralevents'),
    ('lawebs.co.il.conf', 'lawebs.co.il', '/seder', 'https://lawebs.co.il/seder'),
    ('lawebs.co.il.conf', 'lawebs.co.il', '', 'https://lawebs.co.il/'),
    ('vee-app.co.il.conf', 'vee-app.co.il', '/OnYourWay', 'https://vee-app.co.il/OnYourWay'),
    ('vee-app.co.il.conf', 'vee-app.co.il', '/pdf-studio', 'https://vee-app.co.il/pdf-studio/'),
    ('vee-app.co.il.conf', 'vee-app.co.il', '', 'https://vee-app.co.il/'),
    ('dfusreuven.co.il.conf', 'dfusreuven.co.il', '', 'https://www.dfusreuven.co.il/'),
    ('libidiamonds.co.il.conf', 'libidiamonds.co.il', '', 'https://www.libidiamonds.co.il/'),
    ('pinhasratzon.co.il.conf', 'pinhasratzon.co.il', '', 'https://pinhasratzon.co.il/'),
    ('miryamzelig.co.il.conf', 'miryamzelig.co.il', '', 'https://miryamzelig.co.il/'),
    ('sosbaderech.co.il.conf', 'sosbaderech.co.il', '', 'https://sosbaderech.co.il/'),
]

def main():
    key = Path('/root/.visitor-signal-key').read_text().strip()
    if not re.fullmatch('[0-9a-fA-F]{64}', key): raise RuntimeError('Invalid signal key')
    backup = Path('/root/server-monitor-backups') / ('growth-coverage-' + time.strftime('%Y%m%d-%H%M%S'))
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
        asset = Path('/var/lib/server-monitor'); asset.mkdir(mode=0o755, exist_ok=True)
        write(asset / 'growth-tracker.js', (ROOT / 'ops/growth-tracker.js').read_text(), 0o644)
        maps = ['map "$host:$uri" $monitor_growth_tag {', '    default "";',
            '    ~*^(www\\.)?vee-app\\.co\\.il:/(maavar|Manager_Site|serve-monitor|DfusReuven|LibiDiamonds2|Miryam_Zelig|api|admin|login|dashboard)(/|$) "";',
            '    ~*^(www\\.)?lawebs\\.co\\.il:/(PinhasRatzon|admin|login|dashboard)(/|$) "";']
        for config, host, prefix, site in SITES:
            suffix = re.escape(prefix) + '(?:/|$)' if prefix else '/'
            tag = f'<script defer src="/.well-known/server-monitor-growth.js" data-prefix="{prefix}"></script>'
            maps.append(f"    ~^(?:www\\.)?{re.escape(host)}:{suffix} '{tag}';")
        maps.append('}')
        write('/etc/nginx/conf.d/server-monitor-growth.conf', '\n'.join(maps)+'\n', 0o644)
        seen = set()
        def uncompress(path):
            path = Path(path)
            if path in seen: return
            seen.add(path)
            content = path.read_text()
            updated = re.sub(r'(proxy_pass\s+[^;]+;)(?!\n\s*proxy_set_header Accept-Encoding)', r'\1\n    proxy_set_header Accept-Encoding "";', content)
            if updated != content: write(path, updated)
            for include in re.findall(r'include\s+(/etc/nginx/snippets/[^;*]+);', content):
                if not any(token in include for token in ['visitor-signal', 'monitor-navigation', 'monitor-growth']): uncompress(include)
        for config in sorted(set(row[0] for row in SITES)):
            snippet = Path('/etc/nginx/snippets') / ('monitor-growth-' + config)
            navigation = Path('/etc/nginx/snippets') / ('monitor-navigation-' + config)
            content = []
            if navigation.exists():
                navtext = navigation.read_text()
                navtext = navtext.replace("'<head>$monitor_navigation_tag';", "'<head>$monitor_navigation_tag$monitor_growth_tag';")
                write(navigation, navtext)
            else:
                content += ['sub_filter_once on;', "sub_filter '<head>' '<head>$monitor_growth_tag';"]
            content += ['location = /.well-known/server-monitor-growth.js {',
                '    alias /var/lib/server-monitor/growth-tracker.js;', '    default_type application/javascript;',
                '    add_header Cache-Control "no-cache";', '}']
            for _, host, prefix, site in [row for row in SITES if row[0] == config]:
                content += [f'location = {prefix}/.well-known/vee-growth-signal {{',
                    '    limit_except POST { deny all; }', '    client_max_body_size 16k;',
                    '    proxy_pass http://127.0.0.1:4010/serve-monitor/api/browser-signals/site;',
                    '    proxy_set_header Content-Type application/json;',
                    f'    proxy_set_header X-Visitor-Signal-Key "{key}";',
                    f'    proxy_set_header X-Visitor-Site-Url "{site}";',
                    '    proxy_set_header X-Visitor-IP $remote_addr;',
                    '    proxy_set_header X-Visitor-User-Agent $http_user_agent;', '}']
            write(snippet, '\n'.join(content)+'\n', 0o600)
            conf = Path('/etc/nginx/sites-available') / config
            conftext = conf.read_text(); include = f'    include {snippet};'
            for start, end in reversed(list(helper.server_blocks(conftext))):
                block = conftext[start:end]
                serving = 'location ' in block or re.search(r'include\s+/etc/nginx/snippets/[^;]*locations\.conf;', block)
                if re.search(r'listen\s+[^;]*443', block) and serving and include not in block:
                    conftext = conftext[:start] + block[:-1] + '\n' + include + '\n}' + conftext[end:]
            if include not in conftext: raise RuntimeError('No serving TLS block: '+config)
            write(conf, conftext); uncompress(conf)
        subprocess.run(['nginx', '-t'], check=True, capture_output=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
        print('Growth coverage installed for 12 canonical sites; backup: '+str(backup))
    except BaseException:
        for path, original in originals.items():
            if original is None: path.unlink(missing_ok=True)
            else: path.write_bytes(original)
        subprocess.run(['nginx', '-t'], capture_output=True)
        raise

if __name__ == '__main__': main()
