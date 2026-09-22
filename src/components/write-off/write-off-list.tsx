"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StoreLink as Link } from "@/components/store/store-link";
import { useStoreRouter as useRouter } from "@/components/store/use-store-router";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowLeft, Download, Loader2, Plus, Trash2 } from "lucide-react";
import { useSession } from "@/lib/auth-client";

interface Row {
  id: string; documentNo: number; status: "DRAFT" | "POSTED"; writeOffDate: string;
  note: string | null; totalCost: number; userName: string; itemCount: number;
}

function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "long" });
}

export function WriteOffList() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/write-offs");
      const d = await r.json();
      setRows(d.writeOffs ?? []);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function createDraft() {
    setCreating(true);
    try {
      const r = await fetch("/api/write-offs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (!r.ok) { toast.error("Не удалось создать документ"); return; }
      const d = await r.json();
      router.push(`/products/write-off/${d.writeOff.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function deleteDraft(id: string) {
    if (!confirm("Удалить черновик списания?")) return;
    const r = await fetch(`/api/write-offs/${id}`, { method: "DELETE" });
    if (!r.ok) { toast.error("Не удалось удалить"); return; }
    load();
  }

  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const row of rows) {
      const key = dayKey(row.writeOffDate);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return [...map.entries()];
  }, [rows]);

  const grandTotal = rows.reduce((s, r) => s + r.totalCost, 0);
  // UMAG never shows Складской работник the cost value of a write-off, only quantities.
  const canSeeCost = useSession().data?.user.role !== "WAREHOUSE";
  const cols = canSeeCost ? "grid-cols-[1fr_auto_auto_auto_2rem]" : "grid-cols-[1fr_auto_auto_2rem]";

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/products" className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-accent transition-colors">
          <ArrowLeft className="h-4 w-4" /> Товары
        </Link>
        <h1 className="text-2xl font-bold">Списание</h1>
        <span className="ml-auto"><button onClick={() => window.open("/api/write-offs?export=xlsx", "_blank")} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent"><Download className="h-4 w-4" /> Экспорт</button></span>
      </div>

      <button onClick={createDraft} disabled={creating} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
        {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Списание
      </button>

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className={`grid ${cols} gap-3 border-b bg-muted/50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground`}>
          <span>Номер / Пользователь</span>
          <span>Дата</span>
          <span>Статус</span>
          {canSeeCost && <span className="text-right">Сумма</span>}
          <span />
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">Списаний пока нет</p>
        ) : (
          groups.map(([day, dayRows]) => {
            const dayTotal = dayRows.reduce((s, r) => s + r.totalCost, 0);
            return (
              <div key={day}>
                <div className="divide-y">
                  {dayRows.map((row) => (
                    <div key={row.id} className={`grid ${cols} items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/40`}>
                      <Link href={`/products/write-off/${row.id}`} className="min-w-0">
                        <p className="font-medium text-primary truncate">№{row.documentNo}</p>
                        <p className="text-xs text-muted-foreground truncate">{row.userName} · {row.itemCount} тов.</p>
                      </Link>
                      <span className="text-xs text-muted-foreground tabular-nums">{new Date(row.writeOffDate).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>
                      <span className={row.status === "POSTED" ? "rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary" : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"}>
                        {row.status === "POSTED" ? "Проведён" : "Черновик"}
                      </span>
                      {canSeeCost && <span className="text-right font-medium tabular-nums">{formatCurrency(row.totalCost)}</span>}
                      {row.status === "DRAFT" ? (
                        <button onClick={() => deleteDraft(row.id)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Удалить">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : <span />}
                    </div>
                  ))}
                </div>
                {canSeeCost && (
                  <div className="flex justify-between border-t bg-muted/30 px-4 py-1.5 text-xs font-medium text-muted-foreground">
                    <span>Итого {day}</span>
                    <span>{formatCurrency(dayTotal)}</span>
                  </div>
                )}
              </div>
            );
          })
        )}
        {rows.length > 0 && canSeeCost && (
          <div className="flex justify-between border-t px-4 py-2.5 text-sm font-semibold">
            <span>Итого</span>
            <span>{formatCurrency(grandTotal)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
