"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StoreLink as Link } from "@/components/store/store-link";
import { useStoreRouter as useRouter } from "@/components/store/use-store-router";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Loader2, Plus, Settings2, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useAnchoredPopover, AnchoredPopover } from "@/components/ui/anchored-popover";

interface Row {
  id: string; documentNo: number; status: "DRAFT" | "POSTED" | "DELETED"; stockInDate: string;
  note: string | null; totalCost: number; userName: string; itemCount: number;
}
interface UserOption { id: string; name: string }

const STATUS_LABEL: Record<Row["status"], string> = { DRAFT: "Черновик", POSTED: "Проведён", DELETED: "Удалён" };
const STATUS_BADGE: Record<Row["status"], string> = {
  DRAFT: "bg-muted text-muted-foreground",
  POSTED: "bg-primary/10 text-primary",
  DELETED: "bg-destructive/10 text-destructive",
};

function monthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from, to };
}
function toInputDate(d: Date) { return d.toISOString().slice(0, 10); }
function dayKey(iso: string) { return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "long" }); }
function fmtChipDate(d: Date) { return d.toLocaleDateString("ru-RU"); }
function fmtRowDate(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("ru-RU")} ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}

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

const STATUS_OPTIONS = [
  { key: "DRAFT", label: "Черновик" },
  { key: "POSTED", label: "Проведён" },
  { key: "DELETED", label: "Удалён" },
] as const;

