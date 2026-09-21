import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";
import { isValidQuantityForUnit } from "@/lib/units";

const schema = z.object({
  quantity: z.number().positive().optional(),
  costPrice: z.number().nonnegative().optional(),
  discountPct: z.number().min(0).max(100).optional(),
  salePrice: z.number().nonnegative().optional(),
});

function lineTotal(quantity: number, costPrice: number, discountPct: number) {
  return quantity * costPrice * (1 - discountPct / 100);
}

async function requireDraft(receiptId: string, storeId: string) {
  const receipt = await prisma.purchaseReceipt.findFirst({ where: { id: receiptId, storeId }, select: { status: true } });
  if (!receipt) return { error: NextResponse.json({ error: "Документ не найден" }, { status: 404 }) };
  if (receipt.status === "POSTED") return { error: NextResponse.json({ error: "Проведённый документ нельзя изменить" }, { status: 409 }) };
  return { error: null };
}

async function recomputeTotal(receiptId: string) {
  const items = await prisma.purchaseReceiptItem.findMany({ where: { receiptId }, select: { total: true } });
  const total = items.reduce((s, i) => s + Number(i.total), 0);
  await prisma.purchaseReceipt.update({ where: { id: receiptId }, data: { totalAmount: total } });
}

// PATCH /api/purchase-receipts/:id/items/:itemId — edit a line (qty/cost/discount/sale price)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: receiptId, itemId } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { error } = await requireDraft(receiptId, await getStoreId());
  if (error) return error;

  const existing = await prisma.purchaseReceiptItem.findFirst({ where: { id: itemId, receiptId }, select: { quantity: true, costPrice: true, discountPct: true, salePrice: true, unit: true } });
  if (!existing) return NextResponse.json({ error: "Позиция не найдена" }, { status: 404 });

  const quantity = parsed.data.quantity ?? Number(existing.quantity);
  if (!isValidQuantityForUnit(quantity, existing.unit)) {
    return NextResponse.json({ error: "Для штучного товара укажите целое количество" }, { status: 400 });
  }
  const costPrice = parsed.data.costPrice ?? Number(existing.costPrice);
  const discountPct = parsed.data.discountPct ?? Number(existing.discountPct);
  const salePrice = parsed.data.salePrice ?? Number(existing.salePrice);

  const item = await prisma.purchaseReceiptItem.update({
    where: { id: itemId },
    data: { quantity, costPrice, discountPct, salePrice, total: lineTotal(quantity, costPrice, discountPct) },
  });
  await recomputeTotal(receiptId);
  return NextResponse.json({ item });
}

// DELETE /api/purchase-receipts/:id/items/:itemId
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: receiptId, itemId } = await params;
  const { error } = await requireDraft(receiptId, await getStoreId());
  if (error) return error;

  const existingItem = await prisma.purchaseReceiptItem.findFirst({ where: { id: itemId, receiptId } });
  if (!existingItem) return NextResponse.json({ error: "Позиция не найдена" }, { status: 404 });

  await prisma.purchaseReceiptItem.delete({ where: { id: itemId } });
  await recomputeTotal(receiptId);
  return NextResponse.json({ success: true });
}
