import { createHmac } from "crypto";

const SECRET = process.env.BETTER_AUTH_SECRET ?? "dev-secret";
const TTL_MS = 120_000; // 2 minutes

/** Short-lived HMAC token proving a manager authorized an action for this user. */
export function issueManagerToken(userId: string): string {
  const exp = Date.now() + TTL_MS;
  const payload = `${userId}.${exp}`;
  const sig = createHmac("sha256", SECRET).update(payload).digest("hex").slice(0, 32);
  return `${payload}.${sig}`;
}

export function verifyManagerToken(token: string | undefined | null, userId: string): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [tUser, tExp, tSig] = parts;
  if (tUser !== userId) return false;
  if (!/^\d+$/.test(tExp) || Number(tExp) < Date.now()) return false;
  const sig = createHmac("sha256", SECRET).update(`${tUser}.${tExp}`).digest("hex").slice(0, 32);
  return sig === tSig;
}

export const MANAGER_COOKIE = "mgr-ok";
