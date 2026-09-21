import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
const clean = (v:unknown)=> v==null?"":String(v).trim();
const rd=(f:string)=>XLSX.utils.sheet_to_json<Record<string,unknown>>(XLSX.read(readFileSync(f),{cellDates:true}).Sheets["data"],{defval:null});
const cat = rd("public/Список товаров_export_09.09.2026 19_14.xlsx");
const sklad = rd("public/Склад_export_09.09.2026 19_37.xlsx");
const wh = new Set(sklad.map(r=>clean(r["Штрихкод"])));

// in-warehouse quality
let whPlaceholder=0, whZeroPrice=0;
for(const r of sklad){ const n=clean(r["Название товара "]||r["Название товара"]); const p=Number(r["Продажная цена"])||0;
  if(/^(новый продукт|новый товар)/i.test(n)) whPlaceholder++; if(p<=0) whZeroPrice++; }
console.log("WAREHOUSE 19678 rows: placeholder-named", whPlaceholder, " zero-price", whZeroPrice);

// priced-but-no-stock price buckets
const noStockPriced = cat.filter(r=>!wh.has(clean(r["Штрихкод"])) && (Number(r["Прод. цена"])||0)>0 && !/^(новый продукт|новый товар)/i.test(clean(r["Название товара"])));
const bkt:Record<string,number>={};
for(const r of noStockPriced){ const p=Number(r["Прод. цена"])||0;
  const b = p<100?"<100": p<300?"100-300": p<1000?"300-1000": p<3000?"1000-3000":">3000"; bkt[b]=(bkt[b]||0)+1; }
console.log("\n32860 priced-no-stock — price buckets:", JSON.stringify(bkt));
console.log("sample 12 priced-no-stock:");
noStockPriced.slice(0,12).forEach(r=>console.log("  ", clean(r["Название товара"]), "| ₸"+r["Прод. цена"], "| sup:", clean(r["Поставщик"])||"-"));

// how many priced-no-stock have a supplier
const withSup = noStockPriced.filter(r=>clean(r["Поставщик"])).length;
console.log("\npriced-no-stock WITH a supplier:", withSup, "/", noStockPriced.length);

// unit split of the full catalog vs kept
const keepBc = new Set(cat.filter(r=>{const bc=clean(r["Штрихкод"]);const n=clean(r["Название товара"]);const p=Number(r["Прод. цена"])||0;
 if(/^(новый продукт|новый товар|тест|test)/i.test(n))return false; if(bc.length<6||bc.length>13)return false; if(wh.has(bc))return true; return p>0;}).map(r=>clean(r["Штрихкод"])));
console.log("\nproposed-keep total:", keepBc.size, " of which weighted:", cat.filter(r=>keepBc.has(clean(r["Штрихкод"])) && clean(r["Ед. изм"])==="кг").length);
