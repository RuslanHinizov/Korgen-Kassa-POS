"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StoreLink as Link } from "@/components/store/store-link";
import { formatCurrency } from "@/lib/utils";
import { Download, SlidersHorizontal } from "lucide-react";
import { Pagination } from "./supplier-statistics";

interface Row {
  no: number; productId: string | null; productName: string; barcode: string | null;
  quantity: number; unit: string; originalPrice: number; discount: number; discountedPrice: number; soldAt: string;
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

export function DiscountItemsList() {
  const [filterOpen, setFilterOpen] = useState(false);
  const [preset, setPreset] = useState<string | null>("week");
  const [{ from, to }, setRange] = useState(() => presetRange("week"));
  const [q, setQ] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({ from, to, q: "" });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const buildParams = useCallback((extra?: Record<string, string>) => {
    const sp = new URLSearchParams({ from: appliedFilters.from.toISOString(), to: appliedFilters.to.toISOString(), ...extra });
    if (appliedFilters.q) sp.set("q", appliedFilters.q);
    return sp;
  }, [appliedFilters]);

  const load = useCallback(async () => {
    setLoading(true);
    const sp = buildParams({ page: String(page), pageSize: String(pageSize) });
    try {
      const r = await fetch(`/api/reports/discount-items?${sp.toString()}`);
      if (!r.ok) return;
      const d = await r.json();
      setRows(d.items); setTotal(d.total);
    } finally { setLoading(false); }
  }, [buildParams, page, pageSize]);
  useEffect(() => { load(); }, [load]);

  function applyFilters() { setPage(1); setAppliedFilters({ from, to, q }); }
  function resetFilters() { const r = presetRange("week"); setPreset("week"); setRange(r); setQ(""); setPage(1); setAppliedFilters({ from: r.from, to: r.to, q: "" }); }
  function applyPreset(key: (typeof PRESETS)[number]["key"]) { setPreset(key); setRange(presetRange(key)); }
  function exportXlsx() {
    const sp = buildParams({ export: "xlsx" });
    window.open(`/api/reports/discount-items?${sp.toString()}`, "_blank");
  }

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleQChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setQ(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); setAppliedFilters((prev) => ({ ...prev, q: next })); }, 400);
  }

  const dateTimeFmt = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const lastIndex = Math.min(page * pageSize, total);
  const firstIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <h1 className="text-2xl font-bold">Отчёт по скидкам</h1>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setFilterOpen((o) => !o)} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
          <SlidersHorizontal className="h-4 w-4" /> Фильтр
        </button>
        <button onClick={exportXlsx} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
          <Download className="h-4 w-4" /> Excel
        </button>
      </div>

      {filterOpen && (
        <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <div className="flex gap-2 text-xs mb-1.5">
                {PRESETS.map((p) => (
                  <button key={p.key} onClick={() => applyPreset(p.key)} className={preset === p.key ? "font-semibold text-primary underline" : "text-primary hover:underline"}>{p.label}</button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input type="date" value={toInputDate(from)} onChange={(e) => { setPreset(null); setRange((r) => ({ ...r, from: new Date(e.target.value + "T00:00:00") })); }} className="h-9 rounded-md border bg-background px-2 text-sm" />
                <span className="text-muted-foreground">—</span>
                <input type="date" value={toInputDate(to)} onChange={(e) => { setPreset(null); setRange((r) => ({ ...r, to: new Date(e.target.value + "T23:59:59") })); }} className="h-9 rounded-md border bg-background px-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Код продукта/название</label>
              <input value={q} onChange={handleQChange} placeholder="Введите название или штрихкоду" className="h-9 w-56 rounded-md border bg-background px-2 text-sm" />
            </div>
          </div>
          <div className="flex items-center gap-4 pt-1">
            <button onClick={applyFilters} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Применить</button>
            <button onClick={resetFilters} className="text-sm text-muted-foreground hover:underline">Очистить</button>
          </div>
        </div>
      )}

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 text-left">№</th>
              <th className="px-3 py-2 text-left">Название товара</th>
              <th className="px-3 py-2 text-left">Штрихкод</th>
              <th className="px-3 py-2 text-right">Количество</th>
              <th className="px-3 py-2 text-left">Ед. изм</th>
              <th className="px-3 py-2 text-right">Начальная цена</th>
              <th className="px-3 py-2 text-right">Скидка</th>
              <th className="px-3 py-2 text-right">Цена со скидкой</th>
              <th className="px-3 py-2 text-left">Время продажи</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">Загрузка…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">Нет данных за выбранный период</td></tr>
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.soldAt}-${r.productId}-${i}`} className="hover:bg-muted/40">
                  <td className="px-3 py-2 text-muted-foreground">{r.no}</td>
                  <td className="px-3 py-2">
                    {r.productId ? <Link href={`/products/${r.productId}/edit`} className="text-primary hover:underline">{r.productName}</Link> : r.productName}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">{r.barcode ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.quantity}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.unit}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.originalPrice)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-destructive">{formatCurrency(r.discount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{formatCurrency(r.discountedPrice)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{dateTimeFmt.format(new Date(r.soldAt))}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} totalPages={totalPages} firstIndex={firstIndex} lastIndex={lastIndex} />
    </div>
  );
}
