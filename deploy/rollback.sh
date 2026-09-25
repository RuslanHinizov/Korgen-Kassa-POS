#!/bin/sh
# Go back to the version that ran before the last update (code only).
#   sh deploy/rollback.sh
# If the update also changed the database in a way the old code cannot read, restore the
# pre-update backup as well:  sh deploy/restore.sh /opt/korgen-backups/pre-update-XXXX.dump olgax_pos
set -eu
cd /opt/korgen
COMPOSE="docker compose --env-file .env.production -f docker-compose.prod.yml"
docker image inspect korgen-web:previous >/dev/null 2>&1 || { echo "no previous version saved"; exit 1; }
docker tag korgen-web:previous korgen-web
# start the app from the saved image without rebuilding
$COMPOSE up -d --no-build --force-recreate web
echo "rolled back to the previous image. Check: $COMPOSE ps"
