import { prisma } from "@/lib/db";

/**
 * Prisma `where` fragment for customers/suppliers. With "Разделять контрагентов по магазинам"
 * (posSplitCounterparty) on, each store only sees its own counterparties; otherwise the
 * whole company shares one base.
 */
export async function counterpartyScope(storeId: string): Promise<{ storeId?: string }> {
  const s = await prisma.businessSettings.findUnique({ where: { storeId }, select: { posSplitCounterparty: true } });
  return s?.posSplitCounterparty ? { storeId } : {};
}
