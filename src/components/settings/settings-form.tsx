"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { updateSettings } from "@/app/actions/settings-actions";
import { setLocale } from "@/app/actions/locale-actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const settingsSchema = z.object({
  name: z.string().min(1, "Business name is required"),
  logoUrl: z.string().url().optional().or(z.literal("")),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color"),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color"),
  currency: z.string().min(1).max(5),
  currencyDecimals: z.number().int().min(0).max(4),
  taxRate: z.number().min(0).max(100),
  taxName: z.string().min(1),
  receiptFooter: z.string().max(500),
  language: z.string().min(2).max(10),
  // Loyalty
  loyaltyEnabled: z.boolean().optional(),
  loyaltyEarnRate: z.number().min(0),
  loyaltyRedeemValue: z.number().min(1),
  // Inventory
  lowStockThreshold: z.number().int().min(0),
  // Manager controls
  maxCashierDiscountPercent: z.number().min(0).max(100),
  requireOpenShift: z.boolean().optional(),
  managerPin: z.string().default(""),
  // Permissions
  allowWholesale: z.boolean().optional(),
  autoUpdateSalePrice: z.boolean().optional(),
  roundSalePriceUp: z.boolean().optional(),
  backdatingDays: z.number().int().min(0),
  mergeSameProducts: z.boolean().optional(),
  bindProductToSupplier: z.boolean().optional(),
  autosaveReceiptDraft: z.boolean().optional(),
  autoUpdateCostPrice: z.boolean().optional(),
  autoUpdateBundleSalePrice: z.boolean().optional(),
  cashbackEnabled: z.boolean().optional(),
  hideStockDuringStocktake: z.boolean().optional(),
  hideAmountsDuringStocktake: z.boolean().optional(),
  autoRestoreDeletedProducts: z.boolean().optional(),
  // Storage
  storageProvider: z.string().default("local"),
  storageRegion: z.string().default(""),
  storageBucket: z.string().default(""),
  storageEndpoint: z.string().default(""),
  storageAccessKey: z.string().default(""),
  storageSecretKey: z.string().default(""),
  storagePublicUrl: z.string().default(""),
});

// Explicitly type the form values to work around Zod v4 + react-hook-form type inference
// (Zod v4 .default() and .optional() produce input types of T | undefined, which
//  react-hook-form's Resolver generic rejects — so we define the shape manually)
type SettingsFormValues = {
  name: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
  currency: string;
  currencyDecimals: number;
  taxRate: number;
  taxName: string;
  receiptFooter: string;
  language: string;
  loyaltyEnabled?: boolean;
  loyaltyEarnRate: number;
  loyaltyRedeemValue: number;
  lowStockThreshold: number;
  maxCashierDiscountPercent: number;
  requireOpenShift?: boolean;
  managerPin: string;
  allowWholesale?: boolean;
  autoUpdateSalePrice?: boolean;
  roundSalePriceUp?: boolean;
  backdatingDays: number;
  mergeSameProducts?: boolean;
  bindProductToSupplier?: boolean;
  autosaveReceiptDraft?: boolean;
  autoUpdateCostPrice?: boolean;
  autoUpdateBundleSalePrice?: boolean;
  cashbackEnabled?: boolean;
  hideStockDuringStocktake?: boolean;
  hideAmountsDuringStocktake?: boolean;
  autoRestoreDeletedProducts?: boolean;
  storageProvider: string;
  storageRegion: string;
  storageBucket: string;
  storageEndpoint: string;
  storageAccessKey: string;
  storageSecretKey: string;
  storagePublicUrl: string;
};

interface Props {
  settings: {
    name: string;
    logoUrl: string | null;
    primaryColor: string;
    accentColor: string;
    currency: string;
    currencyDecimals: number;
    taxRate: { toString(): string };
    taxName: string;
    receiptFooter: string;
    language: string;
    loyaltyEnabled: boolean;
    loyaltyEarnRate: { toString(): string };
    loyaltyRedeemValue: { toString(): string };
    lowStockThreshold: number;
    maxCashierDiscountPercent: { toString(): string };
    requireOpenShift: boolean;
    hasManagerPin: boolean;
    allowWholesale: boolean;
    autoUpdateSalePrice: boolean;
    roundSalePriceUp: boolean;
    backdatingDays: number;
    mergeSameProducts: boolean;
    bindProductToSupplier: boolean;
    autosaveReceiptDraft: boolean;
    autoUpdateCostPrice: boolean;
    autoUpdateBundleSalePrice: boolean;
    cashbackEnabled: boolean;
    hideStockDuringStocktake: boolean;
    hideAmountsDuringStocktake: boolean;
    autoRestoreDeletedProducts: boolean;
    // Storage
    storageProvider: string;
    storageRegion: string | null;
    storageBucket: string | null;
    storageEndpoint: string | null;
    storageAccessKey: string | null;
    hasStorageSecretKey: boolean;
    storagePublicUrl: string | null;
  };
}

