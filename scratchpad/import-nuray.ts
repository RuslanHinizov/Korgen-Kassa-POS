/**
 * Import the real Nuray Market catalogue from the store export and delete all demo data.
 *
 *   npx tsx scratchpad/import-nuray.mjs                (or: node scratchpad/import-nuray.mjs)
 *
 * Source: public/Список товаров_export_09.09.2026 19_14.xlsx  (sheet "data", 56 813 rows)
 * Columns used: Название товара -> name, Штрихкод -> barcode (unique key),
 *   Закуп. цена -> cost, Прод. цена -> price, Ед. изм (шт/кг) -> unit (pcs/kg),
 *   Поставщик -> Supplier (created + linked). Категория is "Незаданные" everywhere -> null.
 *   The export has NO stock quantities, so every product is imported with stock 0.
 *   active = price > 0  (3 847 price-0 / placeholder rows come in inactive).
 *
 * Keeps: User, BusinessSettings. Wipes everything else (products, suppliers, customers,
 * sales, shifts, inventory ledger, audit log, ...).
 */
import "dotenv/config";
import path from "node:path";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:password@localhost:5432/olgax_pos" });
const prisma = new PrismaClient({ adapter });

const FILE = "public/Список товаров_export_09.09.2026 19_14.xlsx";
const clean = (v) => (v == null ? "" : String(v).trim());
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

async function wipeDemo() {
  console.log("🧹 Deleting demo data …");
  await prisma.loyaltyLog.deleteMany();
  await prisma.refund.deleteMany();
  await prisma.cashMovement.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.goodsReceiptItem.deleteMany();
  await prisma.goodsReceipt.deleteMany();
  await prisma.inventoryLot.deleteMany();
  await prisma.stocktakeItem.deleteMany();
  await prisma.stocktake.deleteMany();
  await prisma.stockAdjustment.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.heldOrder.deleteMany();
  await prisma.product.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.supplier.deleteMany();
  console.log("   done.");
}

async function main() {
  const wb = XLSX.read(readFileSync(FILE) as unknown as Buffer, { cellDates: true, type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["data"], { defval: null });
  console.log(`📖 ${rows.length} rows read from "${path.basename(FILE)}"`);

  await wipeDemo();

  // ---- suppliers ---------------------------------------------------------------
  const supplierNames = [...new Set(rows.map((r) => clean(r["Поставщик"])).filter(Boolean))].sort();
  await prisma.supplier.createMany({ data: supplierNames.map((name) => ({ name })), skipDuplicates: true });
  const supMap = new Map((await prisma.supplier.findMany({ select: { id: true, name: true } })).map((s) => [s.name, s.id]));
  console.log(`🏭 ${supMap.size} suppliers created`);

  // ---- products -------------------------------------------------------------
  const seen = new Set();
  const products = [];
  let dupes = 0, kg = 0, inactive = 0;
  for (const r of rows) {
    const barcode = clean(r["Штрихкод"]);
    const name = clean(r["Название товара"]) || "Без названия";
    if (!barcode) continue;
    if (seen.has(barcode)) { dupes++; continue; }
    seen.add(barcode);
    const unit = clean(r["Ед. изм"]) === "кг" ? "kg" : "pcs";
    const price = Math.max(0, Number(r["Прод. цена"]) || 0);
    const cost = Math.max(0, Number(r["Закуп. цена"]) || 0);
    const active = price > 0;
    if (unit === "kg") kg++;
    if (!active) inactive++;
    products.push({
      name,
      barcode,
      price,
      cost: cost || null,
      unit,
      stock: 0,
      category: null,
      active,
      supplierId: supMap.get(clean(r["Поставщик"])) ?? null,
    });
  }
  console.log(`📦 ${products.length} products prepared  (kg: ${kg}, inactive/price-0: ${inactive}, skipped dup barcodes: ${dupes})`);

  let done = 0;
  for (const part of chunk(products, 1000)) {
    await prisma.product.createMany({ data: part, skipDuplicates: true });
    done += part.length;
    process.stdout.write(`\r   inserted ${done}/${products.length}`);
  }
  console.log("\n✅ import complete");

  const [pc, sc, kgc, ac] = await Promise.all([
    prisma.product.count(),
    prisma.supplier.count(),
    prisma.product.count({ where: { unit: "kg" } }),
    prisma.product.count({ where: { active: true } }),
  ]);
  console.log(`\n📊 DB now: ${pc} products (${ac} active, ${kgc} weighted), ${sc} suppliers, 0 stock everywhere.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
