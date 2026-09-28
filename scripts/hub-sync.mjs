// Hub sync worker — runs inside the office computer's Hub (docker-compose.hub.yml, "sync" service).
// See docs/kasa-offline-plan.md §9b.2 for the design.
//
// Talks to the Hub's own local Postgres directly (this is the same box, no HTTP needed) and to the cloud
// (HUB_CLOUD_URL) over HTTP with the Hub's token (HUB_SYNC_TOKEN, src/lib/hub-auth.ts). Every cycle:
//
//   1. PULL  — GET /api/hub/pull (incremental, `since`/`afterId`): upserts products into the Hub's Product
//              table, upserts cashiers into User+Account+UserStoreAssignment so a till signed in against THIS
//              Hub can be verified the same way the cloud would (same password hash, same Better Auth logic,
//              same store access), and upserts cash registers into Cashbox so a till can pair to one locally
//              (§9b.3) exactly like it pairs to the cloud.
//   2. PUSH  — walks Shift → Sale/CashMovement → Refund/CustomerReturn → shift-close, in that order (a Sale
//              needs its Shift already on the cloud; a Refund needs its Sale already on the cloud), posting
//              each not-yet-synced local row to the matching cloud endpoint with the SAME id it has locally.
//              Those endpoints are the exact ones the browser till already uses for offline uploads
//              (src/app/api/sales/route.ts and its siblings) — a Hub authenticates the same way an offline
//              till does, just with a Bearer token instead of a cashier session (src/lib/pos-request.ts).
//
// A failed row is logged and left for the next cycle — it is never marked synced, so nothing is lost, and
// every push carries the id/clientSaleId that already makes a repeated upload land on the same row (no dupes).
import pg from "pg";

const INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS ?? 15_000);
const CLOUD_URL = process.env.HUB_CLOUD_URL ?? "https://korgenkassa.kz";
const STORE_ID = process.env.HUB_STORE_ID ?? "";
const TOKEN = process.env.HUB_SYNC_TOKEN ?? "";
const ONE_SHOT = process.env.HUB_SYNC_ONE_SHOT === "true";
const PULL_PAGE_LIMIT = 2000;

