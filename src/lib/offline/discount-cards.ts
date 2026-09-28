/**
 * Discount-card lookup has no bulk endpoint the POS role can call (only ADMIN/MANAGER can list all
 * cards — see /api/discount-cards), so unlike products/customers there is nothing to pre-download.
 * Instead each successful online lookup is remembered locally, so a card already used at this till
 * still applies with no connection. An unseen card genuinely cannot be validated offline.
 */
import { cacheConfig, getCachedConfig } from "./config-cache";

export interface CachedDiscountCard {
  code: string;
  holderName: string | null;
  percent: number;
}

const KEY = "discount-cards";

export async function rememberDiscountCard(card: CachedDiscountCard): Promise<void> {
  const all = (await getCachedConfig<CachedDiscountCard[]>(KEY)) ?? [];
  const next = [card, ...all.filter((c) => c.code !== card.code)].slice(0, 200);
  await cacheConfig(KEY, next);
}

export async function getCachedDiscountCard(code: string): Promise<CachedDiscountCard | null> {
  const all = (await getCachedConfig<CachedDiscountCard[]>(KEY)) ?? [];
  return all.find((c) => c.code === code) ?? null;
}
