"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { ChevronDown, ChevronRight, Download, SlidersHorizontal } from "lucide-react";

interface Node { label: string; amount: number; bold?: boolean; children?: Node[] }

function monthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from, to };
}
function toInputDate(d: Date) { return d.toISOString().slice(0, 10); }
function fmtDate(d: Date) { return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }); }

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

export function ProfitLossReport() {
  const [filterOpen, setFilterOpen] = useState(false);
  const [preset, setPreset] = useState<string | null>("month");
  const [{ from, to }, setRange] = useState(() => monthRange());
  const [appliedFilters, setAppliedFilters] = useState({ from, to });

  const [tree, setTree] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const buildParams = useCallback(() => new URLSearchParams({ from: appliedFilters.from.toISOString(), to: appliedFilters.to.toISOString() }), [appliedFilters]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/reports/profit-loss?${buildParams().toString()}`);
      if (!r.ok) return;
      const d = await r.json();
      setTree(d.tree ?? []);
    } finally { setLoading(false); }
  }, [buildParams]);
  useEffect(() => { load(); }, [load]);

  function applyFilters() { setAppliedFilters({ from, to }); }
  function resetFilters() { const r = monthRange(); setPreset("month"); setRange(r); setAppliedFilters({ from: r.from, to: r.to }); }
  function applyPreset(key: (typeof PRESETS)[number]["key"]) { setPreset(key); setRange(presetRange(key)); }

  function toggle(path: string) {
    setExpanded((prev) => { const next = new Set(prev); if (next.has(path)) next.delete(path); else next.add(path); return next; });
  }

  function exportXlsx() {
    const params = buildParams();
    params.set("export", "xlsx");
    window.open(`/api/reports/profit-loss?${params.toString()}`, "_blank");
  }

  function renderNode(node: Node, path: string, depth: number) {
    const hasChildren = !!node.children && node.children.length > 0;
    const isOpen = expanded.has(path);
    return (
      <div key={path}>
        <div
          className={`flex items-center justify-between border-b px-4 py-2.5 text-sm ${hasChildren ? "cursor-pointer hover:bg-muted/40" : ""}`}
          style={{ paddingLeft: `${16 + depth * 24}px` }}
          onClick={hasChildren ? () => toggle(path) : undefined}
        >
          <span className={`flex items-center gap-1.5 ${node.bold ? "font-semibold" : ""}`}>
            {hasChildren ? (isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />) : <span className="w-3.5" />}
            {node.label}
          </span>
          <span className={`tabular-nums ${node.bold ? "font-semibold" : ""}`}>{formatCurrency(node.amount)}</span>
        </div>
        {hasChildren && isOpen && node.children!.map((c, i) => renderNode(c, `${path}.${i}`, depth + 1))}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-3xl">
      <h1 className="text-2xl font-bold">Отчёт прибыль/убытки</h1>

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
          <div className="flex items-center gap-4 pt-1">
            <button onClick={applyFilters} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Применить</button>
            <button onClick={resetFilters} className="text-sm text-muted-foreground hover:underline">Очистить</button>
          </div>
        </div>
      )}

      <p className="text-sm text-muted-foreground">С {fmtDate(appliedFilters.from)} по {fmtDate(appliedFilters.to)}</p>

      <div className="rounded-lg border bg-card overflow-hidden">
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Загрузка…</p>
        ) : (
          tree.map((n, i) => renderNode(n, String(i), 0))
        )}
      </div>
    </div>
  );
}
