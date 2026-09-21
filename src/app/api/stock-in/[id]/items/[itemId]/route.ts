import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStockInActor, stockInOwnerFilter } from "@/lib/stock-in-access";
import { z } from "zod";

const schema = z.object({
  quantity: z.number().positive().optional(),
  note: z.string().max(500).optional().nullable(),
  // Present together when the user confirms "Изменить цену в номенклатуре?" —
  // updates this line's cost AND the product's catalog cost/price immediately,
  // independent of when the document itself gets posted (matches live UMAG).
  unitCost: z.number().min(0).optional(),
  price: z.number().min(0).optional(),
});

async function requireDraft(stockInId: string, actor: NonNullable<Awaited<ReturnType<typeof getStockInActor>>>) {
  const stockIn = await prisma.stockIn.findFirst({ where: { id: stockInId, storeId: actor.storeId, ...stockInOwnerFilter(actor) }, select: { status: true } });
  if (!stockIn) return { error: NextResponse.json({ error: "Документ не найден" }, { status: 404 }) };
  if (stockIn.status !== "DRAFT") return { error: NextResponse.json({ error: "Документ нельзя изменить" }, { status: 409 }) };
  return { error: null };
}

async function recomputeTotal(stockInId: string) {
  const items = await prisma.stockInItem.findMany({ where: { stockInId }, select: { quantity: true, unitCost: true } });
  const total = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitCost ?? 0), 0);
  await prisma.stockIn.update({ where: { id: stockInId }, data: { totalCost: total } });
}

// PATCH /api/stock-in/:id/items/:itemId — edit a line's quantity, or (when
// unitCost/price are given) confirm a catalog re-price from "Цена".
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const actor = await getStockInActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: stockInId, itemId } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { error } = await requireDraft(stockInId, actor);
  if (error) return error;

  const existing = await prisma.stockInItem.findFirst({ where: { id: itemId, stockInId }, select: { productId: true } });
  if (!existing) return NextResponse.json({ error: "Строка не найдена" }, { status: 404 });

  const item = await prisma.stockInItem.update({
    where: { id: itemId },
    data: {
      ...(parsed.data.quantity !== undefined ? { quantity: parsed.data.quantity } : {}),
      ...(parsed.data.unitCost !== undefined ? { unitCost: parsed.data.unitCost } : {}),
      ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
    },
  });

  if (parsed.data.unitCost !== undefined && parsed.data.price !== undefined) {
    await prisma.product.update({ where: { id: existing.productId }, data: { cost: parsed.data.unitCost, price: parsed.data.price } });
  }

  await recomputeTotal(stockInId);
  return NextResponse.json({ item });
}

// DELETE /api/stock-in/:id/items/:itemId
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const actor = await getStockInActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: stockInId, itemId } = await params;
  const { error } = await requireDraft(stockInId, actor);
  if (error) return error;

  const existingItem = await prisma.stockInItem.findFirst({ where: { id: itemId, stockInId } });
  if (!existingItem) return NextResponse.json({ error: "Строка не найдена" }, { status: 404 });

  await prisma.stockInItem.delete({ where: { id: itemId } });
  await recomputeTotal(stockInId);
  return NextResponse.json({ success: true });
}
