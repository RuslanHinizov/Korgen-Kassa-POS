/**
 * The till's own view of recent sales, so receipt history and "return with a receipt" keep working without a connection.
 *
 *   - `cacheSales`   remembers the last sales the server sent (the list the cashier just looked at);
 *   - `queuedSales`  turns sales made offline and not yet uploaded into the same shape;
 *   - `applyQueuedRefunds` takes off what offline refunds already returned, so nothing is returned twice.
 */

import { idbGet, idbPut } from "./idb";
import { listQueue } from "./queue";
import { getTillAuth } from "./auth";

export interface CachedSaleItem {
  id: string;
  productId: string | null;
  name: string;
  quantity: number;
  returnableQuantity: number;
  price: number;
  total: number;
  unit: string;
}

export interface CachedSale {
  id: string;
  documentNo?: number;
  /** number the till made itself for a sale rung up offline */
  receiptNo?: string;
  createdAt: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  discountAmount: number;
  paymentMethod: string;
  amountTendered?: number | null;
  changeDue?: number | null;
  status: "COMPLETED" | "VOIDED" | "REFUNDED";
  user: { name: string };
  items: CachedSaleItem[];
  refunds?: { id: string; amount: number; reason: string | null; createdAt: string; items: { saleItemId?: string; name: string; quantity: number; price: number; unit?: string }[] }[];
  /** true for a sale that is still waiting on this till */
  waiting?: boolean;
}

const MAX_KEPT = 300;

export async function cacheSales(sales: CachedSale[]): Promise<void> {
  try {
    const current = (await idbGet<{ key: string; sales: CachedSale[] }>("meta", "recentSales"))?.sales ?? [];
    const byId = new Map(current.map((s) => [s.id, s]));
    for (const s of sales) byId.set(s.id, s);
    const merged = [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, MAX_KEPT);
    await idbPut("meta", { key: "recentSales", sales: merged });
  } catch {
    /* only a convenience */
  }
}

export async function cachedSales(): Promise<CachedSale[]> {
  return (await idbGet<{ key: string; sales: CachedSale[] }>("meta", "recentSales"))?.sales ?? [];
}

interface QueuedSalePayload {
  clientSaleId: string;
  receiptNo?: string;
  soldAt: string;
  paymentMethod?: string;
  paymentLines?: { method: string; amount: number }[];
  amountTendered?: number;
  discountAmount?: number;
  taxRate?: number;
  tipAmount?: number;
  items: { productId: string | null; name: string; price: number; quantity: number; unit?: string; discountAmount?: number }[];
}

/** Sales rung up on this till that the server has not received yet. */
export async function queuedSales(): Promise<CachedSale[]> {
  const auth = await getTillAuth();
  const out: CachedSale[] = [];
  for (const item of await listQueue()) {
    if (item.kind !== "sale") continue;
    const p = item.payload as QueuedSalePayload;
    const lines = p.items.map((i, n) => {
      const gross = i.price * i.quantity;
      return { id: `L:${n}`, productId: i.productId, name: i.name, quantity: i.quantity, returnableQuantity: i.quantity, price: i.price, total: gross - (i.discountAmount ?? 0), unit: i.unit ?? "pcs" };
    });
    const subtotal = p.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const discount = p.items.reduce((sum, i) => sum + (i.discountAmount ?? 0), 0);
    const total = lines.reduce((sum, l) => sum + l.total, 0);
    out.push({
      id: p.clientSaleId,
      receiptNo: p.receiptNo,
      createdAt: p.soldAt,
      subtotal,
      taxAmount: 0,
      total,
      discountAmount: discount,
      paymentMethod: p.paymentMethod ?? p.paymentLines?.[0]?.method ?? "CASH",
      amountTendered: p.amountTendered ?? null,
      status: "COMPLETED",
      user: { name: auth?.name ?? "" },
      items: lines,
      waiting: true,
    });
  }
  return out;
}

/** Take off the quantities that refunds still waiting on this till have already returned. */
export async function applyQueuedRefunds(sales: CachedSale[]): Promise<CachedSale[]> {
  const returned = new Map<string, Map<string, number>>(); // sale id (server or client) → item id → quantity
  for (const item of await listQueue()) {
    if (item.kind !== "refund") continue;
    const match = /^\/api\/sales\/([^/]+)\/refund$/.exec(item.endpoint);
    if (!match) continue;
    const perItem = returned.get(match[1]) ?? new Map<string, number>();
    for (const line of (item.payload as { items?: { saleItemId: string; quantity: number }[] }).items ?? []) {
      perItem.set(line.saleItemId, (perItem.get(line.saleItemId) ?? 0) + line.quantity);
    }
    returned.set(match[1], perItem);
  }
  if (returned.size === 0) return sales;
  return sales.map((sale) => {
    const perItem = returned.get(sale.id);
    if (!perItem) return sale;
    return { ...sale, items: sale.items.map((i) => ({ ...i, returnableQuantity: Math.max(0, i.returnableQuantity - (perItem.get(i.id) ?? 0)) })) };
  });
}
