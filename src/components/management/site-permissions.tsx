"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Loader2 } from "lucide-react";
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

interface Cashbox { id: string; no: number; name: string; platform: string | null; appVersion: string | null; lastSyncAt: string | null; pairedAt: string | null }

function fmt(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return (
    <>
      {d.toLocaleDateString("ru-RU")} <b>{d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</b>
    </>
  );
}

/** Управление → Настройки разрешений: site-wide switches, sale bans and the android kassa access key. */
export function SitePermissions() {
  const [flags, setFlags] = useState<Record<FlagKey, boolean> | null>(null);
  const [backdatingDays, setBackdatingDays] = useState(365);
  const [roundUp, setRoundUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cashboxes, setCashboxes] = useState<Cashbox[]>([]);
  const [keyCashbox, setKeyCashbox] = useState("");
  const [keyBusy, setKeyBusy] = useState(false);
  const [lastKey, setLastKey] = useState<{ cashbox: string; key: string } | null>(null);

  useEffect(() => {
    fetch("/api/management/site-permissions")
      .then((r) => r.json())
      .then((d) => { setFlags(d.flags); setBackdatingDays(d.backdatingDays); setRoundUp(d.roundSalePriceUp); });
  }, []);
  const loadCashboxes = useCallback(() => {
    fetch("/api/management/cashboxes").then((r) => r.json()).then((d) => setCashboxes(d.cashboxes ?? []));
  }, []);
  useEffect(() => { loadCashboxes(); }, [loadCashboxes]);

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

  async function generateKey() {
    if (!keyCashbox) return;
    setKeyBusy(true);
    try {
      const r = await fetch(`/api/management/cashboxes/${keyCashbox}/generate-key`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(d.error ?? "Не удалось создать ключ"); return; }
      setLastKey({ cashbox: cashboxes.find((c) => c.id === keyCashbox)?.name ?? "", key: d.oneTimeKey });
    } finally { setKeyBusy(false); }
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

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Ключ доступа для android кассы</h2>
        <div className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
          <span>Выберите нужную кассу, чтобы сгенерировать одноразовый ключ доступа</span>
          <div className="flex items-center gap-2">
            <select value={keyCashbox} onChange={(e) => setKeyCashbox(e.target.value)} className={`${select} w-44`}>
              <option value="">Выберите кассу</option>
              {cashboxes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={generateKey} disabled={!keyCashbox || keyBusy} className="bg-primary text-primary-foreground hover:bg-primary/90 h-9 rounded-md px-4 text-sm font-medium disabled:opacity-40">
              Сгенерировать ключ
            </button>
          </div>
        </div>
        {lastKey && (
          <div className="bg-primary/10 flex items-center gap-3 rounded-lg border p-3 text-sm">
            Ключ для «{lastKey.cashbox}»: <b className="font-mono text-base">{lastKey.key}</b>
            <button onClick={() => { void navigator.clipboard?.writeText(lastKey.key); toast.success("Скопировано"); }} className="hover:bg-accent rounded p-1" aria-label="Копировать"><Copy className="h-4 w-4" /></button>
            <span className="text-muted-foreground">Ключ постоянный: после ввода на кассе он остаётся тем же.</span>
          </div>
        )}
        <div className="bg-card overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground border-b text-xs font-medium">
                <th className="px-4 py-2.5 text-left">ID</th>
                <th className="px-4 py-2.5 text-left">Название кассы</th>
                <th className="px-4 py-2.5 text-left">Платформа</th>
                <th className="px-4 py-2.5 text-left">Версия</th>
                <th className="px-4 py-2.5 text-left">Дата последней синхронизации</th>
                <th className="px-4 py-2.5 text-left">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {cashboxes.length === 0 ? (
                <tr><td colSpan={6} className="text-muted-foreground px-4 py-6 text-center">Нет данных</td></tr>
              ) : (
                cashboxes.map((c) => {
                  const live = Boolean(c.pairedAt);
                  return (
                    <tr key={c.id} className="hover:bg-muted/40">
                      <td className="text-muted-foreground px-4 py-2.5">{c.no}</td>
                      <td className="px-4 py-2.5">{c.name}</td>
                      <td className="px-4 py-2.5">{c.platform ?? "Неизвестно"}</td>
                      <td className="px-4 py-2.5">{c.appVersion ?? "—"}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{fmt(c.lastSyncAt)}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${live ? "bg-green-500" : "bg-red-500"}`} />
                          {live ? "Сессия активна" : "Сессия завершена"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
