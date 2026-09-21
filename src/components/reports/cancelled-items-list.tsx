"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StoreLink as Link } from "@/components/store/store-link";
import { Download, Settings2, SlidersHorizontal } from "lucide-react";
import { Pagination } from "./supplier-statistics";
import { useAnchoredPopover, AnchoredPopover } from "@/components/ui/anchored-popover";

interface Row {
  id: string; productId: string | null; productName: string;
  beforeQty: number; afterQty: number | null; reason: string | null;
  createdAt: string; userName: string; cashboxName: string | null;
}
interface CashboxOption { id: string; name: string }

function todayRange() {
  const now = new Date();
  const from = new Date(now); from.setHours(0, 0, 0, 0);
  const to = new Date(now); to.setHours(23, 59, 59, 999);
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

export function CancelledItemsList() {
  const [filterOpen, setFilterOpen] = useState(false);
  const [preset, setPreset] = useState<string | null>("today");
  const [{ from, to }, setRange] = useState(() => todayRange());
  const [q, setQ] = useState("");
  const [cashboxId, setCashboxId] = useState("");
  const [cashboxes, setCashboxes] = useState<CashboxOption[]>([]);
  const [appliedFilters, setAppliedFilters] = useState({ from, to, q: "", cashboxId: "" });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const columns = useAnchoredPopover();
  const [visible, setVisible] = useState({ time: true, quantity: true });

  useEffect(() => {
    fetch("/api/management/cashboxes")
      .then((r) => (r.ok ? r.json() : { cashboxes: [] }))
      .then((d) => setCashboxes(d.cashboxes ?? []))
      .catch(() => {});
  }, []);

  const buildParams = useCallback((extra?: Record<string, string>) => {
    const sp = new URLSearchParams({ from: appliedFilters.from.toISOString(), to: appliedFilters.to.toISOString(), ...extra });
    if (appliedFilters.q) sp.set("q", appliedFilters.q);
    if (appliedFilters.cashboxId) sp.set("cashboxId", appliedFilters.cashboxId);
    return sp;
  }, [appliedFilters]);

  const load = useCallback(async () => {
    setLoading(true);
    const sp = buildParams({ page: String(page), pageSize: String(pageSize) });
    try {
      const r = await fetch(`/api/reports/cancelled-items?${sp.toString()}`);
      if (!r.ok) return;
      const d = await r.json();
      setRows(d.items); setTotal(d.total);
    } finally { setLoading(false); }
  }, [buildParams, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  function applyFilters() { setPage(1); setAppliedFilters({ from, to, q, cashboxId }); }
  function resetFilters() { const r = todayRange(); setPreset("today"); setRange(r); setQ(""); setCashboxId(""); setPage(1); setAppliedFilters({ from: r.from, to: r.to, q: "", cashboxId: "" }); }
  function applyPreset(key: (typeof PRESETS)[number]["key"]) { setPreset(key); setRange(presetRange(key)); }
  function exportXlsx() {
    const sp = buildParams({ export: "xlsx" });
    window.open(`/api/reports/cancelled-items?${sp.toString()}`, "_blank");
  }

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleQChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setQ(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); setAppliedFilters((prev) => ({ ...prev, q: next })); }, 400);
  }

  const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timeFmt = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const lastIndex = Math.min(page * pageSize, total);
  const firstIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <h1 className="text-2xl font-bold">Отменённые товары</h1>

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
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Касса</label>
              <select value={cashboxId} onChange={(e) => setCashboxId(e.target.value)} className="h-9 w-40 rounded-md border bg-background px-2 text-sm">
                <option value="">Все</option>
                {cashboxes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Название товара</label>
              <input value={q} onChange={handleQChange} placeholder="Введите название" className="h-9 w-56 rounded-md border bg-background px-2 text-sm" />
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
            <tr className="border-b bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 text-left">Касса</th>
              <th className="px-3 py-2 text-left">Кассир</th>
              <th className="px-3 py-2 text-left">Название товара</th>
              {visible.time && <th className="px-3 py-2 text-left">Время</th>}
              {visible.quantity && <th className="px-3 py-2 text-right">Количество</th>}
              <th className="px-2 py-2 text-right">
                <button ref={columns.anchorRef} onClick={columns.toggle} className="rounded p-1 hover:bg-accent" aria-label="Настроить столбцы">
                  <Settings2 className="h-4 w-4" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Загрузка…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Нет данных</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/40">
                  <td className="px-3 py-2 text-muted-foreground">{r.cashboxName ?? "—"}</td>
                  <td className="px-3 py-2">{r.userName}</td>
                  <td className="px-3 py-2">
                    {r.productId ? (
                      <Link href={`/products/${r.productId}/edit`} className="text-primary hover:underline">{r.productName}</Link>
                    ) : r.productName}
                  </td>
                  {visible.time && <td className="px-3 py-2 text-muted-foreground">{dateFmt.format(new Date(r.createdAt))} | {timeFmt.format(new Date(r.createdAt))}</td>}
                  {visible.quantity && (
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.afterQty != null ? (
                        <span><span className="text-primary">{r.beforeQty}</span> → <span className="text-destructive">{r.afterQty}</span>шт.</span>
                      ) : (
                        <span className="text-destructive">{r.beforeQty}шт.</span>
                      )}
                    </td>
                  )}
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
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 font-normal">
              <input type="checkbox" checked={visible.time} onChange={(e) => setVisible((v) => ({ ...v, time: e.target.checked }))} /> Время
            </label>
            <label className="flex items-center gap-2 font-normal">
              <input type="checkbox" checked={visible.quantity} onChange={(e) => setVisible((v) => ({ ...v, quantity: e.target.checked }))} /> Количество
            </label>
          </div>
        </AnchoredPopover>
      )}

      <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} totalPages={totalPages} firstIndex={firstIndex} lastIndex={lastIndex} />
    </div>
  );
}
