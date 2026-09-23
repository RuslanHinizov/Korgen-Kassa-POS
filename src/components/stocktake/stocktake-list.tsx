"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StoreLink as Link } from "@/components/store/store-link";
import { useStoreRouter as useRouter } from "@/components/store/use-store-router";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Loader2, PackageOpen, Pencil, Plus, Settings2, SlidersHorizontal, X } from "lucide-react";
import { useAnchoredPopover, AnchoredPopover } from "@/components/ui/anchored-popover";

type Status = "DRAFT" | "COUNTING" | "REVIEWING" | "POSTED" | "CANCELLED";
const STATUS_LABEL: Record<Status, string> = {
  DRAFT: "Черновик", COUNTING: "Подсчёт", REVIEWING: "Проведение", POSTED: "Проведён", CANCELLED: "Отменён",
};
const ALL_STATUSES = Object.keys(STATUS_LABEL) as Status[];
const DEFAULT_STATUSES: Status[] = ["DRAFT", "COUNTING", "REVIEWING", "POSTED"];

interface Row {
  id: string; documentNo: number; status: Status; note: string | null;
  countedAt: string; postedAt: string | null; userName: string; itemCount: number;
}
interface UserOption { id: string; name: string }

function monthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from, to };
}
function toInputDate(d: Date) { return d.toISOString().slice(0, 10); }
function fmtChipDate(d: Date) { return `${d.toLocaleDateString("ru-RU")}, ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`; }
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

