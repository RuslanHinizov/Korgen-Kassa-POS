/**
 * Shared rules for writes that an offline till uploads later (sales, shifts, cash movements, returns).
 * Server side only.
 */

import { prisma } from "@/lib/db";

/** Ids made on the till (UUIDs) become the row's primary key, so an upload that is repeated finds the same row. */
export const CLIENT_ID = /^[A-Za-z0-9_-]{16,64}$/;

/** A till may upload days later; its own timestamp is trusted only inside this window. */
const MAX_OFFLINE_AGE_MS = 14 * 24 * 3600_000;
const MAX_CLOCK_AHEAD_MS = 5 * 60_000;

/** The time the till says something happened, or undefined when it is outside a sane window (then "now" is used). */
export function trustedTime(iso: string | undefined): Date | undefined {
  if (!iso) return undefined;
  const t = new Date(iso).getTime();
  const now = Date.now();
  if (!Number.isFinite(t) || t > now + MAX_CLOCK_AHEAD_MS || t < now - MAX_OFFLINE_AGE_MS) return undefined;
  return new Date(Math.min(t, now));
}

/**
 * Who a write is attributed to. Normally the signed-in cashier. An offline till may have been used by another cashier
 * of the same market than the one whose session uploads it, so it names the real one — accepted only for a person who is
 * assigned to this market and allowed to work at a till.
 *
 * A local Hub (src/lib/hub-auth.ts) has no cashier session of its own: pass `actor.userId: ""` for it, which means
 * "no fallback" — `requested` is then mandatory and must resolve to a real, assigned, till-capable user, or this
 * returns null (the caller must reject the write; there is no session identity to silently fall back to).
 */
export async function attributedUserId(actor: { userId: string; role: string }, storeId: string, requested?: string): Promise<string | null> {
  const noFallback = actor.userId === "";
  if (!requested) return noFallback ? null : actor.userId;
  if (!noFallback && requested === actor.userId) return actor.userId;
  const user = await prisma.user.findUnique({
    where: { id: requested },
    select: { role: true, allowCashierLogin: true, firedAt: true, storeAssignments: { where: { storeId }, select: { id: true } } },
  });
  if (!user || user.firedAt || user.storeAssignments.length === 0) return noFallback ? null : actor.userId;
  const tillRole = ["CASHIER", "WAREHOUSE", "ADMIN", "MANAGER"].includes(user.role ?? "");
  if (!tillRole) return noFallback ? null : actor.userId;
  if (["CASHIER", "WAREHOUSE"].includes(user.role ?? "") && !user.allowCashierLogin) return noFallback ? null : actor.userId;
  return requested;
}
