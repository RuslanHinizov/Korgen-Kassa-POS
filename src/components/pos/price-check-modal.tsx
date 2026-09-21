"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { unitLabel } from "@/lib/units";

interface Found { id: string; name: string; barcode: string | null; price: number; wholesalePrice: number | null; stock: number; unit?: "pcs" | "kg" | "l" | "m" }

/** "Проверка цены" — look a product up (scan or type) and see its price without touching the cart. */
export function PriceCheckModal({ onClose, showWholesale }: { onClose: () => void; showWholesale: boolean }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function run(value: string) {
    if (!value.trim()) { setResults([]); setSearched(false); return; }
    setLoading(true);
    try {
      const r = await fetch(`/api/products/search?q=${encodeURIComponent(value.trim())}&limit=8`);
      setResults(r.ok ? await r.json() : []);
      setSearched(true);
    } finally { setLoading(false); }
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-2xl border bg-card p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Проверка цены</h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Закрыть"><X className="h-5 w-5" /></button>
        </div>
        <input
          autoFocus value={q} placeholder="Название или штрихкод"
          onChange={(e) => { setQ(e.target.value); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => run(e.target.value), 250); }}
          onKeyDown={(e) => { if (e.key === "Enter") { if (timer.current) clearTimeout(timer.current); void run(q); } }}
          className="h-11 w-full rounded-md border bg-background px-3 text-sm"
        />
        <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
          {loading && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>}
          {!loading && searched && results.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Товар не найден</p>}
          {results.map((p) => (
            <div key={p.id} className="rounded-lg border p-3">
              <p className="text-sm font-medium">{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.barcode ?? "без штрихкода"} · остаток {p.stock} {unitLabel(p.unit, true)}</p>
              <p className="mt-1 text-2xl font-bold">{formatCurrency(p.price)}<span className="ml-1 text-xs font-normal text-muted-foreground">/ {unitLabel(p.unit, true)}</span></p>
              {showWholesale && p.wholesalePrice != null && <p className="text-xs text-muted-foreground">Оптовая цена: {formatCurrency(p.wholesalePrice)}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
