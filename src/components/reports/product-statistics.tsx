"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Settings2, SlidersHorizontal, X } from "lucide-react";
import { useAnchoredPopover, AnchoredPopover } from "@/components/ui/anchored-popover";

interface Category { id: string; name: string; parentId: string | null }
interface Option { id: string; name: string }

interface Row {
  productId: string | null;
  productName: string;
  barcode: string | null;
  unit: string;
  saleQty: number;
  saleAmount: number;
  saleCost: number;
  returnQty: number;
  returnAmount: number;
  returnCost: number;
  profit: number;
  rentability: number;
  markup: number;
}

type SortField = "saleQty" | "saleAmount" | "returnQty" | "profit";

const COLUMN_DEFS: { key: keyof Row; label: string }[] = [
  { key: "saleQty", label: "Кол-во продажи" },
  { key: "saleAmount", label: "Сумма продаж" },
  { key: "saleCost", label: "Сумма себестоимость продажи" },
  { key: "returnQty", label: "Кол-во возвраты" },
  { key: "returnAmount", label: "Сумма возвраты" },
  { key: "returnCost", label: "Сумма себестоимость возвраты" },
  { key: "profit", label: "Прибыль" },
  { key: "rentability", label: "Рентабельность, %" },
  { key: "markup", label: "Наценка, ₸" },
];

const COLUMN_STORAGE_KEY = "korgen.stats.products.columns";

function todayRange() {
  const now = new Date();
  const from = new Date(now); from.setHours(0, 0, 0, 0);
  const to = new Date(now); to.setHours(23, 59, 59, 999);
  return { from, to };
}
function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

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

