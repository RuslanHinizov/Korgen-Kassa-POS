/** Kassa rounding rules ("Настройка разрешений → Округление"), shared by the browser cart and the sales API
 * so the total the cashier sees is exactly the total the server records. */
export type RoundingMode = string; // "NONE" | "UP_1" | "DOWN_5" | ...

export function roundAmount(value: number, mode: RoundingMode | undefined | null): number {
  const match = /^(UP|DOWN)_(\d+)$/.exec(mode ?? "");
  if (!match) return value;
  const step = Number(match[2]);
  const units = value / step;
  // Small epsilon so values like 500.0000001 (float noise) don't jump a whole step.
  const rounded = match[1] === "UP" ? Math.ceil(units - 1e-9) : Math.floor(units + 1e-9);
  return rounded * step;
}

/** Line amount before discounts; weighted (kg/l/m) lines follow "Округление весовых товаров". */
export function lineGross(price: number, quantity: number, unit: string | undefined, weightMode: RoundingMode | undefined | null): number {
  const raw = price * quantity;
  return unit && unit !== "pcs" ? roundAmount(raw, weightMode) : raw;
}

/**
 * UMAG discounts line by line. Whatever discount applies to the whole receipt (header %, promotion, discount card, points)
 * is shared out over the lines in proportion to what each line still costs, so every line's `total` is what was really paid
 * for it. Product statistics, refunds (which pay back `total / quantity`) and the profit reports all read those line totals.
 * Amounts are rounded to 2 decimals; the last line takes the rounding remainder so the shares add up exactly.
 */
export function allocateReceiptDiscount(lines: { gross: number; lineDiscount: number }[], receiptDiscount: number): number[] {
  const bases = lines.map((l) => Math.max(0, l.gross - l.lineDiscount));
  const baseSum = bases.reduce((a, b) => a + b, 0);
  const wanted = Math.min(Math.max(0, receiptDiscount), baseSum);
  if (wanted <= 0 || baseSum <= 0) return lines.map(() => 0);
  const shares = bases.map((b) => Math.round(((wanted * b) / baseSum) * 100) / 100);
  const lastWithBase = bases.reduce((idx, b, i) => (b > 0 ? i : idx), 0);
  const others = shares.reduce((a, v, i) => (i === lastWithBase ? a : a + v), 0);
  shares[lastWithBase] = Math.max(0, Math.round((wanted - others) * 100) / 100);
  return shares;
}
