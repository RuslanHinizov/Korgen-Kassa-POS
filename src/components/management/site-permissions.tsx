"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SaleRestrictionsPanel } from "@/components/settings/sale-restrictions-panel";

type FlagKey =
  | "autoUpdateCostPrice" | "autoUpdateSalePrice" | "autoUpdateBundleSalePrice" | "autoRestoreDeletedProducts"
  | "posSplitCounterparty" | "hideStockDuringStocktake" | "bindProductToSupplier" | "mergeSameProducts"
  | "autosaveReceiptDraft" | "cashbackEnabled" | "allowWholesale" | "hideAmountsDuringStocktake";

// Two columns, in the same order as UMAG's «Настройка разрешений на сайте».
const LEFT: [FlagKey, string][] = [
  ["autoUpdateCostPrice", "Автоизменение закупочной цены (по базе)"],
  ["autoUpdateSalePrice", "Автоизменение продажной цены"],
  ["autoUpdateBundleSalePrice", "Автоизменение продажной цены комплекта"],
  ["autoRestoreDeletedProducts", "Автовосстановление удаленных товаров при приемке (коллектор, excel файл)"],
  ["posSplitCounterparty", "Показывать контрагенты раздельно в магазинах"],
  ["hideStockDuringStocktake", "Скрывать остаток и разницу во время инвентаризации"],
];
const RIGHT: [FlagKey, string][] = [
  ["bindProductToSupplier", "Привязка продукта к поставщику (при приемке)"],
  ["mergeSameProducts", "Суммировать одинаковые товары"],
  ["autosaveReceiptDraft", "Автосохранение приемки (каждые 2 минуты)"],
  ["cashbackEnabled", "Включить систему лояльности с cashback"],
  ["allowWholesale", "Разрешить оптовые продажи"],
  ["hideAmountsDuringStocktake", "Скрывать закупочные и продажные суммы во время инвентаризации"],
];
const DAYS = [0, 1, 3, 7, 14, 30, 90, 180, 365];

/** Управление → Настройки разрешений: site-wide switches and sale bans. */
export function SitePermissions() {
  const [flags, setFlags] = useState<Record<FlagKey, boolean> | null>(null);
  const [backdatingDays, setBackdatingDays] = useState(365);
  const [roundUp, setRoundUp] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/management/site-permissions")
      .then((r) => r.json())
      .then((d) => { setFlags(d.flags); setBackdatingDays(d.backdatingDays); setRoundUp(d.roundSalePriceUp); });
  }, []);

  async function save() {
    if (!flags) return;
    setSaving(true);
    try {
      const r = await fetch("/api/management/site-permissions", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flags, backdatingDays, roundSalePriceUp: roundUp }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(d.error ?? "Не удалось сохранить"); return; }
      toast.success("Сохранено");
    } finally { setSaving(false); }
  }

  const SaveBtn = () => (
    <button onClick={save} disabled={saving || !flags} className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-8 items-center gap-2 rounded-md px-4 text-sm font-medium disabled:opacity-50">
      {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Сохранить
    </button>
  );
  const select = "bg-background h-9 rounded-md border px-3 text-sm";

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold">Настройка разрешений</h1>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Настройка разрешений на сайте</h2>
          <SaveBtn />
        </div>
        <div className="bg-card rounded-lg border p-4">
          {!flags ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <div className="grid gap-x-10 gap-y-3 md:grid-cols-2">
              {[LEFT, RIGHT].map((col, ci) => (
                <div key={ci} className="space-y-3">
                  {col.map(([key, label]) => (
                    <label key={key} className="flex cursor-pointer items-start gap-3 text-sm">
                      <input type="checkbox" className="accent-primary mt-0.5 h-4 w-4 shrink-0" checked={flags[key]} onChange={(e) => setFlags({ ...flags, [key]: e.target.checked })} />
                      {label}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-card grid gap-4 rounded-lg border p-4 text-sm md:grid-cols-2">
          <label className="flex items-center justify-between gap-3">
            Создание документов с задним/передним числом на (дней)
            <select value={backdatingDays} onChange={(e) => setBackdatingDays(Number(e.target.value))} className={`${select} w-40`}>
              {(DAYS.includes(backdatingDays) ? DAYS : [...DAYS, backdatingDays].sort((a, b) => a - b)).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="flex items-center justify-between gap-3">
            Округление продажной цены (номенклатура):
            <select value={roundUp ? "up" : "none"} onChange={(e) => setRoundUp(e.target.value === "up")} className={`${select} w-44`}>
              <option value="none">Без округления</option>
              <option value="up">1тг вверх</option>
            </select>
          </label>
        </div>
      </section>

      <section className="space-y-3">
        <SaleRestrictionsPanel />
      </section>

    </div>
  );
}
