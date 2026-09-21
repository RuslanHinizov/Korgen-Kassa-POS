"use client";

import { useCallback, useEffect, useState } from "react";
import { StoreLink as Link } from "@/components/store/store-link";
import { formatCurrency } from "@/lib/utils";
import { ArrowUpDown, ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";

interface ConsRow {
  id: string; documentNo: number; createdAt: string; supplierName: string | null;
  totalAmount: number; paidAmount: number; remainingAmount: number; comment: string | null;
}
type SortBy = "time" | "amount";

const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Закупки → Платежи → Консигнация: posted receipts flagged as consignment, with what is
 * still owed to the supplier. Payments are recorded on the receipt itself. */
export function ConsignmentTab() {
  const [rows, setRows] = useState<ConsRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [docNo, setDocNo] = useState("");
  const [supplier, setSupplier] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("time");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const buildParams = useCallback((extra?: Record<string, string>) => {
    const sp = new URLSearchParams({ isConsignment: "true", status: "POSTED", ...extra });
    if (docNo.trim()) sp.set("documentNo", docNo.trim());
    if (supplier.trim()) sp.set("supplierQuery", supplier.trim());
    return sp;
  }, [docNo, supplier]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/purchase-receipts?${buildParams({ page: String(page), pageSize: String(pageSize) }).toString()}`);
      const d = await r.json();
      setRows(d.receipts ?? []);
      setTotal(d.total ?? 0);
    } finally { setLoading(false); }
  }, [buildParams, page, pageSize]);
  useEffect(() => { load(); }, [load]);

  const sorted = [...rows].sort((a, b) => {
    const diff = sortBy === "amount" ? a.totalAmount - b.totalAmount : +new Date(a.createdAt) - +new Date(b.createdAt);
    return sortOrder === "asc" ? diff : -diff;
  });
  function toggleSort(col: SortBy) {
    if (sortBy === col) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortOrder("desc"); }
  }
  function exportCsv() {
    window.open(`/api/purchase-receipts?${buildParams({ export: "xlsx" }).toString()}`, "_blank");
  }
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Приемка</label>
          <input value={docNo} onChange={(e) => { setDocNo(e.target.value); setPage(1); }} className="h-9 w-48 rounded-md border bg-background px-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Поставщик</label>
          <input value={supplier} onChange={(e) => { setSupplier(e.target.value); setPage(1); }} placeholder="Поиск по названию" className="h-9 w-48 rounded-md border bg-background px-2 text-sm" />
        </div>
        <button onClick={exportCsv} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
          <Download className="h-4 w-4" /> Excel
        </button>
      </div>
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 text-left">Приёмка</th>
              <th className="px-4 py-2.5 text-left"><button onClick={() => toggleSort("time")} className="inline-flex items-center gap-1">Время <ArrowUpDown className="h-3 w-3" /></button></th>
              <th className="px-4 py-2.5 text-left">Поставщик</th>
              <th className="px-4 py-2.5 text-right"><button onClick={() => toggleSort("amount")} className="inline-flex items-center gap-1">Сумма <ArrowUpDown className="h-3 w-3" /></button></th>
              <th className="px-4 py-2.5 text-right">Оплачено</th>
              <th className="px-4 py-2.5 text-right">Осталось</th>
              <th className="px-4 py-2.5 text-left">Комментарий</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Нет данных</td></tr>
            ) : sorted.map((r) => (
              <tr key={r.id} className="hover:bg-muted/40">
                <td className="px-4 py-2.5"><Link href={`/purchases/${r.id}`} className="text-primary hover:underline">№{r.documentNo}</Link></td>
                <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(r.createdAt)}</td>
                <td className="px-4 py-2.5">{r.supplierName ?? "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(r.totalAmount)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(r.paidAmount)}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${r.remainingAmount > 0.009 ? "font-medium text-destructive" : ""}`}>{formatCurrency(r.remainingAmount)}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{r.comment ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded p-1.5 hover:bg-accent disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
          <span className="px-2">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded p-1.5 hover:bg-accent disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="h-8 rounded-md border bg-background px-2 text-sm">
          {[20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
    </>
  );
}
