import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { counterpartyScope } from "@/lib/counterparty-scope";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";
import { getSupplierBalance } from "@/lib/supplier-balance";

const PRODUCT_SELECT = { id: true, name: true, barcode: true, unit: true, price: true, stock: true } as const;

// GET /api/supplier-returns/:id — full document with lines + payments
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const storeId = await getStoreId();

  const supplierReturn = await prisma.supplierReturn.findFirst({
    where: { id, storeId },
    include: {
      user: { select: { name: true } },
      supplier: { select: { id: true, name: true } },
      items: { include: { product: { select: PRODUCT_SELECT } } },
      payments: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } }, account: { select: { name: true } } } },
    },
  });
  if (!supplierReturn) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  const paid = supplierReturn.payments.reduce((s, p) => s + Number(p.amount), 0);
  const supplierBalance = supplierReturn.supplier ? await getSupplierBalance(supplierReturn.supplier.id) : null;

  return NextResponse.json({
    supplierReturn: {
      id: supplierReturn.id, documentNo: supplierReturn.documentNo, status: supplierReturn.status,
      createdAt: supplierReturn.createdAt, postedAt: supplierReturn.postedAt, comment: supplierReturn.comment,
      userName: supplierReturn.user.name,
      supplier: supplierReturn.supplier, supplierBalance,
      totalAmount: Number(supplierReturn.totalAmount), paidAmount: paid, remainingAmount: Number(supplierReturn.totalAmount) - paid,
      items: supplierReturn.items.map((i) => ({
        id: i.id, productId: i.productId, name: i.product?.name ?? i.name, barcode: i.product?.barcode ?? null,
        unit: i.unit, quantity: Number(i.quantity), stock: i.product ? Number(i.product.stock) : null,
        price: Number(i.price), total: Number(i.total),
      })),
      payments: supplierReturn.payments.map((p) => ({
        id: p.id, amount: Number(p.amount), method: p.method, note: p.note, createdAt: p.createdAt, userName: p.user.name, accountName: p.account.name,
      })),
    },
  });
}

const patchSchema = z.object({
  supplierId: z.string().nullable().optional(),
  comment: z.string().max(1000).optional().nullable(),
  createdAt: z.coerce.date().optional(),
});

// PATCH /api/supplier-returns/:id — edit header fields of a still-draft document
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const storeId = await getStoreId();
  const existing = await prisma.supplierReturn.findFirst({ where: { id, storeId }, select: { status: true } });
  if (!existing) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  if (existing.status === "POSTED") return NextResponse.json({ error: "Проведённый документ нельзя изменить" }, { status: 409 });

  if (parsed.data.supplierId) {
    const supplier = await prisma.supplier.findFirst({ where: { id: parsed.data.supplierId, ...(await counterpartyScope(storeId)) } });
    if (!supplier) return NextResponse.json({ error: "Поставщик не найден" }, { status: 404 });
  }

  const supplierReturn = await prisma.supplierReturn.update({
    where: { id },
    data: {
      ...(parsed.data.supplierId !== undefined ? { supplierId: parsed.data.supplierId } : {}),
      ...(parsed.data.comment !== undefined ? { comment: parsed.data.comment } : {}),
      ...(parsed.data.createdAt !== undefined ? { createdAt: parsed.data.createdAt } : {}),
    },
  });
  return NextResponse.json({ supplierReturn });
}

// DELETE /api/supplier-returns/:id — only while still a draft
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const storeId = await getStoreId();
  const existing = await prisma.supplierReturn.findFirst({ where: { id, storeId }, select: { status: true } });
  if (!existing) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  if (existing.status === "POSTED") return NextResponse.json({ error: "Проведённый документ нельзя удалить" }, { status: 409 });

  await prisma.supplierReturn.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
