# Production on a VPS (ps.kz or any Linux server)

`docker-compose.prod.yml` runs HTTPS + app + database + nightly backups. Requirements: a server with Docker, a
domain whose **A record points at the server**, and ports 80 and 443 open.

## 1. First start

```bash
git clone <repo> korgen && cd korgen
node scripts/gen-secrets.mjs pos.example.kz          # writes .env.production (random secrets, chmod 600)
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

- Caddy fetches and renews the TLS certificate itself; `http://` redirects to `https://`.
- The database has no published port and its own random password. Only 80/443 are reachable from outside.
- Migrations run once before the app starts. The app refuses to start when `BETTER_AUTH_SECRET` is missing,
  shorter than 32 characters or still a placeholder.
- **Copy `.env.production` somewhere safe that is not the server** (password manager). Without `POSTGRES_PASSWORD`
  a rebuilt server cannot open the old database volume.

### Empty install
```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec web \
  node scripts/create-superadmin.mjs "+7 (777) 123-45-67" "Owner name"
```
Prints a password once. Sign in at `/login`, open `/superadmin`, create markets from there.

### Moving the existing (local) data to the server
```bash
# on the PC
docker exec korgenkassamagazin-postgres-1 pg_dump -U postgres -Fc --no-owner olgax_pos > move.dump
scp move.dump user@server:~/korgen/
# on the server, app stopped:
docker compose --env-file .env.production -f docker-compose.prod.yml stop web caddy backup
deploy/restore.sh move.dump olgax_pos
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```
Uploaded images live in the `uploads_data` volume and are not part of the database dump.

## 2. Backups

The `backup` container dumps the database when it starts and then every night at `BACKUP_HOUR` (server clock):

| folder | content | kept |
|---|---|---|
| `daily/` | one dump per night | last `BACKUP_KEEP_DAILY` (14) |
| `weekly/` | the Sunday dump | last `BACKUP_KEEP_WEEKLY` (8) |

Each dump is verified with `pg_restore --list`; a failed backup is logged (`docker logs korgen-backup-1`) and never
replaces a good one.

**Backups on the same server die with the server.** Pull them to another machine regularly, e.g. from your PC:

```bash
scp -r user@server:/var/lib/docker/volumes/korgen_backups/_data ./korgen-backups
```

### Check a backup (do this once a month)
```bash
deploy/restore.sh /var/lib/docker/volumes/korgen_backups/_data/daily/olgax_pos-YYYYmmdd-HHMMSS.dump
```
Restores into a scratch database `olgax_pos_restore_test` and prints row counts; live data is not touched.
A restore tested on 2026-09-24 reproduced 52,554 products / 3 stores / 10 users exactly.

### Restore for real
Stop `web caddy backup`, run `deploy/restore.sh <dump> olgax_pos` (asks you to type `replace`), start everything again.

## 3. Updating
```bash
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```
Migrations are applied automatically. Take a manual backup first when a release contains a migration.

## 4. Isolation between markets
`node scripts/tenant-scan/scan.mjs setup | run | cleanup` (development machine, with the dev stack running) creates a
throw-away second market, signs in as its admin / manager / cashier / warehouse (and anonymously), requests every GET
API route and page with the victim market's ids in the URL and with a spoofed store cookie, and reports any response
that contains the victim market's ids, names, phones or barcodes. Run it after adding endpoints or pages.
`static-check.mjs` and `static-lookups.mjs` list handlers/queries that show no store check for a human to review.
