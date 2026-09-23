#!/usr/bin/env bash
# Export the live D1 database to backups/<timestamp>-<label>.sql (schema + data).
# Usage: scripts/backup-d1.sh [label]      e.g. scripts/backup-d1.sh pre-v1.1
set -euo pipefail
cd "$(dirname "$0")/.."
label="${1:-manual}"
mkdir -p backups
out="backups/$(date +%Y%m%d-%H%M)-${label}.sql"
npx wrangler d1 export console-db --remote --config wrangler.jsonc --output "$out" >/dev/null
rows=$(grep -c "^INSERT INTO" "$out" || true)
echo "$out  ($(du -h "$out" | cut -f1), $rows insert statements)"
