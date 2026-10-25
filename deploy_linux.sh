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
BACKUP_MAX_COUNT=3
NGINX_LOG_CONFIG="/etc/nginx/conf.d/server-monitor-host-log.conf"
SSH_HARDENING_CONFIG="/etc/ssh/sshd_config.d/00-server-monitor-hardening.conf"
MANAGER_SITE_ANALYTICS_KEY_FILE="${MANAGER_SITE_ANALYTICS_KEY_FILE:-/root/.manager-site-analytics-key}"
VISITOR_SIGNAL_KEY_FILE="${VISITOR_SIGNAL_KEY_FILE:-/root/.visitor-signal-key}"
AUTH_KEY_FILE="${AUTH_KEY_FILE:-/root/.server-monitor-auth-key}"
MONITOR_ORIGIN="https://monitor.vee-app.co.il"
# Anything this script has to compile runs behind the production sites, never ahead of them.
LOW_PRIORITY=(nice -n 10)
if command -v ionice > /dev/null 2>&1; then LOW_PRIORITY+=(ionice -c 3); fi

echo "[INFO] Starting Deployment..."
cd "$APP_ROOT"

# 1. Git Sync
echo "[INFO] Pulling latest code..."
git fetch origin main
git reset --hard origin/main

# 2. Runtime backup
echo "[INFO] Backing up monitor database..."
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
DEPLOY_UMASK="$(umask)"
umask 077
if [ ! -e "$AUTH_KEY_FILE" ]; then openssl rand 32 > "$AUTH_KEY_FILE"; fi
test "$(wc -c < "$AUTH_KEY_FILE")" -eq 32 || { echo '[ERROR] Invalid authentication key file'; exit 1; }
chmod 600 "$AUTH_KEY_FILE"
# Server-only settings hold mail and API secrets; keep them root-only.
if [ -f "$BACKEND_DIR/.env" ]; then chmod 600 "$BACKEND_DIR/.env"; fi
# Authentication secret backup is separate from the ciphertext-only SQLite snapshots.
install -d -m 0700 /root/server-monitor-key-backups
install -m 0600 "$AUTH_KEY_FILE" /root/server-monitor-key-backups/auth.key
if [ -f "$BACKEND_DIR/monitor.db" ]; then
  BACKUP_PATH="$BACKUP_DIR/monitor-$(date +%Y%m%d-%H%M%S).db"
  sqlite3 "$BACKEND_DIR/monitor.db" ".backup '$BACKUP_PATH'"
  test "$(sqlite3 "$BACKUP_PATH" 'PRAGMA quick_check;')" = 'ok' || { echo '[ERROR] Database backup integrity check failed'; exit 1; }
  chmod 600 "$BACKUP_PATH" "$BACKEND_DIR/monitor.db"
  for SQLITE_SIDE in "$BACKEND_DIR/monitor.db-wal" "$BACKEND_DIR/monitor.db-shm"; do
    if [ -f "$SQLITE_SIDE" ]; then chmod 600 "$SQLITE_SIDE"; fi
  done
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'monitor-*.db' -mtime +"$BACKUP_RETENTION_DAYS" -delete
  mapfile -t BACKUP_FILES < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'monitor-*.db' -printf '%T@ %p\n' | sort -nr | cut -d' ' -f2-)
  if [ "${#BACKUP_FILES[@]}" -gt "$BACKUP_MAX_COUNT" ]; then
    for ((INDEX = BACKUP_MAX_COUNT; INDEX < ${#BACKUP_FILES[@]}; INDEX++)); do
      rm -f -- "${BACKUP_FILES[$INDEX]}"
    done
  fi
  echo "[INFO] Database backup created at $BACKUP_PATH"
fi
umask "$DEPLOY_UMASK"

# 3. Host-aware Nginx access log
echo "[INFO] Installing host-aware access logging..."
LOG_CONFIG_BACKUP="$BACKUP_DIR/host-log-before-$(date +%Y%m%d-%H%M%S).conf"
if [ -f "$NGINX_LOG_CONFIG" ]; then cp -p "$NGINX_LOG_CONFIG" "$LOG_CONFIG_BACKUP"; fi
install -m 0644 nginx-monitor-host-log.conf "$NGINX_LOG_CONFIG"
if ! nginx -t; then
  if [ -f "$LOG_CONFIG_BACKUP" ]; then cp -p "$LOG_CONFIG_BACKUP" "$NGINX_LOG_CONFIG"; fi
  echo "[ERROR] Host logging validation failed; restored the prior configuration"
  exit 1
fi
systemctl reload nginx

# 4. SSH hardening: preserve key-based root administration and reject passwords.
echo "[INFO] Installing key-only SSH policy..."
install -m 0644 ssh-hardening.conf "$SSH_HARDENING_CONFIG"
sshd -t
systemctl reload ssh

# 5. Frontend: deploy.ps1 uploads the dashboard it built and checked for this exact commit.
HEAD_SHA="$(git rev-parse HEAD)"
if [ -n "${PREBUILT_FRONTEND:-}" ] && [ "$(basename "$PREBUILT_FRONTEND")" = "frontend-dist-$HEAD_SHA.tar.gz" ] && [ -s "$PREBUILT_FRONTEND" ]; then
  echo "[INFO] Installing the prebuilt dashboard for $HEAD_SHA..."
  rm -rf "$FRONTEND_DIR/dist.next"
  mkdir -p "$FRONTEND_DIR/dist.next"
  tar -xzf "$PREBUILT_FRONTEND" -C "$FRONTEND_DIR/dist.next"
  test -f "$FRONTEND_DIR/dist.next/dist/index.html"
  rm -rf "$FRONTEND_DIR/dist"
  mv "$FRONTEND_DIR/dist.next/dist" "$FRONTEND_DIR/dist"
  rm -rf "$FRONTEND_DIR/dist.next"
  # Archives packed on Windows carry no Unix modes; serve them read-only.
  chown -R root:root "$FRONTEND_DIR/dist"
  chmod -R u=rwX,go=rX "$FRONTEND_DIR/dist"
  find "$(dirname "$PREBUILT_FRONTEND")" -maxdepth 1 -name 'frontend-dist-*.tar.gz' -delete
else
  echo "[INFO] No prebuilt dashboard for this commit; building it here at low priority..."
  (cd "$FRONTEND_DIR" && "${LOW_PRIORITY[@]}" npm ci -s && "${LOW_PRIORITY[@]}" npm run build)
fi

# 6. Backend: reinstall dependencies only when the lock file or Node version changed.
echo "[INFO] Processing Backend..."
cd "$BACKEND_DIR"
DEPS_STAMP="$(sha256sum package-lock.json | cut -d' ' -f1)-$(node -v)"
if [ -d node_modules ] && [ "$(cat node_modules/.deploy-stamp 2>/dev/null)" = "$DEPS_STAMP" ]; then
  echo "[INFO] Backend dependencies unchanged"
else
  "${LOW_PRIORITY[@]}" npm ci -s
  # better-sqlite3 is native; build it for this server's Node.
  "${LOW_PRIORITY[@]}" npm rebuild better-sqlite3
  echo "$DEPS_STAMP" > node_modules/.deploy-stamp
fi
if ! node -e "process.exit(require('fs').existsSync(require('playwright').chromium.executablePath()) ? 0 : 1)"; then
  NEEDRESTART_MODE=l DEBIAN_FRONTEND=noninteractive npx playwright install --with-deps chromium
fi
cd ..

bash "$APP_ROOT/ops/install-maintenance.sh"
python3 "$APP_ROOT/ops/install-visitor-coverage.py"
python3 "$APP_ROOT/ops/install-growth-coverage.py"
bash "$APP_ROOT/ops/install-retired-sites.sh"
python3 "$APP_ROOT/ops/tidy-nginx.py"
python3 "$APP_ROOT/ops/ensure-monitor-logging.py"
bash "$APP_ROOT/ops/update-asn-db.sh"

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

if [ ! -s "$VISITOR_SIGNAL_KEY_FILE" ]; then
  echo "[INFO] Creating the first-party browser signal service key..."
  umask 077
  openssl rand -hex 32 > "$VISITOR_SIGNAL_KEY_FILE"
fi
chmod 600 "$VISITOR_SIGNAL_KEY_FILE"

if [ -f "$APP_ROOT/install_static_visitor_signals.sh" ]; then
  echo "[INFO] Installing first-party signal bridges for canonical sites..."
  VISITOR_SIGNAL_KEY_FILE="$VISITOR_SIGNAL_KEY_FILE" bash "$APP_ROOT/install_static_visitor_signals.sh"
fi

# 7. PM2 Start
echo "[INFO] Starting PM2 process..."
# We serve the frontend via Nginx or we can use the backend to serve it
# In our architecture, we can just run the backend.
export PORT="$BACKEND_PORT"
export NODE_ENV=production
export MONITOR_ORIGIN AUTH_KEY_FILE
export VAULT_ENABLED=true
export GEOIP_DB_PATH
export MANAGER_SITE_ANALYTICS_KEY="$(tr -d '\r\n' < "$MANAGER_SITE_ANALYTICS_KEY_FILE")"
export VISITOR_SIGNAL_KEY="$(tr -d '\r\n' < "$VISITOR_SIGNAL_KEY_FILE")"
export VISITOR_SIGNAL_KEY_FILE
if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
    pm2 restart "$APP_NAME" --update-env
else
    pm2 start "backend/server.js" --name "$APP_NAME" --cwd "$(pwd)" --update-env
fi
pm2 save > /dev/null
bash "$APP_ROOT/ops/install-remote-relay.sh"

echo "[INFO] Verifying production through the resource-limited browser service..."
curl --silent --show-error --fail --retry 10 --retry-connrefused --retry-delay 1 --max-time 5 \
  --output /dev/null "http://127.0.0.1:$BACKEND_PORT/serve-monitor/"
/usr/local/sbin/lawebs-maintenance browser

echo "[SUCCESS] DEPLOYMENT COMPLETE"
