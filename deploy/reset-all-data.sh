#!/bin/sh
# DANGER: wipes EVERY market and ALL data on the live server (sales, products, employees, finance, support chats, uploaded
# pictures ...). Keeps only the platform owner (SUPERADMIN) account. Afterwards you create a fresh, empty market in the
# platform owner panel (/superadmin -> new market). Tills activated before are cut off: they need new activation codes.
#
#   sh deploy/reset-all-data.sh
#
# It takes a database backup first (kept in /opt/korgen-backups, restorable with deploy/restore.sh), asks you to type a
# confirmation, stops the app while it works, and checks that the app answers again at the end.
set -eu
cd /opt/korgen
COMPOSE="docker compose --env-file .env.production -f docker-compose.prod.yml"
STAMP=$(date +%Y%m%d-%H%M%S)

echo "!! This DELETES ALL markets and ALL their data from the server (only the platform owner account stays)."
printf "To continue type exactly  DELETE EVERYTHING  and press Enter: "
read ANSWER
[ "$ANSWER" = "DELETE EVERYTHING" ] || { echo "cancelled - nothing was changed"; exit 1; }

echo "== 1/4 backup"
mkdir -p /opt/korgen-backups
$COMPOSE exec -T postgres pg_dump -U postgres -Fc --no-owner --no-acl olgax_pos > "/opt/korgen-backups/before-reset-$STAMP.dump"
[ -s "/opt/korgen-backups/before-reset-$STAMP.dump" ] || { echo "backup is empty - stopping, nothing was changed"; exit 1; }
echo "   saved /opt/korgen-backups/before-reset-$STAMP.dump"

echo "== 2/4 stop the app and wipe the data"
$COMPOSE stop web
$COMPOSE exec -T postgres psql -U postgres -d olgax_pos -v ON_ERROR_STOP=1 < deploy/reset-all-data.sql

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
echo "OK - the server is empty. Backup: /opt/korgen-backups/before-reset-$STAMP.dump"
echo "Next: sign in at https://korgenkassa.kz/login as the platform owner, open /superadmin and create the new market."
