/**
 * Signing in at the till without a connection.
 *
 * After a cashier signs in ONLINE on this till, a salted, deliberately slow hash of their password (PBKDF2) is kept in
 * this browser — never the password itself. Without a connection the same cashier can sign in against that hash. Only
 * cashiers who have signed in on this till before can do so (the server's own password hashes are never sent to a till).
 *
 * This lets the cashier work; it is NOT a server session. Sales made offline name the cashier who rang them
 * (`cashierUserId`) and are uploaded when a session exists again, see queue.ts (`needsLogin`).
 */

import { idbDelete, idbGet, idbPut } from "./idb";

const ITERATIONS = 210_000;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60_000;
/** A till that has not talked to the server for this long asks for a sign-in again (about one shift). */
export const TILL_AUTH_TTL_MS = 16 * 3600_000;

export interface StoredCashier {
  /** "cashier:<phone digits>" */
  key: string;
  userId: string;
  name: string;
  role: string;
  stores: { id: string; name: string }[];
  salt: string;
  hash: string;
  iterations: number;
  savedAt: number;
}

interface Attempts {
  key: string;
  count: number;
  lockedUntil: number;
}

/** Who is working at this till right now (also used to attribute offline writes). */
export interface TillAuth {
  key: "tillAuth";
  userId: string;
  name: string;
  role: string;
  storeId: string;
  /** last time the server confirmed the session (online) or the cashier signed in (offline) */
  at: number;
  mode: "online" | "offline";
}

const phoneDigits = (phone: string) => phone.replace(/\D/g, "").slice(-10);
const recordKey = (phone: string) => `cashier:${phoneDigits(phone)}`;

function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s);
}
function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256);
  return toB64(bits);
}

/** Constant-time comparison of two equally long strings. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Call after a successful ONLINE sign-in. */
export async function rememberCashier(phone: string, password: string, user: { id: string; name: string; role: string }, stores: { id: string; name: string }[]): Promise<boolean> {
  try {
    if (typeof crypto === "undefined" || !crypto.subtle) return false; // needs a secure context (https / localhost)
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const record: StoredCashier = {
      key: recordKey(phone),
      userId: user.id,
      name: user.name,
      role: user.role,
      stores,
      salt: toB64(salt),
      hash: await derive(password, salt, ITERATIONS),
      iterations: ITERATIONS,
      savedAt: Date.now(),
    };
    return await idbPut("meta", record);
  } catch {
    return false;
  }
}

export type OfflineLoginResult = { ok: true; cashier: StoredCashier } | { ok: false; reason: "unknown" | "wrong" | "locked" | "unavailable"; waitMs?: number };

export async function verifyOfflineLogin(phone: string, password: string): Promise<OfflineLoginResult> {
  try {
    if (typeof crypto === "undefined" || !crypto.subtle) return { ok: false, reason: "unavailable" };
    const key = recordKey(phone);
    const attempts = (await idbGet<Attempts>("meta", `attempts:${key}`)) ?? { key: `attempts:${key}`, count: 0, lockedUntil: 0 };
    if (attempts.lockedUntil > Date.now()) return { ok: false, reason: "locked", waitMs: attempts.lockedUntil - Date.now() };

    const stored = await idbGet<StoredCashier>("meta", key);
    if (!stored) return { ok: false, reason: "unknown" };

    const hash = await derive(password, fromB64(stored.salt), stored.iterations);
    if (same(hash, stored.hash)) {
      await idbDelete("meta", `attempts:${key}`);
      return { ok: true, cashier: stored };
    }
    const count = attempts.count + 1;
    await idbPut("meta", { key: `attempts:${key}`, count: count >= MAX_ATTEMPTS ? 0 : count, lockedUntil: count >= MAX_ATTEMPTS ? Date.now() + LOCK_MS : 0 } satisfies Attempts);
    return { ok: false, reason: "wrong" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function getTillAuth(): Promise<TillAuth | undefined> {
  return idbGet<TillAuth>("meta", "tillAuth");
}

export async function setTillAuth(auth: Omit<TillAuth, "key">): Promise<void> {
  await idbPut("meta", { key: "tillAuth", ...auth } satisfies TillAuth);
}

export async function clearTillAuth(): Promise<void> {
  await idbDelete("meta", "tillAuth");
}

/** Is the till still allowed to run without asking for a sign-in? */
export function tillAuthValid(auth: TillAuth | undefined): boolean {
  return Boolean(auth) && Date.now() - (auth as TillAuth).at < TILL_AUTH_TTL_MS;
}
