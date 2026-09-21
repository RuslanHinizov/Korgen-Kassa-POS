/** Shared, append-only inventory ledger writer.
 * Call only inside the same transaction that changes Product.stock.
 */
export async function applyInventoryMovement(
  // Prisma transaction client. Kept structural so it works with Prisma's interactive transactions.
  tx: any,
  input: {
    productId: string;
    userId: string;
    type: "OPENING_BALANCE" | "RECEIPT" | "SALE" | "SALE_RETURN" | "SUPPLIER_RETURN" | "DAMAGE" | "WASTE" | "THEFT" | "ADJUSTMENT" | "STOCKTAKE" | "IMPORT" | "TRANSFER_OUT" | "TRANSFER_IN";
    quantity: number;
    supplierId?: string | null;
    unitCost?: number | null;
    referenceType?: string;
    referenceId?: string;
    documentNo?: string | null;
    deliveredBy?: string | null;
    receivedBy?: string | null;
    lotNumber?: string | null;
    expiresAt?: Date | null;
    note?: string | null;
  }
) {
  const product = await tx.product.findUniqueOrThrow({ where: { id: input.productId }, select: { stock: true } });
  const stockBefore = Number(product.stock);
  const stockAfter = stockBefore + input.quantity;
  if (stockAfter < 0) throw new Error("INSUFFICIENT_STOCK");

  await tx.product.update({ where: { id: input.productId }, data: { stock: stockAfter } });
  return tx.inventoryMovement.create({
    data: {
      ...input,
      supplierId: input.supplierId ?? undefined,
      unitCost: input.unitCost ?? undefined,
      documentNo: input.documentNo ?? undefined,
      deliveredBy: input.deliveredBy ?? undefined,
      receivedBy: input.receivedBy ?? undefined,
      lotNumber: input.lotNumber ?? undefined,
      expiresAt: input.expiresAt ?? undefined,
      note: input.note ?? undefined,
      stockBefore,
      stockAfter,
    },
  });
}

/** Depletes dated lots first (FEFO) after a sale. Products without lot data remain supported. */
export async function consumeInventoryLots(tx: any, productId: string, quantity: number) {
  let remaining = quantity;
  const lots = await tx.inventoryLot.findMany({ where: { productId, availableQty: { gt: 0 } }, orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }] });
  for (const lot of lots) {
    if (remaining <= 0) break;
    const available = Number(lot.availableQty);
    const used = Math.min(available, remaining);
    await tx.inventoryLot.update({ where: { id: lot.id }, data: { availableQty: available - used } });
    remaining -= used;
  }
}

/** A returned sale item has no retained source-lot reference, so it is held in its own return lot. */
export async function restoreReturnedLot(tx: any, input: { productId: string; supplierId?: string | null; quantity: number; referenceId: string }) {
  const lotNumber = `RETURN-${input.referenceId.slice(-8)}-${input.productId.slice(-5)}`;
  await tx.inventoryLot.upsert({ where: { productId_lotNumber: { productId: input.productId, lotNumber } }, create: { productId: input.productId, supplierId: input.supplierId ?? undefined, lotNumber, receivedQty: input.quantity, availableQty: input.quantity }, update: { receivedQty: { increment: input.quantity }, availableQty: { increment: input.quantity } } });
}
