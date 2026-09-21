import { createHmac } from "crypto";

const SECRET = process.env.BETTER_AUTH_SECRET ?? "dev-secret";
const TTL_MS = 16 * 60 * 60 * 1000; // 16 hours — roughly one shift

/** Kiosk "who's working" tag — a display/attribution label only, NOT an auth
 * session. The terminal stays signed in as whatever account opened it; this
 * just remembers which staff member is currently acting at the register. */
export function issueActingCashierToken(userId: string): string {
  const exp = Date.now() + TTL_MS;
  const payload = `${userId}.${exp}`;
  const sig = createHmac("sha256", SECRET).update(payload).digest("hex").slice(0, 32);
  return `${payload}.${sig}`;
}

export function verifyActingCashierToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts;
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return null;
  const expected = createHmac("sha256", SECRET).update(`${userId}.${exp}`).digest("hex").slice(0, 32);
  if (expected !== sig) return null;
  return userId;
}

export const ACTING_CASHIER_COOKIE = "acting-cashier";
