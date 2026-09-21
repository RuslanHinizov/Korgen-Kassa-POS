"use client";

import { useCallback, useEffect, useState } from "react";
import { StoreLink as Link } from "@/components/store/store-link";
import { formatCurrency } from "@/lib/utils";
import { useAnchoredPopover, AnchoredPopover } from "@/components/ui/anchored-popover";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, Plus, Minus, SlidersHorizontal, Settings2, Printer } from "lucide-react";

interface Row {
  id: string; kind: "payment" | "receipt" | "return"; documentNo: number; createdAt: string;
  counterparty: string; userName: string; purpose: string; amountOut: number; amountIn: number;
  accountName: string; comment: string;
}
interface ExpenseType { id: string; name: string; active: boolean }
interface FilterUser { id: string; name: string }

const COLUMN_DEFS = [
  { key: "counterparty", label: "Контрагент" },
  { key: "userName", label: "Пользователь" },
  { key: "purpose", label: "Назначение платежа" },
  { key: "amountOut", label: "Сумма расхода" },
  { key: "amountIn", label: "Сумма прихода" },
  { key: "accountName", label: "Счет" },
  { key: "comment", label: "Комментарий" },
] as const;
type ColumnKey = typeof COLUMN_DEFS[number]["key"];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function PaymentsList() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [totalOut, setTotalOut] = useState(0);
  const [totalIn, setTotalIn] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [direction, setDirection] = useState<"" | "IN" | "OUT">("");
  const [expenseTypeId, setExpenseTypeId] = useState("");
  const [userId, setUserId] = useState("");
  const [q, setQ] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({ direction: "" as "" | "IN" | "OUT", expenseTypeId: "", userId: "", q: "" });

  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [users, setUsers] = useState<FilterUser[]>([]);
  const [visible, setVisible] = useState<Record<ColumnKey, boolean>>({
    counterparty: true, userName: true, purpose: true, amountOut: true, amountIn: true, accountName: true, comment: true,
  });

  const filter = useAnchoredPopover();
  const columns = useAnchoredPopover();

  useEffect(() => {
    fetch("/api/finance/expense-types").then((r) => r.json()).then((d) => setExpenseTypes(d.expenseTypes ?? []));
    fetch("/api/reports/statistics/filters").then((r) => r.json()).then((d) => setUsers(d.users ?? []));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (appliedFilters.direction) sp.set("direction", appliedFilters.direction);
    if (appliedFilters.expenseTypeId) sp.set("expenseTypeId", appliedFilters.expenseTypeId);
    if (appliedFilters.userId) sp.set("userId", appliedFilters.userId);
    if (appliedFilters.q) sp.set("q", appliedFilters.q);
    try {
      const r = await fetch(`/api/finance/payments?${sp.toString()}`);
      const d = await r.json();
      setRows(d.payments ?? []); setTotal(d.total ?? 0); setTotalOut(d.totalOut ?? 0); setTotalIn(d.totalIn ?? 0);
    } finally { setLoading(false); }
  }, [page, pageSize, appliedFilters]);
  useEffect(() => { load(); }, [load]);

  function applyFilters() {
    setAppliedFilters({ direction, expenseTypeId, userId, q });
    setPage(1);
    filter.close();
  }
  function clearFilters() {
    setDirection(""); setExpenseTypeId(""); setUserId(""); setQ("");
    setAppliedFilters({ direction: "", expenseTypeId: "", userId: "", q: "" });
    setPage(1);
    filter.close();
  }

  function exportCsv() {
    const sp = new URLSearchParams({ export: "xlsx" });
    if (appliedFilters.direction) sp.set("direction", appliedFilters.direction);
    if (appliedFilters.expenseTypeId) sp.set("expenseTypeId", appliedFilters.expenseTypeId);
    if (appliedFilters.userId) sp.set("userId", appliedFilters.userId);
    if (appliedFilters.q) sp.set("q", appliedFilters.q);
    window.open(`/api/finance/payments?${sp.toString()}`, "_blank");
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <h1 className="text-lg font-semibold">Платежи</h1>

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/finance/payments/create/in" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Приход
        </Link>
        <Link href="/finance/payments/create/out" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-destructive/50 px-3 text-sm font-medium text-destructive hover:bg-destructive/10">
          <Minus className="h-4 w-4" /> Расход
        </Link>
        <button ref={filter.anchorRef} onClick={filter.toggle} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
          <SlidersHorizontal className="h-4 w-4" /> Фильтр
        </button>
        <button onClick={exportCsv} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
          <Printer className="h-4 w-4" /> Печать
        </button>
      </div>

      {filter.open && filter.pos && (
        <AnchoredPopover pos={filter.pos} onClose={filter.close} className="w-80 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Тип документа</label>
            <select value={direction} onChange={(e) => setDirection(e.target.value as "" | "IN" | "OUT")} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">Все</option>
              <option value="OUT">Расход</option>
              <option value="IN">Приход</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Типы расходов</label>
            <select value={expenseTypeId} onChange={(e) => setExpenseTypeId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">Все</option>
              {expenseTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Пользователь</label>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">Пользователь</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Имя/Наименование контрагента</label>
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
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Дата</th>
              {visible.counterparty && <th className="px-3 py-2 text-left">Контрагент</th>}
              {visible.userName && <th className="px-3 py-2 text-left">Пользователь</th>}
              {visible.purpose && <th className="px-3 py-2 text-left">Назначение платежа</th>}
              {visible.amountOut && <th className="px-3 py-2 text-right">Сумма расхода</th>}
              {visible.amountIn && <th className="px-3 py-2 text-right">Сумма прихода</th>}
              {visible.accountName && <th className="px-3 py-2 text-left">Счет</th>}
              {visible.comment && <th className="px-3 py-2 text-left">Комментарий</th>}
              <th className="w-8 px-3 py-2 text-right">
                <button ref={columns.anchorRef} onClick={columns.toggle} className="rounded p-1 hover:bg-accent"><Settings2 className="h-4 w-4" /></button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">Тут пока пусто</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/40">
                  <td className="px-3 py-1.5">
                    {r.kind === "payment" ? <Link href={`/finance/payments/${r.id}`} className="text-primary hover:underline">{r.documentNo}</Link> : r.documentNo}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">{fmtDate(r.createdAt)}</td>
                  {visible.counterparty && <td className="px-3 py-1.5">{r.counterparty}</td>}
                  {visible.userName && <td className="px-3 py-1.5">{r.userName}</td>}
                  {visible.purpose && <td className="px-3 py-1.5">{r.purpose}</td>}
                  {visible.amountOut && <td className="px-3 py-1.5 text-right tabular-nums text-destructive">{r.amountOut ? formatCurrency(r.amountOut) : ""}</td>}
                  {visible.amountIn && <td className="px-3 py-1.5 text-right tabular-nums text-primary">{r.amountIn ? formatCurrency(r.amountIn) : ""}</td>}
                  {visible.accountName && <td className="px-3 py-1.5 text-muted-foreground">{r.accountName}</td>}
                  {visible.comment && <td className="px-3 py-1.5 text-muted-foreground">{r.comment}</td>}
                  <td></td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t font-medium">
                <td colSpan={visible.counterparty && visible.userName && visible.purpose ? 5 : 2}></td>
                {visible.amountOut && <td className="px-3 py-2 text-right tabular-nums text-destructive">{formatCurrency(totalOut)}</td>}
                {visible.amountIn && <td className="px-3 py-2 text-right tabular-nums text-primary">{formatCurrency(totalIn)}</td>}
                <td colSpan={2}></td>
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
