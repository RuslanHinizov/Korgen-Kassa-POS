import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";

export type StockInActor = {
  userId: string;
  role: "ADMIN" | "MANAGER" | "WAREHOUSE";
  storeId: string;
};

/**
 * Resolves a user allowed to work with stock-in documents. Warehouse workers
 * must be assigned to the active store; managers and administrators keep
 * their existing cross-document approval access.
 */
export async function getStockInActor(): Promise<StockInActor | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  const role = session?.user.role;
  if (!session || (role !== "ADMIN" && role !== "MANAGER" && role !== "WAREHOUSE")) return null;

  const storeId = await getStoreId();
  if (role === "WAREHOUSE") {
    const assignment = await prisma.userStoreAssignment.findUnique({
      where: { userId_storeId: { userId: session.user.id, storeId } },
      select: { userId: true },
    });
    if (!assignment) return null;
  }

  return { userId: session.user.id, role, storeId };
}

export function stockInOwnerFilter(actor: StockInActor) {
  return actor.role === "WAREHOUSE" ? { userId: actor.userId } : {};
}
