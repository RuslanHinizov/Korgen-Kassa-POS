import { backdatingError } from "@/lib/backdating";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { counterpartyScope } from "@/lib/counterparty-scope";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";
import { getSupplierBalance } from "@/lib/supplier-balance";

const PRODUCT_SELECT = { id: true, name: true, barcode: true, unit: true, price: true, cost: true, stock: true } as const;

// GET /api/purchase-receipts/:id — full document with lines + payments
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const storeId = await getStoreId();

  const receipt = await prisma.purchaseReceipt.findFirst({
    where: { id, storeId },
    include: {
      user: { select: { name: true } },
      supplier: { select: { id: true, name: true } },
      items: { include: { product: { select: PRODUCT_SELECT } } },
      payments: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } }, account: { select: { name: true } } } },
    },
  });
  if (!receipt) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  const paid = receipt.payments.reduce((s, p) => s + Number(p.amount), 0);
  const supplierBalance = receipt.supplier ? await getSupplierBalance(receipt.supplier.id) : null;

  return NextResponse.json({
    receipt: {
      id: receipt.id, documentNo: receipt.documentNo, status: receipt.status,
      createdAt: receipt.createdAt, postedAt: receipt.postedAt, comment: receipt.comment,
      isConsignment: receipt.isConsignment,
      userName: receipt.user.name,
      supplier: receipt.supplier, supplierBalance,
      totalAmount: Number(receipt.totalAmount), paidAmount: paid, remainingAmount: Number(receipt.totalAmount) - paid,
      items: receipt.items.map((i) => ({
        id: i.id, productId: i.productId, name: i.product?.name ?? i.name, barcode: i.product?.barcode ?? null,
        unit: i.unit, quantity: Number(i.quantity), stock: i.product ? Number(i.product.stock) : null,
        costPrice: Number(i.costPrice), discountPct: Number(i.discountPct), salePrice: Number(i.salePrice), total: Number(i.total),
      })),
      payments: receipt.payments.map((p) => ({
        id: p.id, amount: Number(p.amount), method: p.method, note: p.note, createdAt: p.createdAt, userName: p.user.name, accountName: p.account.name,
      })),
    },
  });
}

const patchSchema = z.object({
  supplierId: z.string().nullable().optional(),
  comment: z.string().max(1000).optional().nullable(),
  createdAt: z.coerce.date().optional(),
  isConsignment: z.boolean().optional(),
});

// PATCH /api/purchase-receipts/:id — edit header fields of a still-draft document
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const storeId = await getStoreId();
  const existing = await prisma.purchaseReceipt.findFirst({ where: { id, storeId }, select: { status: true } });
  if (!existing) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  if (existing.status === "POSTED") return NextResponse.json({ error: "Проведённый документ нельзя изменить" }, { status: 409 });

  if (parsed.data.supplierId) {
    const supplier = await prisma.supplier.findFirst({ where: { id: parsed.data.supplierId, ...(await counterpartyScope(storeId)) } });
    if (!supplier) return NextResponse.json({ error: "Поставщик не найден" }, { status: 404 });
  }

  const bd = await backdatingError(storeId, parsed.data.createdAt);
  if (bd) return NextResponse.json({ error: bd }, { status: 400 });

  const receipt = await prisma.purchaseReceipt.update({
    where: { id },
    data: {
      ...(parsed.data.supplierId !== undefined ? { supplierId: parsed.data.supplierId } : {}),
      ...(parsed.data.comment !== undefined ? { comment: parsed.data.comment } : {}),
      ...(parsed.data.createdAt !== undefined ? { createdAt: parsed.data.createdAt } : {}),
      ...(parsed.data.isConsignment !== undefined ? { isConsignment: parsed.data.isConsignment } : {}),
    },
  });
  return NextResponse.json({ receipt });
}

// DELETE /api/purchase-receipts/:id — only while still a draft
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const storeId = await getStoreId();
  const existing = await prisma.purchaseReceipt.findFirst({ where: { id, storeId }, select: { status: true } });
  if (!existing) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  if (existing.status === "POSTED") return NextResponse.json({ error: "Проведённый документ нельзя удалить" }, { status: 409 });

  await prisma.purchaseReceipt.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
