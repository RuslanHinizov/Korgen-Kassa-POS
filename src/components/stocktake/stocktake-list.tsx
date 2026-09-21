"use client";

import { useCallback, useEffect, useState } from "react";
import { StoreLink as Link } from "@/components/store/store-link";
import { useStoreRouter as useRouter } from "@/components/store/use-store-router";
import { toast } from "sonner";
import { ArrowLeft, Download, Loader2, Plus, Trash2 } from "lucide-react";

type Status = "DRAFT" | "COUNTING" | "REVIEWING" | "POSTED" | "CANCELLED";
const STATUS_LABEL: Record<Status, string> = {
  DRAFT: "Черновик", COUNTING: "Подсчёт", REVIEWING: "Проведение", POSTED: "Проведён", CANCELLED: "Отменён",
};
const STATUS_CLASS: Record<Status, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  COUNTING: "bg-amber-500/10 text-amber-600",
  REVIEWING: "bg-blue-500/10 text-blue-600",
  POSTED: "bg-primary/10 text-primary",
  CANCELLED: "bg-destructive/10 text-destructive",
};

interface Row {
  id: string; documentNo: number; status: Status; note: string | null;
  countedAt: string; postedAt: string | null; userName: string; itemCount: number;
}

export function StocktakeList() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/inventory/stocktakes");
      const d = await r.json();
      setRows(d.stocktakes ?? []);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function createDraft() {
    setCreating(true);
    try {
      const r = await fetch("/api/inventory/stocktakes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (!r.ok) { toast.error("Не удалось создать документ"); return; }
      const d = await r.json();
      router.push(`/products/stocktake/${d.stocktake.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function deleteDoc(id: string) {
    if (!confirm("Удалить эту инвентаризацию?")) return;
    const r = await fetch(`/api/inventory/stocktakes/${id}`, { method: "DELETE" });
    if (!r.ok) { toast.error("Не удалось удалить"); return; }
    load();
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/products" className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-accent transition-colors">
          <ArrowLeft className="h-4 w-4" /> Товары
        </Link>
        <h1 className="text-2xl font-bold">Инвентаризация</h1>
        <span className="ml-auto"><button onClick={() => window.open("/api/inventory/stocktakes?export=xlsx", "_blank")} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent"><Download className="h-4 w-4" /> Экспорт</button></span>
      </div>

      <button onClick={createDraft} disabled={creating} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
        {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Инвентаризация
      </button>

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto_2rem] gap-3 border-b bg-muted/50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <span>Номер / Пользователь</span>
          <span>Дата</span>
          <span>Статус</span>
          <span className="text-right">Кол-во</span>
          <span />
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">Инвентаризаций пока нет</p>
        ) : (
          <div className="divide-y">
            {rows.map((row) => (
              <div key={row.id} className="grid grid-cols-[1fr_auto_auto_auto_2rem] items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/40">
                <Link href={`/products/stocktake/${row.id}`} className="min-w-0">
                  <p className="font-medium text-primary truncate">№{row.documentNo}</p>
                  <p className="text-xs text-muted-foreground truncate">{row.userName}{row.note ? ` · ${row.note}` : ""}</p>
                </Link>
                <span className="text-xs text-muted-foreground tabular-nums">{new Date(row.countedAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[row.status]}`}>{STATUS_LABEL[row.status]}</span>
                <span className="text-right tabular-nums text-muted-foreground">{row.itemCount} тов.</span>
                {row.status !== "POSTED" ? (
                  <button onClick={() => deleteDoc(row.id)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Удалить">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : <span />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
