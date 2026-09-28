/**
 * The till's own copy of small, rarely-changing server config it needs to work correctly with no
 * connection: active promotions (for `evaluatePromotions`, already isomorphic — see src/lib/promotions.ts)
 * and business settings/permissions (tax rate, which POS actions are allowed for which role, receipt
 * branding). Falling back to hard-coded defaults here would be wrong in a different way than falling back
 * to "nothing": a market that restricted returns to managers only must not see that restriction quietly
 * lifted to "everyone" just because the page loaded offline.
 *
 * Every successful fetch overwrites the cached copy; a failed fetch reads the last good one instead.
 */

import { idbGet, idbPut } from "./idb";

interface ConfigRow<T> {
  key: string;
  value: T;
  savedAt: number;
}

export async function cacheConfig<T>(key: string, value: T): Promise<void> {
  await idbPut("meta", { key: `config:${key}`, value, savedAt: Date.now() } satisfies ConfigRow<T>);
}

export async function getCachedConfig<T>(key: string): Promise<T | undefined> {
  return (await idbGet<ConfigRow<T>>("meta", `config:${key}`))?.value;
}
