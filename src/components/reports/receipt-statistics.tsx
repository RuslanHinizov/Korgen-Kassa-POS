"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { ChevronDown, ChevronRight, Download, SlidersHorizontal } from "lucide-react";
import { Pagination } from "./supplier-statistics";

interface Option { id: string; name: string }
interface LineItem { id: string; name: string; quantity: number; unit: string; price: number; discountPct: number; total: number }
interface SaleRow {
  id: string; receiptNo: number; createdAt: string; paymentMethod: string;
  total: number; userName: string; items: LineItem[];
}
interface RefundRow { id: string; receiptNo: number; createdAt: string; paymentMethod: string; total: number }

const PAYMENT_LABEL: Record<string, string> = { CASH: "Наличный", CARD: "Безналичный", OTHER: "Другое", CREDIT: "В долг" };

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

export function ReceiptStatistics() {
  const [mode, setMode] = useState<"sales" | "returns">("sales");
  const [filterOpen, setFilterOpen] = useState(false);
  const [preset, setPreset] = useState<string | null>("today");
  const [{ from, to }, setRange] = useState(() => todayRange());
  const [receiptNo, setReceiptNo] = useState("");
  const [q, setQ] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [userId, setUserId] = useState("");
  const [users, setUsers] = useState<Option[]>([]);

  const [appliedFilters, setAppliedFilters] = useState({ from, to, receiptNo: "", q: "", paymentMethods: [] as string[], userId: "" });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [saleRows, setSaleRows] = useState<SaleRow[]>([]);
  const [refundRows, setRefundRows] = useState<RefundRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totals, setTotals] = useState<{ saleAmount?: number; paymentAmount?: number; discountAmount?: number; returnAmount?: number }>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/reports/statistics/filters")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setUsers(d.users); });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setExpanded(null);
    const sp = new URLSearchParams({ mode, from: appliedFilters.from.toISOString(), to: appliedFilters.to.toISOString(), page: String(page), pageSize: String(pageSize) });
    if (appliedFilters.receiptNo) sp.set("receiptNo", appliedFilters.receiptNo);
    if (appliedFilters.q) sp.set("q", appliedFilters.q);
    if (appliedFilters.paymentMethods.length) sp.set("paymentMethods", appliedFilters.paymentMethods.join(","));
    if (appliedFilters.userId) sp.set("userId", appliedFilters.userId);
    try {
      const r = await fetch(`/api/reports/receipt-statistics?${sp.toString()}`);
      if (!r.ok) return;
      const d = await r.json();
      if (mode === "sales") setSaleRows(d.items); else setRefundRows(d.items);
      setTotal(d.total);
      setTotals(d.totals);
    } finally { setLoading(false); }
  }, [mode, appliedFilters, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  function applyFilters() { setPage(1); setAppliedFilters({ from, to, receiptNo, q, paymentMethods, userId }); }
  function resetFilters() {
    const r = todayRange();
    setPreset("today"); setRange(r); setReceiptNo(""); setQ(""); setPaymentMethods([]); setUserId("");
    setPage(1);
    setAppliedFilters({ from: r.from, to: r.to, receiptNo: "", q: "", paymentMethods: [], userId: "" });
  }
  function applyPreset(key: (typeof PRESETS)[number]["key"]) { setPreset(key); setRange(presetRange(key)); }
  function switchMode(next: "sales" | "returns") { setMode(next); setPage(1); }
  function exportXlsx() {
    const sp = new URLSearchParams({ mode, from: appliedFilters.from.toISOString(), to: appliedFilters.to.toISOString(), export: "xlsx" });
    if (appliedFilters.receiptNo) sp.set("receiptNo", appliedFilters.receiptNo);
    if (appliedFilters.q) sp.set("q", appliedFilters.q);
    if (appliedFilters.paymentMethods.length) sp.set("paymentMethods", appliedFilters.paymentMethods.join(","));
    if (appliedFilters.userId) sp.set("userId", appliedFilters.userId);
    window.open(`/api/reports/receipt-statistics?${sp.toString()}`, "_blank");
  }

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleQChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setQ(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); setAppliedFilters((prev) => ({ ...prev, q: next })); }, 400);
  }

  function togglePayment(pm: string) {
    setPaymentMethods((prev) => (prev.includes(pm) ? prev.filter((p) => p !== pm) : [...prev, pm]));
  }

  const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const lastIndex = Math.min(page * pageSize, total);
  const firstIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        {mode === "sales" ? (
          <>
            <StatCard label="Сумма продаж" value={totals.saleAmount ?? 0} />
            <StatCard label="Сумма платежей" value={totals.paymentAmount ?? 0} />
            <StatCard label="Сумма скидок" value={totals.discountAmount ?? 0} />
          </>
        ) : (
          <StatCard label="Сумма возвратов" value={totals.returnAmount ?? 0} />
        )}
      </div>

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
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Номер чека</label>
              <input value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} placeholder="Введите номер чека" className="h-9 w-36 rounded-md border bg-background px-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Название / Штрихкод</label>
              <input value={q} onChange={handleQChange} placeholder="Поиск" className="h-9 w-44 rounded-md border bg-background px-2 text-sm" />
            </div>
            <div className="relative">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Тип оплаты</label>
              <div className="flex h-9 w-44 items-center gap-1 rounded-md border bg-background px-2 text-sm">
                {(Object.keys(PAYMENT_LABEL) as (keyof typeof PAYMENT_LABEL)[]).map((pm) => (
                  <label key={pm} className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={paymentMethods.includes(pm)} onChange={() => togglePayment(pm)} />
                    {PAYMENT_LABEL[pm]}
                  </label>
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

      <div className="flex gap-1">
        <button onClick={() => switchMode("sales")} className={mode === "sales" ? "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" : "rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"}>Продажи</button>
        <button onClick={() => switchMode("returns")} className={mode === "returns" ? "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" : "rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"}>Возвраты</button>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="w-8"></th>
              <th className="px-3 py-2 text-left">Номер чека</th>
              <th className="px-3 py-2 text-left">Дата и время продажи</th>
              <th className="px-3 py-2 text-left">Тип оплаты</th>
              <th className="px-3 py-2 text-right">Сумма, ₸</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Загрузка…</td></tr>
            ) : mode === "sales" ? (
              saleRows.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Нет данных за выбранный период</td></tr>
              ) : saleRows.map((s) => (
                <SaleRowView key={s.id} sale={s} expanded={expanded === s.id} onToggle={() => setExpanded((e) => (e === s.id ? null : s.id))} dateFmt={dateFmt} />
              ))
            ) : refundRows.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Нет данных</td></tr>
            ) : refundRows.map((r) => (
              <tr key={r.id} className="hover:bg-muted/40">
                <td></td>
                <td className="px-3 py-2 font-medium">{r.receiptNo}</td>
                <td className="px-3 py-2 text-muted-foreground">{dateFmt.format(new Date(r.createdAt))}</td>
                <td className="px-3 py-2">{PAYMENT_LABEL[r.paymentMethod] ?? r.paymentMethod}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} totalPages={totalPages} firstIndex={firstIndex} lastIndex={lastIndex} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{formatCurrency(value)}</p>
    </div>
  );
}

