"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StoreLink as Link } from "@/components/store/store-link";
import { useStoreRouter as useRouter } from "@/components/store/use-store-router";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Loader2, Plus, Settings2, SlidersHorizontal, Trash2 } from "lucide-react";
import { useAnchoredPopover, AnchoredPopover } from "@/components/ui/anchored-popover";

interface Row {
  id: string; documentNo: number; status: "DRAFT" | "POSTED"; createdAt: string;
  customerName: string | null; comment: string | null;
  totalAmount: number; paidAmount: number; remainingAmount: number;
}
interface Option { id: string; name: string }

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

export function CustomerReturnList() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [total, setTotal] = useState(0);
  const [totals, setTotals] = useState({ totalAmount: 0, paidAmount: 0, remainingAmount: 0 });

  const [filterOpen, setFilterOpen] = useState(false);
  const [preset, setPreset] = useState<string | null>("month");
  const [{ from, to }, setRange] = useState(() => monthRange());
  const [userId, setUserId] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<Option[]>([]);
  const [appliedFilters, setAppliedFilters] = useState({ from, to, userId: "", customerQuery: "", q: "" });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const action = useAnchoredPopover();
  const columns = useAnchoredPopover();
  const [visible, setVisible] = useState({ customer: true, status: true, total: true, paid: true, remaining: true, comment: true });

  useEffect(() => {
    fetch("/api/reports/statistics/filters")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setUsers(d.users); });
  }, []);

  const buildParams = useCallback((extra?: Record<string, string>) => {
    const sp = new URLSearchParams({ from: appliedFilters.from.toISOString(), to: appliedFilters.to.toISOString(), ...extra });
    if (appliedFilters.userId) sp.set("userId", appliedFilters.userId);
    if (appliedFilters.customerQuery) sp.set("customerQuery", appliedFilters.customerQuery);
    if (appliedFilters.q) sp.set("q", appliedFilters.q);
    return sp;
  }, [appliedFilters]);

  const load = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    const sp = buildParams({ page: String(page), pageSize: String(pageSize) });
    try {
      const r = await fetch(`/api/customer-returns?${sp.toString()}`);
      const d = await r.json();
      setRows(d.returns ?? []);
      setTotal(d.total ?? 0);
      setTotals(d.totals ?? { totalAmount: 0, paidAmount: 0, remainingAmount: 0 });
    } finally {
      setLoading(false);
    }
  }, [buildParams, page, pageSize]);
  useEffect(() => { load(); }, [load]);

  function applyFilters() { setPage(1); setAppliedFilters({ from, to, userId, customerQuery, q }); }
  function resetFilters() {
    const r = monthRange();
    setPreset("month"); setRange(r); setUserId(""); setCustomerQuery(""); setQ("");
    setPage(1);
    setAppliedFilters({ from: r.from, to: r.to, userId: "", customerQuery: "", q: "" });
  }
  function applyPreset(key: (typeof PRESETS)[number]["key"]) { setPreset(key); setRange(presetRange(key)); }

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleQChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setQ(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); setAppliedFilters((prev) => ({ ...prev, q: next })); }, 400);
  }

  async function createDraft() {
    setCreating(true);
    try {
      const r = await fetch("/api/customer-returns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (!r.ok) { toast.error("Не удалось создать документ"); return; }
      const d = await r.json();
      router.push(`/sales/returns/${d.customerReturn.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function deleteDraft(id: string) {
    if (!confirm("Удалить черновик возврата?")) return;
    const r = await fetch(`/api/customer-returns/${id}`, { method: "DELETE" });
    if (!r.ok) { toast.error("Не удалось удалить"); return; }
    load();
  }

  async function deleteSelectedDrafts() {
    const draftIds = rows.filter((r) => selected.has(r.id) && r.status === "DRAFT").map((r) => r.id);
    if (draftIds.length === 0) { toast.error("Выберите черновики для удаления"); return; }
    if (!confirm(`Удалить ${draftIds.length} черновик(ов)?`)) return;
    action.close();
    await Promise.all(draftIds.map((id) => fetch(`/api/customer-returns/${id}`, { method: "DELETE" })));
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
    window.open(`/api/customer-returns?${sp.toString()}`, "_blank");
  }

  const lastIndex = Math.min(page * pageSize, total);
  const firstIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/sales" className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-accent transition-colors">
          <ArrowLeft className="h-4 w-4" /> Продажи
        </Link>
        <h1 className="text-2xl font-bold">Возврат покупателей</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={createDraft} disabled={creating} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Возврат
        </button>
        <button onClick={() => setFilterOpen((o) => !o)} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
          <SlidersHorizontal className="h-4 w-4" /> Фильтр
        </button>
        <button ref={action.anchorRef} onClick={action.toggle} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
          <span className="flex h-5 min-w-5 items-center justify-center rounded bg-muted px-1 text-xs">{selected.size}</span> Действие
        </button>
        <button onClick={exportCsv} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
          <Download className="h-4 w-4" /> Экспорт
        </button>
      </div>

      {action.open && action.pos && (
        <AnchoredPopover pos={action.pos} onClose={action.close} className="w-52 p-1">
          <button onClick={deleteSelectedDrafts} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-destructive hover:bg-destructive/10">
            <Trash2 className="h-3.5 w-3.5" /> Удалить выбранное
          </button>
        </AnchoredPopover>
      )}

      {filterOpen && (
        <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Дата создания</label>
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
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Поиск по пользователям</label>
              <select value={userId} onChange={(e) => setUserId(e.target.value)} className="h-9 w-44 rounded-md border bg-background px-2 text-sm">
                <option value="">Выберите пользователя</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Контрагент</label>
              <input value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} placeholder="Поиск по покупателям" className="h-9 w-44 rounded-md border bg-background px-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Поиск по товару или штрихкоду</label>
              <input value={q} onChange={handleQChange} placeholder="Введите название или штрихкод" className="h-9 w-56 rounded-md border bg-background px-2 text-sm" />
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
              <th className="w-10 px-3 py-2">
                <input type="checkbox" checked={rows.length > 0 && selected.size === rows.length} onChange={toggleSelectAll} />
              </th>
              <th className="px-3 py-2 text-left">Номер</th>
              <th className="px-3 py-2 text-left">Дата</th>
              {visible.customer && <th className="px-3 py-2 text-left">Контрагент</th>}
              {visible.status && <th className="px-3 py-2 text-left">Статус</th>}
              {visible.total && <th className="px-3 py-2 text-right">Сумма, ₸</th>}
              {visible.paid && <th className="px-3 py-2 text-right">Оплачено, ₸</th>}
              {visible.remaining && <th className="px-3 py-2 text-right">Осталось, ₸</th>}
              {visible.comment && <th className="px-3 py-2 text-left">Комментарий</th>}
              <th className="w-16 px-2 py-2 text-right">
                <button ref={columns.anchorRef} onClick={columns.toggle} className="rounded p-1 hover:bg-accent" aria-label="Настроить столбцы">
                  <Settings2 className="h-4 w-4" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">
                <p className="font-medium text-foreground">Тут пока пусто</p>
                <p>Создайте новый документ</p>
              </td></tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/40">
                  <td className="px-3 py-2"><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelected(row.id)} /></td>
                  <td className="px-3 py-2">
                    <Link href={`/sales/returns/${row.id}`} className="font-medium text-primary hover:underline">№{row.documentNo}</Link>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{new Date(row.createdAt).toLocaleDateString("ru-RU")}</td>
                  {visible.customer && <td className="px-3 py-2">{row.customerName ?? "Розничный покупатель"}</td>}
                  {visible.status && (
                    <td className="px-3 py-2">
                      <span className={row.status === "POSTED" ? "rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary" : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"}>
                        {row.status === "POSTED" ? "Проведён" : "Черновик"}
                      </span>
                    </td>
                  )}
                  {visible.total && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(row.totalAmount)}</td>}
                  {visible.paid && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(row.paidAmount)}</td>}
                  {visible.remaining && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(row.remainingAmount)}</td>}
                  {visible.comment && <td className="px-3 py-2 text-muted-foreground truncate max-w-[12rem]">{row.comment ?? ""}</td>}
                  <td className="px-2 py-2 text-right">
                    {row.status === "DRAFT" && (
                      <button onClick={() => deleteDraft(row.id)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Удалить">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30 text-sm font-semibold">
              <td className="px-3 py-2" colSpan={3}>Итого</td>
              {visible.customer && <td></td>}
              {visible.status && <td></td>}
              {visible.total && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.totalAmount)}</td>}
              {visible.paid && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.paidAmount)}</td>}
              {visible.remaining && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totals.remainingAmount)}</td>}
              {visible.comment && <td></td>}
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {columns.open && columns.pos && (
        <AnchoredPopover pos={columns.pos} onClose={columns.close} className="w-52">
          <p className="mb-1 font-semibold">Видимость столбцов</p>
          <p className="mb-2 text-xs text-muted-foreground">Настройте таблицу под себя и ваш выбор сохранится</p>
          <div className="space-y-1.5">
            {([
              ["customer", "Контрагент"], ["status", "Статус"], ["total", "Сумма"],
              ["paid", "Оплачено"], ["remaining", "Осталось"], ["comment", "Комментарий"],
            ] as const).map(([key, label]) => (
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
    </div>
  );
}
