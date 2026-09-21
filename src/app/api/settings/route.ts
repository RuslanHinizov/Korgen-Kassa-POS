import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { serialize } from "@/lib/serialize";

export async function GET() {
  const storeId = await getStoreId();
  const settings = await prisma.businessSettings.findUnique({ where: { storeId } });
  if (!settings) return NextResponse.json({});
  const s = serialize(settings);
  return NextResponse.json({
    name: s.name,
    logoUrl: s.logoUrl,
    currency: s.currency,
    currencyDecimals: s.currencyDecimals,
    taxRate: Number(s.taxRate),
    taxName: s.taxName,
    receiptFooter: s.receiptFooter,
    receiptHeader: s.receiptHeader || s.name,
    receiptPrintVat: s.receiptPrintVat,
    requireOpenShift: s.requireOpenShift,
    posCreditSale: s.posCreditSale,
    posShowSalesHistory: s.posShowSalesHistory,
    posUniversalProduct: s.posUniversalProduct,
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
  });
}
