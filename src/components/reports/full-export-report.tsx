"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

const STORAGE_KEY = "korgen.fullExportSections";

function loadStoredSections(allKeys: string[]): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set(allKeys);
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set(allKeys);
    const valid = parsed.filter((k): k is string => typeof k === "string" && allKeys.includes(k));
    return new Set(valid);
  } catch {
    return new Set(allKeys);
  }
}

function monthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from, to };
}
function toInputDate(d: Date) { return d.toISOString().slice(0, 10); }

const PRESETS = [
  { key: "yesterday", label: "Вчера" },
  { key: "today", label: "Сегодня" },
  { key: "week", label: "Неделя" },
  { key: "month", label: "Месяц" },
  { key: "3months", label: "Три месяца" },
] as const;

function presetRange(key: (typeof PRESETS)[number]["key"]) {
  const now = new Date();
  const to = new Date(now); to.setHours(23, 59, 59, 999);
  const from = new Date(now); from.setHours(0, 0, 0, 0);
  if (key === "yesterday") { from.setDate(from.getDate() - 1); to.setDate(to.getDate() - 1); to.setHours(23, 59, 59, 999); }
  else if (key === "week") from.setDate(from.getDate() - 6);
  else if (key === "month") from.setDate(from.getDate() - 29);
  else if (key === "3months") from.setDate(from.getDate() - 89);
  return { from, to };
}

const SECTIONS = [
  { key: "sales", label: "Продажи" },
  { key: "customerReturns", label: "Возвраты покупателей" },
  { key: "purchaseReceipts", label: "Приёмки от поставщиков" },
  { key: "supplierReturns", label: "Возвраты поставщикам" },
  { key: "writeOffs", label: "Списания" },
  { key: "storeTransfers", label: "Перемещения между магазинами" },
  { key: "stocktakes", label: "Инвентаризации" },
  { key: "cashMovements", label: "Движение денег (касса)" },
  { key: "inventoryMovements", label: "Товарные движения (полная история склада)" },
  { key: "products", label: "Остатки товаров (текущий снимок)" },
] as const;

export function FullExportReport() {
  const [preset, setPreset] = useState<string | null>("month");
  const [{ from, to }, setRange] = useState(() => monthRange());
  const sectionKeys = SECTIONS.map((s) => s.key);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(sectionKeys));

  // Load the viewer's last selection once the component mounts client-side
  // (localStorage isn't available during SSR) — reduces re-ticking 10 boxes every visit.
  useEffect(() => {
    setSelected(loadStoredSections(sectionKeys));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...selected])); } catch { /* private mode / blocked storage */ }
  }, [selected]);

  function toggleSection(key: string) {
    setSelected((s) => { const next = new Set(s); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }
  function toggleAll() {
    setSelected((s) => (s.size === SECTIONS.length ? new Set() : new Set(SECTIONS.map((x) => x.key))));
  }
  function applyPreset(key: (typeof PRESETS)[number]["key"]) { setPreset(key); setRange(presetRange(key)); }

  function download() {
    const sp = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), sections: [...selected].join(",") });
    window.open(`/api/reports/full-export?${sp}`, "_blank");
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <h1 className="text-2xl font-bold">Полный отчёт</h1>
      <p className="text-sm text-muted-foreground">Выгружает всё, что произошло в магазине за выбранный период, в один Excel-файл — каждый раздел на своей странице.</p>

      <div className="rounded-lg border bg-card p-4 space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Период</label>
          <div className="flex gap-3 text-xs mb-2 flex-wrap">
            {PRESETS.map((p) => (
              <button key={p.key} onClick={() => applyPreset(p.key)} className={preset === p.key ? "font-semibold text-primary underline" : "text-primary hover:underline"}>{p.label}</button>
            ))}
          </div>
          <div className="flex items-center gap-2 max-w-md">
            <input type="date" value={toInputDate(from)} onChange={(e) => { setPreset(null); setRange((r) => ({ ...r, from: new Date(e.target.value + "T00:00:00") })); }} className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
            <span className="text-muted-foreground">—</span>
            <input type="date" value={toInputDate(to)} onChange={(e) => { setPreset(null); setRange((r) => ({ ...r, to: new Date(e.target.value + "T23:59:59") })); }} className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">Что включить</label>
            <button onClick={toggleAll} className="text-xs text-primary hover:underline">{selected.size === SECTIONS.length ? "Снять всё" : "Выбрать всё"}</button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SECTIONS.map((s) => (
              <label key={s.key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selected.has(s.key)} onChange={() => toggleSection(s.key)} /> {s.label}
              </label>
            ))}
          </div>
        </div>

        <button onClick={download} disabled={selected.size === 0} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          <Download className="h-4 w-4" /> Скачать Excel
        </button>
      </div>
    </div>
  );
}
