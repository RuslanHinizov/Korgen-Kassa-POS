"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { Download, Settings2 } from "lucide-react";
import { Pagination } from "./supplier-statistics";
import { useAnchoredPopover, AnchoredPopover } from "@/components/ui/anchored-popover";

interface Row { key: string; label: string; purchases: number; expenses: number; investments: number; dividends: number }

export function CashFlowReport() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const columns = useAnchoredPopover();
  const [visible, setVisible] = useState({ investments: true, dividends: true });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/reports/cash-flow?page=${page}&pageSize=${pageSize}`);
      if (!r.ok) return;
      const d = await r.json();
      setRows(d.items); setTotal(d.total);
    } finally { setLoading(false); }
  }, [page, pageSize]);
  useEffect(() => { load(); }, [load]);

  function exportXlsx() {
    window.open("/api/reports/cash-flow?export=xlsx", "_blank");
  }

  const lastIndex = Math.min(page * pageSize, total);
  const firstIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <h1 className="text-2xl font-bold">Движение денег</h1>

      <button onClick={exportXlsx} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
        <Download className="h-4 w-4" /> Excel
      </button>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 text-left"></th>
              <th className="px-3 py-2 text-right">Закупы</th>
              <th className="px-3 py-2 text-right">Расходы</th>
              {visible.investments && <th className="px-3 py-2 text-right">Вложения</th>}
              {visible.dividends && <th className="px-3 py-2 text-right">Дивиденды</th>}
              <th className="px-2 py-2 text-right">
                <button ref={columns.anchorRef} onClick={columns.toggle} className="rounded p-1 hover:bg-accent" aria-label="Настроить столбцы">
                  <Settings2 className="h-4 w-4" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Загрузка…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">По данному фильтру ничего не найдено</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.key} className="hover:bg-muted/40">
                  <td className="px-3 py-2 text-muted-foreground">{r.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.purchases)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.expenses)}</td>
                  {visible.investments && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.investments)}</td>}
                  {visible.dividends && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.dividends)}</td>}
                  <td></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {columns.open && columns.pos && (
        <AnchoredPopover pos={columns.pos} onClose={columns.close} className="w-52">
          <p className="mb-1 font-semibold">Видимость столбцов</p>
          <p className="mb-2 text-xs text-muted-foreground">Настройте таблицу под себя и ваш выбор сохранится</p>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 font-normal">
              <input type="checkbox" checked={visible.investments} onChange={(e) => setVisible((v) => ({ ...v, investments: e.target.checked }))} /> Вложения
            </label>
            <label className="flex items-center gap-2 font-normal">
              <input type="checkbox" checked={visible.dividends} onChange={(e) => setVisible((v) => ({ ...v, dividends: e.target.checked }))} /> Дивиденды
            </label>
          </div>
        </AnchoredPopover>
      )}

      <Pagination page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} totalPages={totalPages} firstIndex={firstIndex} lastIndex={lastIndex} />

      <p className="text-xs text-muted-foreground">
        «Закупы» — платежи поставщикам. «Расходы» и «Дивиденды» — Расход в Финансы → Платежи (Дивиденды — платежи с назначением «Дивиденды»). «Вложения» — Приход в Финансы → Платежи.
      </p>
    </div>
  );
}
