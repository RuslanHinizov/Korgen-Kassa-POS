import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Prisma `where` fragment for customers/suppliers. With "Разделять контрагентов по магазинам"
 * (posSplitCounterparty) on, each store only sees its own counterparties; otherwise a company's
 * stores share one base — but only the stores this user is assigned to, never another market's.
 */
export async function counterpartyScope(storeId: string): Promise<{ storeId: string | { in: string[] } }> {
  const s = await prisma.businessSettings.findUnique({ where: { storeId }, select: { posSplitCounterparty: true } });
  if (s?.posSplitCounterparty) return { storeId };

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.role === "SUPERADMIN") return { storeId };
  const rows = await prisma.userStoreAssignment.findMany({ where: { userId: session.user.id }, select: { storeId: true } });
  const mine = rows.map((r) => r.storeId);
  return { storeId: { in: mine.includes(storeId) ? mine : [storeId] } };
}
