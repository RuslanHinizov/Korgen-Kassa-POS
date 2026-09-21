import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { counterpartyScope } from "@/lib/counterparty-scope";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const PRODUCT_SELECT = { id: true, name: true, barcode: true, unit: true, price: true } as const;

// GET /api/customer-returns/:id — full document with lines + payments
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const storeId = await getStoreId();

  const customerReturn = await prisma.customerReturn.findFirst({
    where: { id, storeId },
    include: {
      user: { select: { name: true } },
      customer: { select: { id: true, name: true } },
      items: { include: { product: { select: PRODUCT_SELECT } } },
      payments: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } },
    },
  });
  if (!customerReturn) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  const paid = customerReturn.payments.reduce((s, p) => s + Number(p.amount), 0);

  return NextResponse.json({
    customerReturn: {
      id: customerReturn.id, documentNo: customerReturn.documentNo, status: customerReturn.status,
      createdAt: customerReturn.createdAt, postedAt: customerReturn.postedAt, comment: customerReturn.comment, referenceValues: customerReturn.referenceValues,
      userName: customerReturn.user.name,
      customer: customerReturn.customer,
      totalAmount: Number(customerReturn.totalAmount), paidAmount: paid, remainingAmount: Number(customerReturn.totalAmount) - paid,
      items: customerReturn.items.map((i) => ({
        id: i.id, productId: i.productId, name: i.product?.name ?? i.name, barcode: i.product?.barcode ?? null,
        unit: i.unit, quantity: Number(i.quantity), price: Number(i.price), total: Number(i.total),
      })),
      payments: customerReturn.payments.map((p) => ({
        id: p.id, amount: Number(p.amount), method: p.method, note: p.note, createdAt: p.createdAt, userName: p.user.name,
      })),
    },
  });
}

const patchSchema = z.object({
  customerId: z.string().nullable().optional(),
  comment: z.string().max(1000).optional().nullable(),
});

// PATCH /api/customer-returns/:id — edit header fields of a still-draft document
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const storeId = await getStoreId();
  const existing = await prisma.customerReturn.findFirst({ where: { id, storeId }, select: { status: true } });
  if (!existing) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  if (existing.status === "POSTED") return NextResponse.json({ error: "Проведённый документ нельзя изменить" }, { status: 409 });

  if (parsed.data.customerId) {
    const customer = await prisma.customer.findFirst({ where: { id: parsed.data.customerId, ...(await counterpartyScope(storeId)) } });
    if (!customer) return NextResponse.json({ error: "Покупатель не найден" }, { status: 404 });
  }

  const customerReturn = await prisma.customerReturn.update({
    where: { id },
    data: {
      ...(parsed.data.customerId !== undefined ? { customerId: parsed.data.customerId } : {}),
      ...(parsed.data.comment !== undefined ? { comment: parsed.data.comment } : {}),
    },
  });
  return NextResponse.json({ customerReturn });
}

// DELETE /api/customer-returns/:id — only while still a draft
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const storeId = await getStoreId();
  const existing = await prisma.customerReturn.findFirst({ where: { id, storeId }, select: { status: true } });
  if (!existing) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  if (existing.status === "POSTED") return NextResponse.json({ error: "Проведённый документ нельзя удалить" }, { status: 409 });

  await prisma.customerReturn.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
