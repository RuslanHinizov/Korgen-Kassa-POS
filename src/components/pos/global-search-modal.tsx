"use client";

import { useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";

interface GlobalProduct { id: string; name: string; barcode: string | null; price: number; unit: string; storeName: string }

/** "Поиск по глобальной базе" — products that exist in the company's other stores but not here. */
export function GlobalSearchModal({ onClose, canAdd }: { onClose: () => void; canAdd: boolean }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GlobalProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function run(value: string) {
    if (value.trim().length < 2) { setResults([]); setSearched(false); return; }
    setLoading(true);
    try {
      const r = await fetch(`/api/pos/global-products?q=${encodeURIComponent(value.trim())}`);
      const d = r.ok ? await r.json() : { products: [] };
      setResults(d.products ?? []);
      setSearched(true);
    } finally { setLoading(false); }
  }

  async function add(p: GlobalProduct) {
    setAdding(p.id);
    try {
      const r = await fetch("/api/pos/global-products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceProductId: p.id }) });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Не удалось добавить"); return; }
      toast.success(`«${p.name}» добавлен в каталог магазина`);
      setResults((cur) => cur.filter((x) => x.id !== p.id));
    } finally { setAdding(null); }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-2xl border bg-card p-5 shadow-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-semibold">Поиск по глобальной базе</h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Закрыть"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">Товары из других магазинов сети, которых ещё нет в этом магазине.</p>
        <input
          autoFocus value={q} placeholder="Название или штрихкод (от 2 символов)"
          onChange={(e) => { setQ(e.target.value); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => run(e.target.value), 300); }}
          className="h-11 w-full rounded-md border bg-background px-3 text-sm"
        />
        <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
          {loading && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>}
          {!loading && searched && results.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Ничего не найдено</p>}
          {results.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.barcode ?? "без штрихкода"} · {p.storeName} · {formatCurrency(p.price)}</p>
              </div>
              {canAdd && (
                <button onClick={() => add(p)} disabled={adding === p.id} className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
                  {adding === p.id ? "…" : "Добавить в каталог"}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
