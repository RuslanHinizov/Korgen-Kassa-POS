/**
 * Quality audit of the price-list export vs the warehouse export.
 * Read-only. Buckets every catalogue row so we can see what is real and what is junk.
 *
 *   npx tsx scratchpad/audit-catalog.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import * as XLSX from "xlsx";

const CAT = "public/Список товаров_export_09.09.2026 19_14.xlsx";
const SKLAD = "public/Склад_export_09.09.2026 19_37.xlsx";
const clean = (v: unknown) => (v == null ? "" : String(v).trim());
const rd = (f: string, sheet = "data") => XLSX.utils.sheet_to_json<Record<string, unknown>>(XLSX.read(readFileSync(f), { cellDates: true }).Sheets[sheet], { defval: null });

const cat = rd(CAT);
const sklad = rd(SKLAD);

// --- warehouse view: barcode -> qty ---
const skladQty = new Map<string, number>();
for (const r of sklad) {
  const bc = clean(r["Штрихкод"]);
  const q = Number(r["Кол-во"]);
  if (bc) skladQty.set(bc, Number.isFinite(q) ? q : 0);
}

// --- classify catalogue rows ---
const N = cat.length;
let inSklad = 0, notInSklad = 0;
const buckets: Record<string, number> = {};
const bump = (k: string) => (buckets[k] = (buckets[k] ?? 0) + 1);

const NAME_JUNK = /^(новый продукт|новый товар|тест|test|неизвест|аноним|без названия|--|\.+|,+)/i;
const nameCounts = new Map<string, number>();
const examples: Record<string, string[]> = {};
const ex = (k: string, s: string) => { (examples[k] ??= []).length < 6 && examples[k].push(s); };

for (const r of cat) {
  const name = clean(r["Название товара"]);
  const bc = clean(r["Штрихкод"]);
  const price = Number(r["Прод. цена"]) || 0;
  const cost = Number(r["Закуп. цена"]) || 0;
  const unit = clean(r["Ед. изм"]);
  const sup = clean(r["Поставщик"]);
  const inWh = skladQty.has(bc);
  if (inWh) inSklad++; else notInSklad++;
  nameCounts.set(name.toLowerCase(), (nameCounts.get(name.toLowerCase()) ?? 0) + 1);

  // ---- junk signals ----
  const digitsOnlyName = /^[\d\s.,-]+$/.test(name);
  const veryShortName = name.replace(/\s/g, "").length <= 2;
  const placeholderName = NAME_JUNK.test(name);
  const nameEqBarcode = name.replace(/\D/g, "") === bc && bc.length > 5;
  const badBarcodeLen = bc.length < 6 || bc.length > 13;
  const nonNumericBarcode = !/^\d+$/.test(bc);
  const zeroPrice = price <= 0;
  const priceEqCost = price > 0 && cost > 0 && Math.abs(price - cost) < 0.01;
  const costOverPrice = price > 0 && cost > price * 1.02;
  const absurdPrice = price > 200000;

  if (placeholderName) { bump("placeholderName"); ex("placeholderName", `${name} | ${bc} | ${price}`); }
  if (digitsOnlyName && !placeholderName) { bump("digitsOnlyName"); ex("digitsOnlyName", `${name} | ${bc}`); }
  if (veryShortName && !placeholderName && !digitsOnlyName) { bump("veryShortName"); ex("veryShortName", `"${name}" | ${bc}`); }
  if (nameEqBarcode) { bump("nameEqBarcode"); ex("nameEqBarcode", `${name} | ${bc}`); }
  if (badBarcodeLen) { bump("badBarcodeLen"); ex("badBarcodeLen", `${name} | ${bc} (len ${bc.length})`); }
  if (nonNumericBarcode) { bump("nonNumericBarcode"); ex("nonNumericBarcode", `${name} | ${bc}`); }
  if (zeroPrice) { bump("zeroPrice"); }
  if (priceEqCost) { bump("priceEqCost(0 margin)"); ex("priceEqCost(0 margin)", `${name} | p=${price} c=${cost}`); }
  if (costOverPrice) { bump("costOverPrice(loss)"); ex("costOverPrice(loss)", `${name} | p=${price} c=${cost}`); }
  if (absurdPrice) { bump("absurdPrice>200k"); ex("absurdPrice>200k", `${name} | ${price}`); }

  // ---- "probably dead" = not in warehouse AND (no price OR placeholder) ----
  if (!inWh && (zeroPrice || placeholderName)) bump("DEAD: not in warehouse + no price/placeholder");
  if (!inWh && !zeroPrice && !placeholderName) bump("not in warehouse but has a real price");
}

const dupNames = [...nameCounts.entries()].filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]);

console.log(`CATALOGUE rows: ${N}`);
console.log(`  in warehouse export (has stock history): ${inSklad}`);
console.log(`  NOT in warehouse export:                 ${notInSklad}`);
console.log(`\n--- junk signal counts ---`);
for (const [k, v] of Object.entries(buckets).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(6)}  ${k}`);

console.log(`\n--- examples ---`);
for (const [k, arr] of Object.entries(examples)) {
  console.log(`\n[${k}]`);
  arr.forEach((s) => console.log("   " + s));
}

console.log(`\n--- names repeated >=3x (top 25) ---`);
dupNames.slice(0, 25).forEach(([n, c]) => console.log(`  ${String(c).padStart(4)}  ${n}`));
console.log(`  ... ${dupNames.length} distinct names repeated >=3x, totalling ${dupNames.reduce((s, [, c]) => s + c, 0)} rows`);

// proposed keep-set
const keep = cat.filter((r) => {
  const bc = clean(r["Штрихкод"]);
  const name = clean(r["Название товара"]);
  const price = Number(r["Прод. цена"]) || 0;
  const inWh = skladQty.has(bc);
  if (NAME_JUNK.test(name)) return false;          // placeholder names out
  if (bc.length < 6 || bc.length > 13) return false; // broken barcodes out
  if (inWh) return true;                            // anything with stock history stays
  return price > 0;                                 // otherwise keep only priced items
});
console.log(`\n>>> PROPOSED KEEP: ${keep.length}  (drop ${N - keep.length})`);
writeFileSync("scratchpad/audit-summary.txt",
  `catalogue=${N}\nin_warehouse=${inSklad}\nnot_in_warehouse=${notInSklad}\nproposed_keep=${keep.length}\ndrop=${N - keep.length}\n` +
  Object.entries(buckets).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}\t${k}`).join("\n") + "\n");
console.log("wrote scratchpad/audit-summary.txt");
