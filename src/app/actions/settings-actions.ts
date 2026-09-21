"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getStoreId } from "@/lib/store-context";
import { logAudit } from "@/lib/audit";
import { hashPin } from "@/lib/pin";

export async function updateSettings(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const taxRatePercent = parseFloat(raw.taxRate as string) || 0;
  const maxDiscount = Math.min(100, Math.max(0, parseFloat(raw.maxCashierDiscountPercent as string) || 100));
  const requireOpenShift = raw.requireOpenShift === "true";

  const shared = {
    name: (raw.name as string) || "My Store",
    logoUrl: (raw.logoUrl as string) || null,
    primaryColor: (raw.primaryColor as string) || "#15503A",
    accentColor: (raw.accentColor as string) || "#22B24C",
    currency: (raw.currency as string) || "$",
    currencyDecimals: parseInt(raw.currencyDecimals as string, 10) || 2,
    taxRate: taxRatePercent / 100,
    taxName: (raw.taxName as string) || "Tax",
    receiptFooter: (raw.receiptFooter as string) || "",
    language: (raw.language as string) || "en",
    loyaltyEnabled: raw.loyaltyEnabled === "true",
    loyaltyEarnRate: parseFloat(raw.loyaltyEarnRate as string) || 1,
    loyaltyRedeemValue: parseFloat(raw.loyaltyRedeemValue as string) || 100,
    lowStockThreshold: parseInt(raw.lowStockThreshold as string, 10) || 5,
    maxCashierDiscountPercent: maxDiscount,
    requireOpenShift,
    allowWholesale: raw.allowWholesale === "true",
    autoUpdateSalePrice: raw.autoUpdateSalePrice === "true",
    roundSalePriceUp: raw.roundSalePriceUp === "true",
    backdatingDays: Math.max(0, parseInt(raw.backdatingDays as string, 10) || 0),
    mergeSameProducts: raw.mergeSameProducts === "true",
    bindProductToSupplier: raw.bindProductToSupplier === "true",
    autosaveReceiptDraft: raw.autosaveReceiptDraft === "true",
    autoUpdateCostPrice: raw.autoUpdateCostPrice === "true",
    autoUpdateBundleSalePrice: raw.autoUpdateBundleSalePrice === "true",
    cashbackEnabled: raw.cashbackEnabled === "true",
    hideStockDuringStocktake: raw.hideStockDuringStocktake === "true",
    hideAmountsDuringStocktake: raw.hideAmountsDuringStocktake === "true",
    autoRestoreDeletedProducts: raw.autoRestoreDeletedProducts === "true",
    // Storage
    storageProvider: (raw.storageProvider as string) || "local",
    storageRegion: (raw.storageRegion as string) || null,
    storageBucket: (raw.storageBucket as string) || null,
    storageEndpoint: (raw.storageEndpoint as string) || null,
    storageAccessKey: (raw.storageAccessKey as string) || null,
    storagePublicUrl: (raw.storagePublicUrl as string) || null,
  };

  // storageSecretKey is never sent back to the client, so only update it when
  // the user explicitly provides a new value (non-empty string).
  const newSecretKey = (raw.storageSecretKey as string) || "";
  // managerPin: only set when a new PIN is typed; "__CLEAR__" removes it.
  const rawPin = (raw.managerPin as string) || "";
  let pinPatch: { managerPin?: string | null } = {};
  if (rawPin === "__CLEAR__") pinPatch = { managerPin: null };
  else if (rawPin.trim().length >= 4) pinPatch = { managerPin: hashPin(rawPin.trim()) };

  const updatePayload = {
    ...shared,
    ...pinPatch,
    ...(newSecretKey ? { storageSecretKey: newSecretKey } : {}),
  };

  const storeId = await getStoreId();
  await prisma.businessSettings.upsert({
    where: { storeId },
    create: { storeId, ...shared, ...pinPatch, storageSecretKey: newSecretKey || null },
    update: updatePayload,
  });

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (session) {
      await logAudit({ userId: session.user.id, action: "SETTINGS_UPDATE", entityType: "BusinessSettings", entityId: storeId });
    }
  } catch {
    /* non-fatal */
  }

  revalidatePath("/settings");
  revalidatePath("/pos");
}
