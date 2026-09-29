/**
 * Everything the /till shell needs to draw itself, read ONLY from this till's own IndexedDB — no server call, no session.
 * (The /pos page gets the same facts from the server layout; /till must not, so it can open with no connection at all.)
 */

import { getTillAuth, tillAuthValid, type TillAuth } from "./auth";
import { getCachedConfig } from "./config-cache";
import { idbGet } from "./idb";

export interface TillProfile {
  storeId: string;
  cashier: TillAuth;
  primaryColor: string;
  accentColor: string;
  currency: { symbol: string; decimals: number; locale: string };
}

export type TillProfileResult =
  | { state: "ready"; profile: TillProfile }
  /** nothing has ever been loaded on this till (A2 will fill this from a market package) */
  | { state: "unbound" }
  /** the market is known, but nobody has a valid sign-in on this till (A3 adds PIN sign-in) */
  | { state: "signed-out"; storeId: string };

const DEFAULT_PRIMARY = "#15503A";
const DEFAULT_ACCENT = "#22B24C";

export async function loadTillProfile(): Promise<TillProfileResult> {
  const [known, auth, settings] = await Promise.all([
    idbGet<{ key: string; storeId: string }>("meta", "tillStore"),
    getTillAuth(),
    getCachedConfig<Record<string, unknown>>("settings"),
  ]);
  const storeId = known?.storeId ?? auth?.storeId;
  if (!storeId) return { state: "unbound" };
  if (!auth || !tillAuthValid(auth) || auth.storeId !== storeId) return { state: "signed-out", storeId };

  const str = (v: unknown, fallback: string) => (typeof v === "string" && v ? v : fallback);
  const decimals = Number(settings?.currencyDecimals);
  return {
    state: "ready",
    profile: {
      storeId,
      cashier: auth,
      primaryColor: str(settings?.primaryColor, DEFAULT_PRIMARY),
      accentColor: str(settings?.accentColor, DEFAULT_ACCENT),
      currency: {
        symbol: str(settings?.currency, "$"),
        decimals: Number.isNaN(decimals) ? 2 : decimals,
        locale: str(settings?.language, "en"),
      },
    },
  };
}
