import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { applyInventoryMovement } from "@/lib/inventory-ledger";
import { logAudit } from "@/lib/audit";

// POST /api/store-transfers/:id/post — Провести: decrements stock at the source
// store and, for each line, finds a barcode-matching product at the destination
// store to increment (restoring it first if it was soft-deleted and
// autoRestoreDeletedProducts is on), or clones a brand-new product there when no
// match exists (stores have fully independent catalogs — there is no shared row
// to "move"). Then locks the document.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const storeId = await getStoreId();

  const transfer = await prisma.storeTransfer.findFirst({
    where: { id, storeId },
    include: { items: { include: { product: true } } },
  });
  if (!transfer) return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  if (transfer.status === "POSTED") return NextResponse.json({ error: "Документ уже проведён" }, { status: 409 });
  if (transfer.items.length === 0) return NextResponse.json({ error: "Добавьте хотя бы один товар" }, { status: 400 });

  const destSettings = await prisma.businessSettings.findUnique({ where: { storeId: transfer.toStoreId }, select: { autoRestoreDeletedProducts: true } });
  const autoRestore = Boolean(destSettings?.autoRestoreDeletedProducts);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const posted = await prisma.$transaction(async (tx: any) => {
      for (const item of transfer.items) {
        const qty = Number(item.quantity);
        await applyInventoryMovement(tx, {
          productId: item.productId,
          userId: session.user.id,
          type: "TRANSFER_OUT",
          quantity: -qty,
          referenceType: "StoreTransfer",
          referenceId: transfer.id,
          documentNo: String(transfer.documentNo),
          note: transfer.comment ?? undefined,
        });

        const source = item.product;
        let destProductId: string;
        const destMatch = source.barcode
          ? await tx.product.findFirst({ where: { storeId: transfer.toStoreId, barcode: source.barcode, deletedAt: null }, select: { id: true } })
          : null;
        if (destMatch) {
          destProductId = destMatch.id;
        } else {
          const deletedMatch = source.barcode && autoRestore
            ? await tx.product.findFirst({ where: { storeId: transfer.toStoreId, barcode: source.barcode, deletedAt: { not: null } }, select: { id: true } })
            : null;
          if (deletedMatch) {
            await tx.product.update({ where: { id: deletedMatch.id }, data: { deletedAt: null } });
            destProductId = deletedMatch.id;
          } else {
            const created = await tx.product.create({
              data: {
                storeId: transfer.toStoreId,
                name: source.name,
                barcode: source.barcode,
                unit: source.unit,
                price: source.price,
                cost: source.cost,
                stock: 0,
              },
              select: { id: true },
            });
            destProductId = created.id;
          }
        }

        await applyInventoryMovement(tx, {
          productId: destProductId,
          userId: session.user.id,
          type: "TRANSFER_IN",
          quantity: qty,
          referenceType: "StoreTransfer",
          referenceId: transfer.id,
          documentNo: String(transfer.documentNo),
          note: transfer.comment ?? undefined,
        });
      }
      return tx.storeTransfer.update({ where: { id }, data: { status: "POSTED", postedAt: new Date() } });
    });

    await logAudit({ userId: session.user.id, action: "STORE_TRANSFER_POST", entityType: "StoreTransfer", entityId: id, details: { documentNo: transfer.documentNo, items: transfer.items.length, toStoreId: transfer.toStoreId } });
    return NextResponse.json({ transfer: posted });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "INSUFFICIENT_STOCK") {
      return NextResponse.json({ error: "Недостаточно остатка по одному из товаров" }, { status: 409 });
    }
    throw e;
  }
}