export function StockInList() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [totalCost, setTotalCost] = useState(0);
  const [creating, setCreating] = useState(false);

  const [preset, setPreset] = useState<string | null>("month");
  const [{ from, to }, setRange] = useState(() => monthRange());
  const [statuses, setStatuses] = useState<Row["status"][]>(["DRAFT", "POSTED"]);
  const [userId, setUserId] = useState("");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [q, setQ] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({ from, to, statuses, userId: "", q: "" });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupByDay, setGroupByDay] = useState(true);
  const filter = useAnchoredPopover();
  const action = useAnchoredPopover();
  const columns = useAnchoredPopover();
  const [visible, setVisible] = useState({ user: true, status: true, comment: true });

  useEffect(() => {
    fetch("/api/reports/statistics/filters").then((r) => (r.ok ? r.json() : { users: [] })).then((d) => setUsers(d.users ?? [])).catch(() => {});
  }, []);

  const buildParams = useCallback((extra?: Record<string, string>) => {
    const sp = new URLSearchParams({ from: appliedFilters.from.toISOString(), to: appliedFilters.to.toISOString(), ...extra });
    if (appliedFilters.statuses.length > 0) sp.set("status", appliedFilters.statuses.join(","));
    if (appliedFilters.userId) sp.set("userId", appliedFilters.userId);
    if (appliedFilters.q) sp.set("q", appliedFilters.q);
    return sp;
  }, [appliedFilters]);

  const load = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    const sp = buildParams({ page: String(page), pageSize: String(pageSize) });
    try {
      const r = await fetch(`/api/stock-in?${sp.toString()}`);
      const d = await r.json();
      setRows(d.stockIns ?? []);
      setTotal(d.total ?? 0);
      setTotalCost(d.totalCost ?? 0);
    } finally {
      setLoading(false);
    }
  }, [buildParams, page, pageSize]);
  useEffect(() => { load(); }, [load]);

  function applyFilters() { setPage(1); setAppliedFilters({ from, to, statuses, userId, q }); filter.close(); }
  function resetFilters() {
    const r = monthRange();
    setPreset("month"); setRange(r); setStatuses(["DRAFT", "POSTED"]); setUserId(""); setQ("");
    setPage(1);
    setAppliedFilters({ from: r.from, to: r.to, statuses: ["DRAFT", "POSTED"], userId: "", q: "" });
    filter.close();
  }
  function applyPreset(key: (typeof PRESETS)[number]["key"]) { setPreset(key); setRange(presetRange(key)); }
  function toggleStatus(key: Row["status"]) {
    setStatuses((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]));
  }

  async function createDraft() {
    setCreating(true);
    try {
      const r = await fetch("/api/stock-in", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (!r.ok) { toast.error("Не удалось создать документ"); return; }
      const d = await r.json();
      router.push(`/products/stock-in/${d.stockIn.id}`);
    } finally { setCreating(false); }
  }

  async function deleteSelected() {
    if (selected.size === 0) { toast.error("Выберите документы"); return; }
    if (!confirm(`Удалить ${selected.size} черновик(ов)?`)) return;
    action.close();
    const ids = [...selected];
    const results = await Promise.all(ids.map((id) => fetch(`/api/stock-in/${id}`, { method: "DELETE" })));
    const okCount = results.filter((r) => r.ok).length;
    if (okCount < ids.length) toast.error(`Удалено: ${okCount} из ${ids.length} (проведённые нельзя удалить)`);
    else toast.success(`Удалено: ${okCount}`);
    load();
  }

  function toggleSelected(id: string) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function toggleSelectAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  function exportCsv() {
    const sp = buildParams({ export: "xlsx" });
    window.open(`/api/stock-in?${sp.toString()}`, "_blank");
  }

  const qDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleQChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setQ(next);
    if (qDebounce.current) clearTimeout(qDebounce.current);
    qDebounce.current = setTimeout(() => { setPage(1); setAppliedFilters((prev) => ({ ...prev, q: next })); }, 400);
  }

  const groups = useMemo(() => {
    if (!groupByDay) return [["", rows]] as [string, Row[]][];
    const map = new Map<string, Row[]>();
    for (const row of rows) {
      const key = dayKey(row.stockInDate);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return [...map.entries()];
  }, [rows, groupByDay]);

  const lastIndex = Math.min(page * pageSize, total);
  const firstIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const colCount = 4 + Object.values(visible).filter(Boolean).length;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/products" className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-accent transition-colors">
          <ArrowLeft className="h-4 w-4" /> Товары
        </Link>
        <h1 className="text-2xl font-bold">Оприходование</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={createDraft} disabled={creating} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Оприходование
        </button>
        <button ref={action.anchorRef} onClick={action.toggle} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent disabled:opacity-50" disabled={selected.size === 0}>
          <span className="flex h-5 min-w-5 items-center justify-center rounded bg-muted px-1 text-xs">{selected.size}</span> Действие
        </button>
        <button ref={filter.anchorRef} onClick={filter.toggle} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
          <SlidersHorizontal className="h-4 w-4" /> Фильтр
        </button>
        <div className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground">
          С {fmtChipDate(appliedFilters.from)} по {fmtChipDate(appliedFilters.to)}
          <button onClick={resetFilters} aria-label="Сбросить период" className="rounded p-0.5 hover:bg-accent hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
        </div>
        {appliedFilters.statuses.length > 0 && appliedFilters.statuses.length < 3 && (
          <div className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground">
            Статус документа: {appliedFilters.statuses.map((s) => STATUS_LABEL[s]).join(", ")}
          </div>
        )}
        <button onClick={exportCsv} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
          <Download className="h-4 w-4" /> Экспорт
        </button>
      </div>

      {action.open && action.pos && (
        <AnchoredPopover pos={action.pos} onClose={action.close} className="w-52 p-1">
          <button onClick={deleteSelected} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-destructive hover:bg-destructive/10">
            <Trash2 className="h-3.5 w-3.5" /> Удалить выбранные
          </button>
        </AnchoredPopover>
      )}

      {filter.open && filter.pos && (
        <AnchoredPopover pos={filter.pos} onClose={filter.close} className="w-80 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Дата создания</label>
            <div className="flex gap-2 text-xs mb-1.5 flex-wrap">
              {PRESETS.map((p) => (
                <button key={p.key} onClick={() => applyPreset(p.key)} className={preset === p.key ? "font-semibold text-primary underline" : "text-primary hover:underline"}>{p.label}</button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input type="date" value={toInputDate(from)} onChange={(e) => { setPreset(null); setRange((r) => ({ ...r, from: new Date(e.target.value + "T00:00:00") })); }} className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
              <span className="text-muted-foreground">—</span>
              <input type="date" value={toInputDate(to)} onChange={(e) => { setPreset(null); setRange((r) => ({ ...r, to: new Date(e.target.value + "T23:59:59") })); }} className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Статус документа</label>
            <div className="flex flex-wrap gap-3">
              {STATUS_OPTIONS.map((s) => (
                <label key={s.key} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={statuses.includes(s.key)} onChange={() => toggleStatus(s.key)} className="h-3.5 w-3.5 accent-primary" /> {s.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Пользователь</label>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">Выберите пользователя</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Поиск по штрихкоду и названию</label>
            <input value={q} onChange={handleQChange} placeholder="Введите штрихкод или название" className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button onClick={resetFilters} className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium hover:bg-accent">Очистить</button>
            <button onClick={applyFilters} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Применить</button>
          </div>
        </AnchoredPopover>
      )}

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="w-10 px-4 py-2.5"><input type="checkbox" checked={rows.length > 0 && selected.size === rows.length} onChange={toggleSelectAll} className="h-4 w-4 accent-primary" /></th>
              <th className="px-4 py-2.5 text-left">Номер</th>
              <th className="px-4 py-2.5 text-left">Дата</th>
              {visible.status && <th className="px-4 py-2.5 text-left">Статус документа</th>}
              {visible.user && <th className="px-4 py-2.5 text-left">Пользователь</th>}
              {visible.comment && <th className="px-4 py-2.5 text-left">Комментарий</th>}
              <th className="px-4 py-2.5 text-right">Общая сумма ₸</th>
              <th className="w-8 px-2 py-2 text-right">
                <button ref={columns.anchorRef} onClick={columns.toggle} className="rounded p-1 hover:bg-accent" aria-label="Настроить столбцы"><Settings2 className="h-4 w-4" /></button>
              </th>
            </tr>
          </thead>
          {loading ? (
            <tbody><tr><td colSpan={colCount} className="px-3 py-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr></tbody>
          ) : rows.length === 0 ? (
            <tbody><tr><td colSpan={colCount} className="px-3 py-10 text-center text-muted-foreground">Тут пока пусто</td></tr></tbody>
          ) : (
            groups.map(([day, dayRows]) => {
              const dayTotal = dayRows.reduce((s, r) => s + r.totalCost, 0);
              return (
                <tbody key={day || "flat"}>
                  {dayRows.map((row) => (
                    <tr key={row.id} className="hover:bg-muted/40 border-b">
                      <td className="px-4 py-2.5"><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelected(row.id)} className="h-4 w-4 accent-primary" /></td>
                      <td className="px-4 py-2.5"><Link href={`/products/stock-in/${row.id}`} className="font-medium text-primary hover:underline">№{row.documentNo}</Link></td>
                      <td className="px-4 py-2.5 text-muted-foreground">{fmtRowDate(row.stockInDate)}</td>
                      {visible.status && <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[row.status]}`}>{STATUS_LABEL[row.status]}</span></td>}
                      {visible.user && <td className="px-4 py-2.5">{row.userName}</td>}
                      {visible.comment && <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[12rem]">{row.note ?? ""}</td>}
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums">{formatCurrency(row.totalCost)}</td>
                      <td />
                    </tr>
                  ))}
                  {groupByDay && (
                    <tr className="bg-muted/30 text-xs font-medium text-muted-foreground">
                      <td colSpan={colCount - 1} className="px-3 py-1.5">Итого {day}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{formatCurrency(dayTotal)}</td>
                    </tr>
                  )}
                </tbody>
              );
            })
          )}
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t bg-muted/30 text-sm font-semibold">
                <td className="px-4 py-2.5" colSpan={colCount - 1}>Итого</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(totalCost)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {columns.open && columns.pos && (
        <AnchoredPopover pos={columns.pos} onClose={columns.close} className="w-56">
          <p className="mb-1 font-semibold">Видимость столбцов</p>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 font-normal">
              <input type="checkbox" checked={groupByDay} onChange={(e) => setGroupByDay(e.target.checked)} /> По дням
            </label>
            <label className="flex items-center gap-2 font-normal">
              <input type="checkbox" checked={visible.user} onChange={(e) => setVisible((v) => ({ ...v, user: e.target.checked }))} /> Пользователь
            </label>
            <label className="flex items-center gap-2 font-normal">
              <input type="checkbox" checked={visible.status} onChange={(e) => setVisible((v) => ({ ...v, status: e.target.checked }))} /> Статус документа
            </label>
            <label className="flex items-center gap-2 font-normal">
              <input type="checkbox" checked={visible.comment} onChange={(e) => setVisible((v) => ({ ...v, comment: e.target.checked }))} /> Комментарий
            </label>
          </div>
        </AnchoredPopover>
      )}

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1">
          <button disabled={page <= 1} onClick={() => setPage(1)} className="rounded p-1.5 hover:bg-accent disabled:opacity-30"><ChevronsLeft className="h-4 w-4" /></button>
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded p-1.5 hover:bg-accent disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
          <span className="px-2 text-muted-foreground tabular-nums">{firstIndex}-{lastIndex} / {total}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded p-1.5 hover:bg-accent disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
          <button disabled={page >= totalPages} onClick={() => setPage(totalPages)} className="rounded p-1.5 hover:bg-accent disabled:opacity-30"><ChevronsRight className="h-4 w-4" /></button>
        </div>
        <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="h-8 rounded-md border bg-background px-2 text-sm">
          {[25, 50, 100, 500].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
    </div>
  );
}
