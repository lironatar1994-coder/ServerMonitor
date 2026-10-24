#!/usr/bin/env bash
# Claude Remote lives inside Server Monitor (`/serve-monitor/remote`). PC agents installed
# before the move keep calling https://lawebs.co.il/rc/api/agent/ with their existing token;
# Nginx forwards those calls to the monitor and sends the old panel to the monitor screen.
# Retires the standalone claude-rc runtime once the relay answers. Idempotent; run after
# the monitor backend has restarted.
set -euo pipefail

TOKEN_FILE="${RC_AGENT_TOKEN_FILE:-/root/.server-monitor-rc-agent.sha256}"
LEGACY_AUTH=/var/lib/claude-rc/auth.json
SITE_CONF=/etc/nginx/sites-available/lawebs.co.il.conf
SNIPPET=/etc/nginx/snippets/claude-rc.conf
RETIRED=/root/retired-20261025
MONITOR_PORT="${PORT:-4010}"

# The existing agent token keeps working: only its SHA-256 moves to a root-only file.
if [ ! -s "$TOKEN_FILE" ] && [ -f "$LEGACY_AUTH" ]; then
  (umask 077; python3 -c 'import json,re,sys; h=json.load(open(sys.argv[1]))["agentTokenSha256"]; assert re.fullmatch("[0-9a-f]{64}", h); print(h)' "$LEGACY_AUTH" > "$TOKEN_FILE")
  echo "[INFO] Moved the Claude Remote agent token hash into Server Monitor"
fi
if [ -f "$TOKEN_FILE" ]; then chmod 600 "$TOKEN_FILE"; else echo "[WARN] No remote-control agent token yet; run pc-agent/install.ps1 on the PC"; fi

curl --silent --output /dev/null --max-time 5 --retry 10 --retry-connrefused --retry-delay 1 \
  "http://127.0.0.1:$MONITOR_PORT/serve-monitor/api/remote/agent/poll" || { echo '[ERROR] Monitor relay is not answering'; exit 1; }

backup=$(mktemp -d)
cp -a "$SITE_CONF" "$backup/site.conf"
if [ -f "$SNIPPET" ]; then cp -a "$SNIPPET" "$backup/snippet.conf"; fi
restore() {
  cp -a "$backup/site.conf" "$SITE_CONF"
  if [ -f "$backup/snippet.conf" ]; then cp -a "$backup/snippet.conf" "$SNIPPET"; else rm -f "$SNIPPET"; fi
  nginx -t && systemctl reload nginx || true
  echo '[ERROR] Remote relay configuration failed; restored the previous Nginx state' >&2
}
trap restore ERR

cat > "$SNIPPET" <<NGINX
# Claude Remote moved into Server Monitor (managed by ServerMonitor ops/install-remote-relay.sh).
# Older PC agents keep this address; the former panel opens the monitor's remote screen.
location ^~ /rc/api/agent/ {
    proxy_pass http://127.0.0.1:$MONITOR_PORT/serve-monitor/api/remote/agent/;
    proxy_set_header Accept-Encoding "";
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_read_timeout 75s;
    client_max_body_size 4m;
}
location = /rc { return 301 https://monitor.vee-app.co.il/serve-monitor/remote; }
location ^~ /rc/ { return 301 https://monitor.vee-app.co.il/serve-monitor/remote; }
NGINX
chmod 644 "$SNIPPET"

python3 - "$SITE_CONF" <<'PY'
import pathlib, sys
p = pathlib.Path(sys.argv[1])
s = p.read_text()
marker = '    include /etc/nginx/snippets/claude-rc.conf;'
if marker not in s:
    anchor = '    location / {'
    if s.count(anchor) != 1:
        raise SystemExit('Ambiguous nginx insertion point')
    p.write_text(s.replace(anchor, marker + '\n\n' + anchor, 1))
PY
nginx -t
systemctl reload nginx
sleep 1
status=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 https://lawebs.co.il/rc/api/agent/poll)
[ "$status" = 401 ] || { echo "[ERROR] Relay check answered $status instead of 401"; false; }
trap - ERR
rm -rf "$backup"

# Retire the standalone runtime; keep its files in the dated archive.
if pm2 describe claude-rc >/dev/null 2>&1; then
  pm2 delete claude-rc >/dev/null
  pm2 save --force >/dev/null
  echo "[INFO] Stopped the standalone claude-rc process"
fi
for entry in /opt/claude-rc:opt-claude-rc /var/lib/claude-rc:var-lib-claude-rc /opt/claude-rc.lock:opt-claude-rc.lock; do
  path="${entry%%:*}"
  if [ -e "$path" ]; then
    install -d -m 0700 "$RETIRED"
    mv -T "$path" "$RETIRED/${entry#*:}"
  fi
done
echo "[INFO] Remote control relay: https://monitor.vee-app.co.il/serve-monitor/remote"
