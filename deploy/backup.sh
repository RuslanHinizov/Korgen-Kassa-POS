#!/bin/sh
# Nightly PostgreSQL backup (runs inside the "backup" container of docker-compose.prod.yml).
#   /backups/daily/   one dump per night, the last BACKUP_KEEP_DAILY kept
#   /backups/weekly/  the Sunday dump, the last BACKUP_KEEP_WEEKLY kept
# Every dump is checked with pg_restore --list before it counts; a broken dump is deleted and logged.
set -u

DAILY=/backups/daily
WEEKLY=/backups/weekly
mkdir -p "$DAILY" "$WEEKLY"

backup_once() {
  stamp=$(date +%Y%m%d-%H%M%S)
  file="$DAILY/olgax_pos-$stamp.dump"
  if pg_dump --format=custom --no-owner --file="$file.partial"; then
    if pg_restore --list "$file.partial" >/dev/null 2>&1 && [ -s "$file.partial" ]; then
      mv "$file.partial" "$file"
      echo "$(date -Iseconds) backup ok: $file ($(du -h "$file" | cut -f1))"
      [ "$(date +%u)" = "7" ] && cp "$file" "$WEEKLY/"
    else
      rm -f "$file.partial"
      echo "$(date -Iseconds) BACKUP FAILED: dump is not readable"
    fi
  else
    rm -f "$file.partial"
    echo "$(date -Iseconds) BACKUP FAILED: pg_dump error"
  fi
  # keep only the newest N files in each folder
  ls -1t "$DAILY"/olgax_pos-*.dump 2>/dev/null | tail -n +$((BACKUP_KEEP_DAILY + 1)) | xargs -r rm -f
  ls -1t "$WEEKLY"/olgax_pos-*.dump 2>/dev/null | tail -n +$((BACKUP_KEEP_WEEKLY + 1)) | xargs -r rm -f
}

# one backup right away (so a fresh install is covered immediately), then one every night
backup_once
while true; do
  now=$(date +%s)
  target=$(date -d "$(date +%Y-%m-%d) ${BACKUP_HOUR:-03}:00:00" +%s)
  [ "$target" -le "$now" ] && target=$((target + 86400))
  sleep $((target - now))
  backup_once
done
