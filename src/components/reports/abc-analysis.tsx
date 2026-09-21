"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { Download, Settings2, SlidersHorizontal } from "lucide-react";
import { SortableTh, Pagination } from "./supplier-statistics";
import { useAnchoredPopover, AnchoredPopover } from "@/components/ui/anchored-popover";

interface Row {
  productId: string; productName: string; barcode: string | null;
  price: number; cost: number; markup: number | null;
  qty: number; costTotal: number; revenue: number; profit: number;
  abcRevenue: "A" | "B" | "C"; abcProfit: "A" | "B" | "C";
}
interface Category { id: string; name: string; parentId: string | null }

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

const ABC_COLOR: Record<string, string> = {
  A: "text-primary", B: "text-amber-600 dark:text-amber-400", C: "text-destructive",
};

function AbcBadge({ v }: { v: string }) {
  return <span className={`font-medium ${ABC_COLOR[v] ?? ""}`}>{v}</span>;
}

export function AbcAnalysis() {
  const [filterOpen, setFilterOpen] = useState(false);
  const [preset, setPreset] = useState<string | null>("month");
  const [{ from, to }, setRange] = useState(() => monthRange());
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [appliedFilters, setAppliedFilters] = useState({ from, to, q: "", categoryId: "" });

  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const columns = useAnchoredPopover();
  const [visible, setVisible] = useState({
    markup: true, cost: true, qty: true, costTotal: true, revenue: true,
    abcRevenue: true, profit: true, abcProfit: true, summary: true,
  });

  useEffect(() => {
    fetch("/api/reports/statistics/filters")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setCategories(d.categories); });
  }, []);

  const buildParams = useCallback((extra?: Record<string, string>) => {
    const sp = new URLSearchParams({ from: appliedFilters.from.toISOString(), to: appliedFilters.to.toISOString(), sortOrder, ...extra });
    if (appliedFilters.q) sp.set("q", appliedFilters.q);
    if (appliedFilters.categoryId) sp.set("categoryId", appliedFilters.categoryId);
    return sp;
  }, [appliedFilters, sortOrder]);

  const load = useCallback(async () => {
    setLoading(true);
    const sp = buildParams({ page: String(page), pageSize: String(pageSize) });
    try {
      const r = await fetch(`/api/reports/abc-analysis?${sp.toString()}`);
      if (!r.ok) return;
      const d = await r.json();
      setRows(d.items); setTotal(d.total);
    } finally { setLoading(false); }
  }, [buildParams, page, pageSize]);
  useEffect(() => { load(); }, [load]);

  function applyFilters() { setPage(1); setAppliedFilters({ from, to, q, categoryId }); }
  function resetFilters() { const r = monthRange(); setPreset("month"); setRange(r); setQ(""); setCategoryId(""); setPage(1); setAppliedFilters({ from: r.from, to: r.to, q: "", categoryId: "" }); }
  function applyPreset(key: (typeof PRESETS)[number]["key"]) { setPreset(key); setRange(presetRange(key)); }
  function toggleSort() { setSortOrder((o) => (o === "asc" ? "desc" : "asc")); setPage(1); }
  function exportXlsx() {
    const sp = buildParams({ export: "xlsx" });
    window.open(`/api/reports/abc-analysis?${sp.toString()}`, "_blank");
  }

  const topCategories = categories.filter((c) => !c.parentId);
  const lastIndex = Math.min(page * pageSize, total);
  const firstIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <h1 className="text-2xl font-bold">ABC анализ</h1>

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
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Категория</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="h-9 w-44 rounded-md border bg-background px-2 text-sm">
                <option value="">Все категории</option>
                {topCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Код продукта/название</label>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск" className="h-9 w-56 rounded-md border bg-background px-2 text-sm" />
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
              <th className="px-3 py-2 text-left">Товар</th>
              <th className="px-3 py-2 text-right">Прод. цена</th>
              {visible.cost && <th className="px-3 py-2 text-right">Закуп.цена</th>}
              {visible.markup && <th className="px-3 py-2 text-right">Наценка</th>}
              {visible.qty && <th className="px-3 py-2 text-right">Кол-во продаж</th>}
              {visible.costTotal && <th className="px-3 py-2 text-right">Сумма продаж по с/с</th>}
              {visible.revenue && <th className="px-3 py-2 text-right">Сумма продаж по р/ц</th>}
              {visible.abcRevenue && <th className="px-3 py-2 text-center">АВС по р/ц</th>}
              {visible.profit && <SortableTh label="Прибыль" active order={sortOrder} onClick={toggleSort} />}
              {visible.abcProfit && <th className="px-3 py-2 text-center">АВС по прибыли</th>}
              {visible.summary && <th className="px-3 py-2 text-center">Свод</th>}
              <th className="px-2 py-2 text-right">
                <button ref={columns.anchorRef} onClick={columns.toggle} className="rounded p-1 hover:bg-accent" aria-label="Настроить столбцы">
                  <Settings2 className="h-4 w-4" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">Загрузка…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">Нет данных</td></tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.productId} className="hover:bg-muted/40">
                  <td className="px-3 py-2 text-muted-foreground">{firstIndex + i}</td>
                  <td className="px-3 py-2">{r.productName}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.price)}</td>
                  {visible.cost && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.cost)}</td>}
                  {visible.markup && <td className="px-3 py-2 text-right tabular-nums">{r.markup != null ? `${r.markup.toFixed(2)} %` : "—"}</td>}
                  {visible.qty && <td className="px-3 py-2 text-right tabular-nums">{r.qty}</td>}
                  {visible.costTotal && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.costTotal)}</td>}
                  {visible.revenue && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.revenue)}</td>}
                  {visible.abcRevenue && <td className="px-3 py-2 text-center"><AbcBadge v={r.abcRevenue} /></td>}
                  {visible.profit && <td className={`px-3 py-2 text-right font-medium tabular-nums ${r.profit < 0 ? "text-destructive" : ""}`}>{formatCurrency(r.profit)}</td>}
                  {visible.abcProfit && <td className="px-3 py-2 text-center"><AbcBadge v={r.abcProfit} /></td>}
                  {visible.summary && <td className="px-3 py-2 text-center font-semibold">{r.abcRevenue}{r.abcProfit}</td>}
                  <td></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {columns.open && columns.pos && (
        <AnchoredPopover pos={columns.pos} onClose={columns.close}>
          <p className="mb-1 font-semibold">Видимость столбцов</p>
          <p className="mb-2 text-xs text-muted-foreground">Настройте таблицу под себя и ваш выбор сохранится</p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {([
              ["markup", "Наценка"], ["cost", "Закуп.цена"], ["qty", "Кол-во продаж"],
              ["costTotal", "Сумма продаж по с/с"], ["revenue", "Сумма продаж по р/ц"], ["abcRevenue", "АВС по р/ц"],
              ["profit", "Прибыль"], ["abcProfit", "АВС по прибыли"], ["summary", "Свод"],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 font-normal">
                <input type="checkbox" checked={visible[key]} onChange={(e) => setVisible((v) => ({ ...v, [key]: e.target.checked }))} /> {label}
              </label>
            ))}
          </div>
        </AnchoredPopover>
      )}

      <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} totalPages={totalPages} firstIndex={firstIndex} lastIndex={lastIndex} />
    </div>
  );
}