function SaleRowView({ sale, expanded, onToggle, dateFmt }: { sale: SaleRow; expanded: boolean; onToggle: () => void; dateFmt: Intl.DateTimeFormat }) {
  return (
    <>
      <tr className={expanded ? "bg-primary/5" : "hover:bg-muted/40"}>
        <td className="px-2 py-2 text-center">
          <button onClick={onToggle} className="rounded p-0.5 hover:bg-accent">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </td>
        <td className="px-3 py-2 font-medium">{sale.receiptNo}</td>
        <td className="px-3 py-2 text-muted-foreground">{dateFmt.format(new Date(sale.createdAt))}</td>
        <td className="px-3 py-2">{PAYMENT_LABEL[sale.paymentMethod] ?? sale.paymentMethod}</td>
        <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(sale.total)}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} className="bg-muted/20 p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-1.5 text-left w-10">#</th>
                  <th className="px-3 py-1.5 text-left">Наименование</th>
                  <th className="px-3 py-1.5 text-right">Количество</th>
                  <th className="px-3 py-1.5 text-right">Цена, ₸</th>
                  <th className="px-3 py-1.5 text-right">Скидка</th>
                  <th className="px-3 py-1.5 text-right">Сумма, ₸</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((it, i) => (
                  <tr key={it.id} className="border-b last:border-0">
                    <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-1.5">{it.name}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{it.quantity} {it.unit}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatCurrency(it.price)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{it.discountPct.toFixed(2)}%</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatCurrency(it.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}
