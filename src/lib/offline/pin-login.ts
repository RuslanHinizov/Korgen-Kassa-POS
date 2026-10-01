/**
 * Cashier sign-in on the till with a 4-digit PIN and no connection (plan §12, stage A3).
 *
 * The market package carries each employee's PIN exactly as the server stores it (scrypt "salt:hash", src/lib/pin.ts),
 * so PINs already set in Управление → Сотрудники work with no change. The check is redone here with the same
 * parameters Node's `scryptSync` uses by default (N=16384, r=8, p=1, 32 bytes; the salt is the hex text itself).
 * A wrong PIN is counted per employee: 5 misses lock that employee for 5 minutes on this till.
 */

import { scryptAsync } from "@noble/hashes/scrypt.js";
import type { PackageCashier } from "@/lib/till-package-format";
import { setTillAuth } from "./auth";
import { cacheConfig, getCachedConfig } from "./config-cache";
import { idbDelete, idbGet, idbPut } from "./idb";
import { deviceAuthHeaders } from "./device-token";
import { setNeedsLogin } from "./queue";

const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60_000;

interface Attempts {
  key: string;
  count: number;
  lockedUntil: number;
}

/** Employees of this market who have a PIN and can therefore sign in. */
export async function listPinCashiers(): Promise<PackageCashier[]> {
  const all = (await getCachedConfig<PackageCashier[]>("packageCashiers")) ?? [];
  return all.filter((c) => typeof c.pin === "string" && c.pin.includes(":"));
}

/**
 * With a connection, refresh this till's copy of the staff list (new employee, changed PIN, someone fired) so nobody has to
 * carry a new package for it. Needs the device token — /api/pos/till-cashiers refuses anyone else. Best effort.
 */
let lastStaffRefresh = 0;
export async function refreshPackageCashiers(): Promise<void> {
  if (Date.now() - lastStaffRefresh < 120_000) return;
  lastStaffRefresh = Date.now();
  try {
    const res = await fetch("/api/pos/till-cashiers", { cache: "no-store" });
    // The server answered and refused this till's key: the market is switched off or the key was revoked.
    if (res.status === 401 && Boolean((await deviceAuthHeaders()).Authorization)) { setNeedsLogin(true); return; }
    if (!res.ok) return;
    setNeedsLogin(false);
    const data = (await res.json()) as { cashiers?: PackageCashier[] };
    if (Array.isArray(data.cashiers)) await cacheConfig("packageCashiers", data.cashiers);
  } catch {
    /* keep the copy already on the till */
  }
}

/** Constant-time comparison of two equally long strings. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function pinMatches(pin: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const out = await scryptAsync(pin, salt, { N: 16384, r: 8, p: 1, dkLen: 32 });
  const hex = [...out].map((b) => b.toString(16).padStart(2, "0")).join("");
  return same(hex, hash);
}

export type PinLoginResult = { ok: true } | { ok: false; reason: "unknown" | "wrong" | "locked" | "unbound"; waitMs?: number };

export async function signInWithPin(userId: string, pin: string): Promise<PinLoginResult> {
  const storeId = (await idbGet<{ storeId: string }>("meta", "tillStore"))?.storeId;
  if (!storeId) return { ok: false, reason: "unbound" };
  const cashier = (await listPinCashiers()).find((c) => c.id === userId);
  if (!cashier?.pin) return { ok: false, reason: "unknown" };

  const key = `pinAttempts:${userId}`;
  const attempts = (await idbGet<Attempts>("meta", key)) ?? { key, count: 0, lockedUntil: 0 };
  if (attempts.lockedUntil > Date.now()) return { ok: false, reason: "locked", waitMs: attempts.lockedUntil - Date.now() };

  if (await pinMatches(pin, cashier.pin)) {
    await idbDelete("meta", key);
    await setTillAuth({ userId: cashier.id, name: cashier.name, role: cashier.role, storeId, at: Date.now(), mode: "offline" });
    return { ok: true };
  }
  const count = attempts.count + 1;
  const locked = count >= MAX_ATTEMPTS;
  await idbPut("meta", { key, count: locked ? 0 : count, lockedUntil: locked ? Date.now() + LOCK_MS : 0 } satisfies Attempts);
  return locked ? { ok: false, reason: "locked", waitMs: LOCK_MS } : { ok: false, reason: "wrong" };
}
