// Cross-tenant leak scan.
//   node scripts/tenant-scan/scan.mjs setup      create a throw-away market "ZZ Scan B" + users
//   node scripts/tenant-scan/scan.mjs run        sign in as those users and hammer every GET api route / page
//   node scripts/tenant-scan/scan.mjs cleanup    delete the throw-away market
// The "victim" market is SCAN_VICTIM (default store_main). Only read-only requests are sent at it.
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { hashPassword } from "better-auth/crypto";

const BASE = process.env.SCAN_BASE ?? "http://localhost:3000";
const DB = process.env.SCAN_DB ?? "postgresql://postgres:password@localhost:5432/olgax_pos";
const VICTIM = process.env.SCAN_VICTIM ?? "store_main";
const SCAN_STORE = "zz_scan_b";
const PASSWORD = "ScanTest123456Zz";
const USERS = [
  { id: "zz_scan_admin", role: "ADMIN", phone: "+77000009001", name: "ZZ Scan Admin" },
  { id: "zz_scan_manager", role: "MANAGER", phone: "+77000009002", name: "ZZ Scan Manager" },
  { id: "zz_scan_cashier", role: "CASHIER", phone: "+77000009003", name: "ZZ Scan Cashier" },
  { id: "zz_scan_wh", role: "WAREHOUSE", phone: "+77000009004", name: "ZZ Scan Warehouse" },
];

const db = new pg.Client({ connectionString: DB });
await db.connect();
const cmd = process.argv[2];

const q = (sql, params) => db.query(sql, params).then((r) => r.rows);

async function insert(table, values) {
  const cols = await q(
    `select column_name c, data_type t, udt_name u, is_nullable n, column_default d from information_schema.columns where table_schema='public' and table_name=$1`, [table]);
  const row = { ...values };
  for (const col of cols) {
    if (col.c in row || col.n === "YES" || col.d) continue;
    if (col.t === "USER-DEFINED") row[col.c] = (await q(`select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname=$1 order by enumsortorder limit 1`, [col.u]))[0].enumlabel;
    else if (col.t.includes("timestamp")) row[col.c] = new Date();
    else if (col.t === "boolean") row[col.c] = false;
    else if (["integer", "numeric", "double precision"].includes(col.t)) row[col.c] = 0;
    else if (col.t === "jsonb" || col.t === "json") row[col.c] = "[]";
    else row[col.c] = `zz-${col.c}`;
  }
  const keys = Object.keys(row);
  await db.query(`insert into "${table}" (${keys.map((k) => `"${k}"`).join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")})`, keys.map((k) => row[k]));
}

async function setup() {
  await cleanup(true);
  await insert("Store", { id: SCAN_STORE, name: "ZZ Scan B" });
  await insert("BusinessSettings", { id: "zz_scan_bs", storeId: SCAN_STORE }).catch((e) => console.log("settings:", e.message));
  const hash = await hashPassword(PASSWORD);
  for (const u of USERS) {
    await insert("User", { id: u.id, name: u.name, email: `p${u.phone.slice(1)}@phone.korgen`, emailVerified: true, role: u.role, phone: u.phone });
    await insert("Account", { id: `${u.id}_acc`, accountId: u.id, providerId: "credential", userId: u.id, password: hash });
    await insert("UserStoreAssignment", { id: `${u.id}_asg`, userId: u.id, storeId: SCAN_STORE });
  }
  // A little data of its own so lists are not empty.
  await insert("Category", { id: "zz_scan_cat", storeId: SCAN_STORE, name: "ZZ Own Category" });
  await insert("Product", { id: "zz_scan_prod", storeId: SCAN_STORE, name: "ZZ Own Product", barcode: "9990000000017", price: 10, cost: 5 });
  await insert("Customer", { id: "zz_scan_cust", storeId: SCAN_STORE, name: "ZZ Own Customer" });
  console.log("scan market ready:", SCAN_STORE, USERS.map((u) => u.phone).join(" "));
}

