import { createHmac, randomInt } from "crypto";

const SECRET = process.env.BETTER_AUTH_SECRET ?? "dev-secret";

/** Long-lived HMAC token binding this browser/terminal to one Cashbox record,
 * redeemed once via its one-time pairing key (see /api/pos/cashbox). */
export function issueCashboxDeviceToken(cashboxId: string): string {
  const sig = createHmac("sha256", SECRET).update(cashboxId).digest("hex").slice(0, 32);
  return `${cashboxId}.${sig}`;
}

export function getPairedCashboxId(token: string | undefined | null): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const cashboxId = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", SECRET).update(cashboxId).digest("hex").slice(0, 32);
  return expected === sig ? cashboxId : null;
}

export const CASHBOX_DEVICE_COOKIE = "cashbox-device";

const CASHBOX_KEY_ALPHABET = "abcdefghijklmnopqrstuvwxyz";

/** The existing 8-letter one-time key shown in the cashbox editor; distinct from the till activation code. */
export function createCashboxOneTimeKey(): string {
  return Array.from({ length: 8 }, () => CASHBOX_KEY_ALPHABET[randomInt(CASHBOX_KEY_ALPHABET.length)]).join("");
}
