#!/usr/bin/env bash
# DB-IP City Lite, CC BY 4.0; lookups remain local. Failed refresh preserves the old file.
set -uo pipefail
TARGET="${GEOIP_DB_PATH:-/usr/share/GeoIP/GeoLite2-City.mmdb}"
if [ -s "$TARGET" ] && [ -z "$(find "$TARGET" -mtime +35 2>/dev/null)" ]; then exit 0; fi
install -d -m 0755 "$(dirname "$TARGET")"
tmp="$(mktemp)"
trap 'rm -f "$tmp" "$tmp.mmdb"' EXIT
for month in "$(date +%Y-%m)" "$(date -d '-1 month' +%Y-%m)"; do
  if curl -sf --max-time 60 --max-filesize 80000000 -o "$tmp" "https://download.db-ip.com/free/dbip-city-lite-${month}.mmdb.gz" && gunzip -c "$tmp" > "$tmp.mmdb"; then
    if node -e 'const fs=require("fs"), M=require("/root/ServerMonitor/backend/node_modules/maxmind");const r=new M.Reader(fs.readFileSync(process.argv[1])); if(!r.get("8.8.8.8"))process.exit(1)' "$tmp.mmdb"; then
      install -m 0644 "$tmp.mmdb" "$TARGET"
      echo '[INFO] DB-IP city database updated'
      exit 0
    fi
  fi
done
echo '[WARN] City database refresh failed; existing data preserved' >&2
exit 0
