"use client";

import { setCurrencyConfig } from "@/lib/utils";

/**
 * Hands the market's currency to `formatCurrency` for the server-side pass of client components too. The layout's own
 * `setCurrencyConfig` call lives in the server-components module graph, so client components rendered on the server
 * still saw the defaults ("$1,000.00") and then flipped to "₸1 000" after hydration — a flash and React error #418.
 * Rendered first in the layout, this runs before the page below it.
 */
export function CurrencyInit({ symbol, decimals, locale }: { symbol: string; decimals: number; locale: string }) {
  setCurrencyConfig({ symbol, decimals, locale });
  return null;
}
