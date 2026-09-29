/**
 * The offline till program has no login cookie. It proves itself with the device token from its market package
 * (`Authorization: Bearer hub_...`, src/lib/hub-auth.ts) and says which employee is working (`X-Till-Cashier`).
 * For the API calls the till makes, that pair is turned into an ordinary cashier session here — one place, so every
 * endpoint that asks `auth.api.getSession` (and `getStoreId`, `hasKioskAccess`) works for the till without change.
 *
 * Limits: only the market the token belongs to; only staff assigned to it, not fired and allowed at the till; a
 * MANAGER is treated as a plain CASHIER (office-level rights never come from a package file); and only the paths in
 * DEVICE_API_PREFIXES — src/proxy.ts checks that and is the only thing that sets DEVICE_OK_HEADER.
 */

import { prisma } from "./db";
import { resolveHubActor } from "./hub-auth";

export const DEVICE_OK_HEADER = "x-device-ok";
export const DEVICE_CASHIER_HEADER = "x-till-cashier";

/** The API the till itself uses. Anything else stays closed to a device token. */
export const DEVICE_API_PREFIXES = [
  "/api/sales", "/api/shifts", "/api/cash-movements", "/api/pos", "/api/settings", "/api/promotions/active",
  "/api/quick-products", "/api/quick-product-groups", "/api/held-orders", "/api/customers", "/api/discount-cards",
  "/api/products/search", "/api/loyalty", "/api/consultants", "/api/suppliers", "/api/purchase-receipts",
  "/api/manager", "/api/ping",
];

export function deviceMayCall(pathname: string): boolean {
  return DEVICE_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export interface DeviceSession {
  storeId: string;
  suspended: { message: string | null } | null;
  session: { id: string; userId: string; token: string; expiresAt: Date; createdAt: Date; updatedAt: Date; ipAddress: null; userAgent: null };
  user: { id: string; name: string; email: string; emailVerified: boolean; image: null; createdAt: Date; updatedAt: Date; role: string };
}

const cache = new WeakMap<object, Promise<DeviceSession | null>>();

async function resolve(h: Headers): Promise<DeviceSession | null> {
  if (h.get(DEVICE_OK_HEADER) !== "1") return null;
  const cashierId = h.get(DEVICE_CASHIER_HEADER);
  if (!cashierId) return null;
  const hub = await resolveHubActor({ headers: h } as unknown as Request);
  if (!hub) return null;

  const user = await prisma.user.findFirst({
    where: {
      id: cashierId,
      firedAt: null,
      allowCashierLogin: true,
      role: { in: ["CASHIER", "WAREHOUSE", "MANAGER"] },
      storeAssignments: { some: { storeId: hub.storeId } },
    },
    select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true },
  });
  if (!user) return null;
  const store = await prisma.store.findUnique({ where: { id: hub.storeId }, select: { suspendedAt: true, suspendedMessage: true } });

  const now = new Date();
  return {
    storeId: hub.storeId,
    suspended: store?.suspendedAt ? { message: store.suspendedMessage } : null,
    session: { id: `device:${hub.tokenId}`, userId: user.id, token: "", expiresAt: new Date(now.getTime() + 3600_000), createdAt: now, updatedAt: now, ipAddress: null, userAgent: null },
    user: { id: user.id, name: user.name, email: user.email, emailVerified: false, image: null, createdAt: user.createdAt, updatedAt: user.updatedAt, role: user.role === "MANAGER" ? "CASHIER" : user.role },
  };
}

/** The device session for a request's headers, or null (a normal cookie session applies). Memoised per request. */
export function resolveDeviceSession(h: Headers): Promise<DeviceSession | null> {
  if (h.get(DEVICE_OK_HEADER) !== "1") return Promise.resolve(null);
  let p = cache.get(h);
  if (!p) {
    p = resolve(h).catch(() => null);
    cache.set(h, p);
  }
  return p;
}