export function StocktakeList() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [preset, setPreset] = useState<string | null>("month");
  const [{ from, to }, setRange] = useState(() => monthRange());
  const [statuses, setStatuses] = useState<Status[]>(DEFAULT_STATUSES);
  const [userId, setUserId] = useState("");
  const [comment, setComment] = useState("");
  const [q, setQ] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({ from, to, statuses: DEFAULT_STATUSES, userId: "", comment: "", q: "" });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const filter = useAnchoredPopover();
  const action = useAnchoredPopover();
  const exportMenu = useAnchoredPopover();
  const columns = useAnchoredPopover();
  const [visible, setVisible] = useState({ userName: true, note: true, status: true });

  const buildParams = useCallback((extra?: Record<string, string>) => {
    const sp = new URLSearchParams({ from: appliedFilters.from.toISOString(), to: appliedFilters.to.toISOString(), ...extra });
    if (appliedFilters.statuses.length > 0) sp.set("status", appliedFilters.statuses.join(","));
    if (appliedFilters.userId) sp.set("userId", appliedFilters.userId);
    if (appliedFilters.comment) sp.set("comment", appliedFilters.comment);
    if (appliedFilters.q) sp.set("q", appliedFilters.q);
    return sp;
  }, [appliedFilters]);

  const load = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    const sp = buildParams({ page: String(page), pageSize: String(pageSize) });
    try {
      const r = await fetch(`/api/inventory/stocktakes?${sp}`);
      const d = await r.json();
      setRows(d.stocktakes ?? []);
      setTotal(d.total ?? 0);
      setUsers(d.users ?? []);
    } finally {
      setLoading(false);
    }
  }, [buildParams, page, pageSize]);
  useEffect(() => { load(); }, [load]);

  function applyFilters() { setPage(1); setAppliedFilters({ from, to, statuses, userId, comment, q }); filter.close(); }
  function resetFilters() {
    const r = monthRange();
    setPreset("month"); setRange(r); setStatuses(DEFAULT_STATUSES); setUserId(""); setComment(""); setQ("");
    setPage(1);
    setAppliedFilters({ from: r.from, to: r.to, statuses: DEFAULT_STATUSES, userId: "", comment: "", q: "" });
    filter.close();
  }
  function applyPreset(key: (typeof PRESETS)[number]["key"]) { setPreset(key); setRange(presetRange(key)); }
  function toggleStatus(s: Status) {
    setStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }
  function clearDateRange() {
    const r = monthRange();
    setPreset("month"); setRange(r);
    setPage(1);
    setAppliedFilters((prev) => ({ ...prev, from: r.from, to: r.to }));
  }
  function clearStatusFilter() {
    setStatuses(ALL_STATUSES);
    setPage(1);
    setAppliedFilters((prev) => ({ ...prev, statuses: ALL_STATUSES }));
  }

  async function createDraft() {
    setCreating(true);
    try {
      const r = await fetch("/api/inventory/stocktakes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (!r.ok) { toast.error("Не удалось создать документ"); return; }
      const d = await r.json();
      router.push(`/products/stocktake/${d.stocktake.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    action.close();
    if (!confirm(`Удалить выбранные документы (${selected.size})?`)) return;
    const ids = [...selected];
    const results = await Promise.all(ids.map((id) => fetch(`/api/inventory/stocktakes/${id}`, { method: "DELETE" })));
    const okCount = results.filter((r) => r.ok).length;
    if (okCount < ids.length) toast.error(`Удалено ${okCount} из ${ids.length} — проведённые документы удалить нельзя`);
    else toast.success(`Удалено: ${okCount}`);
    load();
  }

  function toggleSelected(id: string) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function toggleSelectAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  function exportXlsx() {
    exportMenu.close();
    const sp = buildParams({ export: "xlsx" });
    window.open(`/api/inventory/stocktakes?${sp}`, "_blank");
  }

  const commentDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastIndex = Math.min(page * pageSize, total);
  const firstIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const colCount = 2 + Object.values(visible).filter(Boolean).length + 2;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <h1 className="text-2xl font-bold">Инвентаризация</h1>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={createDraft} disabled={creating} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Инвентаризация
        </button>
        <button ref={action.anchorRef} onClick={action.toggle} disabled={selected.size === 0} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent disabled:opacity-50">
          <span className="flex h-5 min-w-5 items-center justify-center rounded bg-muted px-1 text-xs">{selected.size}</span> Действие
        </button>
        <button ref={exportMenu.anchorRef} onClick={exportMenu.toggle} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
          <Download className="h-4 w-4" /> Экспорт
        </button>
        <button ref={filter.anchorRef} onClick={filter.toggle} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
          <SlidersHorizontal className="h-4 w-4" /> Фильтр
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {appliedFilters.statuses.length > 0 && appliedFilters.statuses.length < ALL_STATUSES.length && (
          <div className="inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-muted-foreground">
            Статус документа: {appliedFilters.statuses.map((s) => STATUS_LABEL[s]).join(", ")}
            <button onClick={clearStatusFilter} aria-label="Сбросить статус" className="rounded p-0.5 hover:bg-accent hover:text-foreground"><X className="h-3 w-3" /></button>
          </div>
        )}
        <div className="inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-muted-foreground">
          С {fmtChipDate(appliedFilters.from)} по {fmtChipDate(appliedFilters.to)}
          <button onClick={clearDateRange} aria-label="Сбросить период" className="rounded p-0.5 hover:bg-accent hover:text-foreground"><X className="h-3 w-3" /></button>
        </div>
      </div>

      {action.open && action.pos && (
        <AnchoredPopover pos={action.pos} onClose={action.close} className="w-52 p-1">
          <button onClick={deleteSelected} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-destructive hover:bg-destructive/10">
            Удалить выбранное
          </button>
        </AnchoredPopover>
      )}

      {exportMenu.open && exportMenu.pos && (
        <AnchoredPopover pos={exportMenu.pos} onClose={exportMenu.close} className="w-44 p-1">
          <button onClick={exportXlsx} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent">
            Экспорт в Excel
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
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Пользователи</label>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">Все</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Статус документа</label>
            <div className="space-y-1 rounded-md border p-2">
              {ALL_STATUSES.map((s) => (
                <label key={s} className="flex items-center gap-2 font-normal">
                  <input type="checkbox" checked={statuses.includes(s)} onChange={() => toggleStatus(s)} /> {STATUS_LABEL[s]}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Поиск по комментариям</label>
            <input
              defaultValue={comment}
              onChange={(e) => { const v = e.target.value; if (commentDebounce.current) clearTimeout(commentDebounce.current); commentDebounce.current = setTimeout(() => setComment(v), 300); }}
              placeholder="Введите ключевые слова для поиска по комментариям"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Поиск по штрихкоду и названию</label>
            <input
              defaultValue={q}
              onChange={(e) => { const v = e.target.value; if (qDebounce.current) clearTimeout(qDebounce.current); qDebounce.current = setTimeout(() => setQ(v), 300); }}
              placeholder="Введите штрихкод или название"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            />
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
              <th className="w-10 px-4 py-2.5">
                <input type="checkbox" checked={rows.length > 0 && selected.size === rows.length} onChange={toggleSelectAll} />
              </th>
              <th className="px-4 py-2.5 text-left">Номер инвентаризации</th>
              <th className="px-4 py-2.5 text-left">Дата</th>
              {visible.userName && <th className="px-4 py-2.5 text-left">Имя создателя</th>}
              {visible.note && <th className="px-4 py-2.5 text-left">Комментарий</th>}
              {visible.status && <th className="px-4 py-2.5 text-left">Статус документа</th>}
              <th className="w-16 px-2 py-2 text-right">
                <button ref={columns.anchorRef} onClick={columns.toggle} className="rounded p-1 hover:bg-accent" aria-label="Настроить столбцы">
                  <Settings2 className="h-4 w-4" />
                </button>
              </th>
            </tr>
          </thead>
          {loading ? (
            <tbody><tr><td colSpan={colCount} className="px-3 py-10 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr></tbody>
          ) : rows.length === 0 ? (
            <tbody><tr><td colSpan={colCount} className="px-3 py-14 text-center text-muted-foreground">
              <PackageOpen className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
              <p>Тут пока пусто</p>
            </td></tr></tbody>
          ) : (
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/40">
                  <td className="px-4 py-2.5"><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelected(row.id)} /></td>
                  <td className="px-4 py-2.5">
                    <Link href={`/products/stocktake/${row.id}`} className="font-medium text-primary hover:underline">{row.documentNo}</Link>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{fmtRowDate(row.countedAt)}</td>
                  {visible.userName && <td className="px-4 py-2.5">{row.userName}</td>}
                  {visible.note && <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[12rem]">{row.note ?? ""}</td>}
                  {visible.status && <td className="px-4 py-2.5">{STATUS_LABEL[row.status]}</td>}
                  <td className="px-2 py-2 text-right">
                    <Link href={`/products/stocktake/${row.id}`} className="inline-flex rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Открыть">
                      <Pencil className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>

      {columns.open && columns.pos && (
        <AnchoredPopover pos={columns.pos} onClose={columns.close} className="w-56">
          <p className="mb-1 font-semibold">Видимость столбцов</p>
          <div className="space-y-1.5">
            {(([["userName", "Имя создателя"], ["note", "Комментарий"], ["status", "Статус документа"]] as const)).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 font-normal">
                <input type="checkbox" checked={visible[key]} onChange={(e) => setVisible((v) => ({ ...v, [key]: e.target.checked }))} /> {label}
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
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>На страницу</span>
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="h-8 rounded-md border bg-background px-2 text-sm">
            {[25, 50, 100, 500].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
