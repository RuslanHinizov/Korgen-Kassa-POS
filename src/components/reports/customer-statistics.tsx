"use client";

import { useCallback, useEffect, useState } from "react";
import { StoreLink as Link } from "@/components/store/store-link";
import { formatCurrency } from "@/lib/utils";
import { Download, SlidersHorizontal } from "lucide-react";
import { SortableTh, Pagination } from "./supplier-statistics";

interface Option { id: string; name: string }
interface Row {
  key: string | null; label: string;
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

export function CustomerStatistics() {
  const [filterOpen, setFilterOpen] = useState(false);
  const [preset, setPreset] = useState<string | null>("today");
  const [{ from, to }, setRange] = useState(() => todayRange());
  const [userId, setUserId] = useState("");
  const [users, setUsers] = useState<Option[]>([]);
  const [appliedFilters, setAppliedFilters] = useState({ from, to, userId: "" });

  const [sortField, setSortField] = useState<SortField>("saleAmount");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [totals, setTotals] = useState({ saleAmount: 0, saleCost: 0, returnAmount: 0, returnCost: 0, profit: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/reports/statistics/filters")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setUsers(d.users); });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams({ from: appliedFilters.from.toISOString(), to: appliedFilters.to.toISOString(), sortField, sortOrder, page: String(page), pageSize: String(pageSize) });
    if (appliedFilters.userId) sp.set("userId", appliedFilters.userId);
    try {
      const r = await fetch(`/api/reports/customer-statistics?${sp.toString()}`);
      if (!r.ok) return;
      const d = await r.json();
      setRows(d.items); setTotal(d.total); setTotals(d.totals);
    } finally { setLoading(false); }
  }, [appliedFilters, sortField, sortOrder, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  function applyFilters() { setPage(1); setAppliedFilters({ from, to, userId }); }
  function resetFilters() { const r = todayRange(); setPreset("today"); setRange(r); setUserId(""); setPage(1); setAppliedFilters({ from: r.from, to: r.to, userId: "" }); }
  function applyPreset(key: (typeof PRESETS)[number]["key"]) { setPreset(key); setRange(presetRange(key)); }
  function toggleSort(field: SortField) {
    if (sortField === field) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortOrder("desc"); }
    setPage(1);
  }
  function exportXlsx() {
    const sp = new URLSearchParams({ from: appliedFilters.from.toISOString(), to: appliedFilters.to.toISOString(), sortField, sortOrder, export: "xlsx" });
    if (appliedFilters.userId) sp.set("userId", appliedFilters.userId);
    window.open(`/api/reports/customer-statistics?${sp.toString()}`, "_blank");
  }

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
          <div className="flex flex-wrap items-end gap-3">
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
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Пользователь</label>
              <select value={userId} onChange={(e) => setUserId(e.target.value)} className="h-9 w-44 rounded-md border bg-background px-2 text-sm">
                <option value="">Не выбрано</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
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
              <th></th>
              <th colSpan={3} className="border-b-2 border-primary px-3 py-1.5 text-center uppercase tracking-wide">Продажи</th>
              <th colSpan={3} className="border-b-2 border-destructive px-3 py-1.5 text-center uppercase tracking-wide">Возвраты</th>
              <th colSpan={2}></th>
            </tr>
            <tr className="border-b bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 text-left">Покупатель</th>
              <SortableTh label="Кол-во" active={sortField === "saleQty"} order={sortOrder} onClick={() => toggleSort("saleQty")} />
              <SortableTh label="Сумма продаж, ₸" active={sortField === "saleAmount"} order={sortOrder} onClick={() => toggleSort("saleAmount")} />
              <th className="px-3 py-2 text-right">Сумма себес., ₸</th>
              <SortableTh label="Кол-во" active={sortField === "returnQty"} order={sortOrder} onClick={() => toggleSort("returnQty")} />
              <th className="px-3 py-2 text-right">Сумма возвратов, ₸</th>
              <th className="px-3 py-2 text-right">Сумма себес., ₸</th>
              <SortableTh label="Прибыль, ₸" active={sortField === "profit"} order={sortOrder} onClick={() => toggleSort("profit")} />
              <th className="px-3 py-2 text-right">Рентабельность, %</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">Загрузка…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">Нет данных за выбранный период</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.key ?? "walk-in"} className="hover:bg-muted/40">
                  <td className="px-3 py-2">
                    {r.key ? <Link href={`/customers/${r.key}`} className="text-primary hover:underline">{r.label}</Link> : r.label}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.saleQty}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.saleAmount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.saleCost)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.returnQty}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.returnAmount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.returnCost)}</td>
                  <td className={`px-3 py-2 text-right font-medium tabular-nums ${r.profit < 0 ? "text-destructive" : "text-primary"}`}>{formatCurrency(r.profit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.rentability.toFixed(2)}</td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t bg-muted/30 text-sm font-semibold">
                <td className="px-3 py-2"></td>
                <td></td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.saleAmount)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.saleCost)}</td>
                <td></td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.returnAmount)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.returnCost)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.profit)}</td>
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
