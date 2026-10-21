#!/usr/bin/env bash
# Keeps the free DB-IP ASN Lite database (CC BY 4.0, "IP data by DB-IP") used to recognise
# hosting networks. Refreshes when missing or older than 35 days; a failed download keeps
# the previous file and only warns, so deployment continues.
set -uo pipefail
TARGET="${ASN_DB_PATH:-/var/lib/server-monitor/dbip-asn-lite.mmdb}"
install -d -m 0755 "$(dirname "$TARGET")"
if [ -s "$TARGET" ] && [ -z "$(find "$TARGET" -mtime +35 2>/dev/null)" ]; then
  echo "[INFO] ASN database is current"
  exit 0
fi
tmp="$(mktemp)"
trap 'rm -f "$tmp" "$tmp.mmdb"' EXIT
for month in "$(date +%Y-%m)" "$(date -d '-1 month' +%Y-%m)"; do
  if curl -sf --max-time 120 -o "$tmp" "https://download.db-ip.com/free/dbip-asn-lite-${month}.mmdb.gz" && gunzip -c "$tmp" > "$tmp.mmdb" && [ -s "$tmp.mmdb" ]; then
    install -m 0644 "$tmp.mmdb" "$TARGET"
    echo "[INFO] ASN database updated ($month)"
    exit 0
  fi
done
echo "[WARN] ASN database could not be downloaded; hosting-network detection keeps the previous file" >&2
exit 0
