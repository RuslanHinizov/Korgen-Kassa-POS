/**
 * Wipe what this browser keeps for one market: cached pages/answers and the catalogue copy.
 *
 * Signing out does NOT do this — the next cashier (usually of the same market) needs those very pages to sign in
 * again without a connection. It is done when a cashier of ANOTHER market signs in on this till (`bindTillToStore`).
 *
 * Never touched: the upload queue and the saved cashier credentials. Sales rung up offline and still waiting must survive.
 */

import { clearCatalog } from "./catalog";
import { idbClear, idbGet, idbPut } from "./idb";
import { setNeedsLogin } from "./queue";

async function wipeCaches(): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      reg?.active?.postMessage("clear-caches");
    }
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("korgen-")).map((k) => caches.delete(k)));
    }
    await clearCatalog();
  } catch {
    /* never fail because a cache could not be cleared */
  }
}

export async function clearOfflineCaches(): Promise<void> {
  await wipeCaches();
}

/**
 * Remember which market this till belongs to; when it changes (another market's cashier signs in),
 * everything kept for the previous market is wiped first.
 */
export async function bindTillToStore(storeId: string): Promise<void> {
  const known = await idbGet<{ key: string; storeId: string }>("meta", "tillStore");
  if (known && known.storeId !== storeId) await wipeCaches();
  if (!known || known.storeId !== storeId) await idbPut("meta", { key: "tillStore", storeId });
}

/**
 * Forget everything this till program holds: the upload queue (sales not sent yet), catalogue, saved market package, saved
 * sign-in, the basket on screen. Used when the market this till belonged to was switched off or deleted for good and the
 * till must be tied to a new one. Unsent sales are lost: they belong to a market that no longer accepts them.
 */
export async function resetTill(): Promise<void> {
  await wipeCaches();
  for (const store of ["queue", "products", "meta"] as const) await idbClear(store);
  try { localStorage.removeItem("olgax-pos-cart"); } catch { /* best effort */ }
  setNeedsLogin(false);
}
