import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const schema = z.object({ quantity: z.number().positive() });

async function requireDraft(transferId: string, storeId: string) {
  const transfer = await prisma.storeTransfer.findFirst({ where: { id: transferId, storeId }, select: { status: true } });
  if (!transfer) return { error: NextResponse.json({ error: "Документ не найден" }, { status: 404 }) };
  if (transfer.status === "POSTED") return { error: NextResponse.json({ error: "Проведённый документ нельзя изменить" }, { status: 409 }) };
  return { error: null };
}

async function recomputeTotal(transferId: string) {
  const items = await prisma.storeTransferItem.findMany({ where: { transferId }, select: { total: true } });
  const total = items.reduce((s, i) => s + Number(i.total), 0);
  await prisma.storeTransfer.update({ where: { id: transferId }, data: { totalAmount: total } });
}

// PATCH /api/store-transfers/:id/items/:itemId — edit a line's quantity
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: transferId, itemId } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { error } = await requireDraft(transferId, await getStoreId());
  if (error) return error;

  const existingItem = await prisma.storeTransferItem.findFirst({ where: { id: itemId, transferId } });
  if (!existingItem) return NextResponse.json({ error: "Строка не найдена" }, { status: 404 });

  const item = await prisma.storeTransferItem.update({
    where: { id: itemId },
    data: { quantity: parsed.data.quantity, total: parsed.data.quantity * Number(existingItem.unitCost ?? 0) },
  });
  await recomputeTotal(transferId);
  return NextResponse.json({ item });
}

// DELETE /api/store-transfers/:id/items/:itemId
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: transferId, itemId } = await params;
  const { error } = await requireDraft(transferId, await getStoreId());
  if (error) return error;

  const existingItem = await prisma.storeTransferItem.findFirst({ where: { id: itemId, transferId } });
  if (!existingItem) return NextResponse.json({ error: "Строка не найдена" }, { status: 404 });

  await prisma.storeTransferItem.delete({ where: { id: itemId } });
  await recomputeTotal(transferId);
  return NextResponse.json({ success: true });
}
