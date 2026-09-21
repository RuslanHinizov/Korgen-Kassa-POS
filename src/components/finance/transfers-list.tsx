"use client";

import { useCallback, useEffect, useState } from "react";
import { StoreLink as Link } from "@/components/store/store-link";
import { formatCurrency } from "@/lib/utils";
import { useAnchoredPopover, AnchoredPopover } from "@/components/ui/anchored-popover";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, Plus, SlidersHorizontal, Settings2, Download } from "lucide-react";

interface Row { id: string; documentNo: number; createdAt: string; fromAccountName: string; toAccountName: string; amount: number; userName: string; comment: string }
interface Account { id: string; name: string }
interface FilterUser { id: string; name: string }

const COLUMN_DEFS = [
  { key: "fromAccountName", label: "Со счёта" },
  { key: "toAccountName", label: "На счёт" },
  { key: "amount", label: "Сумма" },
  { key: "userName", label: "Пользователь" },
  { key: "comment", label: "Комментарий" },
] as const;
type ColumnKey = typeof COLUMN_DEFS[number]["key"];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function TransfersList() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [userId, setUserId] = useState("");
  const [q, setQ] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({ fromAccountId: "", toAccountId: "", userId: "", q: "" });

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [users, setUsers] = useState<FilterUser[]>([]);
  const [visible, setVisible] = useState<Record<ColumnKey, boolean>>({
    fromAccountName: true, toAccountName: true, amount: true, userName: true, comment: true,
  });

  const filter = useAnchoredPopover();
  const columns = useAnchoredPopover();

  useEffect(() => {
    fetch("/api/finance/accounts").then((r) => r.json()).then((d) => setAccounts(d.accounts ?? []));
    fetch("/api/reports/statistics/filters").then((r) => r.json()).then((d) => setUsers(d.users ?? []));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (appliedFilters.fromAccountId) sp.set("fromAccountId", appliedFilters.fromAccountId);
    if (appliedFilters.toAccountId) sp.set("toAccountId", appliedFilters.toAccountId);
    if (appliedFilters.userId) sp.set("userId", appliedFilters.userId);
    if (appliedFilters.q) sp.set("q", appliedFilters.q);
    try {
      const r = await fetch(`/api/finance/transfers?${sp.toString()}`);
      const d = await r.json();
      setRows(d.transfers ?? []); setTotal(d.total ?? 0); setTotalAmount(d.totalAmount ?? 0);
    } finally { setLoading(false); }
  }, [page, pageSize, appliedFilters]);
  useEffect(() => { load(); }, [load]);

  function applyFilters() {
    setAppliedFilters({ fromAccountId, toAccountId, userId, q });
    setPage(1);
    filter.close();
  }
  function clearFilters() {
    setFromAccountId(""); setToAccountId(""); setUserId(""); setQ("");
    setAppliedFilters({ fromAccountId: "", toAccountId: "", userId: "", q: "" });
    setPage(1);
    filter.close();
  }

  function exportCsv() {
    const sp = new URLSearchParams({ export: "xlsx" });
    if (appliedFilters.fromAccountId) sp.set("fromAccountId", appliedFilters.fromAccountId);
    if (appliedFilters.toAccountId) sp.set("toAccountId", appliedFilters.toAccountId);
    if (appliedFilters.userId) sp.set("userId", appliedFilters.userId);
    if (appliedFilters.q) sp.set("q", appliedFilters.q);
    window.open(`/api/finance/transfers?${sp.toString()}`, "_blank");
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <h1 className="text-lg font-semibold">История переводов</h1>

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/finance/transfers/create" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Перевод
        </Link>
        <button ref={filter.anchorRef} onClick={filter.toggle} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
          <SlidersHorizontal className="h-4 w-4" /> Фильтр
        </button>
        <button onClick={exportCsv} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
          <Download className="h-4 w-4" /> Скачать
        </button>
      </div>

      {filter.open && filter.pos && (
        <AnchoredPopover pos={filter.pos} onClose={filter.close} className="w-80 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Из какого счета</label>
            <select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">Все</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">В какой счет</label>
            <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">Все</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Пользователь</label>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">Выберите пользователей</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Комментарий</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск" className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={clearFilters} className="h-8 rounded-md border px-3 text-xs font-medium hover:bg-accent">Очистить</button>
            <button onClick={applyFilters} className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">Применить</button>
          </div>
        </AnchoredPopover>
      )}

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 text-left">Номер</th>
              <th className="px-3 py-2 text-left">Дата</th>
              {visible.fromAccountName && <th className="px-3 py-2 text-left">Со счёта</th>}
              {visible.toAccountName && <th className="px-3 py-2 text-left">На счёт</th>}
              {visible.amount && <th className="px-3 py-2 text-right">Сумма</th>}
              {visible.userName && <th className="px-3 py-2 text-left">Пользователь</th>}
              {visible.comment && <th className="px-3 py-2 text-left">Комментарий</th>}
              <th className="w-8 px-3 py-2 text-right">
                <button ref={columns.anchorRef} onClick={columns.toggle} className="rounded p-1 hover:bg-accent"><Settings2 className="h-4 w-4" /></button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Нет данных</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/40">
                  <td className="px-3 py-1.5"><Link href={`/finance/transfers/${r.id}`} className="text-primary hover:underline">{r.documentNo}</Link></td>
                  <td className="px-3 py-1.5 text-muted-foreground">{fmtDate(r.createdAt)}</td>
                  {visible.fromAccountName && <td className="px-3 py-1.5">{r.fromAccountName}</td>}
                  {visible.toAccountName && <td className="px-3 py-1.5">{r.toAccountName}</td>}
                  {visible.amount && <td className="px-3 py-1.5 text-right tabular-nums">{formatCurrency(r.amount)}</td>}
                  {visible.userName && <td className="px-3 py-1.5">{r.userName}</td>}
                  {visible.comment && <td className="px-3 py-1.5 text-muted-foreground">{r.comment}</td>}
                  <td></td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t font-medium">
                <td colSpan={visible.fromAccountName && visible.toAccountName ? 4 : 2}></td>
                {visible.amount && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totalAmount)}</td>}
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {columns.open && columns.pos && (
        <AnchoredPopover pos={columns.pos} onClose={columns.close} className="w-56 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Видимость столбцов</p>
          {COLUMN_DEFS.map((c) => (
            <label key={c.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={visible[c.key]} onChange={() => setVisible((v) => ({ ...v, [c.key]: !v[c.key] }))} className="h-4 w-4 accent-primary" />
              {c.label}
            </label>
          ))}
        </AnchoredPopover>
      )}

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1">
          <button disabled={page <= 1} onClick={() => setPage(1)} className="rounded p-1.5 hover:bg-accent disabled:opacity-30"><ChevronsLeft className="h-4 w-4" /></button>
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded p-1.5 hover:bg-accent disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
          <span className="px-2 text-muted-foreground">{total === 0 ? "0-0" : `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, total)}`} / {total}</span>
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
