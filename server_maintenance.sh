#!/usr/bin/env bash

set -u

LOG_FILE="/var/log/server_maintenance.log"
SUMMARY_LOG="/var/log/server_cleanup_summary.log"
BACKUP_DIR="/root/db_backups"
PM2_BIN="/usr/bin/pm2"
RETENTION_DAYS=7

exec > >(tee "$LOG_FILE") 2>&1

echo "Server Cleanup Summary" > "$SUMMARY_LOG"
echo "Run started: $(date)" >> "$SUMMARY_LOG"
echo "Mode: scheduled daily maintenance" >> "$SUMMARY_LOG"
echo "----------------------------------------" >> "$SUMMARY_LOG"

summary() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" >> "$SUMMARY_LOG"
}

echo "--- Server Maintenance Started at $(date) ---"
summary "Started scheduled cleanup run."

journalctl --vacuum-time=7d
summary "System journal vacuumed; retained seven days."

if [ -x "$PM2_BIN" ]; then
    "$PM2_BIN" set pm2-logrotate:retain "$RETENTION_DAYS" >/dev/null
    "$PM2_BIN" set pm2-logrotate:compress true >/dev/null
    find /root/.pm2/logs -maxdepth 1 -type f -name '*__*.log' -mtime +"$RETENTION_DAYS" -delete
    summary "PM2 rotated logs limited to seven days with compression enabled."
fi

apt-get clean
summary "APT cache cleaned."

find /tmp -maxdepth 1 -type f -name '*-deploy.tar.gz' -mtime +1 -delete
find /tmp -maxdepth 1 -type d -name 'npm-*' -mtime +3 -exec rm -rf -- {} +
find /tmp -maxdepth 1 -type d -name 'v8-compile-cache-*' -mtime +3 -exec rm -rf -- {} +
summary "Expired deployment archives and Node temporary directories removed."

for cache_dir in \
    "/root/TextToPDF/.next/cache" \
    "/root/Vee/frontend/.next/cache" \
    "/root/OnYourWay/frontend/.next/cache" \
    "/root/sos-landing-standalone/.next/cache" \
    "/root/LibiDiamonds-live/.next/cache" \
    "/root/ServerMonitor/frontend/node_modules/.vite"; do
    if [ -d "$cache_dir" ]; then
        find "$cache_dir" -mindepth 1 -mtime +7 -delete 2>/dev/null || true
    fi
done
summary "Build-cache entries older than seven days removed."

mkdir -p "$BACKUP_DIR"

backup_sqlite_db() {
    local label="$1"
    local db_path="$2"
    local timestamp="$3"
    local backup_file="$BACKUP_DIR/${label}_${timestamp}.sqlite"

    if [ ! -s "$db_path" ]; then
        summary "Skipped database backup for $label; database missing or empty."
        return
    fi

    sqlite3 "$db_path" "PRAGMA busy_timeout=5000; PRAGMA wal_checkpoint(TRUNCATE); PRAGMA optimize;" || true
    if sqlite3 "$db_path" ".backup '$backup_file'"; then
        gzip -f "$backup_file"
        summary "Created compressed SQLite backup: ${backup_file}.gz"
    else
        rm -f -- "$backup_file"
        summary "ERROR: SQLite backup failed for $label."
    fi
}

timestamp="$(date +%Y%m%d_%H%M%S)"
backup_sqlite_db "vee_database" "/root/Vee/backend/database.sqlite" "$timestamp"
backup_sqlite_db "on_your_way_prod" "/root/OnYourWay/backend/prisma/prod.db" "$timestamp"
backup_sqlite_db "sos_landing_analytics" "/root/sos-landing-standalone/data/analytics.db" "$timestamp"
backup_sqlite_db "server_monitor" "/root/ServerMonitor/backend/monitor.db" "$timestamp"
find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.sqlite.gz' -mtime +7 -delete
summary "SQLite backups pruned to seven days."

disk_percent="$(df --output=pcent / | tail -1 | tr -dc '0-9')"
disk_available="$(df -h --output=avail / | tail -1 | xargs)"
memory_available="$(awk '/^MemAvailable:/ {printf "%.0f MiB", $2 / 1024}' /proc/meminfo)"

echo
df -h /
free -h
summary "Final disk usage: ${disk_percent}% with ${disk_available} available."
summary "Final available memory: ${memory_available}."

if [ "${disk_percent:-0}" -ge 90 ]; then
    summary "CRITICAL: root filesystem usage is at least 90%."
    email_subject="CRITICAL: Vee server disk at ${disk_percent}%"
elif [ "${disk_percent:-0}" -ge 80 ]; then
    summary "WARNING: root filesystem usage is at least 80%."
    email_subject="WARNING: Vee server disk at ${disk_percent}%"
else
    email_subject="Vee server maintenance: disk at ${disk_percent}%"
fi

echo "----------------------------------------" >> "$SUMMARY_LOG"
echo "Run completed: $(date)" >> "$SUMMARY_LOG"
echo "--- Server Maintenance Completed at $(date) ---"

env_file="/root/Vee/backend/.env"
if [ -r "$env_file" ] && command -v jq >/dev/null 2>&1; then
    resend_key="$(sed -n 's/^RESEND_API_KEY=//p' "$env_file" | tail -1 | tr -d '\r' | sed -e 's/^["'\'']//; s/["'\'']$//')"
    email_to="$(sed -n 's/^MAINTENANCE_EMAIL_TO=//p' "$env_file" | tail -1 | tr -d '\r' | sed -e 's/^["'\'']//; s/["'\'']$//')"
    if [ -z "$email_to" ]; then
        email_to="$(sed -n 's/^REPORT_EMAIL_TO=//p' "$env_file" | tail -1 | tr -d '\r' | sed -e 's/^["'\'']//; s/["'\'']$//')"
    fi

    if [ -n "$resend_key" ] && [ -n "$email_to" ]; then
        email_html="<pre>$(sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' "$LOG_FILE")</pre>"
        payload="$(jq -n \
            --arg from "Vee Maintenance <onboarding@resend.dev>" \
            --arg to "$email_to" \
            --arg subject "$email_subject" \
            --arg html "$email_html" \
            '{from: $from, to: [$to], subject: $subject, html: $html}')"
        curl -fsS -X POST "https://api.resend.com/emails" \
            -H "Authorization: Bearer $resend_key" \
            -H "Content-Type: application/json" \
            --data "$payload"
        echo
    fi
fi
