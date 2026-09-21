"use client";

import { useTranslations } from "next-intl";
import { useDeviceSettings } from "@/hooks/use-device-settings";
import { printReceipt, kickCashDrawer } from "@/lib/thermal-print";

const DEMO_RECEIPT = {
  data: {
    items: [{ name: "Test Item", quantity: 1, price: 1.0, total: 1.0 }],
    subtotal: 1.0,
    discountAmount: 0,
    taxAmount: 0,
    total: 1.0,
    paymentMethod: "CASH",
  },
  settings: {
    name: "Korgen Kassa POS",
    currency: "$",
    currencyDecimals: 2,
    taxName: "Tax",
    receiptFooter: "Thank you!",
  },
};

export function DeviceSettingsForm() {
  const t = useTranslations("settings.device");
  const tp = useTranslations("pos");
  const [settings, update] = useDeviceSettings();

  const METHOD_KEY = { CASH: "cash", CARD: "card", OTHER: "other" } as const;

  async function handleTestPrint() {
    if (settings.printerType === "none") {
      alert(t("printer_disabled_alert"));
      return;
    }
    const result = await printReceipt(DEMO_RECEIPT);
    if (!result.ok) {
      alert(t("print_failed", { error: result.error ?? "" }));
    }
  }

  async function handleTestDrawer() {
    const result = await kickCashDrawer();
    if (!result.ok) {
      alert(t("drawer_failed", { error: result.error ?? "" }));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold mb-1">{t("prefs_title")}</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {t("prefs_subtitle")}
        </p>
      </div>

      {/* Default Payment Method */}
      <div className="space-y-2">
        <label className="text-sm font-medium">{t("default_payment")}</label>
        <div className="flex gap-2">
          {(["CASH", "CARD", "OTHER"] as const).map((method) => (
            <button
              key={method}
              onClick={() => update({ defaultPaymentMethod: method })}
              className={
                settings.defaultPaymentMethod === method
                  ? "flex-1 rounded-md border-2 border-primary bg-primary/10 py-2 text-xs font-semibold text-primary"
                  : "flex-1 rounded-md border py-2 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
              }
            >
              {tp(METHOD_KEY[method])}
            </button>
          ))}
        </div>
      </div>

      {/* Sound on sale */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{t("sound_title")}</p>
          <p className="text-xs text-muted-foreground">{t("sound_hint")}</p>
        </div>
        <button
          role="switch"
          aria-checked={settings.soundOnSale}
          onClick={() => update({ soundOnSale: !settings.soundOnSale })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            settings.soundOnSale ? "bg-primary" : "bg-muted"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              settings.soundOnSale ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {/* Scanner beep */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{t("scanner_beep")}</p>
          <p className="text-xs text-muted-foreground">{t("scanner_beep_hint")}</p>
        </div>
        <button
          role="switch"
          aria-checked={settings.scannerBeepEnabled}
          onClick={() => update({ scannerBeepEnabled: !settings.scannerBeepEnabled })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            settings.scannerBeepEnabled ? "bg-primary" : "bg-muted"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              settings.scannerBeepEnabled ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {/* Printer type */}
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">{t("printer_title")}</p>
          <p className="text-xs text-muted-foreground">
            {t("printer_hint")}
          </p>
        </div>
        <div className="flex gap-2">
          {(
            [
              { value: "serial", label: t("printer_serial") },
              { value: "usb", label: t("printer_usb") },
              { value: "none", label: t("printer_disabled") },
            ] as const
          ).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => update({ printerType: value })}
              className={
                settings.printerType === value
                  ? "flex-1 rounded-md border-2 border-primary bg-primary/10 py-2 text-xs font-semibold text-primary"
                  : "flex-1 rounded-md border py-2 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
              }
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={handleTestPrint}
          disabled={settings.printerType === "none"}
          className="w-full rounded-md border border-dashed py-2 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t("test_print")}
        </button>
      </div>

      {/* Cash drawer */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{t("drawer_title")}</p>
            <p className="text-xs text-muted-foreground">{t("drawer_hint")}</p>
          </div>
          <button
            role="switch"
            aria-checked={settings.openDrawerOnCash}
            onClick={() => update({ openDrawerOnCash: !settings.openDrawerOnCash })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              settings.openDrawerOnCash ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                settings.openDrawerOnCash ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
        <button
          onClick={handleTestDrawer}
          disabled={settings.printerType === "none"}
          className="w-full rounded-md border border-dashed py-2 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t("test_drawer")}
        </button>
      </div>
    </div>
  );
}
