// Issues a Hub token for one store — the office computer's local Hub uses it to authenticate to the cloud
// (see docs/kasa-offline-plan.md §9b and src/lib/hub-auth.ts). Prints the token once; it cannot be recovered
// afterwards, only revoked and replaced.
//
//   docker compose --env-file .env.production -f docker-compose.prod.yml exec web \
//     node scripts/create-hub-token.mjs <storeId> "Nuray office PC"
//
// List stores first if you don't have the id handy:
//   ... exec web node -e 'require("./scripts/list-stores.mjs")'   (or just query the Store table)
import { randomBytes } from "node:crypto";
import { createHash } from "node:crypto";
import pg from "pg";

const [storeId, labelArg] = process.argv.slice(2);
if (!storeId) {
  console.error('usage: node scripts/create-hub-token.mjs <storeId> ["label"]');
  process.exit(1);
}
const label = labelArg || `Hub ${new Date().toISOString().slice(0, 10)}`;

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  const store = (await db.query(`select id, name from "Store" where id = $1`, [storeId])).rows[0];
  if (!store) {
    console.error(`no store with id ${storeId}`);
    process.exit(1);
  }

  const token = "hub_" + randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const id = "ht" + randomBytes(12).toString("hex");
  await db.query(
    `insert into "HubToken" (id, "storeId", "tokenHash", label, "createdAt") values ($1, $2, $3, $4, now())`,
    [id, storeId, tokenHash, label]
  );

  console.log(`Hub token created for store "${store.name}" (${store.id})`);
  console.log(`Label: ${label}`);
  console.log("");
  console.log("Token (write it down now — it will not be shown again):");
  console.log(token);
  console.log("");
  console.log("Put it in the office computer's .env.hub as HUB_SYNC_TOKEN and HUB_STORE_ID=" + store.id);
} finally {
  await db.end();
}
