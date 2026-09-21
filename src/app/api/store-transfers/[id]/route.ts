import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const PRODUCT_SELECT = { id: true, name: true, barcode: true, unit: true, price: true, cost: true, stock: true } as const;

// GET /api/store-transfers/:id — full document with lines
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const storeId = await getStoreId();

  const transfer = await prisma.storeTransfer.findFirst({
    where: { id, storeId },
    include: {
      user: { select: { name: true } },
      store: { select: { name: true } },
      toStore: { select: { id: true, name: true } },
      items: { include: { product: { select: PRODUCT_SELECT } } },
    },
  });
  if (!transfer) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  return NextResponse.json({
    transfer: {
      id: transfer.id, documentNo: transfer.documentNo, status: transfer.status,
      comment: transfer.comment, createdAt: transfer.createdAt, postedAt: transfer.postedAt,
      totalAmount: Number(transfer.totalAmount), userName: transfer.user.name,
      fromStoreName: transfer.store.name,
      toStoreId: transfer.toStore.id, toStoreName: transfer.toStore.name,
      items: transfer.items.map((i) => ({
        id: i.id, productId: i.productId, productName: i.product.name, barcode: i.product.barcode,
        unit: i.product.unit, currentStock: Number(i.product.stock), quantity: Number(i.quantity),
        salePrice: Number(i.product.price),
        unitCost: i.unitCost ? Number(i.unitCost) : null, total: Number(i.total),
      })),
    },
  });
}

const patchSchema = z.object({
  toStoreId: z.string().min(1).optional(),
  comment: z.string().max(1000).optional().nullable(),
  createdAt: z.coerce.date().optional(),
});

// PATCH /api/store-transfers/:id — edit header fields of a still-draft document
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const storeId = await getStoreId();
  const existing = await prisma.storeTransfer.findFirst({ where: { id, storeId }, select: { status: true } });
  if (!existing) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  if (existing.status === "POSTED") return NextResponse.json({ error: "Проведённый документ нельзя изменить" }, { status: 409 });

  if (parsed.data.toStoreId) {
    if (parsed.data.toStoreId === storeId) return NextResponse.json({ error: "Нельзя перемещать товар в тот же магазин" }, { status: 400 });
    const toStore = await prisma.store.findUnique({ where: { id: parsed.data.toStoreId } });
    if (!toStore) return NextResponse.json({ error: "Магазин назначения не найден" }, { status: 404 });
  }

  const transfer = await prisma.storeTransfer.update({
    where: { id },
    data: {
      ...(parsed.data.toStoreId !== undefined ? { toStoreId: parsed.data.toStoreId } : {}),
      ...(parsed.data.comment !== undefined ? { comment: parsed.data.comment } : {}),
      ...(parsed.data.createdAt !== undefined ? { createdAt: parsed.data.createdAt } : {}),
    },
  });
  return NextResponse.json({ transfer });
}

// DELETE /api/store-transfers/:id — only while still a draft
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const storeId = await getStoreId();
  const existing = await prisma.storeTransfer.findFirst({ where: { id, storeId }, select: { status: true } });
  if (!existing) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  if (existing.status === "POSTED") return NextResponse.json({ error: "Проведённый документ нельзя удалить" }, { status: 409 });

  await prisma.storeTransfer.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
