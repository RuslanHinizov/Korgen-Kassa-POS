import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const schema = z.object({ items: z.array(z.object({ barcode: z.string().min(1), quantity: z.number().positive() })).min(1) });

function lineTotal(quantity: number, unitCost: number) {
  return quantity * unitCost;
}

async function recomputeTotal(transferId: string) {
  const items = await prisma.storeTransferItem.findMany({ where: { transferId }, select: { total: true } });
  const total = items.reduce((s, i) => s + Number(i.total), 0);
  await prisma.storeTransfer.update({ where: { id: transferId }, data: { totalAmount: total } });
}

// POST /api/store-transfers/:id/items/import — "Импорт товаров": bulk-add lines
// resolved by exact barcode match against the source store's own catalog.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: transferId } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const storeId = await getStoreId();
  const transfer = await prisma.storeTransfer.findFirst({ where: { id: transferId, storeId }, select: { status: true } });
  if (!transfer) return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  if (transfer.status === "POSTED") return NextResponse.json({ error: "Проведённый документ нельзя изменить" }, { status: 409 });

  const settings = await prisma.businessSettings.findUnique({ where: { storeId }, select: { mergeSameProducts: true } });
  const shouldMerge = settings?.mergeSameProducts !== false;

  let added = 0;
  const notFound: string[] = [];
  for (const row of parsed.data.items) {
    const product = await prisma.product.findFirst({ where: { barcode: row.barcode, storeId, deletedAt: null }, select: { id: true, cost: true, price: true } });
    if (!product) { notFound.push(row.barcode); continue; }
    const unitCost = Number(product.cost ?? product.price);
    const existing = shouldMerge ? await prisma.storeTransferItem.findFirst({ where: { transferId, productId: product.id } }) : null;
    if (existing) {
      const quantity = Number(existing.quantity) + row.quantity;
      await prisma.storeTransferItem.update({ where: { id: existing.id }, data: { quantity, total: lineTotal(quantity, unitCost) } });
    } else {
      await prisma.storeTransferItem.create({ data: { transferId, productId: product.id, quantity: row.quantity, unitCost, total: lineTotal(row.quantity, unitCost) } });
    }
    added++;
  }
  await recomputeTotal(transferId);
  return NextResponse.json({ added, notFound });
}
