/** Builds the market package (see till-package-format.ts) for one store. Server only. */

import { prisma } from "@/lib/db";
import { fetchCatalogPage } from "@/lib/catalog-query";
import { getActivePromotions, getPublicSettings, getQuickGroups, getQuickItems } from "@/lib/till-data";
import type { LocalProduct } from "@/lib/offline/catalog";
import type { TillPackageBody } from "@/lib/till-package-format";

/** Who can work the till of this market, with the PIN hash each signs in with offline. */
export async function listPackageCashiers(storeId: string) {
  const staff = await prisma.userStoreAssignment.findMany({
    where: { storeId, user: { role: { in: ["CASHIER", "MANAGER", "WAREHOUSE"] }, firedAt: null, allowCashierLogin: true } },
    select: { user: { select: { id: true, name: true, lastName: true, role: true, pin: true } } },
  });
  return staff.map((a) => ({ id: a.user.id, name: [a.user.name, a.user.lastName].filter(Boolean).join(" "), role: a.user.role, pin: a.user.pin }));
}

export async function buildTillPackageBody(storeId: string): Promise<TillPackageBody | null> {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } });
  if (!store) return null;

  // the same feed the online till downloads, walked page by page from the beginning
  const products: LocalProduct[] = [];
  let since: Date | null = null;
  let afterId = "";
  for (let page = 0; page < 200; page++) {
    const { products: rows, hasMore } = await fetchCatalogPage(storeId, since, afterId, 5000);
    for (const r of rows) if (!("removed" in r)) products.push(r as LocalProduct);
    const last = rows[rows.length - 1];
    if (!hasMore || !last) break;
    since = new Date(last.updatedAt);
    afterId = last.id;
  }


  const [settings, promotions, quickGroups, quickItems] = await Promise.all([
    getPublicSettings(storeId),
    getActivePromotions(storeId),
    getQuickGroups(storeId),
    getQuickItems(storeId),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    store: { id: store.id, name: store.name },
    settings,
    promotions,
    quickGroups,
    quickItems,
    cashiers: await listPackageCashiers(storeId),
    products,
  };
}
