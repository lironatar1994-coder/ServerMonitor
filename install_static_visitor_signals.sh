#!/usr/bin/env bash

set -euo pipefail

KEY_FILE="${VISITOR_SIGNAL_KEY_FILE:-/root/.visitor-signal-key}"
MONITOR_UPSTREAM="${SERVER_MONITOR_SIGNAL_URL:-http://127.0.0.1:4010/serve-monitor/api/browser-signals/site}"
VEE_CONF="/etc/nginx/sites-available/vee-app.co.il.conf"
MIRYAM_CONF="/etc/nginx/sites-available/miryamzelig.co.il.conf"
VEE_SNIPPET="/etc/nginx/snippets/visitor-signal-vee.conf"
MIRYAM_SNIPPET="/etc/nginx/snippets/visitor-signal-miryam.conf"

if [ "$(id -u)" -ne 0 ]; then
  echo "[ERROR] Static visitor-signal bridge installation requires root." >&2
  exit 1
fi

SIGNAL_KEY="$(tr -d '\r\n' < "$KEY_FILE")"
if ! printf '%s' "$SIGNAL_KEY" | grep -Eq '^[[:xdigit:]]{64}$'; then
  echo "[ERROR] $KEY_FILE must contain one 64-character hexadecimal key." >&2
  exit 1
fi

write_snippet() {
  local output="$1"
  local site_url="$2"
  cat > "$output" <<NGINX
location = /.well-known/vee-visitor-signal {
    limit_except POST { deny all; }
    client_max_body_size 16k;
    proxy_pass $MONITOR_UPSTREAM;
    proxy_http_version 1.1;
    proxy_set_header Content-Type application/json;
    proxy_set_header X-Visitor-Signal-Key "$SIGNAL_KEY";
    proxy_set_header X-Visitor-Site-Url "$site_url";
    proxy_set_header X-Visitor-IP \$remote_addr;
    proxy_set_header X-Visitor-User-Agent \$http_user_agent;
}
NGINX
  chmod 600 "$output"
}

write_snippet "$VEE_SNIPPET" "https://vee-app.co.il/"
write_snippet "$MIRYAM_SNIPPET" "https://miryamzelig.co.il/"

cat >> "$VEE_SNIPPET" <<NGINX
location = /pdf-studio/.well-known/vee-visitor-signal {
    limit_except POST { deny all; }
    client_max_body_size 16k;
    proxy_pass $MONITOR_UPSTREAM;
    proxy_http_version 1.1;
    proxy_set_header Content-Type application/json;
    proxy_set_header X-Visitor-Signal-Key "$SIGNAL_KEY";
    proxy_set_header X-Visitor-Site-Url "https://vee-app.co.il/pdf-studio/";
    proxy_set_header X-Visitor-IP \$remote_addr;
    proxy_set_header X-Visitor-User-Agent \$http_user_agent;
}
NGINX
chmod 600 "$VEE_SNIPPET"

timestamp="$(date +%Y%m%d-%H%M%S)"
for conf in "$VEE_CONF" "$MIRYAM_CONF"; do
  if [ ! -f "$conf" ]; then
    echo "[ERROR] Required Nginx site config is missing: $conf" >&2
    exit 1
  fi
  cp "$conf" "$conf.visitor-signal-backup.$timestamp"
done

python3 - "$VEE_CONF" "$VEE_SNIPPET" "vee-app.co.il www.vee-app.co.il" \
          "$MIRYAM_CONF" "$MIRYAM_SNIPPET" "miryamzelig.co.il www.miryamzelig.co.il" <<'PY'
from pathlib import Path
import sys

for index in range(1, len(sys.argv), 3):
    config_path = Path(sys.argv[index])
    snippet_path = sys.argv[index + 1]
    server_names = sys.argv[index + 2]
    include_line = f"    include {snippet_path};"
    text = config_path.read_text()
    if include_line in text:
        continue
    marker = f"    server_name {server_names};"
    if marker not in text:
        raise SystemExit(f"Could not find exact HTTPS server marker in {config_path}: {marker}")
    config_path.write_text(text.replace(marker, f"{marker}\n{include_line}", 1))
PY

if ! nginx -t; then
  cp "$VEE_CONF.visitor-signal-backup.$timestamp" "$VEE_CONF"
  cp "$MIRYAM_CONF.visitor-signal-backup.$timestamp" "$MIRYAM_CONF"
  nginx -t
  echo "[ERROR] Restored Nginx configs after visitor-signal validation failed." >&2
  exit 1
fi

systemctl reload nginx
echo "[INFO] Installed static first-party visitor-signal bridges for Vee and Miryam Zelig."
