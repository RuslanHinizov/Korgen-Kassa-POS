"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StoreLink as Link } from "@/components/store/store-link";
import { useStoreRouter as useRouter } from "@/components/store/use-store-router";
import { useStoreId } from "@/components/store/store-provider";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Loader2, Pencil, Plus, Settings2, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useAnchoredPopover, AnchoredPopover } from "@/components/ui/anchored-popover";

type Status = "DRAFT" | "POSTED" | "CANCELLED";
const STATUS_LABEL: Record<Status, string> = { DRAFT: "Черновик", POSTED: "Проведён", CANCELLED: "Удалён" };

interface Row {
  id: string; documentNo: number; status: Status; comment: string | null;
  createdAt: string; postedAt: string | null; totalAmount: number; userName: string;
  toStoreName: string; itemCount: number;
}
interface Store { id: string; name: string }
interface UserOption { id: string; name: string }

function monthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from, to };
}
function toInputDate(d: Date) { return d.toISOString().slice(0, 10); }
function fmtChipDate(d: Date) { return d.toLocaleDateString("ru-RU"); }
function fmtRowDate(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("ru-RU")} ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}

const PRESETS = [
  { key: "today", label: "Сегодня" },
  { key: "yesterday", label: "Вчера" },
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

export function StoreTransferList() {
  const router = useRouter();
  const currentStoreId = useStoreId();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [creating, setCreating] = useState(false);
  const [storePicker, setStorePicker] = useState(false);
  const [otherStores, setOtherStores] = useState<Store[]>([]);

  const [preset, setPreset] = useState<string | null>("month");
  const [{ from, to }, setRange] = useState(() => monthRange());
  const [status, setStatus] = useState("");
  const [userId, setUserId] = useState("");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [q, setQ] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({ from, to, status: "", userId: "", q: "" });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const filter = useAnchoredPopover();
  const action = useAnchoredPopover();
  const columns = useAnchoredPopover();
  const [visible, setVisible] = useState({ toStore: true, comment: true });

  const buildParams = useCallback((extra?: Record<string, string>) => {
    const sp = new URLSearchParams({ from: appliedFilters.from.toISOString(), to: appliedFilters.to.toISOString(), ...extra });
    if (appliedFilters.status) sp.set("status", appliedFilters.status);
    if (appliedFilters.userId) sp.set("userId", appliedFilters.userId);
    if (appliedFilters.q) sp.set("q", appliedFilters.q);
    return sp;
  }, [appliedFilters]);

  useEffect(() => {
    fetch("/api/reports/statistics/filters").then((r) => (r.ok ? r.json() : { users: [] })).then((d) => setUsers(d.users ?? [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    const sp = buildParams({ page: String(page), pageSize: String(pageSize) });
    try {
      const r = await fetch(`/api/store-transfers?${sp.toString()}`);
      const d = await r.json();
      setRows(d.transfers ?? []);
      setTotal(d.total ?? 0);
      setTotalAmount(d.totalAmount ?? 0);
    } finally {
      setLoading(false);
    }
  }, [buildParams, page, pageSize]);
  useEffect(() => { load(); }, [load]);

  function applyFilters() { setPage(1); setAppliedFilters({ from, to, status, userId, q }); filter.close(); }
  function resetFilters() {
    const r = monthRange();
    setPreset("month"); setRange(r); setStatus(""); setUserId(""); setQ("");
    setPage(1);
    setAppliedFilters({ from: r.from, to: r.to, status: "", userId: "", q: "" });
    filter.close();
  }
  function applyPreset(key: (typeof PRESETS)[number]["key"]) { setPreset(key); setRange(presetRange(key)); }

  const qDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleQChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setQ(next);
    if (qDebounce.current) clearTimeout(qDebounce.current);
    qDebounce.current = setTimeout(() => { setPage(1); setAppliedFilters((prev) => ({ ...prev, q: next })); }, 400);
  }

  async function openStorePicker() {
    const r = await fetch("/api/stores");
    const d = await r.json();
    setOtherStores((d.stores ?? []).filter((s: Store) => s.id !== currentStoreId));
    setStorePicker(true);
  }

  async function createDraft(toStoreId: string) {
    setCreating(true);
    try {
      const r = await fetch("/api/store-transfers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toStoreId }) });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось создать документ"); return; }
      const d = await r.json();
      router.push(`/products/transfer/${d.transfer.id}`);
    } finally {
      setCreating(false);
      setStorePicker(false);
    }
  }

  async function deleteSelected() {
    if (selected.size === 0) { toast.error("Выберите перемещения для удаления"); return; }
    action.close();
    const ids = [...selected];
    const results = await Promise.all(ids.map((id) => fetch(`/api/store-transfers/${id}`, { method: "DELETE" })));
    const okCount = results.filter((r) => r.ok).length;
    if (okCount === 0) { toast.error("Не удалось удалить (проведённые перемещения нельзя удалить)"); return; }
    toast.success(`Удалено: ${okCount}`);
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
    window.open(`/api/store-transfers?${sp.toString()}`, "_blank");
  }

  const lastIndex = Math.min(page * pageSize, total);
  const firstIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const colCount = 6 + Object.values(visible).filter(Boolean).length;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <h1 className="text-2xl font-bold">Перемещение</h1>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={openStorePicker} disabled={creating} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Перемещение
        </button>
        <button ref={action.anchorRef} onClick={action.toggle} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
          <span className="flex h-5 min-w-5 items-center justify-center rounded bg-muted px-1 text-xs">{selected.size}</span> Действие
        </button>
        <button ref={filter.anchorRef} onClick={filter.toggle} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
          <SlidersHorizontal className="h-4 w-4" /> Фильтр
        </button>
        <div className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground">
          С {fmtChipDate(appliedFilters.from)} по {fmtChipDate(appliedFilters.to)}
          <button onClick={resetFilters} aria-label="Сбросить период" className="rounded p-0.5 hover:bg-accent hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
        </div>
        <button onClick={exportCsv} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
          <Download className="h-4 w-4" /> Экспорт
        </button>
      </div>

      {action.open && action.pos && (
        <AnchoredPopover pos={action.pos} onClose={action.close} className="w-56 p-1">
          <button onClick={deleteSelected} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-destructive hover:bg-destructive/10">
            <Trash2 className="h-3.5 w-3.5" /> Удалить выбранное
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
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">Все</option>
              <option value="DRAFT">Черновик</option>
              <option value="POSTED">Проведён</option>
              <option value="CANCELLED">Удалён</option>
            </select>
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
              <th className="w-10 px-4 py-2.5">
                <input type="checkbox" checked={rows.length > 0 && selected.size === rows.length} onChange={toggleSelectAll} />
              </th>
              <th className="px-4 py-2.5 text-left">Номер</th>
              <th className="px-4 py-2.5 text-left">Дата</th>
              {visible.toStore && <th className="px-4 py-2.5 text-left">В магазин</th>}
              <th className="px-4 py-2.5 text-left">Пользователь</th>
              {visible.comment && <th className="px-4 py-2.5 text-left">Комментарий</th>}
              <th className="px-4 py-2.5 text-left">Статус документа</th>
              <th className="px-4 py-2.5 text-right">Общая сумма</th>
              <th className="w-16 px-2 py-2 text-right">
                <button ref={columns.anchorRef} onClick={columns.toggle} className="rounded p-1 hover:bg-accent" aria-label="Настроить столбцы">
                  <Settings2 className="h-4 w-4" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={colCount} className="px-3 py-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={colCount} className="px-3 py-10 text-center text-muted-foreground">Тут пока пусто</td></tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/40">
                  <td className="px-4 py-2.5"><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelected(row.id)} /></td>
                  <td className="px-4 py-2.5">
                    <Link href={`/products/transfer/${row.id}`} className="font-medium text-primary hover:underline">№{row.documentNo}</Link>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">{fmtRowDate(row.createdAt)}</td>
                  {visible.toStore && <td className="px-4 py-2.5 text-xs">{row.toStoreName}</td>}
                  <td className="px-4 py-2.5 text-xs">{row.userName}</td>
                  {visible.comment && <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[12rem]">{row.comment ?? ""}</td>}
                  <td className="px-4 py-2.5">
                    <span className={row.status === "POSTED" ? "rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary" : row.status === "CANCELLED" ? "rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive" : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"}>
                      {STATUS_LABEL[row.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">{formatCurrency(row.totalAmount)}</td>
                  <td className="px-2 py-2 text-right">
                    <Link href={`/products/transfer/${row.id}`} className="inline-flex rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Открыть">
                      <Pencil className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t bg-muted/30 text-sm font-semibold">
                <td className="px-4 py-2.5" colSpan={visible.toStore ? (visible.comment ? 5 : 4) : (visible.comment ? 4 : 3)}>Итого</td>
                <td></td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(totalAmount)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {columns.open && columns.pos && (
        <AnchoredPopover pos={columns.pos} onClose={columns.close} className="w-56">
          <p className="mb-1 font-semibold">Видимость столбцов</p>
          <div className="space-y-1.5">
            {([["toStore", "В магазин"], ["comment", "Комментарий"]] as const).map(([key, label]) => (
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
        <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="h-8 rounded-md border bg-background px-2 text-sm">
          {[25, 50, 100, 500].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {storePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setStorePicker(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-lg border bg-card p-5 shadow-lg space-y-3">
            <h3 className="text-lg font-semibold">В какой магазин?</h3>
            {otherStores.length === 0 ? (
              <p className="text-sm text-muted-foreground">Других магазинов нет</p>
            ) : (
              <div className="space-y-1.5">
                {otherStores.map((s) => (
                  <button
                    key={s.id} disabled={creating}
                    onClick={() => createDraft(s.id)}
                    className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
