// Creates .env.production with freshly generated secrets.
//   node scripts/gen-secrets.mjs pos.example.kz
// Never overwrites an existing file (rotating BETTER_AUTH_SECRET signs every user out).
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

const domain = process.argv[2];
if (!domain || domain.includes("/") || domain.includes(":") || (!domain.includes(".") && domain !== "localhost")) {
  console.error("usage: node scripts/gen-secrets.mjs <domain>   e.g. pos.example.kz (no https://)");
  process.exit(1);
}
if (existsSync(".env.production")) {
  console.error(".env.production already exists — delete it first if you really want new secrets.");
  process.exit(1);
}

const env = `# Generated ${new Date().toISOString()} — keep this file private and back it up OFF the server.
# Losing BETTER_AUTH_SECRET only signs everyone out; losing POSTGRES_PASSWORD locks you out of a fresh database.
DOMAIN=${domain}
BETTER_AUTH_SECRET=${randomBytes(48).toString("base64")}
POSTGRES_PASSWORD=${randomBytes(24).toString("hex")}

# Nightly backup time (server clock, hour 00-23) and how many dumps to keep
BACKUP_HOUR=03
BACKUP_KEEP_DAILY=14
BACKUP_KEEP_WEEKLY=8
`;
writeFileSync(".env.production", env, { mode: 0o600 });
console.log(`.env.production written for ${domain}`);
console.log("Next: docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build");
