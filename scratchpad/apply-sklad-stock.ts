/**
 * Set real stock levels from the warehouse export, matching products by barcode.
 *
 *   npx tsx scratchpad/apply-sklad-stock.ts          (dry run — prints what would change)
 *   npx tsx scratchpad/apply-sklad-stock.ts --write  (apply)
 *
 * Source: public/Склад_export_09.09.2026 19_37.xlsx  (sheet "data", 19 678 rows)
 *   Штрихкод -> match Product.barcode   |   Кол-во -> Product.stock  (kept faithfully, negatives incl.)
 * Products absent from this file keep stock 0. Prices / units / names are NOT touched.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:password@localhost:5432/olgax_pos" });
const prisma = new PrismaClient({ adapter });

const FILE = "public/Склад_export_09.09.2026 19_37.xlsx";
const WRITE = process.argv.includes("--write");
const clean = (v: unknown) => (v == null ? "" : String(v).trim());

async function main() {
  const wb = XLSX.read(readFileSync(FILE), { cellDates: true });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["data"], { defval: null });

  // barcode -> qty (last wins; file has no dup barcodes anyway)
  const stockByBc = new Map<string, number>();
  let neg = 0, frac = 0;
  for (const r of rows) {
    const bc = clean(r["Штрихкод"]);
    const qty = Number(r["Кол-во"]);
    if (!bc || !Number.isFinite(qty)) continue;
    stockByBc.set(bc, qty);
    if (qty < 0) neg++;
    if (qty % 1 !== 0) frac++;
  }
  console.log(`📖 ${stockByBc.size} barcodes with a quantity  (negative: ${neg}, fractional/kg: ${frac})`);

  const dbProducts = await prisma.product.findMany({ select: { id: true, barcode: true } });
  const idByBc = new Map(dbProducts.filter((p) => p.barcode).map((p) => [p.barcode as string, p.id]));

  let matched = 0, missing = 0;
  const updates: { id: string; stock: number }[] = [];
  for (const [bc, qty] of stockByBc) {
    const id = idByBc.get(bc);
    if (!id) { missing++; continue; }
    matched++;
    updates.push({ id, stock: qty });
  }
  console.log(`🔗 matched ${matched} / ${stockByBc.size}  (not found in catalogue: ${missing})`);

  const totalUnits = updates.reduce((s, u) => s + u.stock, 0);
  console.log(`Σ total units across matched products: ${Math.round(totalUnits).toLocaleString("ru-RU")}`);

  if (!WRITE) {
    console.log("\n(dry run) — re-run with --write to apply.");
    console.log("sample:", updates.slice(0, 8));
    return;
  }

  console.log("\n✍️  writing …");
  let done = 0;
  const CHUNK = 500;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const part = updates.slice(i, i + CHUNK);
    await prisma.$transaction(part.map((u) => prisma.product.update({ where: { id: u.id }, data: { stock: u.stock } })));
    done += part.length;
    process.stdout.write(`\r   ${done}/${updates.length}`);
  }
  console.log("\n✅ stock applied");

  const [withStock, kgWithStock, negStock] = await Promise.all([
    prisma.product.count({ where: { stock: { not: 0 } } }),
    prisma.product.count({ where: { unit: "kg", stock: { gt: 0 } } }),
    prisma.product.count({ where: { stock: { lt: 0 } } }),
  ]);
  console.log(`\n📊 products with non-zero stock: ${withStock} | weighted with positive stock: ${kgWithStock} | negative stock: ${negStock}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
