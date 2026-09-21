import { backdatingError } from "@/lib/backdating";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStockInActor, stockInOwnerFilter } from "@/lib/stock-in-access";
import { z } from "zod";

const PRODUCT_SELECT = { id: true, name: true, barcode: true, unit: true, cost: true, price: true, stock: true } as const;

// GET /api/stock-in/:id — full document with lines
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getStockInActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const stockIn = await prisma.stockIn.findFirst({
    where: { id, storeId: actor.storeId, ...stockInOwnerFilter(actor) },
    include: { user: { select: { name: true } }, items: { include: { product: { select: PRODUCT_SELECT } } } },
  });
  if (!stockIn) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  return NextResponse.json({
    stockIn: {
      id: stockIn.id, documentNo: stockIn.documentNo, status: stockIn.status,
      stockInDate: stockIn.stockInDate, note: stockIn.note, totalCost: Number(stockIn.totalCost),
      userName: stockIn.user.name, postedAt: stockIn.postedAt,
      items: stockIn.items.map((i) => {
        const unitCost = i.unitCost != null ? Number(i.unitCost) : Number(i.product.cost ?? 0);
        return {
          id: i.id, productId: i.productId, productName: i.product.name, barcode: i.product.barcode,
          unit: i.product.unit, currentStock: Number(i.product.stock), quantity: Number(i.quantity),
          unitCost, catalogCost: Number(i.product.cost ?? 0), catalogPrice: Number(i.product.price),
          note: i.note, total: unitCost * Number(i.quantity),
        };
      }),
    },
  });
}

const patchSchema = z.object({
  stockInDate: z.coerce.date().optional(),
  note: z.string().max(1000).optional().nullable(),
});

// PATCH /api/stock-in/:id — edit header fields (date/note) of a still-draft document
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getStockInActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.stockIn.findFirst({ where: { id, storeId: actor.storeId, ...stockInOwnerFilter(actor) }, select: { status: true } });
  if (!existing) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  if (existing.status !== "DRAFT") return NextResponse.json({ error: "Документ нельзя изменить" }, { status: 409 });

  const bd = await backdatingError(actor.storeId, parsed.data.stockInDate);
  if (bd) return NextResponse.json({ error: bd }, { status: 400 });

  const stockIn = await prisma.stockIn.update({
    where: { id },
    data: {
      ...(parsed.data.stockInDate !== undefined ? { stockInDate: parsed.data.stockInDate } : {}),
      ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
    },
  });
  return NextResponse.json({ stockIn });
}

// DELETE /api/stock-in/:id — soft-delete (status → DELETED, row kept for the
// audit trail, matching UMAG's "Статус документа: Удалён" filter option).
// Only while still a draft — a posted document already moved stock and is locked.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getStockInActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const existing = await prisma.stockIn.findFirst({ where: { id, storeId: actor.storeId, ...stockInOwnerFilter(actor) }, select: { status: true } });
  if (!existing) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  if (existing.status !== "DRAFT") return NextResponse.json({ error: "Только черновик можно удалить" }, { status: 409 });

  await prisma.stockIn.update({ where: { id }, data: { status: "DELETED" } });
  return NextResponse.json({ success: true });
}
