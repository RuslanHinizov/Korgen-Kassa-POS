"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Ban, Loader2, Plus, Trash2 } from "lucide-react";

type Category = { id: string; name: string; parentId: string | null };
type Rule = { id: string; categoryId: string; categoryName: string; active: boolean; daysOfWeek: string | null; startTime: string; endTime: string };

const DAY_LABELS: [string, string][] = [["1", "Пн"], ["2", "Вт"], ["3", "Ср"], ["4", "Чт"], ["5", "Пт"], ["6", "Сб"], ["7", "Вс"]];

/** Запреты на продажу на кассе — ban selling a category during a recurring
 * time window (e.g. Kazakhstan's alcohol-sale curfew). Matches UMAG's own
 * "Настройки разрешений" page layout: a small table + inline add row. */
export function SaleRestrictionsPanel() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [newCatId, setNewCatId] = useState("");
  const [newStart, setNewStart] = useState("21:00");
  const [newEnd, setNewEnd] = useState("08:00");
  const [newDays, setNewDays] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, cRes] = await Promise.all([fetch("/api/sale-restrictions"), fetch("/api/categories")]);
      const rData = rRes.ok ? await rRes.json() : { rules: [] };
      const cData = cRes.ok ? await cRes.json() : { categories: [] };
      setRules(rData.rules ?? []);
      setCats((cData.categories ?? []).filter((c: Category) => !c.parentId));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  function toggleDay(d: string) {
    setNewDays((s) => { const n = new Set(s); n.has(d) ? n.delete(d) : n.add(d); return n; });
  }

  async function addRule() {
    if (!newCatId) return;
    setBusy(true);
    try {
      const r = await fetch("/api/sale-restrictions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: newCatId, startTime: newStart, endTime: newEnd, daysOfWeek: newDays.size ? [...newDays].sort().join(",") : null }),
      });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось добавить"); return; }
      setNewCatId(""); setNewDays(new Set());
      load();
    } finally { setBusy(false); }
  }

  async function toggleActive(rule: Rule) {
    setBusy(true);
    try {
      const r = await fetch(`/api/sale-restrictions/${rule.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !rule.active }) });
      if (!r.ok) { toast.error("Не удалось сохранить"); return; }
      load();
    } finally { setBusy(false); }
  }

  async function deleteRule(id: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/sale-restrictions/${id}`, { method: "DELETE" });
      if (!r.ok) { toast.error("Не удалось удалить"); return; }
      load();
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Ban className="h-4 w-4 text-destructive" />
        <p className="text-sm font-medium">Запреты на продажу на кассе</p>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        Запретить продажу категории на кассе в определённый промежуток времени (например, ограничение по времени продажи алкоголя).
      </p>

      {loading ? (
        <div className="py-4 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
      ) : rules.length > 0 ? (
        <ul className="divide-y rounded-md border">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className={`flex-1 truncate ${!r.active ? "text-muted-foreground line-through" : ""}`}>{r.categoryName}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{r.startTime}–{r.endTime}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {r.daysOfWeek ? r.daysOfWeek.split(",").map((d) => DAY_LABELS.find(([k]) => k === d)?.[1]).join(" ") : "ежедневно"}
              </span>
              <label className="flex shrink-0 items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={r.active} onChange={() => toggleActive(r)} disabled={busy} className="h-3.5 w-3.5 accent-primary" />
              </label>
              <button onClick={() => deleteRule(r.id)} disabled={busy} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Удалить">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Пока нет запретов на продажу.</p>
      )}

      <div className="space-y-2 rounded-md border border-dashed p-3">
        <div className="flex flex-wrap items-center gap-2">
          <select value={newCatId} onChange={(e) => setNewCatId(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs">
            <option value="">— выберите категорию —</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs" />
          <span className="text-xs text-muted-foreground">—</span>
          <input type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs" />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {DAY_LABELS.map(([k, label]) => (
            <button key={k} type="button" onClick={() => toggleDay(k)}
              className={`h-7 w-9 rounded border text-xs font-medium ${newDays.has(k) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
              {label}
            </button>
          ))}
          <span className="ml-1 text-xs text-muted-foreground">{newDays.size === 0 ? "(ежедневно)" : ""}</span>
          <button type="button" onClick={addRule} disabled={busy || !newCatId}
            className="ml-auto inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            <Plus className="h-3.5 w-3.5" /> Добавить
          </button>
        </div>
      </div>
    </div>
  );
}
