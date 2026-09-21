import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";

export type AuditAction =
  | "SALE_VOID"
  | "SALE_REFUND"
  | "DISCOUNT_OVERRIDE"
  | "PRICE_OVERRIDE"
  | "STOCK_ADJUST"
  | "SETTINGS_UPDATE"
  | "SHIFT_OPEN"
  | "SHIFT_CLOSE"
  | "CASH_IN"
  | "CASH_OUT"
  | "MANAGER_OVERRIDE"
  | "USER_CREATE"
  | "USER_DELETE"
  | "STOCK_RECEIPT"
  | "STOCKTAKE_POST"
  | "WRITE_OFF_POST"
  | "STOCK_IN_POST"
  | "CUSTOMER_RETURN_POST"
  | "CUSTOMER_RETURN_PAYMENT"
  | "CUSTOMER_PAYMENT"
  | "PURCHASE_RECEIPT_POST"
  | "PURCHASE_RECEIPT_PAYMENT"
  | "SUPPLIER_RETURN_POST"
  | "SUPPLIER_RETURN_PAYMENT"
  | "STORE_TRANSFER_POST"
  | "PRODUCT_CREATE";

/** Best-effort audit trail write — never throws into the caller. */
export async function logAudit(entry: {
  userId: string;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  details?: unknown;
}): Promise<void> {
  try {
    const storeId = await getStoreId();
    await prisma.auditLog.create({
      data: {
        storeId,
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        details: entry.details === undefined ? undefined : (entry.details as object),
      },
    });
  } catch (err) {
    console.error("[audit] failed to write log", err);
  }
}
