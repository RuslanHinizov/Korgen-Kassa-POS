/**
 * Activation codes: a new till program types an 8-digit code and downloads its market package by itself (plan §12).
 * The code is one-time, expires, is stored only as a hash, and redeeming it is rate-limited. Server only.
 */

import { createHash, randomInt } from "crypto";
import { prisma } from "./db";

export const ACTIVATION_TTL_MS = 24 * 3600_000;

const hash = (digits: string) => createHash("sha256").update(digits).digest("hex");

/** Only the digits count, so "1234-5678", "1234 5678" and "12345678" are the same code. */
export function normalizeCode(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return digits.length === 8 ? digits : null;
}

export function formatCode(digits: string): string {
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

export async function createActivationCode(storeId: string, createdBy: string): Promise<{ code: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + ACTIVATION_TTL_MS);
  for (let attempt = 0; attempt < 5; attempt++) {
    const digits = String(randomInt(0, 100_000_000)).padStart(8, "0");
    try {
      await prisma.activationCode.create({ data: { storeId, codeHash: hash(digits), createdBy, expiresAt } });
      return { code: formatCode(digits), expiresAt };
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e; // a live code with the same digits: draw another
    }
  }
  throw new Error("could not create an activation code");
}

/** The market the code belongs to, or null (unknown, expired or already used). Marks it used in one atomic step. */
export async function redeemActivationCode(raw: string): Promise<string | null> {
  const digits = normalizeCode(raw);
  if (!digits) return null;
  const codeHash = hash(digits);
  const claimed = await prisma.activationCode.updateMany({ where: { codeHash, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) return null;
  const row = await prisma.activationCode.findUnique({ where: { codeHash }, select: { storeId: true } });
  return row?.storeId ?? null;
}

// Small in-memory brake against guessing (per client address, plus one for the whole server).
const perClient = new Map<string, { count: number; resetAt: number }>();
let global = { count: 0, resetAt: 0 };

export function tooManyAttempts(client: string): boolean {
  const now = Date.now();
  if (global.resetAt < now) global = { count: 0, resetAt: now + 3600_000 };
  global.count += 1;
  const e = perClient.get(client);
  if (!e || e.resetAt < now) perClient.set(client, { count: 1, resetAt: now + 10 * 60_000 });
  else e.count += 1;
  return (perClient.get(client)?.count ?? 0) > 8 || global.count > 200;
}
