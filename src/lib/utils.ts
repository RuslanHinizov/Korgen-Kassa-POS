import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Global currency defaults, populated from BusinessSettings.
 *
 * - On the server the app layout calls `setCurrencyConfig` (module state).
 * - On the client the app layout injects an inline <script> that sets
 *   `window.__olgaxCurrency` before hydration, which `formatCurrency` reads.
 *
 * This avoids threading currency settings through every component and is
 * robust against bundler module duplication (window is a true singleton).
 */
interface CurrencyConfig {
  symbol: string;
  decimals: number;
  locale: string;
}

declare global {
  interface Window {
    __olgaxCurrency?: Partial<CurrencyConfig>;
  }
}

const serverCurrencyConfig: CurrencyConfig = { symbol: "$", decimals: 2, locale: "en" };

export function setCurrencyConfig(cfg: {
  symbol?: string | null;
  decimals?: number | null;
  locale?: string | null;
}): void {
  if (cfg.symbol != null && cfg.symbol !== "") serverCurrencyConfig.symbol = cfg.symbol;
  if (cfg.decimals != null && !Number.isNaN(cfg.decimals)) serverCurrencyConfig.decimals = cfg.decimals;
  if (cfg.locale) serverCurrencyConfig.locale = cfg.locale;
  if (typeof window !== "undefined") {
    window.__olgaxCurrency = { ...window.__olgaxCurrency, ...serverCurrencyConfig };
  }
}

function activeCurrencyConfig(): CurrencyConfig {
  if (typeof window !== "undefined" && window.__olgaxCurrency) {
    return { ...serverCurrencyConfig, ...window.__olgaxCurrency };
  }
  return serverCurrencyConfig;
}

/**
 * Format a number as currency using the business settings.
 * Uses Intl.NumberFormat for locale-aware thousand separators / decimal point.
 * The symbol is prepended (custom, not ISO code).
 * When symbol/decimals/locale are omitted, the values from `setCurrencyConfig` are used.
 */
export function formatCurrency(
  amount: number | string,
  symbol?: string,
  decimals?: number,
  locale?: string
): string {
  const cfg = activeCurrencyConfig();
  const sym = symbol ?? cfg.symbol;
  const dec = decimals ?? cfg.decimals;
  const loc = locale ?? cfg.locale;
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return `${sym}0.${"0".repeat(dec)}`;
  try {
    const formatted = new Intl.NumberFormat(loc, {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    }).format(num);
    return `${sym}${formatted}`;
  } catch {
    return `${sym}${num.toFixed(dec)}`;
  }
}

/**
 * Format a date/time string in the user's locale.
 */
export function formatDate(
  date: Date | string | number,
  locale = "en",
  options?: Intl.DateTimeFormatOptions
): string {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat(locale, options ?? {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(d);
}

/**
 * Truncate a string to a max length with ellipsis.
 */
export function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

