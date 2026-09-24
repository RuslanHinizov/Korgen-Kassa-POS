#!/bin/sh
# Restore a backup dump. Run on the server, from the project folder:
#
#   deploy/restore.sh <dump-file> [target-database]
#
# By default the dump is restored into a SCRATCH database ("olgax_pos_restore_test") so you can check it
# without touching live data; it prints table row counts. To replace the live database, stop the app first:
#   docker compose --env-file .env.production -f docker-compose.prod.yml stop web caddy backup
#   deploy/restore.sh backups/olgax_pos-YYYYmmdd-HHMMSS.dump olgax_pos
#   docker compose --env-file .env.production -f docker-compose.prod.yml up -d
set -eu
FILE=${1:?usage: deploy/restore.sh <dump-file> [target-database]}
TARGET=${2:-olgax_pos_restore_test}
COMPOSE=${COMPOSE:-"docker compose --env-file .env.production -f docker-compose.prod.yml"}

if [ "$TARGET" = "olgax_pos" ]; then
  printf 'This REPLACES the live database "olgax_pos" with %s. Type "replace" to continue: ' "$FILE"
  read -r answer
  [ "$answer" = "replace" ] || { echo "cancelled"; exit 1; }
fi

$COMPOSE exec -T postgres psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS \"$TARGET\"" -c "CREATE DATABASE \"$TARGET\""
$COMPOSE exec -T postgres pg_restore -U postgres -d "$TARGET" --no-owner --exit-on-error < "$FILE"
echo "restored into database: $TARGET"
$COMPOSE exec -T postgres psql -U postgres -d "$TARGET" -Atc \
  "select 'Product', count(*) from \"Product\" union all select 'Sale', count(*) from \"Sale\" union all select 'User', count(*) from \"User\" union all select 'Store', count(*) from \"Store\""
