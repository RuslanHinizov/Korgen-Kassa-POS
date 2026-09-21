import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getStoreId } from "@/lib/store-context";
import { unstable_noStore as noStore } from "next/cache";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serialize } from "@/lib/serialize";
import { SettingsForm } from "@/components/settings/settings-form";
import { DeviceSettingsForm } from "@/components/settings/device-settings-form";
import { PluginsPanel } from "@/components/settings/plugins-panel";
import { DbError } from "@/components/ui/db-error";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  noStore();
  const t = await getTranslations("settings");
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    redirect(`/store/${await getStoreId()}/pos`);
  }

  // Upsert this store's settings row so the form always has data
  const storeId = await getStoreId();
  let settings;
  try {
    const raw = await prisma.businessSettings.upsert({
      where: { storeId },
      create: { storeId },
      update: {},
    });
    settings = serialize(raw);
  } catch {
    return <DbError page="settings" />;
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl space-y-10">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <SettingsForm settings={{
        name: settings.name,
        logoUrl: settings.logoUrl,
        primaryColor: settings.primaryColor,
        accentColor: settings.accentColor,
        currency: settings.currency,
        currencyDecimals: settings.currencyDecimals,
        taxRate: settings.taxRate,
        taxName: settings.taxName,
        receiptFooter: settings.receiptFooter,
        language: settings.language,
        loyaltyEnabled: settings.loyaltyEnabled,
        loyaltyEarnRate: settings.loyaltyEarnRate,
        loyaltyRedeemValue: settings.loyaltyRedeemValue,
        lowStockThreshold: settings.lowStockThreshold,
        maxCashierDiscountPercent: settings.maxCashierDiscountPercent,
        requireOpenShift: settings.requireOpenShift,
        hasManagerPin: !!settings.managerPin,
        allowWholesale: settings.allowWholesale,
        autoUpdateSalePrice: settings.autoUpdateSalePrice,
        roundSalePriceUp: settings.roundSalePriceUp,
        backdatingDays: settings.backdatingDays,
        mergeSameProducts: settings.mergeSameProducts,
        bindProductToSupplier: settings.bindProductToSupplier,
        autosaveReceiptDraft: settings.autosaveReceiptDraft,
        autoUpdateCostPrice: settings.autoUpdateCostPrice,
        autoUpdateBundleSalePrice: settings.autoUpdateBundleSalePrice,
        cashbackEnabled: settings.cashbackEnabled,
        hideStockDuringStocktake: settings.hideStockDuringStocktake,
        hideAmountsDuringStocktake: settings.hideAmountsDuringStocktake,
        autoRestoreDeletedProducts: settings.autoRestoreDeletedProducts,
        storageProvider: settings.storageProvider,
        storageRegion: settings.storageRegion,
        storageBucket: settings.storageBucket,
        storageEndpoint: settings.storageEndpoint,
        storageAccessKey: settings.storageAccessKey,
        hasStorageSecretKey: !!settings.storageSecretKey,
        storagePublicUrl: settings.storagePublicUrl,
      }} />
      <hr />
      <DeviceSettingsForm />
      <hr />
      <PluginsPanel />
    </div>
  );
}
