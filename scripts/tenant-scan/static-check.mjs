// Heuristic: for every mutating handler in a route with a dynamic segment, does the handler check store ownership
// of the addressed row before writing? Prints handlers that do not show an obvious id+storeId check.
import fs from "node:fs"; import path from "node:path";
function walk(d){return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):e.name==="route.ts"?[path.join(d,e.name)]:[]);}
const bad=[];
for (const f of walk("src/app/api")) {
  if (!f.includes("[")) continue;
  const src = fs.readFileSync(f,"utf8");
  const parts = src.split(/(?=export\s+async\s+function\s+)/);
  for (const p of parts) {
    const m = p.match(/^export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)/); if (!m) continue;
    const scoped = /storeId|requireSuperAdmin|sharesStore|adminStoreIds/.test(p);
    const lineOk = p.split("\n").some(l => /storeId|sharesStore/.test(l) && /\b(id|[a-zA-Z]+Id|params)\b/.test(l.replace(/storeId/g,"")));
    if (!scoped || !lineOk) bad.push(`${m[1].padEnd(6)} ${f}  scoped=${scoped}`);
  }
}
console.log(bad.join("\n")); console.log(bad.length,"handlers to review");
