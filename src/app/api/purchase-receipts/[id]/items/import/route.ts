import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";

const schema = z.object({
  items: z.array(z.object({ barcode: z.string().trim().min(1), quantity: z.number().positive() })).min(1).max(5000),
});

function lineTotal(quantity: number, costPrice: number, discountPct: number) {
  return quantity * costPrice * (1 - discountPct / 100);
}

// POST /api/purchase-receipts/:id/items/import — «Импорт товаров» (Excel / collector file):
// lines are matched by barcode or article. Products deleted earlier are brought back when
// «Автовосстановление удаленных товаров при приемке» is on.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: receiptId } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректный файл: нужны столбцы «Штрихкод» и «Количество»" }, { status: 400 });

  const storeId = await getStoreId();
  const receipt = await prisma.purchaseReceipt.findFirst({ where: { id: receiptId, storeId }, select: { status: true, supplierId: true } });
  if (!receipt) return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  if (receipt.status === "POSTED") return NextResponse.json({ error: "Проведённый документ нельзя изменить" }, { status: 409 });

  const settings = await prisma.businessSettings.findUnique({
    where: { storeId },
    select: { mergeSameProducts: true, bindProductToSupplier: true, autoRestoreDeletedProducts: true },
  });
  const shouldMerge = settings?.mergeSameProducts !== false;

  let added = 0;
  let restored = 0;
  const notFound: string[] = [];
  for (const row of parsed.data.items) {
    const match = { OR: [{ barcode: row.barcode }, { sku: row.barcode }], storeId };
    let product = await prisma.product.findFirst({ where: { ...match, deletedAt: null }, select: { id: true, name: true, unit: true, price: true, cost: true, supplierId: true } });
    if (!product && settings?.autoRestoreDeletedProducts) {
      const deleted = await prisma.product.findFirst({ where: { ...match, deletedAt: { not: null } }, select: { id: true } });
      if (deleted) {
        product = await prisma.product.update({ where: { id: deleted.id }, data: { deletedAt: null }, select: { id: true, name: true, unit: true, price: true, cost: true, supplierId: true } });
        restored++;
      }
    }
    if (!product) { notFound.push(row.barcode); continue; }

    const existing = shouldMerge ? await prisma.purchaseReceiptItem.findFirst({ where: { receiptId, productId: product.id } }) : null;
    if (existing) {
      const quantity = Number(existing.quantity) + row.quantity;
      await prisma.purchaseReceiptItem.update({
        where: { id: existing.id },
        data: { quantity, total: lineTotal(quantity, Number(existing.costPrice), Number(existing.discountPct)) },
      });
    } else {
      const costPrice = Number(product.cost ?? product.price);
      await prisma.purchaseReceiptItem.create({
        data: {
          receiptId, productId: product.id, name: product.name, unit: product.unit,
          quantity: row.quantity, costPrice, discountPct: 0, salePrice: Number(product.price), total: lineTotal(row.quantity, costPrice, 0),
        },
      });
    }
    if (settings?.bindProductToSupplier && !product.supplierId && receipt.supplierId) {
      await prisma.product.update({ where: { id: product.id }, data: { supplierId: receipt.supplierId } });
    }
    added++;
  }

  const items = await prisma.purchaseReceiptItem.findMany({ where: { receiptId }, select: { total: true } });
  await prisma.purchaseReceipt.update({ where: { id: receiptId }, data: { totalAmount: items.reduce((s, i) => s + Number(i.total), 0) } });
  return NextResponse.json({ added, restored, notFound });
}