async function cleanup(quiet) {
  const ids = USERS.map((u) => u.id);
  const del = async (sql, p) => db.query(sql, p).catch((e) => { if (!quiet) console.log("cleanup:", e.message.split("\n")[0]); });
  await del(`delete from "InventoryMovement" where "productId" in (select id from "Product" where "storeId"=$1)`, [SCAN_STORE]);
  await del(`delete from "Refund" where "userId"=any($1)`, [ids]);
  await del(`delete from "Store" where id=$1`, [SCAN_STORE]);
  await del(`delete from "Session" where "userId"=any($1)`, [ids]);
  await del(`delete from "Account" where "userId"=any($1)`, [ids]);
  await del(`delete from "User" where id=any($1)`, [ids]);
  if (!quiet) console.log("scan market removed");
}

// ---------- route discovery ----------
function walk(dir, name) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, name));
    else if (e.name === name) out.push(p);
  }
  return out;
}
const toUrl = (file, root) =>
  "/" + path.relative(root, path.dirname(file)).split(path.sep).filter((s) => !/^\(.*\)$/.test(s)).join("/");

function apiRoutes() {
  const root = "src/app/api";
  return walk(root, "route.ts").map((f) => {
    const src = fs.readFileSync(f, "utf8");
    const methods = [...src.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]);
    return { file: f, url: "/api" + toUrl(f, root).replace(/^\/$/, ""), methods };
  }).filter((r) => !r.url.includes("[...") && r.methods.length);
}
function pageRoutes() {
  const root = "src/app";
  return walk(root, "page.tsx").map((f) => ({ file: f, url: toUrl(f, root) || "/" })).filter((r) => !r.url.startsWith("/api"));
}

// ---------- victim fingerprints ----------
async function fingerprints() {
  const ids = new Set(); const strings = new Set(); const byTable = {};
  const tables = (await q(`select table_name t from information_schema.columns where table_schema='public' and column_name='storeId'`)).map((r) => r.t);
  const scoped = {
    Refund: `"saleId" in (select id from "Sale" where "storeId"=$1)`,
    SaleItem: `"saleId" in (select id from "Sale" where "storeId"=$1)`,
    CashMovement: `"shiftId" in (select id from "Shift" where "storeId"=$1)`,
    StocktakeItem: `"stocktakeId" in (select id from "Stocktake" where "storeId"=$1)`,
    QuickProduct: `"groupId" in (select id from "QuickProductGroup" where "storeId"=$1)`,
    InventoryMovement: `"productId" in (select id from "Product" where "storeId"=$1)`,
    LoyaltyLog: `"customerId" in (select id from "Customer" where "storeId"=$1)`,
    CustomerPayment: `"customerId" in (select id from "Customer" where "storeId"=$1)`,
  };
  const targets = [...tables.map((t) => [t, `"storeId"=$1`]), ...Object.entries(scoped)];
  for (const [t, where] of targets) {
    if (t === "BusinessSettings" || t === "UserStoreAssignment") continue;
    let rows;
    try { rows = await q(`select id from "${t}" where ${where} order by random() limit 4000`, [VICTIM]); } catch (e) { console.log("fp skip", t, e.message.split("\n")[0]); continue; }
    byTable[t] = rows.map((r) => r.id);
    rows.forEach((r) => ids.add(r.id));
  }
  // hard-coded UI words that happen to equal a victim's names (default account / category labels)
  for (const generic of ["Сейф - 1", "Разное"]) strings.delete(generic);
  ids.add(VICTIM);
  const vs = await q(`select name, address from "Store" where id=$1`, [VICTIM]);
  vs.forEach((s) => [s.name, s.address].filter((x) => x && x.length > 3).forEach((x) => strings.add(x)));
  const users = await q(`select u.id, u.name, u.phone, u.email from "User" u join "UserStoreAssignment" a on a."userId"=u.id where a."storeId"=$1 and u.id not like 'zz_scan%'`, [VICTIM]);
  users.forEach((u) => { ids.add(u.id); byTable.User = [...(byTable.User ?? []), u.id]; if (u.phone) strings.add(u.phone); if (u.name && u.name.length > 4) strings.add(u.name); if (u.email) strings.add(u.email); });
  for (const [t, col] of [["Customer", "name"], ["Customer", "phone"], ["Supplier", "name"], ["Category", "name"], ["FinanceAccount", "name"], ["Consultant", "name"], ["Cashbox", "name"], ["DiscountCard", "code"], ["QuickProductGroup", "name"], ["Promotion", "name"]]) {
    try { (await q(`select distinct "${col}" v from "${t}" where "storeId"=$1 and "${col}" is not null limit 3000`, [VICTIM])).forEach((r) => { if (String(r.v).length >= 6) strings.add(String(r.v)); }); } catch (e) { console.log("fp text skip", t, col, e.message); }
  }
  const codes = await q(`select barcode from "Product" where "storeId"=$1 and barcode is not null and length(barcode)>=8`, [VICTIM]);
  const barcodes = new Set(codes.map((r) => r.barcode));
  for (const generic of ["Сейф - 1", "Разное"]) strings.delete(generic);
  return { ids, strings, byTable, barcodes };
}

