import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
const clean = (v: unknown) => (v == null ? "" : String(v).trim());
const rd = (f: string) => XLSX.utils.sheet_to_json<Record<string, unknown>>(XLSX.read(readFileSync(f), { cellDates: true }).Sheets["data"], { defval: null });

const S = rd("public/Склад_export_09.09.2026 19_37.xlsx");
const C = rd("public/Список товаров_export_09.09.2026 19_14.xlsx");
const catPrice = new Map<string, number>();
for (const r of C) catPrice.set(clean(r["Штрихкод"]), Number(r["Прод. цена"]) || 0);

const K = { name: "Название товара ", cat: "Категория", bc: "Штрихкод", bc2: "Доп. штрихкоды", qty: "Кол-во", unit: "Ед. изм", price: "Продажная цена", sumSell: "Сумма по продаваемой", cost: "Закупочная цена", sumCost: "Сумма по закупочной" };

const n = S.length;
let pos = 0, neg = 0, tiny = 0, frac = 0, placeholder = 0, zeroPrice = 0, notInCat = 0, priceMismatch = 0, hasBc2 = 0;
let stockAtCost = 0, stockAtSell = 0, negValueCost = 0;
const PH = /^(новый продукт|новый товар|тест|test|без названия)/i;
const negWorst: { name: string; qty: number; val: number }[] = [];
const posWorst: { name: string; qty: number; val: number }[] = [];
const unitCount: Record<string, number> = {};

for (const r of S) {
  const name = clean(r[K.name]);
  const bc = clean(r[K.bc]);
  const qty = Number(r[K.qty]) || 0;
  const price = Number(r[K.price]) || 0;
  const cost = Number(r[K.cost]) || 0;
  const unit = clean(r[K.unit]);
  unitCount[unit] = (unitCount[unit] || 0) + 1;
  if (PH.test(name)) placeholder++;
  if (price <= 0) zeroPrice++;
  if (clean(r[K.bc2])) hasBc2++;
  if (!catPrice.has(bc)) notInCat++;
  else if (Math.abs((catPrice.get(bc) || 0) - price) > 0.5) priceMismatch++;
  if (qty > 0) { pos++; stockAtCost += qty * cost; stockAtSell += qty * price; posWorst.push({ name, qty, val: qty * cost }); }
  else if (qty < 0) { neg++; negValueCost += qty * cost; negWorst.push({ name, qty, val: qty * cost }); if (qty > -5) tiny++; }
  if (qty % 1 !== 0) frac++;
}
negWorst.sort((a, b) => a.qty - b.qty);
posWorst.sort((a, b) => b.val - a.val);

const fmt = (x: number) => Math.round(x).toLocaleString("ru-RU");
console.log(`ВСЕГО строк: ${n}`);
console.log(`  ед. изм.:            ${JSON.stringify(unitCount)}`);
console.log(`  положительный остаток: ${pos}`);
console.log(`  отрицательный остаток: ${neg}   (из них «мелочь» −0.001…−5: ${tiny})`);
console.log(`  дробный остаток (вес): ${frac}`);
console.log(`  «Новый продукт» и т.п.: ${placeholder}`);
console.log(`  цена = 0:             ${zeroPrice}`);
console.log(`  нет в прайс-листе:     ${notInCat}`);
console.log(`  цена ≠ прайс-листу (>0.5₸): ${priceMismatch}`);
console.log(`  есть доп. штрихкод:    ${hasBc2}`);
console.log(`\n💰 СТОИМОСТЬ ЗАПАСА (только положительные остатки)`);
console.log(`  по закупке:  ${fmt(stockAtCost)} ₸`);
console.log(`  по продаже:  ${fmt(stockAtSell)} ₸`);
console.log(`  «дырка» от отрицательных (по закупке): ${fmt(negValueCost)} ₸`);
console.log(`\n🔻 10 худших отрицательных (перепродано):`);
negWorst.slice(0, 10).forEach((x) => console.log(`   ${String(x.qty).padStart(9)}  ${x.name}`));
console.log(`\n🔺 10 самых дорогих позиций запаса (кол-во × закуп):`);
posWorst.slice(0, 10).forEach((x) => console.log(`   ${fmt(x.val).padStart(12)} ₸   ${x.qty} × ${x.name}`));
