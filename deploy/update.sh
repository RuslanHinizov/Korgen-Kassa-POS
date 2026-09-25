#!/bin/sh
# Safe update of the production server. Run on the server:
#
#   sh deploy/update.sh /root/korgen-src.tar.gz
#
# 1. takes a database backup (kept in /opt/korgen-backups)
# 2. remembers the running image so you can go back (deploy/rollback.sh)
# 3. unpacks the new code, builds it, applies migrations, restarts the app
# 4. checks that the app answers; if it does not, it says so and tells you how to roll back
set -eu
cd /opt/korgen
ARCHIVE=${1:?usage: sh deploy/update.sh <korgen-src.tar.gz>}
COMPOSE="docker compose --env-file .env.production -f docker-compose.prod.yml"
STAMP=$(date +%Y%m%d-%H%M%S)

echo "== 1/4 database backup"
mkdir -p /opt/korgen-backups
$COMPOSE exec -T postgres pg_dump -U postgres -Fc --no-owner --no-acl olgax_pos > "/opt/korgen-backups/pre-update-$STAMP.dump"
[ -s "/opt/korgen-backups/pre-update-$STAMP.dump" ] || { echo "backup is empty - stopping"; exit 1; }
echo "   saved /opt/korgen-backups/pre-update-$STAMP.dump"
# keep the last 20 pre-update dumps
ls -1t /opt/korgen-backups/pre-update-*.dump | tail -n +21 | xargs -r rm -f

echo "== 2/4 remember the current version"
if docker image inspect korgen-web >/dev/null 2>&1; then docker tag korgen-web korgen-web:previous; fi
echo "$STAMP" > /opt/korgen/.last-update

echo "== 3/4 unpack, build, restart"
tar -xzf "$ARCHIVE" -C /opt/korgen
$COMPOSE build migrate
$COMPOSE up -d

echo "== 4/4 health check"
i=0
until docker exec korgen-web-1 node -e "fetch('http://localhost:3000/api/ping').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "!! the app does not answer. Look at: docker logs korgen-web-1 --tail 40"
    echo "!! To go back: sh deploy/rollback.sh"
    exit 1
  fi
  sleep 2
done
echo "OK - the new version is running. Backup: /opt/korgen-backups/pre-update-$STAMP.dump"
$COMPOSE ps
