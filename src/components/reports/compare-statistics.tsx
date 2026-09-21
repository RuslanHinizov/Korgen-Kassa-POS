"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { Download, SlidersHorizontal, X } from "lucide-react";
import { SortableTh, Pagination } from "./supplier-statistics";

interface Row {
  productId: string | null; productName: string; barcode: string | null; unit: string;
  saleQty: number; saleAmount: number; saleCost: number;
  returnQty: number; returnAmount: number; returnCost: number;
  profit: number; rentability: number;
}
type SortField = "saleQty" | "saleAmount" | "returnQty" | "profit";

function todayRange() {
  const now = new Date();
  const from = new Date(now); from.setHours(0, 0, 0, 0);
  const to = new Date(now); to.setHours(23, 59, 59, 999);
  return { from, to };
}
function toInputDate(d: Date) { return d.toISOString().slice(0, 10); }

const PRESETS = [
  { key: "yesterday", label: "Вч." },
  { key: "today", label: "Сег." },
  { key: "week", label: "Нед." },
  { key: "month", label: "Мес." },
  { key: "3months", label: "3 Мес." },
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

export function CompareStatistics() {
  const [filterOpen, setFilterOpen] = useState(false);
  const [preset, setPreset] = useState<string | null>("today");
  const [{ from, to }, setRange] = useState(() => todayRange());
  const [appliedFilters, setAppliedFilters] = useState({ from, to });

  const [sortField, setSortField] = useState<SortField>("saleAmount");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [totals, setTotals] = useState({ saleAmount: 0, saleCost: 0, returnAmount: 0, returnCost: 0, profit: 0 });
  const [loading, setLoading] = useState(true);
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams({ from: appliedFilters.from.toISOString(), to: appliedFilters.to.toISOString(), sortField, sortOrder, page: String(page), pageSize: String(pageSize) });
    try {
      const r = await fetch(`/api/reports/product-statistics?${sp.toString()}`);
      if (!r.ok) return;
      const d = await r.json();
      setRows(d.items); setTotal(d.total); setTotals(d.totals);
    } finally { setLoading(false); }
  }, [appliedFilters, sortField, sortOrder, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  function applyFilters() { setPage(1); setAppliedFilters({ from, to }); }
  function resetFilters() { const r = todayRange(); setPreset("today"); setRange(r); setPage(1); setAppliedFilters({ from: r.from, to: r.to }); setRemoved(new Set()); }
  function applyPreset(key: (typeof PRESETS)[number]["key"]) { setPreset(key); setRange(presetRange(key)); }
  function exportXlsx() {
    const sp = new URLSearchParams({ from: appliedFilters.from.toISOString(), to: appliedFilters.to.toISOString(), sortField, sortOrder, export: "xlsx" });
    window.open(`/api/reports/product-statistics?${sp.toString()}`, "_blank");
  }
  function toggleSort(field: SortField) {
    if (sortField === field) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortOrder("desc"); }
    setPage(1);
  }

  const visibleRows = rows.filter((r) => !r.productId || !removed.has(r.productId));
  const lastIndex = Math.min(page * pageSize, total);
  const firstIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
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
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Период</label>
            <div className="flex items-center gap-2">
              <input type="date" value={toInputDate(from)} onChange={(e) => { setPreset(null); setRange((r) => ({ ...r, from: new Date(e.target.value + "T00:00:00") })); }} className="h-9 rounded-md border bg-background px-2 text-sm" />
              <span className="text-muted-foreground">—</span>
              <input type="date" value={toInputDate(to)} onChange={(e) => { setPreset(null); setRange((r) => ({ ...r, to: new Date(e.target.value + "T23:59:59") })); }} className="h-9 rounded-md border bg-background px-2 text-sm" />
            </div>
            <div className="mt-1 flex gap-2 text-xs">
              {PRESETS.map((p) => (
                <button key={p.key} onClick={() => applyPreset(p.key)} className={preset === p.key ? "font-semibold text-primary underline" : "text-primary hover:underline"}>{p.label}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4 pt-1">
            <button onClick={applyFilters} className="inline-flex h-9 items-center rounded-md border border-primary px-4 text-sm font-medium text-primary hover:bg-primary/10">Применить</button>
            <button onClick={resetFilters} className="text-sm text-muted-foreground hover:underline">Сбросить</button>
          </div>
        </div>
      )}

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs font-medium text-muted-foreground">
              <th colSpan={3}></th>
              <th colSpan={3} className="border-b-2 border-primary px-3 py-1.5 text-center uppercase tracking-wide">Продажи</th>
              <th colSpan={3} className="border-b-2 border-destructive px-3 py-1.5 text-center uppercase tracking-wide">Возвраты</th>
              <th colSpan={3}></th>
            </tr>
            <tr className="border-b bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 text-left">Название товара</th>
              <th className="px-3 py-2 text-left">Штрихкод</th>
              <th className="px-3 py-2 text-left">Ед. изм</th>
              <SortableTh label="Кол-во" active={sortField === "saleQty"} order={sortOrder} onClick={() => toggleSort("saleQty")} />
              <th className="px-3 py-2 text-right">Сумма себес., ₸</th>
              <SortableTh label="Сумма продаж, ₸" active={sortField === "saleAmount"} order={sortOrder} onClick={() => toggleSort("saleAmount")} />
              <SortableTh label="Кол-во" active={sortField === "returnQty"} order={sortOrder} onClick={() => toggleSort("returnQty")} />
              <th className="px-3 py-2 text-right">Сумма себес., ₸</th>
              <th className="px-3 py-2 text-right">Сумма возвратов, ₸</th>
              <SortableTh label="Прибыль, ₸" active={sortField === "profit"} order={sortOrder} onClick={() => toggleSort("profit")} />
              <th className="px-3 py-2 text-right">Рентабельность, %</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">Загрузка…</td></tr>
            ) : visibleRows.length === 0 ? (
              <tr><td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">Нет данных за выбранный период</td></tr>
            ) : (
              visibleRows.map((r, i) => (
                <tr key={r.productId ?? i} className="hover:bg-muted/40">
                  <td className="px-3 py-2">{r.productName}</td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">{r.barcode ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.unit}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.saleQty}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.saleCost)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.saleAmount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.returnQty}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.returnCost)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.returnAmount)}</td>
                  <td className={`px-3 py-2 text-right font-medium tabular-nums ${r.profit < 0 ? "text-destructive" : "text-primary"}`}>{formatCurrency(r.profit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.rentability.toFixed(2)}</td>
                  <td className="px-2 py-2 text-right">
                    {r.productId && (
                      <button onClick={() => setRemoved((prev) => new Set(prev).add(r.productId!))} className="rounded border border-primary/40 p-1 text-primary hover:bg-primary/10" aria-label="Убрать из сравнения">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {visibleRows.length > 0 && (
            <tfoot>
              <tr className="border-t bg-muted/30 text-sm font-semibold">
                <td className="px-3 py-2" colSpan={3}></td>
                <td></td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.saleCost)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.saleAmount)}</td>
                <td></td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.returnCost)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.returnAmount)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.profit)}</td>
                <td></td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} totalPages={totalPages} firstIndex={firstIndex} lastIndex={lastIndex} />
    </div>
  );
}
