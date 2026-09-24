# Deploying on Plesk shared hosting (ps.kz) — no Docker, no SSH

Works only if the plan has the **Node.js** extension (22 or 24) and the server may open outgoing connections to a
PostgreSQL server (port 5432). ps.kz's own PostgreSQL is 9.2 and cannot be used.

## 1. Build the package (on your PC, Docker Desktop running)
```bash
docker build -f deploy/plesk/Dockerfile --output type=local,dest=dist-plesk .
```
Result: `dist-plesk/korgen-app.tar.gz` (~170 MB). It contains the built app plus a production-only `node_modules`,
built for Linux/glibc with Node 22. Tested by starting it in a clean `node:22-bookworm-slim` container against the
real database: login page, login API, product/sales/report pages and an xlsx export answered 200.

## 2. Database (PostgreSQL 14+ elsewhere, e.g. Neon)
Create the database in the provider's dashboard, copy its connection string (keep it private), then move the data:
```bash
docker exec korgenkassamagazin-postgres-1 pg_dump -U postgres -Fc --no-owner --no-acl olgax_pos > move.dump
docker run --rm -v "%cd%:/d" postgres:16-alpine pg_restore -d "<CONNECTION STRING>" --no-owner --no-acl /d/move.dump
```
(PowerShell: use `${PWD}` instead of `%cd%`.) The connection string must contain `?sslmode=require` for most providers.

## 3. Secrets
`node scripts/gen-secrets.mjs korgenkassa.kz` writes `.env.production`; only its `BETTER_AUTH_SECRET` line is needed here.

## 4. Plesk
1. **Files**: upload `korgen-app.tar.gz` to the domain's folder (next to `httpdocs`), extract it → folder `korgen-app`.
   Create an empty folder `uploads` next to it (product photos; survives updates).
2. **Websites & Domains → korgenkassa.kz → Node.js**, Enable Node.js:
   - Node.js version: 22 (or 24)
   - Application mode: production
   - Application root: the `korgen-app` folder
   - Application startup file: `app.js`
   - Custom environment variables:
     `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=https://korgenkassa.kz`,
     `NEXT_PUBLIC_APP_URL=https://korgenkassa.kz`, `BETTER_AUTH_TRUSTED_ORIGINS=https://korgenkassa.kz`,
     `UPLOAD_DIR=<full path of the uploads folder>`, `NODE_ENV=production`
   - Do **not** press "NPM install" — everything is already in the package.
3. **SSL/TLS Certificates**: issue Let's Encrypt for the domain; in Hosting settings turn on the permanent redirect
   from http to https.
4. Press **Restart App**, open https://korgenkassa.kz/login.

## 5. Updating
Build a new package, upload, extract over the old folder (keep `uploads`), Restart App. New migrations are applied
from your PC: `DATABASE_URL="<CONNECTION STRING>" npx prisma migrate deploy`.

## 6. Backups
Take a dump from your PC regularly:
`docker run --rm -e PGPASSWORD=... postgres:16-alpine pg_dump -h <host> -U <user> -Fc <db> > backup.dump`
and restore with `deploy/restore.sh`-style `pg_restore`. Also use the provider's own point-in-time restore.
