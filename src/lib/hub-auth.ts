/**
 * Authenticates a local Hub (the office computer of a multi-till market, see docs/kasa-offline-plan.md §9b)
 * to the cloud. A Hub sends `Authorization: Bearer <token>` instead of a cashier session cookie; the token
 * is scoped to exactly one store and can only pull that store's catalogue and push sales/shifts/etc for it —
 * it never grants office/admin access (no product editing, no other store, no user management).
 */

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "./db";

const TOKEN_PREFIX = "hub_";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Issues a new token for a store. Returns the plaintext token — shown once, never recoverable afterwards. */
export async function createHubToken(storeId: string, label: string, cashboxId?: string | null): Promise<string> {
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  await prisma.hubToken.create({ data: { storeId, label, tokenHash: hashToken(token), cashboxId: cashboxId ?? null } });
  return token;
}

export async function revokeHubToken(id: string): Promise<void> {
  await prisma.hubToken.update({ where: { id }, data: { revokedAt: new Date() } });
}

/** Revokes a just-issued token when a one-time pairing code loses a concurrent claim race. */
export async function revokeHubTokenSecret(token: string): Promise<void> {
  await prisma.hubToken.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
}

export interface HubActor {
  storeId: string;
  tokenId: string;
  /** The register this device was activated for, if any. */
  cashboxId: string | null;
}

/** Resolves the store a Hub request is authorized for, from its Authorization header. Null if invalid/revoked. */
export async function resolveHubActor(req: Request): Promise<HubActor | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/.exec(header);
  if (!match || !match[1].startsWith(TOKEN_PREFIX)) return null;

  const tokenHash = hashToken(match[1]);
  // Constant-time-ish: the hash is already opaque and unique-indexed, a direct lookup does not leak timing
  // information about the token's content the way comparing raw secrets would.
  const row = await prisma.hubToken.findUnique({ where: { tokenHash }, include: { store: { select: { suspendedAt: true } } } });
  if (!row || row.revokedAt) return null;
  // A market the platform owner suspended is switched off for its tills too: they get the same refusal as a revoked key
  // (and work again by themselves once the market is switched back on).
  if (row.store.suspendedAt) return null;
  // A till credential is permanently scoped to its cashbox. Missing or disabled cashboxes close it too.
  if (row.cashboxId) {
    const cashbox = await prisma.cashbox.findFirst({ where: { id: row.cashboxId, storeId: row.storeId }, select: { active: true } });
    if (!cashbox?.active) return null;
  }

  void prisma.hubToken.update({ where: { id: row.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  // The standalone till sends its program version; the register it is tied to shows it in Управление → Кассы.
  const version = req.headers.get("x-korgen-version")?.slice(0, 20);
  if (row.cashboxId && version && /^[0-9A-Za-z.\-]+$/.test(version)) {
    void prisma.cashbox
      .updateMany({
        where: { id: row.cashboxId, storeId: row.storeId, OR: [{ appVersion: { not: version } }, { lastSyncAt: null }, { lastSyncAt: { lt: new Date(Date.now() - 60_000) } }] },
        data: { appVersion: version, platform: "Windows (программа кассы)", lastSyncAt: new Date() },
      })
      .catch(() => {});
  }
  return { storeId: row.storeId, tokenId: row.id, cashboxId: row.cashboxId ?? null };
}

/** Constant-time string compare, for anything (rare) that still needs to compare a secret directly. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
