import { backdatingError } from "@/lib/backdating";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const PRODUCT_SELECT = { id: true, name: true, barcode: true, unit: true, stock: true, cost: true, price: true } as const;

// GET /api/inventory/stocktakes/:id — full document with lines
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const storeId = await getStoreId();

  const stocktake = await prisma.stocktake.findFirst({
    where: { id, storeId },
    include: { user: { select: { name: true } }, items: { include: { product: { select: PRODUCT_SELECT } } } },
  });
  if (!stocktake) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  return NextResponse.json({
    stocktake: {
      id: stocktake.id, documentNo: stocktake.documentNo, status: stocktake.status, note: stocktake.note,
      countedAt: stocktake.countedAt, postedAt: stocktake.postedAt, userName: stocktake.user.name,
      items: stocktake.items.map((i) => ({
        id: i.id, productId: i.productId, productName: i.product.name, barcode: i.product.barcode,
        unit: i.product.unit, currentStock: Number(i.product.stock),
        cost: i.product.cost != null ? Number(i.product.cost) : null, price: Number(i.product.price),
        expectedQty: Number(i.expectedQty), countedQty: Number(i.countedQty), difference: Number(i.difference),
      })),
    },
  });
}

const patchSchema = z.object({
  countedAt: z.coerce.date().optional(),
  note: z.string().max(1000).optional().nullable(),
});

// PATCH /api/inventory/stocktakes/:id — edit header fields while still DRAFT/COUNTING
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const storeId = await getStoreId();
  const existing = await prisma.stocktake.findFirst({ where: { id, storeId }, select: { status: true } });
  if (!existing) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  if (existing.status !== "DRAFT" && existing.status !== "COUNTING") {
    return NextResponse.json({ error: "Документ на этом этапе нельзя изменить" }, { status: 409 });
  }

  const bd = await backdatingError(storeId, parsed.data.countedAt);
  if (bd) return NextResponse.json({ error: bd }, { status: 400 });

  const stocktake = await prisma.stocktake.update({
    where: { id },
    data: {
      ...(parsed.data.countedAt !== undefined ? { countedAt: parsed.data.countedAt } : {}),
      ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
    },
  });
  return NextResponse.json({ stocktake });
}

// DELETE /api/inventory/stocktakes/:id — only before it's posted
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const storeId = await getStoreId();
  const existing = await prisma.stocktake.findFirst({ where: { id, storeId }, select: { status: true } });
  if (!existing) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  if (existing.status === "POSTED") return NextResponse.json({ error: "Проведённый документ нельзя удалить" }, { status: 409 });

  await prisma.stocktake.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
