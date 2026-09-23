import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";

const schema = z.object({
  items: z.array(z.object({ barcode: z.string().trim().min(1), quantity: z.number().positive() })).min(1).max(5000),
});

// POST /api/inventory/stocktakes/:id/items/import — «Импорт товаров» (collector/Excel file):
// lines are matched by barcode. A repeated barcode accumulates onto the existing
// Сканировано count, matching how a physical scanner would add up repeat scans.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: stocktakeId } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректный файл: нужны столбцы «Штрихкод» и «Количество»" }, { status: 400 });

  const storeId = await getStoreId();
  const stocktake = await prisma.stocktake.findFirst({ where: { id: stocktakeId, storeId }, select: { status: true } });
  if (!stocktake) return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  if (stocktake.status !== "DRAFT" && stocktake.status !== "COUNTING") {
    return NextResponse.json({ error: "На этом этапе нельзя добавлять товары" }, { status: 409 });
  }

  let added = 0;
  const notFound: string[] = [];
  const now = new Date();
  for (const row of parsed.data.items) {
    const product = await prisma.product.findFirst({ where: { barcode: row.barcode, storeId, deletedAt: null }, select: { id: true, stock: true } });
    if (!product) { notFound.push(row.barcode); continue; }

    const existing = await prisma.stocktakeItem.findFirst({ where: { stocktakeId, productId: product.id } });
    if (existing) {
      const countedQty = Number(existing.countedQty ?? 0) + row.quantity;
      await prisma.stocktakeItem.update({
        where: { id: existing.id },
        data: { countedQty, difference: countedQty - Number(existing.expectedQty), scannedAt: now },
      });
    } else {
      const expectedQty = Number(product.stock);
      await prisma.stocktakeItem.create({
        data: { stocktakeId, productId: product.id, expectedQty, countedQty: row.quantity, difference: row.quantity - expectedQty, scannedAt: now },
      });
    }
    added++;
  }

  if (added > 0) await prisma.stocktake.updateMany({ where: { id: stocktakeId, status: "DRAFT" }, data: { status: "COUNTING" } });
  return NextResponse.json({ added, notFound });
}
