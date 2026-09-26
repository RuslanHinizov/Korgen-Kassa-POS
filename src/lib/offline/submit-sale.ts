/**
 * Send a sale to the server; when there is no connection, keep it on the till and upload it later.
 *
 * The till never refuses a sale because the internet is down: the sale is stored with a `clientSaleId`
 * (so a retry can never duplicate it), gets a receipt number made on the till, and the cashier carries on.
 */

import { newId, nextReceiptNo } from "./queue";
import { sendOrQueue } from "./send";
import { getLocalShift } from "./shift";
import { getTillAuth } from "./auth";

/** The numbers the screen already computed — used to show the receipt when the server could not answer. */
export interface OfflineSaleSummary {
  total: number;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  tipAmount: number;
  amountTendered: number;
}

export interface SubmittedSale {
  id: string;
  documentNo?: number;
  receiptNo?: string;
  total: number;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  tipAmount: number;
  amountTendered: number;
  [key: string]: unknown;
}

export type SubmitSaleResult =
  | { ok: true; sale: SubmittedSale; queued: boolean }
  | { ok: false; error: string; status: number };

export async function submitSale(body: Record<string, unknown>, summary: OfflineSaleSummary, fallbackError: string): Promise<SubmitSaleResult> {
  const clientSaleId = newId();
  const shift = await getLocalShift();
  const auth = await getTillAuth();
  const payload: Record<string, unknown> = {
    ...body,
    clientSaleId,
    soldAt: new Date().toISOString(),
    // an offline till knows its shift and its cashier before the server does
    ...(shift && shift.status === "OPEN" ? { shiftId: shift.id } : {}),
    ...(auth ? { cashierUserId: auth.userId } : {}),
  };

  const sent = await sendOrQueue({
    kind: "sale",
    endpoint: "/api/sales",
    payload,
    clientId: clientSaleId,
    fallbackError,
    decorateForQueue: async (p) => ({ ...p, receiptNo: await nextReceiptNo(), offline: true }),
  });

  if (!sent.ok) return sent;
  if (!sent.queued) return { ok: true, sale: sent.data.sale as SubmittedSale, queued: false };
  return { ok: true, queued: true, sale: { id: clientSaleId, receiptNo: sent.payload.receiptNo as string, ...summary } };
}