if (!STORE_ID || !TOKEN) {
  console.error("[hub-sync] HUB_STORE_ID / HUB_SYNC_TOKEN not set — idling forever");
  await new Promise(() => {});
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

// ── small local key/value store for the pull cursor (not part of the shared Prisma schema — an
// implementation detail of this worker only, so it never needs a migration on the cloud side) ──────────────
async function ensureState() {
  await db.query(`CREATE TABLE IF NOT EXISTS "_hub_sync_kv" (key text PRIMARY KEY, value text)`);
}
async function getState(key) {
  const r = await db.query('SELECT value FROM "_hub_sync_kv" WHERE key = $1', [key]);
  return r.rows[0]?.value ?? null;
}
async function setState(key, value) {
  await db.query(
    'INSERT INTO "_hub_sync_kv" (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    [key, value]
  );
}

function cloudFetch(path, init = {}) {
  return fetch(`${CLOUD_URL}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  });
}

// ── PULL ──────────────────────────────────────────────────────────────────────────────────────────────────
async function upsertProduct(p) {
  if (p.removed) {
    await db.query('UPDATE "Product" SET active = false, "deletedAt" = now(), "updatedAt" = $2 WHERE id = $1', [p.id, p.updatedAt]);
    return;
  }
  await db.query(
    `INSERT INTO "Product"
       (id, "storeId", name, price, "wholesalePrice", stock, "lowStockThreshold", sku, barcode, "scalePlu", category, "imageUrl", unit, active, "deletedAt", "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,null,now(),$14)
     ON CONFLICT (id) DO UPDATE SET
       name=$3, price=$4, "wholesalePrice"=$5, stock=$6, "lowStockThreshold"=$7, sku=$8, barcode=$9,
       "scalePlu"=$10, category=$11, "imageUrl"=$12, unit=$13, active=true, "deletedAt"=null, "updatedAt"=$14`,
    [p.id, STORE_ID, p.name, p.price, p.wholesalePrice, p.stock, p.lowStockThreshold, p.sku, p.barcode, p.scalePlu, p.category, p.imageUrl, p.unit, p.updatedAt]
  );
}

/** So a till signed in on this Hub can be checked exactly like the cloud would: same email, same password hash.
 * Also gives the user a UserStoreAssignment row for this store — without one, getStoreId() (src/lib/store-
 * context.ts) refuses any session for them, so a real browser sign-in on the Hub would fail even though the
 * User+Account rows look fine. */
async function upsertCashiers(cashiers) {
  for (const c of cashiers ?? []) {
    if (!c.passwordHash) continue; // nothing to verify a sign-in against — skip, they simply cannot sign in on this Hub yet
    await db.query(
      `INSERT INTO "User" (id, name, email, phone, role, "allowCashierLogin", "firedAt", "emailVerified", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5::"Role",$6,$7,true,now(),now())
       ON CONFLICT (id) DO UPDATE SET
         name=$2, email=$3, phone=$4, role=$5::"Role", "allowCashierLogin"=$6, "firedAt"=$7, "updatedAt"=now()`,
      [c.id, c.name, c.email, c.phone, c.role, c.allowCashierLogin, c.firedAt]
    );
    await db.query(
      `INSERT INTO "Account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
       VALUES ($1,$2,'credential',$2,$3,now(),now())
       ON CONFLICT ("providerId", "accountId") DO UPDATE SET password=$3, "updatedAt"=now()`,
      [`hub_acc_${c.id}`, c.id, c.passwordHash]
    );
    await db.query(
      `INSERT INTO "UserStoreAssignment" (id, "userId", "storeId", "createdAt")
       VALUES ($1,$2,$3,now())
       ON CONFLICT ("userId", "storeId") DO NOTHING`,
      [`hub_usa_${c.id}`, c.id, STORE_ID]
    );
  }
}

/** Cash registers (docs/kasa-offline-plan.md §9b.3): the cloud owns name/active/receipt settings, so those
 * are refreshed on every pull. Pairing state (oneTimeKey/pairedAt) is only SEEDED on first insert and never
 * overwritten afterwards — the Hub is the source of truth for "which till is this register" once a terminal
 * has paired against it locally, and reflecting that back to the cloud is a separate, not-yet-built step
 * (see plan). Overwriting it on every pull would silently un-pair every till each cycle. */
async function upsertCashboxes(cashboxes) {
  for (const c of cashboxes ?? []) {
    await db.query(
      `INSERT INTO "Cashbox"
         (id, "storeId", no, name, active, "oneTimeKey", "receiptHeaderText", "receiptFooterText",
          "receiptCyrillicCodepage", "receiptPaperWidth", "receiptTabularView", "receiptPrintVat", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),now())
       ON CONFLICT (id) DO UPDATE SET
         name=$4, active=$5,
         "receiptHeaderText"=$7, "receiptFooterText"=$8, "receiptCyrillicCodepage"=$9,
         "receiptPaperWidth"=$10, "receiptTabularView"=$11, "receiptPrintVat"=$12, "updatedAt"=now()`,
      [
        c.id, STORE_ID, c.no, c.name, c.active, c.oneTimeKey,
        c.receiptHeaderText, c.receiptFooterText, c.receiptCyrillicCodepage,
        c.receiptPaperWidth, c.receiptTabularView, c.receiptPrintVat,
      ]
    );
  }
}

async function pullCycle() {
  let since = await getState("catalog_since");
  let afterId = (await getState("catalog_afterId")) ?? "";
  let cashiersDone = false;

  for (let page = 0; page < 500; page++) {
    const qs = new URLSearchParams({ limit: String(PULL_PAGE_LIMIT) });
    if (since) {
      qs.set("since", since);
      if (afterId) qs.set("afterId", afterId);
    }
    const res = await cloudFetch(`/api/hub/pull?${qs}`);
    if (!res.ok) {
      console.error(`[hub-sync] pull failed: HTTP ${res.status}`);
      return;
    }
    const data = await res.json();

    for (const p of data.products) await upsertProduct(p);
    if (!cashiersDone) {
      await upsertCashiers(data.cashiers);
      await upsertCashboxes(data.cashboxes);
      cashiersDone = true;
    }

    const last = data.products[data.products.length - 1];
    if (last) {
      since = last.updatedAt;
      afterId = last.id;
      await setState("catalog_since", since);
      await setState("catalog_afterId", afterId);
    }
    if (data.products.length > 0) console.log(`[hub-sync] pulled ${data.products.length} product change(s)`);
    if (!data.hasMore) break;
  }
}

// ── PUSH ──────────────────────────────────────────────────────────────────────────────────────────────────
/** True (marked synced) on 200/201 (created, or the cloud already had it — both are success); false otherwise. */
async function pushOne(table, id, endpoint, body) {
  let res;
  try {
    res = await cloudFetch(endpoint, { method: "POST", body: JSON.stringify(body) });
  } catch (err) {
    console.error(`[hub-sync] ${table} ${id}: network error, will retry —`, err.message);
    return false;
  }
  if (res.ok) {
    await db.query(`UPDATE "${table}" SET "syncedToCloudAt" = now() WHERE id = $1`, [id]);
    return true;
  }
  const text = await res.text().catch(() => "");
  console.error(`[hub-sync] ${table} ${id}: HTTP ${res.status} ${text.slice(0, 200)} — will retry`);
  return false;
}

async function pushShiftOpens() {
  const { rows } = await db.query(
    `SELECT id, "userId", "openingFloat", "openedAt" FROM "Shift" WHERE "syncedToCloudAt" IS NULL AND "storeId" = $1 ORDER BY "openedAt" ASC`,
    [STORE_ID]
  );
  for (const s of rows) {
    await pushOne("Shift", s.id, "/api/shifts", {
      id: s.id,
      openingFloat: Number(s.openingFloat),
      openedAt: s.openedAt.toISOString(),
      cashierUserId: s.userId,
    });
  }
  return rows.length;
}

async function pushSales() {
  const { rows } = await db.query(
    `SELECT s.id, s."userId", s."shiftId", s."cashboxId", s."paymentMethod", s."paymentLines", s."amountTendered",
            s."taxRate", s."discountAmount", s."tipAmount", s."receiptNo", s."createdAt", s.notes, s."customerId", s."consultantId"
     FROM "Sale" s WHERE s."syncedToCloudAt" IS NULL AND s."storeId" = $1 ORDER BY s."createdAt" ASC`,
    [STORE_ID]
  );
  for (const s of rows) {
    const { rows: items } = await db.query(
      `SELECT "productId", name, price, quantity, unit, "discountAmount" FROM "SaleItem" WHERE "saleId" = $1 ORDER BY "lineNo" ASC`,
      [s.id]
    );
    await pushOne("Sale", s.id, "/api/sales", {
      clientSaleId: s.id,
      receiptNo: s.receiptNo ?? undefined,
      soldAt: s.createdAt.toISOString(),
      offline: true,
      shiftId: s.shiftId ?? undefined,
      cashboxId: s.cashboxId ?? undefined,
      cashierUserId: s.userId,
      customerId: s.customerId ?? undefined,
      consultantId: s.consultantId ?? undefined,
      note: s.notes ?? undefined,
      taxRate: Number(s.taxRate),
      discountAmount: Number(s.discountAmount),
      discountType: "fixed",
      tipAmount: s.tipAmount != null ? Number(s.tipAmount) : 0,
      paymentMethod: s.paymentMethod,
      paymentLines: s.paymentLines ?? undefined,
      amountTendered: s.amountTendered != null ? Number(s.amountTendered) : undefined,
      items: items.map((i) => ({
        productId: i.productId,
        name: i.name,
        price: Number(i.price),
        quantity: Number(i.quantity),
        unit: i.unit,
        discountAmount: Number(i.discountAmount),
      })),
    });
  }
  return rows.length;
}

async function pushCashMovements() {
  const { rows } = await db.query(
    `SELECT cm.id, cm."userId", cm."shiftId", cm.type, cm.amount, cm.reason, cm."createdAt"
     FROM "CashMovement" cm JOIN "Shift" sh ON sh.id = cm."shiftId"
     WHERE cm."syncedToCloudAt" IS NULL AND sh."storeId" = $1 ORDER BY cm."createdAt" ASC`,
    [STORE_ID]
  );
  for (const m of rows) {
    await pushOne("CashMovement", m.id, "/api/cash-movements", {
      id: m.id,
      type: m.type,
      amount: Number(m.amount),
      reason: m.reason ?? undefined,
      shiftId: m.shiftId,
      cashierUserId: m.userId,
      createdAt: m.createdAt.toISOString(),
    });
  }
  return rows.length;
}

async function pushRefunds() {
  const { rows } = await db.query(
    `SELECT r.id, r."userId", r."saleId", r.reason, r.items, r."restoreStock", r."createdAt"
     FROM "Refund" r JOIN "Sale" s ON s.id = r."saleId"
     WHERE r."syncedToCloudAt" IS NULL AND s."storeId" = $1 ORDER BY r."createdAt" ASC`,
    [STORE_ID]
  );
  for (const r of rows) {
    // The Hub's local SaleItem ids mean nothing to the cloud (it makes its own when the Sale is pushed) — every
    // line is instead named by its position ("L:<lineNo>"), the same mechanism a not-yet-uploaded browser till
    // sale already uses, and it works whether or not the sale has been pushed yet (a SaleItem always has a lineNo).
    const { rows: lines } = await db.query('SELECT id, "lineNo" FROM "SaleItem" WHERE "saleId" = $1', [r.saleId]);
    const lineNoById = new Map(lines.map((l) => [l.id, l.lineNo]));
    const items = (Array.isArray(r.items) ? r.items : []).map((item) => ({
      saleItemId: `L:${lineNoById.get(item.saleItemId) ?? 0}`,
      quantity: Number(item.quantity),
    }));
    await pushOne("Refund", r.id, `/api/sales/${r.saleId}/refund`, {
      id: r.id,
      refundedAt: r.createdAt.toISOString(),
      cashierUserId: r.userId,
      reason: r.reason ?? undefined,
      restoreStock: r.restoreStock,
      items,
    });
  }
  return rows.length;
}

async function pushReturnsWithoutReceipt() {
  const { rows } = await db.query(
    `SELECT cr.id, cr."userId", cr.comment, cr."createdAt",
            coalesce(json_agg(json_build_object('productId', i."productId", 'quantity', i.quantity)) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
     FROM "CustomerReturn" cr LEFT JOIN "CustomerReturnItem" i ON i."returnId" = cr.id
     WHERE cr."syncedToCloudAt" IS NULL AND cr."storeId" = $1
     GROUP BY cr.id ORDER BY cr."createdAt" ASC`,
    [STORE_ID]
  );
  for (const r of rows) {
    if (!Array.isArray(r.items) || r.items.length === 0) continue; // nothing to send yet (items not written this instant)
    await pushOne("CustomerReturn", r.id, "/api/pos/returns/without-receipt", {
      id: r.id,
      returnedAt: r.createdAt.toISOString(),
      cashierUserId: r.userId,
      reason: r.comment ?? undefined,
      items: r.items.map((i) => ({ productId: i.productId, quantity: Number(i.quantity) })),
    });
  }
  return rows.length;
}

async function pushShiftCloses() {
  // "syncedToCloudAt" already means "the shift row itself exists on the cloud" (set by pushShiftOpens) — the
  // close is a second, separate event on that same row, so whether IT was pushed is tracked in the small kv
  // store instead (one "shift_closed:<id>" flag per shift), rather than overloading that one column for both.
  const { rows } = await db.query(
    `SELECT id, "countedCash", notes, "closedAt" FROM "Shift"
     WHERE status = 'CLOSED' AND "closedAt" IS NOT NULL AND "syncedToCloudAt" IS NOT NULL AND "storeId" = $1
     ORDER BY "closedAt" ASC`,
    [STORE_ID]
  );
  let count = 0;
  for (const s of rows) {
    if (await getState(`shift_closed:${s.id}`)) continue; // already pushed
    const res = await cloudFetch(`/api/shifts/${s.id}`, {
      method: "POST",
      body: JSON.stringify({
        action: "close",
        countedCash: Number(s.countedCash ?? 0),
        notes: s.notes ?? undefined,
        closedAt: s.closedAt.toISOString(),
        offline: true,
      }),
    });
    if (res.ok) {
      await setState(`shift_closed:${s.id}`, "1");
      count++;
    } else {
      const text = await res.text().catch(() => "");
      console.error(`[hub-sync] Shift ${s.id} close: HTTP ${res.status} ${text.slice(0, 200)} — will retry`);
    }
  }
  return count;
}

async function pushCycle() {
  const opened = await pushShiftOpens();
  const sold = await pushSales();
  const moved = await pushCashMovements();
  const refunded = await pushRefunds();
  const returned = await pushReturnsWithoutReceipt();
  const closed = await pushShiftCloses();
  const total = opened + sold + moved + refunded + returned + closed;
  if (total > 0) console.log(`[hub-sync] pushed: ${opened} shift-open, ${sold} sale, ${moved} cash, ${refunded} refund, ${returned} return, ${closed} shift-close`);
}

async function cycle() {
  await pushCycle(); // push first: a till should never wait behind a slow catalogue pull to get its sale off the local box
  await pullCycle();
}

console.log(`[hub-sync] starting for store ${STORE_ID}, cloud ${CLOUD_URL}, interval ${INTERVAL_MS}ms`);
await ensureState();

if (ONE_SHOT) {
  await cycle();
  await db.end();
  process.exit(0);
}

for (;;) {
  try {
    await cycle();
  } catch (err) {
    console.error("[hub-sync] cycle failed:", err);
  }
  await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
}
