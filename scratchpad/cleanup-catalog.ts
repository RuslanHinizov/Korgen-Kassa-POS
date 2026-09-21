/**
 * Catalogue clean-up.
 *   npx tsx scratchpad/cleanup-catalog.ts          -> dry run (counts + samples)
 *   npx tsx scratchpad/cleanup-catalog.ts --write  -> apply
 *
 * Rule of thumb: a product with stock <> 0 exists in the warehouse -> it is REAL, never touched.
 *
 *  A) HARD DELETE  — pure garbage, stock = 0 AND one of:
 *       - placeholder name  (Новый продукт / Новый товар / тест / без названия …)
 *       - broken barcode    (length < 6 or > 13, or non-numeric)
 *       - name is just a number / code  (only digits & punctuation, or name === its own barcode)
 *  B) DEACTIVATE   — every remaining product with stock = 0  (real, but not on the shelf)
 *  C) KEEP ACTIVE  — everything with stock <> 0   (~19 678)
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:password@localhost:5432/olgax_pos" });
const prisma = new PrismaClient({ adapter });
const WRITE = process.argv.includes("--write");

const PLACEHOLDER = /^(новый продукт|новый товар|нов(ый|ая) |тест\b|test\b|неизвест|без названия|аноним|образец)/i;
const DIGITS_ONLY = /^[\s\d.,\-_/№#]+$/;

function isJunk(name: string, barcode: string): string | null {
  const n = name.trim();
  const bc = barcode.trim();
  if (!n || PLACEHOLDER.test(n)) return "placeholder-name";
  if (bc.length < 6 || bc.length > 13) return "broken-barcode";
  if (!/^\d+$/.test(bc)) return "non-numeric-barcode";
  if (DIGITS_ONLY.test(n)) return "numeric-name";
  // name is nothing but its own barcode (+ punctuation), no letters at all
  if (!/\p{L}/u.test(n) || n.replace(/\D/g, "") === bc && !/[\p{L}]/u.test(n.replace(bc, ""))) return "name-equals-barcode";
  return null;
}

async function main() {
  const all = await prisma.product.findMany({ select: { id: true, name: true, barcode: true, stock: true, active: true } });
  console.log(`catalogue: ${all.length} products`);

  const del: { id: string; reason: string; name: string; bc: string }[] = [];
  const deact: string[] = [];
  const reasons: Record<string, number> = {};

  for (const p of all) {
    const stock = Number(p.stock);
    if (stock !== 0) continue;                 // C) real / on shelf -> untouched
    const reason = isJunk(p.name ?? "", p.barcode ?? "");
    if (reason) {
      del.push({ id: p.id, reason, name: p.name ?? "", bc: p.barcode ?? "" });
      reasons[reason] = (reasons[reason] ?? 0) + 1;
    } else {
      deact.push(p.id);
    }
  }

  console.log(`\nA) HARD DELETE: ${del.length}`);
  for (const [r, c] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) console.log(`     ${String(c).padStart(5)}  ${r}`);
  console.log("   samples:");
  del.slice(0, 15).forEach((d) => console.log(`     [${d.reason}] "${d.name}" | ${d.bc}`));

  console.log(`\nB) DEACTIVATE (stock 0, real name): ${deact.length}`);
  console.log(`C) KEEP ACTIVE (stock <> 0): ${all.length - del.length - deact.length}`);

  if (!WRITE) { console.log("\n(dry run) re-run with --write"); return; }

  console.log("\n✍️  deleting …");
  let d = 0;
  for (let i = 0; i < del.length; i += 500) {
    const ids = del.slice(i, i + 500).map((x) => x.id);
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
    d += ids.length; process.stdout.write(`\r   ${d}/${del.length}`);
  }
  console.log("\n✍️  deactivating …");
  let a = 0;
  for (let i = 0; i < deact.length; i += 1000) {
    const ids = deact.slice(i, i + 1000);
    await prisma.product.updateMany({ where: { id: { in: ids } }, data: { active: false } });
    a += ids.length; process.stdout.write(`\r   ${a}/${deact.length}`);
  }

  const [tot, act, stk, actStk] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { active: true } }),
    prisma.product.count({ where: { stock: { not: 0 } } }),
    prisma.product.count({ where: { active: true, stock: { not: 0 } } }),
  ]);
  console.log(`\n\n📊 after clean-up:`);
  console.log(`   total products : ${tot}   (deleted ${all.length - tot})`);
  console.log(`   active         : ${act}`);
  console.log(`   with stock     : ${stk}`);
  console.log(`   active & stock : ${actStk}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
