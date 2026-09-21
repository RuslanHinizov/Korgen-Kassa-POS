import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { applyInventoryMovement } from "@/lib/inventory-ledger";
import { recomputeBundlesUsing } from "@/lib/bundle";
import { logAudit } from "@/lib/audit";

// POST /api/purchase-receipts/:id/post — Провести: increases stock for each line
// (goods physically arrived) and re-prices the catalog (cost/sale price) from
// what was entered on the receipt, matching UMAG's behaviour. Locks the
// document; the resulting debt is then settled over time via /payments.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const storeId = await getStoreId();

  const receipt = await prisma.purchaseReceipt.findFirst({ where: { id, storeId }, include: { items: true } });
  if (!receipt) return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  if (receipt.status === "POSTED") return NextResponse.json({ error: "Документ уже проведён" }, { status: 409 });
  if (!receipt.supplierId) return NextResponse.json({ error: "Выберите поставщика" }, { status: 400 });
  if (receipt.items.length === 0) return NextResponse.json({ error: "Добавьте хотя бы один товар" }, { status: 400 });

  const settings = await prisma.businessSettings.findUnique({ where: { storeId }, select: { autoUpdateCostPrice: true, autoUpdateSalePrice: true, autoUpdateBundleSalePrice: true, roundSalePriceUp: true } });
  const doUpdateCost = settings?.autoUpdateCostPrice !== false;
  const doUpdateSalePrice = settings?.autoUpdateSalePrice !== false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const posted = await prisma.$transaction(async (tx: any) => {
    for (const item of receipt.items) {
      if (!item.productId) continue;
      const discountedCost = Number(item.costPrice) * (1 - Number(item.discountPct) / 100);
      await applyInventoryMovement(tx, {
        productId: item.productId,
        userId: session.user.id,
        supplierId: receipt.supplierId,
        type: "RECEIPT",
        quantity: Number(item.quantity),
        unitCost: discountedCost,
        referenceType: "PurchaseReceipt",
        referenceId: receipt.id,
        documentNo: String(receipt.documentNo),
        note: receipt.comment ?? undefined,
      });
      if (doUpdateCost || doUpdateSalePrice) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            ...(doUpdateCost ? { cost: discountedCost } : {}),
            ...(doUpdateSalePrice ? { price: settings?.roundSalePriceUp ? Math.ceil(Number(item.salePrice) - 1e-9) : Number(item.salePrice) } : {}),
          },
        });
      }
      if (doUpdateCost && settings?.autoUpdateBundleSalePrice) {
        await recomputeBundlesUsing(tx, item.productId);
      }
    }
    return tx.purchaseReceipt.update({ where: { id }, data: { status: "POSTED", postedAt: new Date() } });
  });

  await logAudit({ userId: session.user.id, action: "PURCHASE_RECEIPT_POST", entityType: "PurchaseReceipt", entityId: id, details: { documentNo: receipt.documentNo, items: receipt.items.length, totalAmount: Number(receipt.totalAmount) } });
  return NextResponse.json({ receipt: posted });
}
