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
