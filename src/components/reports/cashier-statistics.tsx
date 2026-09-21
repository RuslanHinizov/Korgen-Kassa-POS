"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { Download, Settings2, SlidersHorizontal } from "lucide-react";
import { SortableTh, Pagination } from "./supplier-statistics";
import { useAnchoredPopover, AnchoredPopover } from "@/components/ui/anchored-popover";

interface Row { userId: string; name: string; reportSum: number; salesSum: number; nonCash: number; returns: number; total: number }
type SortField = "reportSum" | "salesSum" | "nonCash" | "returns" | "total";
const COLUMN_STORAGE_KEY = "korgen.reports.cashiers.columns";

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

export function CashierStatistics() {
  const [filterOpen, setFilterOpen] = useState(false);
  const [preset, setPreset] = useState<string | null>("month");
  const [{ from, to }, setRange] = useState(() => monthRange());
  const [appliedFilters, setAppliedFilters] = useState({ from, to });

  const [sortField, setSortField] = useState<SortField>("salesSum");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [totals, setTotals] = useState({ reportSum: 0, salesSum: 0, nonCash: 0, returns: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  const columns = useAnchoredPopover();
  const [visible, setVisible] = useState({ nonCash: true, returns: true, total: true });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLUMN_STORAGE_KEY);
      if (saved) setVisible(JSON.parse(saved));
    } catch { /* Browser storage is optional. */ }
  }, []);

  function setColumnVisible(column: keyof typeof visible, checked: boolean) {
    setVisible((previous) => {
      const next = { ...previous, [column]: checked };
      try { localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(next)); } catch { /* Browser storage is optional. */ }
      return next;
    });
  }

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams({ from: appliedFilters.from.toISOString(), to: appliedFilters.to.toISOString(), sortField, sortOrder, page: String(page), pageSize: String(pageSize) });
    try {
      const r = await fetch(`/api/reports/cashier-statistics?${sp.toString()}`);
      if (!r.ok) return;
      const d = await r.json();
      setRows(d.items); setTotal(d.total); setTotals(d.totals);
    } finally { setLoading(false); }
  }, [appliedFilters, sortField, sortOrder, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  function applyFilters() { setPage(1); setAppliedFilters({ from, to }); }
  function resetFilters() { const r = monthRange(); setPreset("month"); setRange(r); setPage(1); setAppliedFilters({ from: r.from, to: r.to }); }
  function applyPreset(key: (typeof PRESETS)[number]["key"]) { setPreset(key); setRange(presetRange(key)); }
  function exportXlsx() {
    const sp = new URLSearchParams({ from: appliedFilters.from.toISOString(), to: appliedFilters.to.toISOString(), sortField, sortOrder, export: "xlsx" });
    window.open(`/api/reports/cashier-statistics?${sp.toString()}`, "_blank");
  }
  function toggleSort(field: SortField) {
    if (sortField === field) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortOrder("desc"); }
    setPage(1);
  }

  const lastIndex = Math.min(page * pageSize, total);
  const firstIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const columnCount = 4 + Number(visible.nonCash) + Number(visible.returns) + Number(visible.total);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <h1 className="text-2xl font-bold">Отчёты по кассирам</h1>

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
              <th className="px-3 py-2 text-left">Имя</th>
              <SortableTh label="Сумма по отчётам" active={sortField === "reportSum"} order={sortOrder} onClick={() => toggleSort("reportSum")} />
              <SortableTh label="Сумма по продажам" active={sortField === "salesSum"} order={sortOrder} onClick={() => toggleSort("salesSum")} />
              {visible.nonCash && <SortableTh label="Безнал" active={sortField === "nonCash"} order={sortOrder} onClick={() => toggleSort("nonCash")} />}
              {visible.returns && <SortableTh label="Возврат" active={sortField === "returns"} order={sortOrder} onClick={() => toggleSort("returns")} />}
              {visible.total && <SortableTh label="Итого" active={sortField === "total"} order={sortOrder} onClick={() => toggleSort("total")} />}
              <th className="px-2 py-2 text-right">
                <button ref={columns.anchorRef} onClick={columns.toggle} className="rounded p-1 hover:bg-accent" aria-label="Настроить столбцы">
                  <Settings2 className="h-4 w-4" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={columnCount} className="px-3 py-8 text-center text-muted-foreground">Загрузка…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={columnCount} className="px-3 py-8 text-center text-muted-foreground">Нет данных за выбранный период</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.userId} className="hover:bg-muted/40">
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.reportSum)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.salesSum)}</td>
                  {visible.nonCash && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.nonCash)}</td>}
                  {visible.returns && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.returns)}</td>}
                  {visible.total && <td className="px-3 py-2 text-right font-medium tabular-nums">{formatCurrency(r.total)}</td>}
                  <td></td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t bg-muted/30 text-sm font-semibold">
                <td className="px-3 py-2">Итого</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.reportSum)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.salesSum)}</td>
                {visible.nonCash && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.nonCash)}</td>}
                {visible.returns && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.returns)}</td>}
                {visible.total && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.total)}</td>}
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {columns.open && columns.pos && (
        <AnchoredPopover pos={columns.pos} onClose={columns.close}>
          <p className="mb-1 font-semibold">Видимость столбцов</p>
          <p className="mb-2 text-xs text-muted-foreground">Настройте таблицу под себя и ваш выбор сохранится</p>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 font-normal">
              <input type="checkbox" checked={visible.nonCash} onChange={(e) => setColumnVisible("nonCash", e.target.checked)} /> Безнал
            </label>
            <label className="flex items-center gap-2 font-normal">
              <input type="checkbox" checked={visible.returns} onChange={(e) => setColumnVisible("returns", e.target.checked)} /> Возврат
            </label>
            <label className="flex items-center gap-2 font-normal">
              <input type="checkbox" checked={visible.total} onChange={(e) => setColumnVisible("total", e.target.checked)} /> Итого
            </label>
          </div>
        </AnchoredPopover>
      )}

      <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} totalPages={totalPages} firstIndex={firstIndex} lastIndex={lastIndex} />
    </div>
  );
}
