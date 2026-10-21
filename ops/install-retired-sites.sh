#!/usr/bin/env bash
# Retired domains that still resolve here answer 410 with a neutral page instead of
# falling through to another client's default server block. Certificates keep renewing.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PAGE_DIR=/var/lib/server-monitor/retired
# domain: canonical name, alias names (space separated)
SITES=("libidiamonds.co.il|libidiamonds.co.il www.libidiamonds.co.il")

install -d -m 0755 "$PAGE_DIR"
install -m 0644 "$ROOT/retired-site.html" "$PAGE_DIR/index.html"

changed=()
for entry in "${SITES[@]}"; do
  domain="${entry%%|*}"
  names="${entry#*|}"
  cert="/etc/letsencrypt/live/$domain"
  conf="/etc/nginx/sites-available/$domain.conf"
  if [ ! -s "$cert/fullchain.pem" ]; then
    echo "[WARN] No certificate for retired $domain; skipped" >&2
    continue
  fi
  backup=""
  if [ -f "$conf" ]; then backup="$(mktemp)"; cp -p "$conf" "$backup"; fi
  cat > "$conf" <<NGINX
# Retired site: neutral 410 page (managed by ServerMonitor ops/install-retired-sites.sh).
server {
    listen 80;
    listen [::]:80;
    server_name $names;
    location ^~ /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://\$host\$request_uri; }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $names;
    ssl_certificate $cert/fullchain.pem;
    ssl_certificate_key $cert/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    add_header X-Robots-Tag "noindex" always;
    error_page 410 /retired.html;
    location = /retired.html { alias $PAGE_DIR/index.html; default_type text/html; charset utf-8; internal; }
    location / { return 410; }
}
NGINX
  ln -sfn "$conf" "/etc/nginx/sites-enabled/$domain.conf"
  changed+=("$conf|$backup")
  # Restore archived renewal settings so the certificate keeps renewing.
  renewal="/etc/letsencrypt/renewal/$domain.conf"
  archived="/root/retired-20261020/letsencrypt/$domain.conf"
  if [ ! -f "$renewal" ] && [ -f "$archived" ]; then install -m 0644 "$archived" "$renewal"; fi
done

if ! nginx -t; then
  for item in "${changed[@]}"; do
    conf="${item%%|*}"; backup="${item#*|}"
    if [ -n "$backup" ]; then cp -p "$backup" "$conf"; else rm -f "$conf" "/etc/nginx/sites-enabled/$(basename "$conf")"; fi
  done
  echo "[ERROR] Retired-site configuration failed validation; restored the previous state" >&2
  exit 1
fi
systemctl reload nginx
echo "[INFO] Retired sites answer 410: ${#changed[@]}"
