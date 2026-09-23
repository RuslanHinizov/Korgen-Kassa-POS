"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatCurrency } from "@/lib/utils";
import { ShiftReportModal } from "@/components/pos/shift-bar";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Settings2, SlidersHorizontal } from "lucide-react";
import { useAnchoredPopover, AnchoredPopover } from "@/components/ui/anchored-popover";

interface Shift {
  id: string; userName: string; openedAt: string; closedAt: string | null; status: "OPEN" | "CLOSED";
  openingFloat: number; cashIn: number; cashOut: number; countedCash: number | null; difference: number | null; profit: number;
}
interface Option { id: string; name: string }

function weekRange() {
  const now = new Date();
  const from = new Date(now); from.setDate(from.getDate() - 6); from.setHours(0, 0, 0, 0);
  const to = new Date(now); to.setHours(23, 59, 59, 999);
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

export default function ShiftsPage() {
  const t = useTranslations("shift");
  const tc = useTranslations("common");
  const locale = useLocale();

  const [filterOpen, setFilterOpen] = useState(false);
  const [preset, setPreset] = useState<string | null>("week");
  const [{ from, to }, setRange] = useState(() => weekRange());
  const [userId, setUserId] = useState("");
  const [users, setUsers] = useState<Option[]>([]);
  const [appliedFilters, setAppliedFilters] = useState({ from, to, userId: "" });

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewId, setViewId] = useState<string | null>(null);
  const columns = useAnchoredPopover();
  const [showProfit, setShowProfit] = useState(true);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    fetch("/api/reports/statistics/filters")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setUsers(d.users); });
  }, []);

  const buildParams = useCallback((extra?: Record<string, string>) => {
    const sp = new URLSearchParams({ scope: "all", from: appliedFilters.from.toISOString(), to: appliedFilters.to.toISOString(), ...extra });
    if (appliedFilters.userId) sp.set("userId", appliedFilters.userId);
    return sp;
  }, [appliedFilters]);

  const load = useCallback(async () => {
    setLoading(true);
    const sp = buildParams();
    try {
      const r = await fetch(`/api/shifts?${sp.toString()}`);
      const d = r.ok ? await r.json() : { shifts: [] };
      setShifts(d.shifts ?? []);
    } finally {
      setLoading(false);
    }
  }, [buildParams]);
  useEffect(() => { load(); }, [load]);

  function applyFilters() { setPage(1); setAppliedFilters({ from, to, userId }); }
  function resetFilters() { const r = weekRange(); setPreset("week"); setRange(r); setUserId(""); setPage(1); setAppliedFilters({ from: r.from, to: r.to, userId: "" }); }
  function applyPreset(key: (typeof PRESETS)[number]["key"]) { setPreset(key); setRange(presetRange(key)); }
  function exportXlsx() {
    const sp = buildParams({ export: "xlsx" });
    window.open(`/api/shifts?${sp.toString()}`, "_blank");
  }

  const total = shifts.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageRows = shifts.slice((page - 1) * pageSize, page * pageSize);
  const firstIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastIndex = Math.min(page * pageSize, total);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

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
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("cashier")}</label>
              <select value={userId} onChange={(e) => setUserId(e.target.value)} className="h-9 w-44 rounded-md border bg-background px-2 text-sm">
                <option value="">Все</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-4 pt-1">
            <button onClick={applyFilters} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Применить</button>
            <button onClick={resetFilters} className="text-sm text-muted-foreground hover:underline">Очистить</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground py-10 text-center">{tc("loading")}</p>
      ) : shifts.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-muted-foreground text-sm">
          {t("none")}
        </div>
      ) : (
        <>
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr className="text-xs text-muted-foreground uppercase font-medium">
                  <th className="px-4 py-3 text-left">Касса</th>
                  <th className="px-4 py-3 text-left">{t("cashier")}</th>
                  <th className="px-4 py-3 text-left">Время открытия</th>
                  <th className="px-4 py-3 text-left">Время закрытия</th>
                  <th className="px-4 py-3 text-right">Н. Остаток</th>
                  <th className="px-4 py-3 text-right">Приход</th>
                  <th className="px-4 py-3 text-right">Расход</th>
                  <th className="px-4 py-3 text-right">К. Остаток</th>
                  <th className="px-4 py-3 text-right">{t("difference")}</th>
                  {showProfit && <th className="px-4 py-3 text-right">Прибыль</th>}
                  <th className="px-4 py-3 text-right">
                    <button ref={columns.anchorRef} onClick={columns.toggle} className="rounded p-1 hover:bg-accent" aria-label="Настроить столбцы">
                      <Settings2 className="h-4 w-4" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pageRows.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setViewId(s.id)}>
                    <td className="px-4 py-3 text-muted-foreground">Касса-1</td>
                    <td className="px-4 py-3">{s.userName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(s.openedAt).toLocaleString(locale)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.closedAt ? new Date(s.closedAt).toLocaleString(locale) : "Не закрыта"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(s.openingFloat)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-primary">{formatCurrency(s.cashIn)}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${s.cashOut > 0 ? "text-destructive" : ""}`}>{formatCurrency(s.cashOut)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{s.countedCash != null ? formatCurrency(s.countedCash) : "-"}</td>
                    <td className={`px-4 py-3 text-right tabular-nums font-medium ${s.difference == null ? "" : Math.abs(s.difference) < 0.005 ? "text-primary" : "text-destructive"}`}>
                      {s.difference == null ? "-" : formatCurrency(s.difference)}
                    </td>
                    {showProfit && <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(s.profit)}</td>}
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setViewId(s.id)} className="text-xs text-primary hover:underline">
                          {t(s.status === "OPEN" ? "x_report" : "z_report")}
                        </button>
                        <button
                          onClick={() => window.open(`/api/reports/full-export?shiftId=${s.id}&sections=sales,cashMovements`, "_blank")}
                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                          aria-label="Скачать отчёт по смене"
                          title="Скачать отчёт по смене"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {columns.open && columns.pos && (
            <AnchoredPopover pos={columns.pos} onClose={columns.close} className="w-44">
              <label className="flex items-center gap-2 font-normal">
                <input type="checkbox" checked={showProfit} onChange={(e) => setShowProfit(e.target.checked)} /> Прибыль
              </label>
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
              {[25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </>
      )}

      {viewId && (
        <ShiftReportModal
          shiftId={viewId}
          kind={shifts.find((s) => s.id === viewId)?.status === "OPEN" ? "X" : "Z"}
          onClose={() => setViewId(null)}
        />
      )}
    </div>
  );
}
