import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const PRODUCT_SELECT = { id: true, name: true, barcode: true, unit: true, price: true, stock: true } as const;

// GET /api/write-offs/:id — full document with lines
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const storeId = await getStoreId();

  const writeOff = await prisma.writeOff.findFirst({
    where: { id, storeId },
    include: {
      user: { select: { name: true } },
      items: { include: { product: { select: PRODUCT_SELECT } } },
    },
  });
  if (!writeOff) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  return NextResponse.json({
    writeOff: {
      id: writeOff.id, documentNo: writeOff.documentNo, status: writeOff.status,
      writeOffDate: writeOff.writeOffDate, note: writeOff.note, totalCost: Number(writeOff.totalCost),
      userName: writeOff.user.name, postedAt: writeOff.postedAt,
      items: writeOff.items.map((i) => ({
        id: i.id, productId: i.productId, productName: i.product.name, barcode: i.product.barcode,
        unit: i.product.unit, currentStock: Number(i.product.stock), quantity: Number(i.quantity),
        reason: i.reason, unitCost: i.unitCost ? Number(i.unitCost) : null, note: i.note,
        total: i.unitCost ? Number(i.unitCost) * Number(i.quantity) : null,
      })),
    },
  });
}

const patchSchema = z.object({
  writeOffDate: z.coerce.date().optional(),
  note: z.string().max(1000).optional().nullable(),
});

// PATCH /api/write-offs/:id — edit header fields (date/note) of a still-draft document
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const storeId = await getStoreId();
  const existing = await prisma.writeOff.findFirst({ where: { id, storeId }, select: { status: true } });
  if (!existing) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  if (existing.status === "POSTED") return NextResponse.json({ error: "Проведённый документ нельзя изменить" }, { status: 409 });

  const writeOff = await prisma.writeOff.update({
    where: { id },
    data: {
      ...(parsed.data.writeOffDate !== undefined ? { writeOffDate: parsed.data.writeOffDate } : {}),
      ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
    },
  });
  return NextResponse.json({ writeOff });
}

// DELETE /api/write-offs/:id — only while still a draft
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const storeId = await getStoreId();
  const existing = await prisma.writeOff.findFirst({ where: { id, storeId }, select: { status: true } });
  if (!existing) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  if (existing.status === "POSTED") return NextResponse.json({ error: "Проведённый документ нельзя удалить" }, { status: 409 });

  await prisma.writeOff.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
