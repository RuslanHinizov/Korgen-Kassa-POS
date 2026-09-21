/**
 * Round 2 clean-up.
 *   npx tsx scratchpad/cleanup2.ts            dry run
 *   npx tsx scratchpad/cleanup2.ts --write    apply
 *
 *  DELETE  : the last placeholder-named rows (they have stock but no identity) + rows priced 0 that still hold stock.
 *  CLAMP   : stock < 0  ->  stock = 0   (NOT deleted — these are the shop's staples: bread, eggs, water,
 *            coffee, pads … a negative balance just means no goods-receipt was ever entered, not that the
 *            product is unwanted. Clamping keeps them sellable and clears the oversold noise; a stocktake fixes the rest.)
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:password@localhost:5432/olgax_pos" });
const prisma = new PrismaClient({ adapter });
const WRITE = process.argv.includes("--write");
const PLACEHOLDER = /^(новый продукт|новый товар|нов(ый|ая) |тест\b|test\b|неизвест|без названия|аноним|образец)/i;

async function main() {
  const all = await prisma.product.findMany({ select: { id: true, name: true, barcode: true, stock: true, price: true } });

  const delIds: string[] = [];
  let delPlaceholder = 0, delZeroPrice = 0;
  const clampIds: string[] = [];

  for (const p of all) {
    const stock = Number(p.stock);
    const price = Number(p.price);
    const placeholder = PLACEHOLDER.test((p.name ?? "").trim());
    if (placeholder) { delIds.push(p.id); delPlaceholder++; continue; }
    if (price <= 0 && stock !== 0) { delIds.push(p.id); delZeroPrice++; continue; }
    if (stock < 0) clampIds.push(p.id);
  }

  console.log(`DELETE : ${delIds.length}   (placeholder-named ${delPlaceholder}, priced-0-with-stock ${delZeroPrice})`);
  console.log(`CLAMP  : ${clampIds.length}  negative-stock rows -> 0  (kept — staples)`);
  console.log(`untouched: ${all.length - delIds.length - clampIds.length}`);

  if (!WRITE) { console.log("\n(dry run) re-run with --write"); return; }

  console.log("\n✍️  deleting …");
  for (let i = 0; i < delIds.length; i += 500) {
    await prisma.product.deleteMany({ where: { id: { in: delIds.slice(i, i + 500) } } });
    process.stdout.write(`\r   ${Math.min(i + 500, delIds.length)}/${delIds.length}`);
  }
  console.log("\n✍️  clamping negatives to 0 …");
  for (let i = 0; i < clampIds.length; i += 1000) {
    await prisma.product.updateMany({ where: { id: { in: clampIds.slice(i, i + 1000) } }, data: { stock: 0 } });
    process.stdout.write(`\r   ${Math.min(i + 1000, clampIds.length)}/${clampIds.length}`);
  }

  const [tot, act, stk, neg, actStk] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { active: true } }),
    prisma.product.count({ where: { stock: { gt: 0 } } }),
    prisma.product.count({ where: { stock: { lt: 0 } } }),
    prisma.product.count({ where: { active: true, stock: { gt: 0 } } }),
  ]);
  console.log(`\n\n📊 total ${tot} | active ${act} | stock>0 ${stk} | negative ${neg} | active&stock ${actStk}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