export function SettingsForm({ settings }: Props) {
  const router = useRouter();
  const t = useTranslations("settings");
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SettingsFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(settingsSchema) as any,
    defaultValues: {
      name: settings.name,
      logoUrl: settings.logoUrl ?? "",
      primaryColor: settings.primaryColor,
      accentColor: settings.accentColor,
      currency: settings.currency,
      currencyDecimals: settings.currencyDecimals,
      taxRate: parseFloat(settings.taxRate.toString()) * 100,
      taxName: settings.taxName,
      receiptFooter: settings.receiptFooter,
      language: settings.language,
      loyaltyEnabled: settings.loyaltyEnabled,
      loyaltyEarnRate: parseFloat(settings.loyaltyEarnRate.toString()),
      loyaltyRedeemValue: parseFloat(settings.loyaltyRedeemValue.toString()),
      lowStockThreshold: settings.lowStockThreshold,
      maxCashierDiscountPercent: parseFloat(settings.maxCashierDiscountPercent.toString()),
      requireOpenShift: settings.requireOpenShift,
      managerPin: "",
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
      // Storage — secret key intentionally never pre-filled (security)
      storageProvider: settings.storageProvider,
      storageRegion: settings.storageRegion ?? "",
      storageBucket: settings.storageBucket ?? "",
      storageEndpoint: settings.storageEndpoint ?? "",
      storageAccessKey: settings.storageAccessKey ?? "",
      storageSecretKey: "",
      storagePublicUrl: settings.storagePublicUrl ?? "",
    },
  });

  const storageProvider = watch("storageProvider");

  async function onSubmit(values: SettingsFormValues) {
    const fd = new FormData();
    Object.entries(values).forEach(([k, v]) => fd.append(k, String(v ?? "")));
    fd.set("loyaltyEnabled", values.loyaltyEnabled ? "true" : "false");
    try {
      await updateSettings(fd);
      // Update locale cookie when language changes
      await setLocale(values.language);
      toast.success(t("saved"));
      router.refresh();
    } catch {
      toast.error(t("save_failed"));
    }
  }

  function field(
    label: string,
    name: keyof SettingsFormValues,
    props?: React.InputHTMLAttributes<HTMLInputElement>
  ) {
    const isNum = props?.type === "number";
    return (
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{label}</label>
        <input
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {...register(name as any, isNum ? { valueAsNumber: true } : undefined)}
          {...props}
          className={cn(
            "border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
            errors[name] && "border-destructive"
          )}
        />
        {errors[name] && (
          <p className="text-xs text-destructive">{String(errors[name]?.message)}</p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {/* Business */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold border-b pb-2">{t("section_business")}</h2>
        {field(`${t("business_name")} *`, "name", { placeholder: t("business_name_placeholder") })}
        {field(t("logo_url"), "logoUrl", { type: "url", placeholder: "https://…" })}
      </section>

      {/* Appearance */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold border-b pb-2">{t("section_appearance")}</h2>
        <div className="grid grid-cols-2 gap-4">
          {field(t("primary_color"), "primaryColor", { type: "color" })}
          {field(t("accent_color"), "accentColor", { type: "color" })}
        </div>
      </section>

      {/* Currency & Tax */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold border-b pb-2">{t("section_currency_tax")}</h2>
        <div className="grid grid-cols-2 gap-4">
          {field(t("currency_symbol"), "currency", { placeholder: "$" })}
          {field(t("decimal_places"), "currencyDecimals", { type: "number", min: "0", max: "4" })}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {field(t("tax_rate"), "taxRate", { type: "number", step: "0.01", min: "0", max: "100" })}
          {field(t("tax_name"), "taxName", { placeholder: t("tax_name_placeholder") })}
        </div>
      </section>

      {/* Receipt */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold border-b pb-2">{t("section_receipt")}</h2>
        {field(t("footer_text"), "receiptFooter", { placeholder: t("footer_placeholder") })}
      </section>

      {/* Language */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold border-b pb-2">{t("section_language")}</h2>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("language")}</label>
          <select
            {...register("language")}
            className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            <option value="en">English</option>
            <option value="si">සිංහල (Sinhala)</option>
            <option value="ta">தமிழ் (Tamil)</option>
            <option value="ar">العربية (Arabic)</option>
            <option value="zh">中文 (Chinese)</option>
            <option value="de">Deutsch (German)</option>
            <option value="es">Español (Spanish)</option>
            <option value="fr">Français (French)</option>
            <option value="hi">हिन्दी (Hindi)</option>
            <option value="id">Bahasa Indonesia</option>
            <option value="ja">日本語 (Japanese)</option>
            <option value="ko">한국어 (Korean)</option>
            <option value="pt">Português (Portuguese)</option>
            <option value="ru">Русский (Russian)</option>
          </select>
        </div>
      </section>

      {/* Loyalty */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold border-b pb-2">{t("section_loyalty")}</h2>
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">{t("loyalty_enable")}</p>
            <p className="text-xs text-muted-foreground">{t("loyalty_enable_hint")}</p>
          </div>
          <input
            type="checkbox"
            {...register("loyaltyEnabled")}
            className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          {field(t("loyalty_earn_rate", { unit: `${watch("currency") || settings.currency}1` }), "loyaltyEarnRate", { type: "number", step: "0.01", min: "0", placeholder: "1" })}
          {field(t("loyalty_redeem_rate", { unit: `${watch("currency") || settings.currency}1` }), "loyaltyRedeemValue", { type: "number", step: "1", min: "1", placeholder: "100" })}
        </div>
        <p className="text-xs text-muted-foreground">
          {t("loyalty_example", { unit: `${watch("currency") || settings.currency}1` })}
        </p>
      </section>

      {/* Inventory */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold border-b pb-2">{t("section_inventory")}</h2>
        {field(t("low_stock_threshold"), "lowStockThreshold", { type: "number", min: "0", step: "1", placeholder: "5" })}
        <p className="text-xs text-muted-foreground">{t("low_stock_hint")}</p>

      </section>

      {/* Manager controls */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold border-b pb-2">{t("section_manager")}</h2>
        {field(t("max_discount"), "maxCashierDiscountPercent", { type: "number", min: "0", max: "100", step: "1" })}
        <p className="text-xs text-muted-foreground">{t("max_discount_hint")}</p>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">{t("require_shift")}</p>
            <p className="text-xs text-muted-foreground">{t("require_shift_hint")}</p>
          </div>
          <input
            type="checkbox"
            {...register("requireOpenShift")}
            className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("manager_pin")}</label>
          <input
            {...register("managerPin")}
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            placeholder={settings.hasManagerPin ? t("manager_pin_set") : t("manager_pin_unset")}
            className="border-input bg-background flex h-10 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          />
          <p className="text-xs text-muted-foreground">{t("manager_pin_hint")}</p>
        </div>
      </section>

      {/* Permissions (Настройка разрешений) */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold border-b pb-2">{t("section_permissions")}</h2>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">{t("perm_auto_sale_price")}</p>
            <p className="text-xs text-muted-foreground">{t("perm_auto_sale_price_hint")}</p>
          </div>
          <input type="checkbox" {...register("autoUpdateSalePrice")} className="h-4 w-4 rounded border-input accent-primary cursor-pointer" />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">{t("perm_round_up")}</p>
            <p className="text-xs text-muted-foreground">{t("perm_round_up_hint")}</p>
          </div>
          <input type="checkbox" {...register("roundSalePriceUp")} className="h-4 w-4 rounded border-input accent-primary cursor-pointer" />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">{t("perm_wholesale")}</p>
            <p className="text-xs text-muted-foreground">{t("perm_wholesale_hint")}</p>
          </div>
          <input type="checkbox" {...register("allowWholesale")} className="h-4 w-4 rounded border-input accent-primary cursor-pointer" />
        </div>

        {field(t("perm_backdating_days"), "backdatingDays", { type: "number", min: "0", step: "1" })}
        <p className="text-xs text-muted-foreground">{t("perm_backdating_days_hint")}</p>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">{t("perm_merge_products")}</p>
            <p className="text-xs text-muted-foreground">{t("perm_merge_products_hint")}</p>
          </div>
          <input type="checkbox" {...register("mergeSameProducts")} className="h-4 w-4 rounded border-input accent-primary cursor-pointer" />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">{t("perm_bind_supplier")}</p>
            <p className="text-xs text-muted-foreground">{t("perm_bind_supplier_hint")}</p>
          </div>
          <input type="checkbox" {...register("bindProductToSupplier")} className="h-4 w-4 rounded border-input accent-primary cursor-pointer" />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">{t("perm_autosave_receipt")}</p>
            <p className="text-xs text-muted-foreground">{t("perm_autosave_receipt_hint")}</p>
          </div>
          <input type="checkbox" {...register("autosaveReceiptDraft")} className="h-4 w-4 rounded border-input accent-primary cursor-pointer" />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4 opacity-70">
          <div>
            <p className="text-sm font-medium">{t("perm_contragents_per_store")}</p>
            <p className="text-xs text-muted-foreground">{t("perm_contragents_per_store_hint")}</p>
          </div>
          <input type="checkbox" checked disabled className="h-4 w-4 rounded border-input accent-primary" />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">{t("perm_auto_cost_price")}</p>
            <p className="text-xs text-muted-foreground">{t("perm_auto_cost_price_hint")}</p>
          </div>
          <input type="checkbox" {...register("autoUpdateCostPrice")} className="h-4 w-4 rounded border-input accent-primary cursor-pointer" />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">{t("perm_auto_bundle_price")}</p>
            <p className="text-xs text-muted-foreground">{t("perm_auto_bundle_price_hint")}</p>
          </div>
          <input type="checkbox" {...register("autoUpdateBundleSalePrice")} className="h-4 w-4 rounded border-input accent-primary cursor-pointer" />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">{t("perm_cashback")}</p>
            <p className="text-xs text-muted-foreground">{t("perm_cashback_hint")}</p>
          </div>
          <input type="checkbox" {...register("cashbackEnabled")} className="h-4 w-4 rounded border-input accent-primary cursor-pointer" />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">{t("perm_hide_stock_stocktake")}</p>
            <p className="text-xs text-muted-foreground">{t("perm_hide_stock_stocktake_hint")}</p>
          </div>
          <input type="checkbox" {...register("hideStockDuringStocktake")} className="h-4 w-4 rounded border-input accent-primary cursor-pointer" />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">{t("perm_hide_amounts_stocktake")}</p>
            <p className="text-xs text-muted-foreground">{t("perm_hide_amounts_stocktake_hint")}</p>
          </div>
          <input type="checkbox" {...register("hideAmountsDuringStocktake")} className="h-4 w-4 rounded border-input accent-primary cursor-pointer" />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="text-sm font-medium">{t("perm_auto_restore")}</p>
            <p className="text-xs text-muted-foreground">{t("perm_auto_restore_hint")}</p>
          </div>
          <input type="checkbox" {...register("autoRestoreDeletedProducts")} className="h-4 w-4 rounded border-input accent-primary cursor-pointer" />
        </div>

      </section>

      {/* Image Storage */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold border-b pb-2">{t("section_storage")}</h2>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("storage_provider")}</label>
          <select
            {...register("storageProvider")}
            className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            <option value="local">{t("storage_provider_local")}</option>
            <option value="vercel_blob">Vercel Blob</option>
            <option value="cloudflare_r2">Cloudflare R2</option>
            <option value="s3">AWS S3</option>
          </select>
          <p className="text-xs text-muted-foreground">
            {t("storage_provider_hint")}
          </p>
        </div>

        {storageProvider === "local" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4 text-sm text-amber-800 dark:text-amber-300">
            {t("storage_local_warn")}
          </div>
        )}

        {storageProvider === "vercel_blob" && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-4 space-y-2 text-sm">
            <p className="font-medium text-blue-800 dark:text-blue-300">{t("storage_vercel_title")}</p>
            <p className="text-muted-foreground">
              {t("storage_vercel_body")}
            </p>
          </div>
        )}

        {(storageProvider === "cloudflare_r2" || storageProvider === "s3") && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {field(t("storage_bucket"), "storageBucket", { placeholder: "my-bucket" })}
              {field(
                t("storage_region"),
                "storageRegion",
                { placeholder: storageProvider === "cloudflare_r2" ? "auto" : "us-east-1" }
              )}
            </div>
            {storageProvider === "cloudflare_r2" &&
              field(t("storage_endpoint"), "storageEndpoint", {
                placeholder: "https://<account-id>.r2.cloudflarestorage.com",
              })
            }
            {field(t("storage_access_key"), "storageAccessKey", { placeholder: "Access key ID", autoComplete: "off" })}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("storage_secret_key")}</label>
              <input
                {...register("storageSecretKey")}
                type="password"
                autoComplete="new-password"
                placeholder={settings.hasStorageSecretKey ? t("storage_secret_keep") : t("storage_secret_new")}
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              />
            </div>
            {field(t("storage_public_url"), "storagePublicUrl", {
              placeholder: storageProvider === "cloudflare_r2"
                ? "https://pub-xxx.r2.dev"
                : "https://cdn.example.com",
              type: "url",
            })}
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t("storage_creds_warn")}
            </p>
          </div>
        )}
      </section>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center rounded-md px-6 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {isSubmitting ? t("saving") : t("save")}
        </button>
      </div>
    </form>
  );
}
