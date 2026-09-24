// Lists prisma reads/writes on store-owned models whose argument never mentions the store.
import fs from "node:fs"; import path from "node:path";
const MODELS = "product|category|customer|supplier|sale|shift|financeAccount|expenseType|cashbox|consultant|discountCard|promotion|stocktake|purchaseReceipt|writeOff|stockIn|supplierReturn|customerReturn|storeTransfer|transfer|payment|heldOrder|referenceBook|quickProductGroup|quickProduct|productArticle|goodsReceipt|cashMovement|refund|inventoryMovement|saleItem|cancelledItem|loyaltyLog|saleRestriction";
const OPS = "findFirst|findUnique|findUniqueOrThrow|findFirstOrThrow|findMany|count|updateMany|deleteMany|aggregate|groupBy|update|delete|upsert";
const re = new RegExp("(?:prisma|tx)\\.(" + MODELS + ")\\.(" + OPS + ")\\(", "g");
function walk(d){return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):/\.(ts|tsx)$/.test(e.name)?[path.join(d,e.name)]:[]);}
let total=0;
for (const f of [...walk("src/app"),...walk("src/lib")]) {
  if (f.includes("superadmin") || f.includes("generated")) continue;
  const s = fs.readFileSync(f,"utf8");
  for (const m of s.matchAll(re)) {
    let i = m.index + m[0].length, depth = 1;
    while (i < s.length && depth) { if (s[i]==="(") depth++; else if (s[i]===")") depth--; i++; }
    const arg = s.slice(m.index + m[0].length, i-1);
    if (/storeId|store:|store\s*:|sale:\s*\{\s*storeId|\bstore\b/.test(arg)) continue;
    const line = s.slice(0,m.index).split("\n").length;
    console.log(`${f}:${line}  ${m[1]}.${m[2]}(${arg.replace(/\s+/g," ").slice(0,110)})`);
    total++;
  }
}
console.log(total);
