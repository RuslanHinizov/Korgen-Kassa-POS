import { pathToFileURL } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as XLSX from "xlsx";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:password@localhost:5432/olgax_pos" });
const prisma = new PrismaClient({ adapter });

const FILE = "public/Склад_export_09.09.2026 19_37.xlsx";
const clean = (v: unknown) => (v == null ? "" : String(v).trim());

async function main() {
const wb = XLSX.read(readFileSync(FILE), { cellDates: true });
const rows = XLSX.utils.sheet_to_json(wb.Sheets["data"], { defval: null });
console.log("ROWS:", rows.length);

const K = {
  name: "Название товара ", cat: "Категория", subcat: "Подкатеогрия", bc: "Штрихкод",
  bc2: "Доп. штрихкоды", qty: "Кол-во", unit: "Ед. изм", price: "Продажная цена", cost: "Закупочная цена",
};

const units = {}, cats = {}, subcats = new Set();
let blankBc = 0, hasBc2 = 0, negQty = 0, zeroQty = 0, fracQty = 0, dupBc = 0;
const bcSeen = new Set();
let qtyMin = Infinity, qtyMax = -Infinity, qtySum = 0;
const bcList = [];

for (const r of rows) {
  const bc = clean(r[K.bc]);
  const unit = clean(r[K.unit]);
  const cat = clean(r[K.cat]);
  const sub = clean(r[K.subcat]);
  const qty = Number(r[K.qty]);
  units[unit] = (units[unit] || 0) + 1;
  cats[cat] = (cats[cat] || 0) + 1;
  if (sub) subcats.add(sub);
  if (!bc) blankBc++; else { if (bcSeen.has(bc)) dupBc++; bcSeen.add(bc); bcList.push(bc); }
  if (clean(r[K.bc2])) hasBc2++;
  if (Number.isFinite(qty)) { if (qty < 0) negQty++; if (qty === 0) zeroQty++; if (qty % 1 !== 0) fracQty++; qtyMin = Math.min(qtyMin, qty); qtyMax = Math.max(qtyMax, qty); qtySum += qty; }
}

console.log("\nUNITS:", JSON.stringify(units));
console.log("CATEGORIES:", Object.keys(cats).length, "->", JSON.stringify(Object.fromEntries(Object.entries(cats).slice(0, 15))));
console.log("SUBCATEGORIES:", subcats.size, [...subcats].slice(0, 20));
console.log("blank barcode:", blankBc, " dup barcode:", dupBc, " has Доп.штрихкоды:", hasBc2);
console.log("qty: min", qtyMin, "max", qtyMax, "sum", Math.round(qtySum), " neg:", negQty, " zero:", zeroQty, " fractional:", fracQty);

// fractional qty samples (weighted goods)
console.log("\nfractional-qty rows (first 10):");
rows.filter((r) => { const q = Number(r[K.qty]); return Number.isFinite(q) && q % 1 !== 0; }).slice(0, 10)
  .forEach((r) => console.log("  ", JSON.stringify({ n: r[K.name], bc: r[K.bc], qty: r[K.qty], unit: r[K.unit] })));

// negative qty samples
console.log("\nnegative-qty rows (first 10):");
rows.filter((r) => Number(r[K.qty]) < 0).slice(0, 10).forEach((r) => console.log("  ", JSON.stringify({ n: r[K.name], bc: r[K.bc], qty: r[K.qty] })));

// Доп. штрихкоды sample
console.log("\nДоп. штрихкоды samples:");
rows.filter((r) => clean(r[K.bc2])).slice(0, 8).forEach((r) => console.log("  main", r[K.bc], "extra:", JSON.stringify(r[K.bc2])));

// match against DB
const dbProducts = await prisma.product.findMany({ select: { barcode: true } });
const dbBc = new Set(dbProducts.map((p) => p.barcode));
const matched = bcList.filter((b) => dbBc.has(b));
const unmatched = bcList.filter((b) => !dbBc.has(b));
console.log("\nDB products:", dbProducts.length);
console.log("Склад barcodes matched in DB:", matched.length, "/", bcList.length);
console.log("Склад barcodes NOT in DB:", unmatched.length, " sample:", unmatched.slice(0, 15));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
