"use client";

import { useCallback, useEffect, useState } from "react";
import { StoreLink as Link } from "@/components/store/store-link";
import { formatCurrency } from "@/lib/utils";
import { ConsignmentTab } from "./consignment-tab";
import { ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Loader2 } from "lucide-react";

interface Row {
  id: string; kind: "receipt" | "return"; docId: string; docNo: number;
  supplierName: string; userName: string; amount: number; createdAt: string; accountName: string;
}

const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

type SortBy = "time" | "amount";

export function PurchaseReceiptPayments() {
  const [tab, setTab] = useState<"payments" | "consignment">("payments");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("time");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sortBy, sortOrder });
    if (q.trim()) sp.set("q", q.trim());
    try {
      const r = await fetch(`/api/purchase-receipts/payments?${sp.toString()}`);
      const d = await r.json();
      setRows(d.payments ?? []);
      setTotal(d.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, q, sortBy, sortOrder]);
  useEffect(() => { if (tab === "payments") load(); }, [load, tab]);

  function toggleSort(col: SortBy) {
    if (sortBy === col) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortOrder("desc"); }
  }
  function exportXlsx() {
    const sp = new URLSearchParams({ sortBy, sortOrder, export: "xlsx" });
    if (q.trim()) sp.set("q", q.trim());
    window.open(`/api/purchase-receipts/payments?${sp.toString()}`, "_blank");
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1).slice(Math.max(0, page - 3), Math.max(0, page - 3) + 5);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex gap-6 border-b text-sm font-medium">
        <button onClick={() => setTab("payments")} className={`pb-2 -mb-px border-b-2 ${tab === "payments" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Платежи</button>
        <button onClick={() => setTab("consignment")} className={`pb-2 -mb-px border-b-2 ${tab === "consignment" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Консигнация</button>
      </div>

      {tab === "consignment" ? (
        <ConsignmentTab />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Приемка</label>
              <input
                value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
                placeholder="" className="h-9 w-48 rounded-md border bg-background px-2 text-sm"
              />
            </div>
            <button onClick={exportXlsx} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
              <Download className="h-4 w-4" /> Excel
            </button>
          </div>

          <div className="rounded-lg border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 text-left">
                    <button onClick={() => toggleSort("time")} className={`inline-flex items-center gap-1 ${sortBy === "time" ? "text-primary" : ""}`}>
                      Время <ArrowUpDown className={`h-3 w-3 ${sortBy === "time" && sortOrder === "asc" ? "rotate-180" : ""}`} />
                    </button>
                  </th>
                  <th className="px-4 py-2.5 text-left">Приёмка</th>
                  <th className="px-4 py-2.5 text-left">Со счета</th>
                  <th className="px-4 py-2.5 text-left">Поставщик</th>
                  <th className="px-4 py-2.5 text-left">Пользователь</th>
                  <th className="px-4 py-2.5 text-right">
                    <button onClick={() => toggleSort("amount")} className={`inline-flex items-center gap-1 ${sortBy === "amount" ? "text-primary" : ""}`}>
                      Сумма <ArrowUpDown className={`h-3 w-3 ${sortBy === "amount" && sortOrder === "asc" ? "rotate-180" : ""}`} />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Нет данных</td></tr>
                ) : (
                  rows.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/40">
                      <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(p.createdAt)}</td>
                      <td className="px-4 py-2.5">
                        <Link href={p.kind === "receipt" ? `/purchases/${p.docId}` : `/purchases/returns/${p.docId}`} className="text-primary hover:underline">№{p.docNo}</Link>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{p.accountName}</td>
                      <td className="px-4 py-2.5">{p.supplierName}</td>
                      <td className="px-4 py-2.5">{p.userName}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${p.amount < 0 ? "text-destructive" : ""}`}>{formatCurrency(p.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-1">
              <button disabled={page <= 1} onClick={() => setPage(1)} className="rounded p-1.5 hover:bg-accent disabled:opacity-30"><ChevronsLeft className="h-4 w-4" /></button>
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded p-1.5 hover:bg-accent disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
              {pageNumbers.map((n) => (
                <button key={n} onClick={() => setPage(n)} className={`min-w-8 rounded px-2 py-1 ${n === page ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>{n}</button>
              ))}
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded p-1.5 hover:bg-accent disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
              <button disabled={page >= totalPages} onClick={() => setPage(totalPages)} className="rounded p-1.5 hover:bg-accent disabled:opacity-30"><ChevronsRight className="h-4 w-4" /></button>
            </div>
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="h-8 rounded-md border bg-background px-2 text-sm">
              {[20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </>
      )}
    </div>
  );
}

