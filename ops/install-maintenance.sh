#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
install -m 700 "$ROOT/ops/maintenance.py" /usr/local/sbin/lawebs-maintenance
install -m 700 "$ROOT/server_maintenance.sh" /root/server_maintenance.sh
# Preserve replication manifests/acknowledgements; keep the compatibility copy identical.
install -d -m 700 /var/lib/lawebs-maintenance
install -m 700 "$ROOT/ops/maintenance.py" /var/lib/lawebs-maintenance/maintenance.py
cat > /etc/systemd/system/lawebs-maintenance.service <<'UNIT'
[Unit]
Description=Verified backups, bounded cleanup and resource health
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/lawebs-maintenance daily
TimeoutStartSec=20min
Nice=15
IOSchedulingClass=idle
UMask=0077
Environment=PM2_HOME=/root/.pm2
UNIT
cat > /etc/systemd/system/lawebs-maintenance.timer <<'UNIT'
[Unit]
Description=Daily production maintenance
[Timer]
OnCalendar=*-*-* 03:00:00
RandomizedDelaySec=300
Persistent=true
[Install]
WantedBy=timers.target
UNIT
cat > /etc/systemd/system/lawebs-health.service <<'UNIT'
[Unit]
Description=Production service, disk, memory, TLS and backup health
After=network-online.target
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/lawebs-maintenance health
TimeoutStartSec=5min
Nice=15
UMask=0077
Environment=PM2_HOME=/root/.pm2
UNIT
cat > /etc/systemd/system/lawebs-browser-check.service <<'UNIT'
[Unit]
Description=Bounded portfolio and monitor browser verification
After=network-online.target
[Service]
Type=oneshot
WorkingDirectory=/root/ServerMonitor
ExecStart=/usr/bin/node /root/ServerMonitor/ops/browser-check.cjs
TimeoutStartSec=180
TimeoutStopSec=10
KillMode=control-group
MemoryAccounting=true
MemoryHigh=512M
MemoryMax=640M
MemorySwapMax=128M
CPUAccounting=true
CPUQuota=75%
CPUWeight=10
Nice=15
IOSchedulingClass=idle
OOMScoreAdjust=500
UMask=0077
UNIT
cat > /etc/systemd/system/lawebs-health.timer <<'UNIT'
[Unit]
Description=Production health every 15 minutes
[Timer]
OnBootSec=10min
OnUnitActiveSec=15min
[Install]
WantedBy=timers.target
UNIT
cron_file="$(mktemp)"
crontab -l > "$cron_file" 2>/dev/null || true
sed -i '\|/root/server_maintenance.sh|d' "$cron_file"
crontab "$cron_file"
rm -f -- "$cron_file"
/usr/bin/pm2 set pm2-logrotate:retain 7 >/dev/null
/usr/bin/pm2 set pm2-logrotate:compress true >/dev/null
/usr/bin/pm2 set pm2-logrotate:max_size 10M >/dev/null
systemctl daemon-reload
systemctl enable --now lawebs-maintenance.timer lawebs-health.timer