function findLeak(body, fp) {
  const hits = [];
  for (const m of body.matchAll(/[A-Za-z0-9_]{20,32}/g)) { if (fp.ids.has(m[0])) { hits.push(m[0]); if (hits.length > 2) break; } }
  if (hits.length < 3) for (const m of body.matchAll(/\d{8,14}/g)) { if (fp.barcodes.has(m[0])) { hits.push("barcode:" + m[0]); if (hits.length > 2) break; } }
  for (const s of fp.strings) if (body.includes(s)) { hits.push("text:" + s); if (hits.length > 4) break; }
  if (body.includes(VICTIM)) hits.push("id:" + VICTIM);
  return hits;
}

// ---------- session helpers ----------
async function login(phone) {
  const r = await fetch(`${BASE}/api/login/phone`, { method: "POST", headers: { "content-type": "application/json", cookie: "olgax-setup-complete=1" }, body: JSON.stringify({ phone, password: PASSWORD }) });
  if (!r.ok) throw new Error(`login ${phone}: ${r.status} ${await r.text()}`);
  return ["olgax-setup-complete=1", ...r.headers.getSetCookie().map((c) => c.split(";")[0])].join("; ");
}
async function hit(url, cookie) {
  try {
    const r = await fetch(BASE + url, { headers: { cookie }, redirect: "manual", signal: AbortSignal.timeout(30000) });
    const ct = r.headers.get("content-type") ?? "";
    const body = ct.includes("json") || ct.includes("text") || ct.includes("html") ? await r.text() : `[binary ${ct}]`;
    return { status: r.status, body, location: r.headers.get("location") };
  } catch (e) { return { status: 0, body: String(e) }; }
}

const isDyn = (s) => /^\[.+\]$/.test(s);

