import { cache } from "react";
import { cookies, headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { STORE_COOKIE, DEFAULT_STORE_ID } from "@/lib/store-constants";

export interface StoreAccess {
  storeId: string;
  /** The signed-in user asked for a store they are not assigned to; storeId is their own store instead. */
  mismatch: boolean;
  /** The store is suspended by the platform SUPERADMIN (message shown instead of the app). */
  suspended: { message: string | null } | null;
  /** Signed in, but assigned to no store at all. */
  noAccess: boolean;
}

export class StoreAccessError extends Error {}

/**
 * Who may see which store. The store id arrives from a client-controlled cookie/URL, so it is
 * never trusted on its own: a signed-in user only ever gets a store they are assigned to
 * (SUPERADMIN, the platform owner, may open any). Memoised per request.
 */
export const resolveStoreAccess = cache(async (): Promise<StoreAccess> => {
  const requested = (await cookies()).get(STORE_COOKIE)?.value || DEFAULT_STORE_ID;
  const session = await auth.api.getSession({ headers: await headers() });
  // Unauthenticated callers (login pages, kiosk sign-in) only need the id for branding.
  if (!session) return { storeId: requested, mismatch: false, suspended: null, noAccess: false };
  if (session.user.role === "SUPERADMIN") return { storeId: requested, mismatch: false, suspended: null, noAccess: false };

  const assignments = await prisma.userStoreAssignment.findMany({
    where: { userId: session.user.id },
    select: { storeId: true, store: { select: { suspendedAt: true, suspendedMessage: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (assignments.length === 0) return { storeId: requested, mismatch: false, suspended: null, noAccess: true };

  const chosen = assignments.find((a) => a.storeId === requested) ?? assignments[0];
  return {
    storeId: chosen.storeId,
    mismatch: chosen.storeId !== requested,
    suspended: chosen.store.suspendedAt ? { message: chosen.store.suspendedMessage } : null,
    noAccess: false,
  };
});

/** The current store id for this request — only ever a store the caller is allowed to use. */
export async function getStoreId(): Promise<string> {
  const access = await resolveStoreAccess();
  if (access.noAccess) throw new StoreAccessError("NO_STORE_ACCESS");
  if (access.suspended) throw new StoreAccessError("STORE_SUSPENDED");
  return access.storeId;
}
