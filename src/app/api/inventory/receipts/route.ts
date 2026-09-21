import { backdatingError } from "@/lib/backdating";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { counterpartyScope } from "@/lib/counterparty-scope";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";
import { applyInventoryMovement } from "@/lib/inventory-ledger";
import { logAudit } from "@/lib/audit";

const receiptSchema = z.object({
  supplierId: z.string(), documentNo: z.string().max(100).optional(), deliveredBy: z.string().max(120).optional(),
  receivedBy: z.string().max(120).optional(), note: z.string().max(1000).optional(), receivedAt: z.coerce.date().optional(),
  items: z.array(z.object({ productId: z.string(), quantity: z.number().positive(), unitCost: z.number().min(0).optional(), lotNumber: z.string().max(100).optional(), expiresAt: z.coerce.date().optional() })).min(1),
});

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const storeId = await getStoreId();
  const receipts = await prisma.goodsReceipt.findMany({ where: { storeId }, include: { supplier: { select: { name: true } }, user: { select: { name: true } }, items: { include: { product: { select: { name: true, unit: true } } } } }, orderBy: { receivedAt: "desc" }, take: 100 });
  return NextResponse.json({ receipts });
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = receiptSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;
  const storeId = await getStoreId();
  const bd = await backdatingError(storeId, data.receivedAt);
  if (bd) return NextResponse.json({ error: bd }, { status: 400 });
  const [supplier, validProducts] = await Promise.all([
    prisma.supplier.findFirst({ where: { id: data.supplierId, ...(await counterpartyScope(storeId)) } }),
    prisma.product.count({ where: { id: { in: [...new Set(data.items.map((i) => i.productId))] }, storeId } }),
  ]);
  if (!supplier) return NextResponse.json({ error: "Поставщик не найден" }, { status: 404 });
  if (validProducts !== new Set(data.items.map((i) => i.productId)).size) {
    return NextResponse.json({ error: "Один или несколько товаров недоступны" }, { status: 400 });
  }
  const totalCost = Math.round(data.items.reduce((s, i) => s + i.quantity * (i.unitCost ?? 0), 0) * 100) / 100;
  const receipt = await prisma.$transaction(async (tx) => {
    const created = await tx.goodsReceipt.create({ data: { storeId, supplierId: data.supplierId, userId: session.user.id, totalCost, documentNo: data.documentNo, deliveredBy: data.deliveredBy, receivedBy: data.receivedBy, note: data.note, receivedAt: data.receivedAt, items: { create: data.items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitCost: i.unitCost, lotNumber: i.lotNumber, expiresAt: i.expiresAt })) } }, include: { items: true } });
    for (const item of data.items) {
      await applyInventoryMovement(tx, { productId: item.productId, userId: session.user.id, supplierId: data.supplierId, type: "RECEIPT", quantity: item.quantity, unitCost: item.unitCost, referenceType: "GoodsReceipt", referenceId: created.id, documentNo: data.documentNo, deliveredBy: data.deliveredBy, receivedBy: data.receivedBy, lotNumber: item.lotNumber, expiresAt: item.expiresAt, note: data.note });
      if (item.lotNumber) await tx.inventoryLot.upsert({ where: { productId_lotNumber: { productId: item.productId, lotNumber: item.lotNumber } }, create: { productId: item.productId, supplierId: data.supplierId, lotNumber: item.lotNumber, expiresAt: item.expiresAt, receivedQty: item.quantity, availableQty: item.quantity, unitCost: item.unitCost }, update: { receivedQty: { increment: item.quantity }, availableQty: { increment: item.quantity }, expiresAt: item.expiresAt ?? undefined, unitCost: item.unitCost ?? undefined } });
    }
    return created;
  });
  await logAudit({ userId: session.user.id, action: "STOCK_RECEIPT", entityType: "GoodsReceipt", entityId: receipt.id, details: { documentNo: data.documentNo ?? null, items: data.items.length } });
  return NextResponse.json({ receipt }, { status: 201 });
}
