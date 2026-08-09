#!/bin/bash

# ==============================================================================
# Server Monitor Production Deployment Script (Server-Side)
# ==============================================================================

set -e

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="server-monitor"
BACKEND_PORT=4010
FRONTEND_DIR="frontend"
BACKEND_DIR="backend"
GEOIP_DB_PATH="${GEOIP_DB_PATH:-/usr/share/GeoIP/GeoLite2-City.mmdb}"
BACKUP_DIR="/root/server-monitor-backups"
BACKUP_RETENTION_DAYS=7
BACKUP_MAX_COUNT=10
NGINX_LOG_CONFIG="/etc/nginx/conf.d/server-monitor-host-log.conf"
SSH_HARDENING_CONFIG="/etc/ssh/sshd_config.d/00-server-monitor-hardening.conf"
MANAGER_SITE_ANALYTICS_KEY_FILE="${MANAGER_SITE_ANALYTICS_KEY_FILE:-/root/.manager-site-analytics-key}"

echo "[INFO] Starting Deployment..."
cd "$APP_ROOT"

# 1. Git Sync
echo "[INFO] Pulling latest code..."
git fetch origin main
git reset --hard origin/main

# 2. Runtime backup
echo "[INFO] Backing up monitor database..."
mkdir -p "$BACKUP_DIR"
if [ -f "$BACKEND_DIR/monitor.db" ]; then
  BACKUP_PATH="$BACKUP_DIR/monitor-$(date +%Y%m%d-%H%M%S).db"
  sqlite3 "$BACKEND_DIR/monitor.db" ".backup '$BACKUP_PATH'"
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'monitor-*.db' -mtime +"$BACKUP_RETENTION_DAYS" -delete
  mapfile -t BACKUP_FILES < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'monitor-*.db' -printf '%T@ %p\n' | sort -nr | cut -d' ' -f2-)
  if [ "${#BACKUP_FILES[@]}" -gt "$BACKUP_MAX_COUNT" ]; then
    for ((INDEX = BACKUP_MAX_COUNT; INDEX < ${#BACKUP_FILES[@]}; INDEX++)); do
      rm -f -- "${BACKUP_FILES[$INDEX]}"
    done
  fi
  echo "[INFO] Database backup created at $BACKUP_PATH"
fi

# 3. Host-aware Nginx access log
echo "[INFO] Installing host-aware access logging..."
install -m 0644 nginx-monitor-host-log.conf "$NGINX_LOG_CONFIG"
nginx -t
systemctl reload nginx

# 4. SSH hardening: preserve key-based root administration and reject passwords.
echo "[INFO] Installing key-only SSH policy..."
install -m 0644 ssh-hardening.conf "$SSH_HARDENING_CONFIG"
sshd -t
systemctl reload ssh

# 5. Frontend Setup
echo "[INFO] Processing Frontend..."
cd "$FRONTEND_DIR"
npm ci -s
npm run build
cd ..

# 6. Backend Setup
echo "[INFO] Processing Backend..."
cd "$BACKEND_DIR"
npm ci -s
# Rebuild sqlite3 for Linux environment just in case
npm rebuild better-sqlite3
cd ..

if [ -f "$APP_ROOT/server_maintenance.sh" ]; then
  install -m 700 "$APP_ROOT/server_maintenance.sh" "/root/server_maintenance.sh"
  (crontab -l 2>/dev/null | grep -v '/root/server_maintenance.sh'; echo '0 3 * * * /bin/bash /root/server_maintenance.sh') | crontab -
  echo "[INFO] Installed versioned daily maintenance script"
fi

if [ -r "$GEOIP_DB_PATH" ]; then
  echo "[INFO] GeoIP city database found at $GEOIP_DB_PATH"
else
  echo "[WARN] GeoIP city database not found at $GEOIP_DB_PATH; visitor analytics will show unknown locations"
fi

if [ ! -s "$MANAGER_SITE_ANALYTICS_KEY_FILE" ]; then
  echo "[INFO] Creating the Manager Site analytics service key..."
  umask 077
  openssl rand -hex 32 > "$MANAGER_SITE_ANALYTICS_KEY_FILE"
fi
chmod 600 "$MANAGER_SITE_ANALYTICS_KEY_FILE"

# 7. PM2 Start
echo "[INFO] Starting PM2 process..."
# We serve the frontend via Nginx or we can use the backend to serve it
# In our architecture, we can just run the backend.
export PORT="$BACKEND_PORT"
export GEOIP_DB_PATH
export MANAGER_SITE_ANALYTICS_KEY="$(tr -d '\r\n' < "$MANAGER_SITE_ANALYTICS_KEY_FILE")"
if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
    pm2 restart "$APP_NAME" --update-env
else
    pm2 start "backend/server.js" --name "$APP_NAME" --cwd "$(pwd)" --update-env
fi
pm2 save > /dev/null

echo "[SUCCESS] DEPLOYMENT COMPLETE"
