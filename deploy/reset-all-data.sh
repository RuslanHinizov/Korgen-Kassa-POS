#!/bin/sh
# DANGER: wipes EVERY market and ALL data on the live server (sales, products, employees, finance, support chats, uploaded
# pictures ...). Afterwards you create a fresh, empty market in the platform owner panel (/superadmin -> new market).
# Tills activated before are cut off: they need new activation codes.
#
#   sh deploy/reset-all-data.sh                          keeps the platform owner (SUPERADMIN) account, takes a backup first
#   sh deploy/reset-all-data.sh --everything             also deletes the owner account and asks you for a NEW owner
#   sh deploy/reset-all-data.sh --everything --no-backup nothing is kept at all, no backup is taken (cannot be undone)
#
# It asks you to type a confirmation, stops the app while it works, and checks that the app answers again at the end.
set -eu
cd /opt/korgen
COMPOSE="docker compose --env-file .env.production -f docker-compose.prod.yml"
STAMP=$(date +%Y%m%d-%H%M%S)
EVERYTHING=0
BACKUP=1
for arg in "$@"; do
  case "$arg" in
    --everything) EVERYTHING=1 ;;
    --no-backup) BACKUP=0 ;;
    *) echo "unknown option: $arg"; exit 1 ;;
  esac
done

if [ "$EVERYTHING" = "1" ]; then
  echo "!! This DELETES ALL markets, ALL data AND the platform owner account."
else
  echo "!! This DELETES ALL markets and ALL their data (only the platform owner account stays)."
fi
[ "$BACKUP" = "1" ] || echo "!! NO BACKUP will be taken: this cannot be undone."
printf "To continue type exactly  DELETE EVERYTHING  and press Enter: "
read ANSWER
[ "$ANSWER" = "DELETE EVERYTHING" ] || { echo "cancelled - nothing was changed"; exit 1; }

if [ "$EVERYTHING" = "1" ]; then
  echo "New platform owner (the account that creates markets and resets passwords):"
  printf "  phone (e.g. +7 777 123 45 67): "; read OWNER_PHONE
  printf "  name: "; read OWNER_NAME
  printf "  password (8+ characters, shown while typing): "; read OWNER_PASSWORD
  [ -n "$OWNER_PHONE" ] && [ -n "$OWNER_NAME" ] && [ "${#OWNER_PASSWORD}" -ge 8 ] || { echo "phone, name and a password of 8+ characters are required - nothing was changed"; exit 1; }
fi

echo "== 1/4 backup"
if [ "$BACKUP" = "1" ]; then
  mkdir -p /opt/korgen-backups
  $COMPOSE exec -T postgres pg_dump -U postgres -Fc --no-owner --no-acl olgax_pos > "/opt/korgen-backups/before-reset-$STAMP.dump"
  [ -s "/opt/korgen-backups/before-reset-$STAMP.dump" ] || { echo "backup is empty - stopping, nothing was changed"; exit 1; }
  echo "   saved /opt/korgen-backups/before-reset-$STAMP.dump"
else
  echo "   skipped (--no-backup)"
fi

echo "== 2/4 stop the app and wipe the data"
$COMPOSE stop web
$COMPOSE exec -T postgres psql -U postgres -d olgax_pos -v ON_ERROR_STOP=1 < deploy/reset-all-data.sql
if [ "$EVERYTHING" = "1" ]; then
  $COMPOSE exec -T postgres psql -U postgres -d olgax_pos -v ON_ERROR_STOP=1 -c 'DELETE FROM "Account"; DELETE FROM "User";'
  # the new owner is made while the app is still stopped, so the first-run wizard is never open to a stranger
  $COMPOSE run --rm --no-deps -T web node scripts/create-superadmin.mjs "$OWNER_PHONE" "$OWNER_NAME" "$OWNER_PASSWORD"
fi

echo "== 3/4 start the app and clear uploaded pictures"
$COMPOSE start web
sleep 3
docker exec korgen-web-1 sh -c 'rm -rf /app/uploads/* 2>/dev/null; true'

echo "== 4/4 health check"
i=0
until docker exec korgen-web-1 node -e "fetch('http://localhost:3000/api/ping').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "!! the app does not answer. Look at: docker logs korgen-web-1 --tail 40"
    exit 1
  fi
  sleep 2
done
echo "OK - the server is empty."
[ "$BACKUP" = "1" ] && echo "Backup: /opt/korgen-backups/before-reset-$STAMP.dump"
echo "Next: sign in at https://korgenkassa.kz/login as the platform owner, open /superadmin and create the new market."
