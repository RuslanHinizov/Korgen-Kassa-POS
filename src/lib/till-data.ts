/**
 * The small server-side reads a till needs, shared by the live endpoints (/api/settings, /api/promotions/active,
 * /api/quick-products, /api/quick-product-groups) and by the market package (src/lib/till-package.ts) so the two
 * can never drift apart: what a till loads from a package is exactly what it would have downloaded online.
 */

import { prisma } from "@/lib/db";
import { serialize } from "@/lib/serialize";

/** Business settings as the kassa screen reads them (never cost/supplier/finance data). {} when the market has none. */
export async function getPublicSettings(storeId: string) {
  const settings = await prisma.businessSettings.findUnique({ where: { storeId } });
  if (!settings) return {};
  const s = serialize(settings);
  return {
    name: s.name,
    logoUrl: s.logoUrl,
    currency: s.currency,
    currencyDecimals: s.currencyDecimals,
    // brand colours + locale: the offline till shell (/till) paints itself from this cached copy
    primaryColor: s.primaryColor,
    accentColor: s.accentColor,
    language: s.language,
    taxRate: Number(s.taxRate),
    taxName: s.taxName,
    receiptFooter: s.receiptFooter,
    receiptHeader: s.receiptHeader || s.name,
    receiptPrintVat: s.receiptPrintVat,
    requireOpenShift: s.requireOpenShift,
    posCreditSale: s.posCreditSale,
    posShowSalesHistory: s.posShowSalesHistory,
    posUniversalProduct: s.posUniversalProduct,
    posCreateProduct: s.posCreateProduct,
    posEditProductAtPos: s.posEditProductAtPos,
    posHoldOrder: s.posHoldOrder,
    posDiscount: s.posDiscount,
    posCashInOut: s.posCashInOut,
    posCardPayment: s.posCardPayment,
    posChangePriceAtPos: s.posChangePriceAtPos,
    posRoundingWeightItems: s.posRoundingWeightItems,
    posRoundingDiscount: s.posRoundingDiscount,
    posBanPriceDecrease: s.posBanPriceDecrease,
    allowWholesale: s.allowWholesale,
    posWholesaleAtPos: s.posWholesaleAtPos,
    posPriceCheck: s.posPriceCheck,
    posGlobalSearch: s.posGlobalSearch,
    posCollapseWindow: s.posCollapseWindow,
    posInstantSync: s.posInstantSync,
    posNewReceiptFormat: s.posNewReceiptFormat,
    posAccessReturn: s.posAccessReturn,
    posAccessReturnNoReceipt: s.posAccessReturnNoReceipt,
    posAccessDeleteItem: s.posAccessDeleteItem,
    posAccessDecreaseQty: s.posAccessDecreaseQty,
    autosaveReceiptDraft: s.autosaveReceiptDraft,
    hideStockDuringStocktake: s.hideStockDuringStocktake,
    hideAmountsDuringStocktake: s.hideAmountsDuringStocktake,
  };
}

/** Active promotions serialised for the POS engine (time-window filtering happens client-side via isPromotionLive). */
export async function getActivePromotions(storeId: string) {
  const rows = await prisma.promotion.findMany({
    where: { storeId, active: true },
    orderBy: { priority: "desc" },
    include: { bundleItems: { select: { productId: true, quantity: true } } },
  });
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    active: p.active,
    priority: p.priority,
    scope: p.scope,
    categoryId: p.categoryId,
    productId: p.productId,
    percent: p.percent === null ? null : Number(p.percent),
    amount: p.amount === null ? null : Number(p.amount),
    buyQty: p.buyQty,
    getQty: p.getQty,
    getPercent: p.getPercent === null ? null : Number(p.getPercent),
    minSubtotal: p.minSubtotal === null ? null : Number(p.minSubtotal),
    startsAt: p.startsAt,
    endsAt: p.endsAt,
    daysOfWeek: p.daysOfWeek,
    startTime: p.startTime,
    endTime: p.endTime,
    bundleItems: p.bundleItems,
  }));
}

const QUICK_PRODUCT_SELECT = {
  id: true, name: true, price: true, stock: true, unit: true, barcode: true, categoryId: true, active: true,
} as const;

/** Quick-tap buttons, ordered, with their linked product's price/stock. */
export async function getQuickItems(storeId: string, groupId?: string | null) {
  const items = await prisma.quickProduct.findMany({
    where: { product: { storeId, deletedAt: null }, ...(groupId ? { groupId } : {}) },
    orderBy: [{ sortOrder: "asc" }],
    include: { product: { select: QUICK_PRODUCT_SELECT } },
  });
  return items.map((i) => ({
    id: i.id,
    groupId: i.groupId,
    displayName: i.displayName,
    sortOrder: i.sortOrder,
    product: i.product ? { ...i.product, price: Number(i.product.price), stock: Number(i.product.stock) } : null,
  }));
}

export async function getQuickGroups(storeId: string) {
  const groups = await prisma.quickProductGroup.findMany({
    where: { storeId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { items: true } } },
  });
  return groups.map((g) => ({ id: g.id, name: g.name, sortOrder: g.sortOrder, itemCount: g._count.items }));
}
