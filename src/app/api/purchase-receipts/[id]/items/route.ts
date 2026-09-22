import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const line = z.object({ productId: z.string().min(1), quantity: z.number().positive() });
const schema = z.union([line, z.object({ items: z.array(line).min(1) })]);

function lineTotal(quantity: number, costPrice: number, discountPct: number) {
  return quantity * costPrice * (1 - discountPct / 100);
}

// POST /api/purchase-receipts/:id/items — add one or more lines to a still-draft
// document; a product already on the document has its quantity merged in,
// matching UMAG's default "Суммировать одинаковые товары" behaviour.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: receiptId } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const lines = "items" in parsed.data ? parsed.data.items : [parsed.data];

  const storeId = await getStoreId();
  const receipt = await prisma.purchaseReceipt.findFirst({ where: { id: receiptId, storeId }, select: { status: true, supplierId: true } });
  if (!receipt) return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  if (receipt.status === "POSTED") return NextResponse.json({ error: "Проведённый документ нельзя изменить" }, { status: 409 });

  const settings = await prisma.businessSettings.findUnique({ where: { storeId }, select: { mergeSameProducts: true, bindProductToSupplier: true } });
  const shouldMerge = settings?.mergeSameProducts !== false;
  const existing = shouldMerge ? await prisma.purchaseReceiptItem.findMany({ where: { receiptId }, select: { id: true, productId: true, quantity: true } }) : [];
  const existingByProduct = new Map(existing.filter((i) => i.productId).map((i) => [i.productId as string, i]));

  const created: unknown[] = [];
  for (const l of lines) {
    const already = existingByProduct.get(l.productId);
    if (already) {
      const quantity = Number(already.quantity) + l.quantity;
      const item = await prisma.purchaseReceiptItem.findUnique({ where: { id: already.id } });
      if (!item) continue;
      await prisma.purchaseReceiptItem.update({
        where: { id: already.id },
        data: { quantity, total: lineTotal(quantity, Number(item.costPrice), Number(item.discountPct)) },
      });
      continue;
    }
    const product = await prisma.product.findFirst({ where: { id: l.productId, storeId, deletedAt: null }, select: { name: true, unit: true, price: true, cost: true, supplierId: true } });
    if (!product) continue;
    const costPrice = Number(product.cost ?? product.price);
    const salePrice = Number(product.price);
    const item = await prisma.purchaseReceiptItem.create({
      data: {
        receiptId, productId: l.productId, name: product.name, unit: product.unit,
        quantity: l.quantity, costPrice, discountPct: 0, salePrice, total: lineTotal(l.quantity, costPrice, 0),
      },
    });
    created.push(item);
    if (settings?.bindProductToSupplier && !product.supplierId && receipt.supplierId) {
      await prisma.product.update({ where: { id: l.productId }, data: { supplierId: receipt.supplierId } });
    }
  }
  await recomputeTotal(receiptId);
  return NextResponse.json({ items: created }, { status: 201 });
}

async function recomputeTotal(receiptId: string) {
  const items = await prisma.purchaseReceiptItem.findMany({ where: { receiptId }, select: { total: true } });
  const total = items.reduce((s, i) => s + Number(i.total), 0);
  await prisma.purchaseReceipt.update({ where: { id: receiptId }, data: { totalAmount: total } });
}
