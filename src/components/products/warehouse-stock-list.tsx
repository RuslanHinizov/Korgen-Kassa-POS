"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, Search } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { unitLabel } from "@/lib/units";

interface Row {
  id: string; name: string; barcode: string | null; additionalCode: string | null;
  stock: number; price: number; unit: string; saleValue: number;
}

/** Товары → Склад — UMAG's read-only stock report for Складской работник: quantities
 * and sale price only, no purchase cost or markup (see /api/products/stock). */
export function WarehouseStockList() {
  const [rows, setRows] = useState<Row[]>([]);
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const sp = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (q) sp.set("q", q);
    fetch(`/api/products/stock?${sp}`)
      .then((r) => (r.ok ? r.json() : { rows: [], count: 0, total: 0 }))
      .then((d) => { setRows(d.rows ?? []); setCount(d.count ?? 0); setTotal(d.total ?? 0); })
      .finally(() => setLoading(false));
  }, [q, page, pageSize]);
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Склад</h1>
        <button onClick={() => window.open(`/api/products/stock?export=xlsx${q ? `&q=${encodeURIComponent(q)}` : ""}`, "_blank")} className="hover:bg-accent inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium">
          <Download className="h-4 w-4" /> Скачать
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Название товара, штрихкод, доп. код" className="bg-background h-9 w-full rounded-md border pl-9 pr-3 text-sm" />
      </div>

      <div className="bg-card overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground border-b text-xs font-medium">
              <th className="px-3 py-2.5 text-left">Название товара</th>
              <th className="px-3 py-2.5 text-left">Штрихкод</th>
              <th className="px-3 py-2.5 text-left">Доп. код</th>
              <th className="px-3 py-2.5 text-right">Кол-во</th>
              <th className="px-3 py-2.5 text-right">Продажная цена</th>
              <th className="px-3 py-2.5 text-right">Сумма по продажной</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={6} className="text-muted-foreground px-3 py-8 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="text-muted-foreground px-3 py-8 text-center">Нет данных</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/40">
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="text-muted-foreground px-3 py-2">{r.barcode ?? ""}</td>
                  <td className="text-muted-foreground px-3 py-2">{r.additionalCode ?? ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.stock} {unitLabel(r.unit, true)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.price)}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{formatCurrency(r.saleValue)}</td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t font-medium">
                <td colSpan={5} className="px-3 py-2 text-right">Итого</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          {count === 0 ? "0" : `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, count)}`} / {count}
        </span>
        <div className="flex items-center gap-3">
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="bg-background h-9 rounded-md border px-2 text-sm">
            {[25, 50, 100, 500].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || loading} className="hover:bg-accent inline-flex h-9 items-center gap-1 rounded-md border px-3 disabled:opacity-40">
            <ChevronLeft className="h-3.5 w-3.5" /> Назад
          </button>
          <span>{page} из {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages || loading} className="hover:bg-accent inline-flex h-9 items-center gap-1 rounded-md border px-3 disabled:opacity-40">
            Вперёд <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
