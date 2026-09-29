/**
 * «ИЗМЕНИТЬ ТОВАР»: change a catalogue product's name and/or price at the till. Works with no connection — the edit is
 * kept on the till and uploaded later, like UMAG's product/price "editions". Plan §7.
 */

import { newId } from "./queue";
import { sendOrQueue } from "./send";
import { updateLocalProduct } from "./catalog";

export async function editProductAtTill(
  productId: string,
  patch: { name?: string; price?: number },
  fallbackError: string,
): Promise<{ ok: true; queued: boolean } | { ok: false; error: string }> {
  const sent = await sendOrQueue({
    kind: "product-edit",
    endpoint: `/api/pos/products/${productId}/edit`,
    payload: patch,
    clientId: newId(),
    fallbackError,
  });
  if (!sent.ok) return sent; // e.g. permission refused: nothing changes here either
  await updateLocalProduct(productId, patch);
  return { ok: true, queued: sent.queued };
}
