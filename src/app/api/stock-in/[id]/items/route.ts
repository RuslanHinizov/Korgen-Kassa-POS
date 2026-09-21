import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStockInActor, stockInOwnerFilter } from "@/lib/stock-in-access";
import { z } from "zod";

const schema = z.object({
  productId: z.string().min(1).optional(),
  barcode: z.string().min(1).optional(),
  quantity: z.number().positive().default(1),
}).refine((d) => d.productId || d.barcode, { message: "productId or barcode required" });

async function recomputeTotal(stockInId: string) {
  const items = await prisma.stockInItem.findMany({ where: { stockInId }, select: { quantity: true, unitCost: true } });
  const total = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitCost ?? 0), 0);
  await prisma.stockIn.update({ where: { id: stockInId }, data: { totalCost: total } });
}

// POST /api/stock-in/:id/items — add a line to a still-draft document
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getStockInActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: stockInId } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const stockIn = await prisma.stockIn.findFirst({ where: { id: stockInId, storeId: actor.storeId, ...stockInOwnerFilter(actor) }, select: { status: true } });
  if (!stockIn) return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  if (stockIn.status !== "DRAFT") return NextResponse.json({ error: "Документ нельзя изменить" }, { status: 409 });
  const product = parsed.data.productId
    ? await prisma.product.findFirst({ where: { id: parsed.data.productId, storeId: actor.storeId, deletedAt: null }, select: { id: true, cost: true, price: true } })
    : await prisma.product.findFirst({ where: { barcode: parsed.data.barcode, storeId: actor.storeId, deletedAt: null }, select: { id: true, cost: true, price: true } });
  if (!product) return NextResponse.json({ error: "Товар не найден" }, { status: 404 });

  const settings = await prisma.businessSettings.findUnique({ where: { storeId: actor.storeId }, select: { mergeSameProducts: true } });
  const shouldMerge = settings?.mergeSameProducts !== false;
  const existing = shouldMerge ? await prisma.stockInItem.findFirst({ where: { stockInId, productId: product.id } }) : null;
  let item;
  if (existing) {
    item = await prisma.stockInItem.update({ where: { id: existing.id }, data: { quantity: Number(existing.quantity) + parsed.data.quantity } });
  } else {
    item = await prisma.stockInItem.create({
      data: { stockInId, productId: product.id, quantity: parsed.data.quantity, unitCost: product.cost ?? product.price },
    });
  }
  await recomputeTotal(stockInId);
  return NextResponse.json({ item }, { status: 201 });
}
