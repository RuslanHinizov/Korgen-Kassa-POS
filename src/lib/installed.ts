import { prisma } from "@/lib/db";
import { DEFAULT_STORE_ID } from "@/lib/store-constants";

/**
 * Has this server been set up? The first-run wizard's flag says so, but so does the existence of a platform owner
 * (SUPERADMIN) or of any market: after the server is wiped and a fresh market is created there is no wizard flag, and the
 * first-run wizard (which can create an administrator) must never open for a stranger on a server that has an owner.
 */
export async function isInstalled(): Promise<boolean> {
  const settings = await prisma.businessSettings.findUnique({ where: { storeId: DEFAULT_STORE_ID }, select: { setupComplete: true } });
  if (settings?.setupComplete) return true;
  if ((await prisma.user.count({ where: { role: "SUPERADMIN" } })) > 0) return true;
  return (await prisma.store.count()) > 0;
}
