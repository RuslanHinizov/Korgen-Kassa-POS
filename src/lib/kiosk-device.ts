import { headers } from "next/headers";
import { auth } from "./auth";
import { prisma } from "./db";
import { getStoreId } from "./store-context";

/**
 * POS endpoints are for an authenticated cashier only.  The page layout has the
 * same guard, but this separate API guard prevents an office admin (or a manually
 * crafted request) from using register operations without going through cashier
 * login.  A cashier is also limited to stores assigned by the administrator.
 */
export async function hasKioskAccess(): Promise<boolean> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.role !== "CASHIER") return false;

  const account = await prisma.user.findUnique({ where: { id: session.user.id }, select: { allowCashierLogin: true, firedAt: true } });
  if (!account || !account.allowCashierLogin || account.firedAt) return false;

  const storeId = await getStoreId();
  const assignment = await prisma.userStoreAssignment.findUnique({
    where: { userId_storeId: { userId: session.user.id, storeId } },
    select: { id: true },
  });
  return Boolean(assignment);
}
