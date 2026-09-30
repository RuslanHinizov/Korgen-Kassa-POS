/**
 * Load a market package (src/lib/till-package-format.ts) onto this till: binds it to the market and fills the same
 * local stores the online till fills by downloading — catalogue, settings, promotions, quick products — so the
 * till then works exactly as if it had synced. No connection is used. (Plan §12, stage A2.)
 */

import { clearCatalog } from "./catalog";
import { bindTillToStore } from "./clear";
import { cacheConfig } from "./config-cache";
import { idbCount, idbDelete, idbGet, idbPut, idbPutMany } from "./idb";
import { setDeviceToken } from "./device-token";
import { parsePackage, type TillPackageBody } from "@/lib/till-package-format";

export type ImportResult =
  | { ok: true; storeName: string; products: number; generatedAt: string }
  | { ok: false; reason: "not-json" | "not-a-package" | "newer-version" | "damaged" | "unsent-sales" | "storage-failed" };

export interface PackageInfo {
  key: "packageInfo";
  storeId: string;
  storeName: string;
  generatedAt: string;
  loadedAt: number;
  products: number;
}

export async function importPackage(text: string): Promise<ImportResult> {
  const parsed = await parsePackage(text);
  if (!parsed.ok) return parsed;
  const body: TillPackageBody = parsed.pkg.body;

  // Never swap markets under sales that were rung up and not uploaded yet: they belong to the old market.
  const known = await idbGet<{ storeId: string }>("meta", "tillStore");
  if (known && known.storeId !== body.store.id && (await idbCount("queue")) > 0) return { ok: false, reason: "unsent-sales" };

  await bindTillToStore(body.store.id); // wipes the previous market's caches when it differs
  await clearCatalog();
  if (!(await idbPutMany("products", body.products))) return { ok: false, reason: "storage-failed" };

  // resume point for the online catalogue sync: it continues after the newest row the package already holds
  const newest = body.products.reduce<{ updatedAt: string; id: string } | null>((m, p) => (!m || p.updatedAt > m.updatedAt || (p.updatedAt === m.updatedAt && p.id > m.id) ? { updatedAt: p.updatedAt, id: p.id } : m), null);
  await idbPut("meta", { key: "catalogCursor", storeId: body.store.id, since: newest?.updatedAt ?? null, afterId: newest?.id ?? "", syncedAt: Date.parse(body.generatedAt) });

  await cacheConfig("settings", body.settings);
  await cacheConfig("promotions", body.promotions);
  await cacheConfig("quickProductGroups", body.quickGroups);
  await cacheConfig("quickProducts", body.quickItems);
  await cacheConfig("packageCashiers", body.cashiers);
  await setDeviceToken(body.deviceToken); // also clears a token left from another market when this package has none
  // a fresh package carries the PINs as they are now; a lock from guesses against the old ones no longer applies
  for (const c of body.cashiers) await idbDelete("meta", `pinAttempts:${c.id}`);
  if (body.cashbox) await idbPut("meta", { key: "tillCashbox", id: body.cashbox.id, name: body.cashbox.name });
  else await idbDelete("meta", "tillCashbox");
  await idbPut("meta", { key: "packageInfo", storeId: body.store.id, storeName: body.store.name, generatedAt: body.generatedAt, loadedAt: Date.now(), products: body.products.length } satisfies PackageInfo);

  return { ok: true, storeName: body.store.name, products: body.products.length, generatedAt: body.generatedAt };
}

export async function getPackageInfo(): Promise<PackageInfo | undefined> {
  return idbGet<PackageInfo>("meta", "packageInfo");
}
