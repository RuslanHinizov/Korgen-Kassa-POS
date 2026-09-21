/** Product units of sale — "pcs" is whole/integer, the other three sell by fractional quantity. */
export const UNIT_OPTIONS = [
  { value: "pcs", label: "шт." },
  { value: "kg", label: "кг." },
  { value: "l", label: "л." },
  { value: "m", label: "м." },
] as const;
export type Unit = (typeof UNIT_OPTIONS)[number]["value"];

export function unitLabel(unit: string | null | undefined, short = false): string {
  switch (unit) {
    case "kg": return short ? "кг" : "кг.";
    case "l": return short ? "л" : "л.";
    case "m": return short ? "м" : "м.";
    default: return short ? "шт" : "шт.";
  }
}

/** "kg"/"l"/"m" sell by fractional quantity (decimal weight/volume/length); "pcs" is whole units. */
export function isFractionalUnit(unit: string | null | undefined): boolean {
  return unit === "kg" || unit === "l" || unit === "m";
}

/**
 * Reads a quantity without confusing a thousands separator with a decimal
 * separator. Piece quantities are always whole: `1,001`, `1.001` and
 * `1 001` all mean one thousand and one pieces. For kg/l/m, a comma stays a
 * decimal separator.
 */
export function parseQuantityInput(value: string | number, unit: string | null | undefined, allowZero = false): number | null {
  const raw = String(value).trim().replace(/[\s\u00a0]/g, "");
  if (!raw) return null;

  if (!isFractionalUnit(unit)) {
    const digits = raw.replace(/[.,]/g, "");
    if (!/^\d+$/.test(digits)) return null;
    const quantity = Number(digits);
    return Number.isSafeInteger(quantity) && (allowZero ? quantity >= 0 : quantity > 0) ? quantity : null;
  }

  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  const normalized = lastComma >= 0 && lastDot >= 0
    ? raw.slice(0, Math.max(lastComma, lastDot)).replace(/[.,]/g, "") + "." + raw.slice(Math.max(lastComma, lastDot) + 1).replace(/[.,]/g, "")
    : raw.replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const quantity = Number(normalized);
  return Number.isFinite(quantity) && (allowZero ? quantity >= 0 : quantity > 0) ? quantity : null;
}

/** Server-side guard for API callers that bypass the quantity input. */
export function isValidQuantityForUnit(quantity: number, unit: string | null | undefined, allowZero = false): boolean {
  return Number.isFinite(quantity)
    && (allowZero ? quantity >= 0 : quantity > 0)
    && (isFractionalUnit(unit) || Number.isInteger(quantity));
}
