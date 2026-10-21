#!/usr/bin/env bash
# Planned host reboot (e.g. a pending kernel update) with a verified recovery.
#   planned-reboot.sh schedule "2026-10-22 03:30"   one-off timer, Israel time
#   planned-reboot.sh run                          waits for nightly jobs, then reboots
#   planned-reboot.sh verify                       after boot: health + browser checks, push summary
set -euo pipefail
STATE=/var/lib/lawebs-maintenance
FLAG="$STATE/post-reboot-pending"
RESULT="$STATE/post-reboot.json"
SELF=/usr/local/sbin/lawebs-planned-reboot
UNIT=/etc/systemd/system/lawebs-post-reboot.service
BACKEND=/root/ServerMonitor/backend

case "${1:-}" in
  schedule)
    WHEN="${2:?time required, e.g. 2026-10-22 03:30}"
    install -m 0755 "$(readlink -f "$0")" "$SELF"
    cat > "$UNIT" <<EOF
[Unit]
Description=Verify websites and services after a planned reboot
ConditionPathExists=$FLAG
Wants=network-online.target
After=network-online.target nginx.service pm2-root.service postgresql.service

[Service]
Type=oneshot
ExecStart=$SELF verify
TimeoutStartSec=900

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable -q lawebs-post-reboot.service
    systemctl stop lawebs-planned-reboot.timer 2>/dev/null || true
    systemd-run -q --unit=lawebs-planned-reboot --on-calendar="$WHEN Asia/Jerusalem" --timer-property=AccuracySec=1s "$SELF" run
    systemctl list-timers lawebs-planned-reboot.timer --no-legend
    ;;
  run)
    # Let nightly maintenance, backups and browser checks finish (at most 30 minutes).
    for _ in $(seq 180); do
      busy=0
      for unit in lawebs-maintenance lawebs-browser-check crm-backup maavar-backup; do
        systemctl is-active -q "$unit.service" && busy=1
      done
      [ "$busy" = 0 ] && break
      sleep 10
    done
    pm2 save --force >/dev/null
    date -Is > "$FLAG"
    sync
    systemctl reboot
    ;;
  verify)
    sleep 120
    "$(command -v lawebs-maintenance || echo /usr/local/sbin/lawebs-maintenance)" health >/dev/null 2>&1 || true
    systemctl start lawebs-browser-check.service >/dev/null 2>&1 || true
    python3 - "$FLAG" "$RESULT" <<'PY'
import json, subprocess, sys, time
flag, out = sys.argv[1], sys.argv[2]
def load(path):
    try: return json.load(open(path))
    except Exception: return {}
health = load('/var/lib/lawebs-maintenance/health.json')
browser = load('/var/lib/lawebs-maintenance/browser-check.json')
pm2 = json.loads(subprocess.run(['pm2', 'jlist'], capture_output=True, text=True).stdout or '[]')
down = [p['name'] for p in pm2 if p['pm2_env']['status'] != 'online']
problems = list(health.get('errors', [])) + list(browser.get('errors', [])) + [f'PM2 {name} is not online' for name in down]
result = {'requested_at': open(flag).read().strip(), 'checked_at': time.strftime('%Y-%m-%dT%H:%M:%S%z'),
          'kernel': subprocess.run(['uname', '-r'], capture_output=True, text=True).stdout.strip(),
          'pm2_online': len(pm2) - len(down), 'browser_checks': len(browser.get('checks', [])), 'problems': problems,
          'reboot_still_required': subprocess.run(['test', '-f', '/var/run/reboot-required']).returncode == 0}
json.dump(result, open(out, 'w'), ensure_ascii=False, indent=1)
print(json.dumps(result, ensure_ascii=False))
PY
    rm -f "$FLAG"
    cd "$BACKEND" && node -e '
const r = require(process.argv[1]);
require("dotenv").config({ quiet: true });
const body = r.problems.length
  ? `השרת עלה מחדש, אבל ${r.problems.length} בדיקות נכשלו: ${r.problems.slice(0, 3).join(" · ")}`.slice(0, 280)
  : `השרת עלה מחדש וכל הבדיקות עברו: ${r.pm2_online} תהליכים פעילים, ${r.browser_checks} בדיקות דפדפן.`;
require("./push").sendPush({ title: "הפעלה מחדש מתוכננת", body, url: "/serve-monitor/operations/availability" }, { urgent: true })
  .catch(() => {}).finally(() => setTimeout(() => process.exit(0), 3000));' "$RESULT" || true
    ;;
  *) echo "usage: $0 schedule 'YYYY-MM-DD HH:MM' | run | verify" >&2; exit 2 ;;
esac