async function run() {
  const fp = await fingerprints();
  console.log(`victim ${VICTIM}: ${fp.ids.size} ids, ${fp.strings.size} strings, ${fp.barcodes.size} barcodes`);
  const api = apiRoutes().filter((r) => r.methods.includes("GET"));
  const pages = pageRoutes();
  console.log(`${api.length} GET api routes, ${pages.length} pages`);

  // Candidate victim ids for dynamic segments: a few from every table.
  const sample = [];
  for (const [t, list] of Object.entries(fp.byTable)) list.slice(0, 3).forEach((id) => sample.push({ t, id }));
  sample.push({ t: "Store", id: VICTIM });

  const actors = [];
  for (const u of USERS) actors.push({ name: u.role, cookie: await login(u.phone) });
  actors.push({ name: "ANON", cookie: "olgax-setup-complete=1" });
  const variants = [
    { label: "own-cookie", extra: (c) => (c ? `${c}; store-id=${SCAN_STORE}` : c) },
    { label: "spoofed-store-cookie", extra: (c) => (c ? `${c}; store-id=${VICTIM}` : c) },
  ];
  const PAGE_TABLES = ["Store", "Sale", "Product", "Customer", "Stocktake", "Supplier", "Shift"];

  const findings = []; const stats = {}; let n = 0;
  const record = (kind, actor, variant, url, res, hits) => findings.push({ kind, actor, variant, url, status: res.status, hits });

  for (const a of actors) for (const v of variants) {
    if (a.name === "ANON" && v.label !== "own-cookie") continue;
    const cookie = v.extra(a.cookie);
    const tasks = [];
    for (const r of api) {
      const segs = r.url.split("/").filter(Boolean);
      if (!segs.some(isDyn)) tasks.push({ url: r.url, foreign: false });
      else for (const s of sample) tasks.push({ url: "/" + segs.map((x) => (isDyn(x) ? s.id : x)).join("/"), foreign: true, table: s.t });
    }
    // Pages live under /store/<id>/...; the id in the URL is client-controlled, so try our own market and the victim's.
    const prefix = v.label === "own-cookie" ? SCAN_STORE : VICTIM;
    for (const p of pages) {
      if (p.url.startsWith("/superadmin") || p.url === "/setup" || p.url.startsWith("/login") || p.url.startsWith("/kasa-giris")) { tasks.push({ url: p.url, page: true }); continue; }
      const segs = p.url.split("/").filter(Boolean);
      const at = (rest) => `/store/${prefix}${rest === "/" ? "" : rest}`;
      if (!segs.some(isDyn)) tasks.push({ url: at(p.url), page: true });
      else for (const s of sample.filter((x) => PAGE_TABLES.includes(x.t))) tasks.push({ url: at("/" + segs.map((x) => (isDyn(x) ? s.id : x)).join("/")), foreign: true, page: true, table: s.t });
    }
    let i = 0;
    await Promise.all(Array.from({ length: 6 }, async () => {
      while (i < tasks.length) {
        const t = tasks[i++]; n++;
        const res = await hit(t.url, cookie);
        const all = findLeak(res.body, fp);
        const hits = all.filter((h) => !t.url.includes(h.replace(/^id:/, "")));
        const ok2xx = res.status >= 200 && res.status < 300;
        stats[a.name + "/" + v.label] ??= {}; stats[a.name + "/" + v.label][res.status] = (stats[a.name + "/" + v.label][res.status] ?? 0) + 1;
        // only the id we put in the URL came back: a problem only when the row was actually served (2xx)
        if (all.length && !hits.length) { if (ok2xx) record(t.page ? "PAGE-FOREIGN-ID-200" : "API-FOREIGN-ID-200", a.name, v.label, t.url, res, all); }
        else if (hits.length) record(t.page ? "PAGE-LEAK" : "API-LEAK", a.name, v.label, t.url, res, hits);
        else if (t.foreign && ok2xx && !t.page && res.body.length > 20 && a.name !== "ANON") record("API-200-FOR-FOREIGN-ID?", a.name, v.label, t.url, res, []);
        if (a.name === "ANON" && ok2xx && !t.page && !/^\/api\/(ping|health|auth|login|setup|errors)/.test(t.url)) record("ANON-API-200", a.name, v.label, t.url, res, []);
      }
    }));
    console.log(`${a.name}/${v.label}: ${tasks.length} requests`);
  }
  console.log(`total requests ${n}`);
  console.log("status histogram:", JSON.stringify(stats));
  const out = "scripts/tenant-scan/last-report.json";
  fs.writeFileSync(out, JSON.stringify(findings, null, 1));
  const grouped = {};
  for (const f of findings) { const k = `${f.kind} ${f.url.replace(/\/[A-Za-z0-9_]{20,32}(?=\/|$)/g, "/:id")}`; (grouped[k] ??= []).push(f); }
  for (const [k, list] of Object.entries(grouped)) console.log(`${list.length}x ${k}  [${[...new Set(list.map((f) => f.actor + "/" + f.variant))].join(", ")}]  e.g. ${list[0].hits.slice(0, 2).join(" | ")}`);
  // "...-FOREIGN-ID-200": the page shell rendered for someone else's id but held none of the victim's data
  // (only the id typed into the URL) - informational, not a leak.
  const real = findings.filter((f) => !f.kind.endsWith("-FOREIGN-ID-200"));
  const info = findings.length - real.length;
  console.log(real.length ? `
${real.length} findings (details: ${out})` : `
No cross-tenant leaks found.${info ? ` (${info} pages rendered an empty shell for a foreign id, no data)` : ""}`);
}

try {
  if (cmd === "setup") await setup();
  else if (cmd === "cleanup") await cleanup(false);
  else if (cmd === "run") await run();
  else console.log("usage: setup | run | cleanup");
} finally { await db.end(); }
