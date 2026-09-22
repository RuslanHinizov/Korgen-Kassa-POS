import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const schema = z.object({
  quantity: z.number().positive().optional(),
  price: z.number().nonnegative().optional(),
});

async function requireDraft(returnId: string, storeId: string) {
  const supplierReturn = await prisma.supplierReturn.findFirst({ where: { id: returnId, storeId }, select: { status: true } });
  if (!supplierReturn) return { error: NextResponse.json({ error: "Документ не найден" }, { status: 404 }) };
  if (supplierReturn.status === "POSTED") return { error: NextResponse.json({ error: "Проведённый документ нельзя изменить" }, { status: 409 }) };
  return { error: null };
}

async function recomputeTotal(returnId: string) {
  const items = await prisma.supplierReturnItem.findMany({ where: { returnId }, select: { total: true } });
  const total = items.reduce((s, i) => s + Number(i.total), 0);
  await prisma.supplierReturn.update({ where: { id: returnId }, data: { totalAmount: total } });
}

// PATCH /api/supplier-returns/:id/items/:itemId — edit a line (qty/price)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: returnId, itemId } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { error } = await requireDraft(returnId, await getStoreId());
  if (error) return error;

  const existing = await prisma.supplierReturnItem.findFirst({ where: { id: itemId, returnId }, select: { quantity: true, price: true } });
  if (!existing) return NextResponse.json({ error: "Позиция не найдена" }, { status: 404 });

  const quantity = parsed.data.quantity ?? Number(existing.quantity);
  const price = parsed.data.price ?? Number(existing.price);

  const item = await prisma.supplierReturnItem.update({
    where: { id: itemId },
    data: { quantity, price, total: quantity * price },
  });
  await recomputeTotal(returnId);
  return NextResponse.json({ item });
}

// DELETE /api/supplier-returns/:id/items/:itemId
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: returnId, itemId } = await params;
  const { error } = await requireDraft(returnId, await getStoreId());
  if (error) return error;

  const existingItem = await prisma.supplierReturnItem.findFirst({ where: { id: itemId, returnId } });
  if (!existingItem) return NextResponse.json({ error: "Позиция не найдена" }, { status: 404 });

  await prisma.supplierReturnItem.delete({ where: { id: itemId } });
  await recomputeTotal(returnId);
  return NextResponse.json({ success: true });
}
