// Creates the platform owner account (role SUPERADMIN) on a fresh database.
//   docker compose --env-file .env.production -f docker-compose.prod.yml exec web \
//     node scripts/create-superadmin.mjs "+7 (777) 123-45-67" "Owner"
// Prints a generated password once (or pass a third argument to choose your own, min 8 chars).
import { randomBytes, randomInt } from "node:crypto";
import pg from "pg";
import { hashPassword } from "better-auth/crypto";

const [phoneArg, nameArg, passwordArg] = process.argv.slice(2);
const digits = (phoneArg ?? "").replace(/\D/g, "");
const national = digits.length === 11 && (digits[0] === "7" || digits[0] === "8") ? digits.slice(1) : digits.length === 10 ? digits : null;
if (!national || !nameArg) {
  console.error('usage: node scripts/create-superadmin.mjs "<phone>" "<name>" [password]');
  process.exit(1);
}
const phone = `+7${national}`;
const CHARS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
const password = passwordArg ?? Array.from({ length: 12 }, () => CHARS[randomInt(CHARS.length)]).join("");
if (password.length < 8) { console.error("password must be at least 8 characters"); process.exit(1); }

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  if ((await db.query(`select 1 from "User" where phone = $1`, [phone])).rowCount) {
    console.error(`a user with phone ${phone} already exists`);
    process.exit(1);
  }
  const id = "sa" + randomBytes(12).toString("hex");
  const now = new Date();
  await db.query("begin");
  await db.query(
    `insert into "User" (id, name, email, "emailVerified", role, phone, "createdAt", "updatedAt") values ($1,$2,$3,true,'SUPERADMIN',$4,$5,$5)`,
    [id, nameArg, `p${phone.slice(1)}@phone.korgen`, phone, now],
  );
  await db.query(
    `insert into "Account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") values ($1,$2,'credential',$2,$3,$4,$4)`,
    ["acc" + randomBytes(12).toString("hex"), id, await hashPassword(password), now],
  );
  // A fresh install would otherwise send every visitor to the first-run setup wizard. (Only when the default market
  // exists; on a wiped server the owner account itself keeps the wizard closed, see src/lib/installed.ts.)
  if ((await db.query(`select 1 from "Store" where id = 'store_main'`)).rowCount) {
    await db.query(
      `insert into "BusinessSettings" (id, "storeId", "setupComplete", "updatedAt") values ($1,'store_main',true,$2)
       on conflict ("storeId") do update set "setupComplete" = true`,
      ["bs" + randomBytes(12).toString("hex"), now],
    );
  }
  await db.query("commit");
  console.log(`SUPERADMIN created\n  phone:    ${phone}\n  password: ${password}\nSign in at /login, then open /superadmin.`);
} catch (e) {
  await db.query("rollback").catch(() => {});
  throw e;
} finally {
  await db.end();
}