export function ProductStatistics() {
  const [filterOpen, setFilterOpen] = useState(false);
  const [preset, setPreset] = useState<string | null>("today");
  const [{ from, to }, setRange] = useState(() => todayRange());
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryIds, setSubcategoryIds] = useState<string[]>([]);
  const [subPanelOpen, setSubPanelOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [userId, setUserId] = useState("");

  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Option[]>([]);
  const [users, setUsers] = useState<Option[]>([]);

  const [appliedFilters, setAppliedFilters] = useState({ from, to, q: "", categoryId: "", subcategoryIds: [] as string[], supplierId: "", userId: "" });

  const [sortField, setSortField] = useState<SortField>("saleAmount");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [totals, setTotals] = useState({ saleAmount: 0, saleCost: 0, returnAmount: 0, returnCost: 0, profit: 0 });
  const [loading, setLoading] = useState(true);

  const columns = useAnchoredPopover();
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => Object.fromEntries(COLUMN_DEFS.map((c) => [c.key, true])));

  function toggleColumn(key: string) {
    setVisibleColumns((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  useEffect(() => {
    (async () => {
      try {
        const saved = localStorage.getItem(COLUMN_STORAGE_KEY);
        if (saved) setVisibleColumns(JSON.parse(saved));
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    fetch("/api/reports/statistics/filters")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setCategories(d.categories); setSuppliers(d.suppliers); setUsers(d.users); } });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams({
      from: appliedFilters.from.toISOString(),
      to: appliedFilters.to.toISOString(),
      sortField,
      sortOrder,
      page: String(page),
      pageSize: String(pageSize),
    });
    if (appliedFilters.q) sp.set("q", appliedFilters.q);
    if (appliedFilters.categoryId) sp.set("categoryId", appliedFilters.categoryId);
    if (appliedFilters.subcategoryIds.length) sp.set("subcategoryIds", appliedFilters.subcategoryIds.join(","));
    if (appliedFilters.supplierId) sp.set("supplierId", appliedFilters.supplierId);
    if (appliedFilters.userId) sp.set("userId", appliedFilters.userId);

    try {
      const r = await fetch(`/api/reports/product-statistics?${sp.toString()}`);
      if (!r.ok) return;
      const d = await r.json();
      setRows(d.items);
      setTotal(d.total);
      setTotals(d.totals);
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, sortField, sortOrder, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  function applyFilters() {
    setPage(1);
    setAppliedFilters({ from, to, q, categoryId, subcategoryIds, supplierId, userId });
  }

  function resetFilters() {
    const r = todayRange();
    setPreset("today");
    setRange(r);
    setQ("");
    setCategoryId("");
    setSubcategoryIds([]);
    setSupplierId("");
    setUserId("");
    setPage(1);
    setAppliedFilters({ from: r.from, to: r.to, q: "", categoryId: "", subcategoryIds: [], supplierId: "", userId: "" });
  }

  function applyPreset(key: (typeof PRESETS)[number]["key"]) {
    setPreset(key);
    setRange(presetRange(key));
  }

  function toggleSort(field: SortField) {
    if (sortField === field) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortOrder("desc"); }
    setPage(1);
  }

  const topCategories = useMemo(() => categories.filter((c) => !c.parentId), [categories]);
  const subCategories = useMemo(() => categories.filter((c) => c.parentId === categoryId), [categories, categoryId]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setQ(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      setAppliedFilters((prev) => ({ ...prev, q: next }));
    }, 400);
  }

  function download() {
    const sp = new URLSearchParams({
      from: appliedFilters.from.toISOString(),
      to: appliedFilters.to.toISOString(),
      sortField,
      sortOrder,
      export: "xlsx",
    });
    if (appliedFilters.q) sp.set("q", appliedFilters.q);
    if (appliedFilters.categoryId) sp.set("categoryId", appliedFilters.categoryId);
    if (appliedFilters.subcategoryIds.length) sp.set("subcategoryIds", appliedFilters.subcategoryIds.join(","));
    if (appliedFilters.supplierId) sp.set("supplierId", appliedFilters.supplierId);
    if (appliedFilters.userId) sp.set("userId", appliedFilters.userId);
    window.open(`/api/reports/product-statistics?${sp.toString()}`, "_blank");
  }

  const lastIndex = Math.min(page * pageSize, total);
  const firstIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const col = (key: string) => visibleColumns[key] !== false;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setFilterOpen((o) => !o)}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent"
        >
          <SlidersHorizontal className="h-4 w-4" /> Фильтр
        </button>
        <button onClick={download} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
          <Download className="h-4 w-4" /> Excel
        </button>
      </div>

      {filterOpen && (
        <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Период</label>
              <div className="flex items-center gap-2">
                <input
                  type="date" value={toInputDate(from)}
                  onChange={(e) => { setPreset(null); setRange((r) => ({ ...r, from: new Date(e.target.value + "T00:00:00") })); }}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                />
                <span className="text-muted-foreground">—</span>
                <input
                  type="date" value={toInputDate(to)}
                  onChange={(e) => { setPreset(null); setRange((r) => ({ ...r, to: new Date(e.target.value + "T23:59:59") })); }}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                />
              </div>
              <div className="mt-1 flex gap-2 text-xs">
                {PRESETS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => applyPreset(p.key)}
                    className={preset === p.key ? "font-semibold text-primary underline" : "text-primary hover:underline"}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Название / Штрихкод</label>
              <input
                value={q} onChange={handleSearchChange} placeholder="Поиск"
                className="h-9 w-48 rounded-md border bg-background px-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Категория</label>
              <select
                value={categoryId}
                onChange={(e) => { setCategoryId(e.target.value); setSubcategoryIds([]); }}
                className="h-9 w-40 rounded-md border bg-background px-2 text-sm"
              >
                <option value="">Не выбрано</option>
                {topCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="relative">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Подкатегория</label>
              <button
                type="button" disabled={!categoryId || subCategories.length === 0}
                onClick={() => setSubPanelOpen((o) => !o)}
                className="flex h-9 w-48 items-center justify-between rounded-md border bg-background px-2 text-sm disabled:opacity-50"
              >
                <span>{subcategoryIds.length} Выбрано</span>
                {subcategoryIds.length > 0 ? (
                  <X className="h-3.5 w-3.5" onClick={(e) => { e.stopPropagation(); setSubcategoryIds([]); }} />
                ) : <span className="text-muted-foreground">Выберите</span>}
              </button>
              {subPanelOpen && subCategories.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-48 w-48 overflow-y-auto rounded-md border bg-popover p-2 shadow-md">
                  {subCategories.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent">
                      <input
                        type="checkbox" checked={subcategoryIds.includes(c.id)}
                        onChange={(e) => setSubcategoryIds((prev) => (e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)))}
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Поставщик</label>
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="h-9 w-40 rounded-md border bg-background px-2 text-sm">
                <option value="">Не выбрано</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">ОФД</label>
              <select disabled className="h-9 w-28 rounded-md border bg-background px-2 text-sm text-muted-foreground">
                <option>Все</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Точка продаж POS (счета)</label>
              <select disabled className="h-9 w-40 rounded-md border bg-background px-2 text-sm text-muted-foreground">
                <option>Все</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Пользователь</label>
              <select value={userId} onChange={(e) => setUserId(e.target.value)} className="h-9 w-44 rounded-md border bg-background px-2 text-sm">
                <option value="">Не выбрано</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Консультант</label>
              <select disabled className="h-9 w-28 rounded-md border bg-background px-2 text-sm text-muted-foreground">
                <option>Все</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-4 pt-1">
            <button onClick={applyFilters} className="inline-flex h-9 items-center rounded-md border border-primary px-4 text-sm font-medium text-primary hover:bg-primary/10">
              Применить
            </button>
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
              <th></th>
            </tr>
            <tr className="border-b bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 text-left">Название товара</th>
              <th className="px-3 py-2 text-left">Штрихкод</th>
              <th className="px-3 py-2 text-left">Ед. изм</th>
              {col("saleQty") && <SortableTh label="Кол-во" active={sortField === "saleQty"} order={sortOrder} onClick={() => toggleSort("saleQty")} />}
              {col("saleAmount") && <SortableTh label="Сумма продаж, ₸" active={sortField === "saleAmount"} order={sortOrder} onClick={() => toggleSort("saleAmount")} />}
              {col("saleCost") && <th className="px-3 py-2 text-right">Сумма себес., ₸</th>}
              {col("returnQty") && <SortableTh label="Кол-во" active={sortField === "returnQty"} order={sortOrder} onClick={() => toggleSort("returnQty")} />}
              {col("returnAmount") && <th className="px-3 py-2 text-right">Сумма возвратов, ₸</th>}
              {col("returnCost") && <th className="px-3 py-2 text-right">Сумма себес., ₸</th>}
              {col("markup") && <th className="px-3 py-2 text-right">Наценка, ₸</th>}
              {col("rentability") && <th className="px-3 py-2 text-right">Рентабельность, %</th>}
              {col("profit") && <SortableTh label="Прибыль, ₸" active={sortField === "profit"} order={sortOrder} onClick={() => toggleSort("profit")} />}
              <th className="px-2 py-2 text-right">
                <button ref={columns.anchorRef} onClick={columns.toggle} className="rounded p-1 hover:bg-accent" aria-label="Настроить столбцы">
                  <Settings2 className="h-4 w-4" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={13} className="px-3 py-8 text-center text-muted-foreground">Загрузка…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={13} className="px-3 py-8 text-center text-muted-foreground">Нет данных за выбранный период</td></tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.productId ?? i} className="hover:bg-muted/40">
                  <td className="px-3 py-2">{r.productName}</td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">{r.barcode ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.unit}</td>
                  {col("saleQty") && <td className="px-3 py-2 text-right tabular-nums">{r.saleQty}</td>}
                  {col("saleAmount") && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.saleAmount)}</td>}
                  {col("saleCost") && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.saleCost)}</td>}
                  {col("returnQty") && <td className="px-3 py-2 text-right tabular-nums">{r.returnQty}</td>}
                  {col("returnAmount") && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.returnAmount)}</td>}
                  {col("returnCost") && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.returnCost)}</td>}
                  {col("markup") && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.markup)}</td>}
                  {col("rentability") && <td className="px-3 py-2 text-right tabular-nums">{r.rentability.toFixed(2)}</td>}
                  {col("profit") && <td className={`px-3 py-2 text-right font-medium tabular-nums ${r.profit < 0 ? "text-destructive" : "text-primary"}`}>{formatCurrency(r.profit)}</td>}
                  <td></td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t bg-muted/30 text-sm font-semibold">
                <td className="px-3 py-2" colSpan={3}></td>
                {col("saleQty") && <td></td>}
                {col("saleAmount") && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.saleAmount)}</td>}
                {col("saleCost") && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.saleCost)}</td>}
                {col("returnQty") && <td></td>}
                {col("returnAmount") && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.returnAmount)}</td>}
                {col("returnCost") && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.returnCost)}</td>}
                {col("markup") && <td></td>}
                {col("rentability") && <td></td>}
                {col("profit") && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.profit)}</td>}
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {columns.open && columns.pos && (
        <AnchoredPopover pos={columns.pos} onClose={columns.close} className="w-64">
          <p className="mb-1 font-semibold">Видимость столбцов</p>
          <p className="mb-2 text-xs text-muted-foreground">Настройте таблицу под себя и ваш выбор сохранится</p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {COLUMN_DEFS.map((c) => (
              <label key={c.key} className="flex items-center gap-2 font-normal">
                <input type="checkbox" checked={col(c.key)} onChange={() => toggleColumn(c.key)} />
                {c.label}
              </label>
            ))}
          </div>
        </AnchoredPopover>
      )}

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1">
          <button disabled={page <= 1} onClick={() => setPage(1)} className="rounded p-1.5 hover:bg-accent disabled:opacity-30"><ChevronsLeft className="h-4 w-4" /></button>
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded p-1.5 hover:bg-accent disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
          <span className="px-2 text-muted-foreground">{firstIndex}-{lastIndex} / {total}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded p-1.5 hover:bg-accent disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
          <button disabled={page >= totalPages} onClick={() => setPage(totalPages)} className="rounded p-1.5 hover:bg-accent disabled:opacity-30"><ChevronsRight className="h-4 w-4" /></button>
        </div>
        <select
          value={pageSize}
          onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
          className="h-8 rounded-md border bg-background px-2 text-sm"
        >
          {[25, 50, 100, 500].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
    </div>
  );
}

function SortableTh({ label, active, order, onClick }: { label: string; active: boolean; order: "asc" | "desc"; onClick: () => void }) {
  return (
    <th className="px-3 py-2 text-right">
      <button onClick={onClick} className={`inline-flex items-center gap-1 ${active ? "text-primary" : ""}`}>
        {label}
        <ArrowUpDown className={`h-3 w-3 ${active && order === "asc" ? "rotate-180" : ""}`} />
      </button>
    </th>
  );
}
