"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { unitLabel } from "@/lib/units";
import { Loader2, Search, X } from "lucide-react";
import { useSession } from "@/lib/auth-client";

export interface PickableProduct {
  id: string; name: string; barcode: string | null; unit: string; price: number; cost: number | null; stock: number;
}

/** Товары поставщика / Номенклатура — the multi-select product picker UMAG uses to
 * bulk-add lines to a Приёмка/Возврат instead of a plain type-ahead search. */
export function ProductPickerModal({ title, supplierId, type, onClose, onSelect }: {
  title: string; supplierId?: string | null; type?: "REGULAR";
  onClose: () => void; onSelect: (products: PickableProduct[]) => void;
}) {
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<PickableProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Map<string, PickableProduct>>(new Map());
  const pageSize = 50;
  const requestId = useRef(0);
  // UMAG never shows Закупочная цена to Складской работник.
  const canSeeCost = useSession().data?.user.role !== "WAREHOUSE";

  const load = useCallback(async () => {
    const thisRequest = ++requestId.current;
    setLoading(true);
    const sp = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (q.trim()) sp.set("q", q.trim());
    if (supplierId) sp.set("supplierId", supplierId);
    if (type) sp.set("type", type);
    try {
      const r = await fetch(`/api/products/admin-search?${sp.toString()}`);
      const d = await r.json();
      if (thisRequest !== requestId.current) return; // a newer request has already superseded this one
      setProducts(d.products ?? []);
      setTotal(d.total ?? 0);
    } finally {
      if (thisRequest === requestId.current) setLoading(false);
    }
  }, [q, page, supplierId, type]);
  useEffect(() => { load(); }, [load]);

  function toggle(p: PickableProduct) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(p.id)) next.delete(p.id); else next.set(p.id, p);
      return next;
    });
  }

  function confirm() {
    if (selected.size === 0) { onClose(); return; }
    onSelect([...selected.values()]);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-3xl rounded-xl border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <button onClick={confirm} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Выбрать{selected.size > 0 ? ` (${selected.size})` : ""}
            </button>
            <button onClick={onClose} className="inline-flex h-9 items-center rounded-md border px-4 text-sm hover:bg-accent">Отменить</button>
            <div className="relative ml-auto w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Поиск по названию / штрихкоду"
                className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm" />
            </div>
          </div>

          <div className="max-h-[26rem] overflow-y-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-2"></th>
                  <th className="px-3 py-2 text-left">Название товара</th>
                  <th className="px-3 py-2 text-left">Штрихкод</th>
                  {canSeeCost && <th className="px-3 py-2 text-right">Закуп. цена</th>}
                  <th className="px-3 py-2 text-right">Прод. цена</th>
                  <th className="px-3 py-2 text-left">Ед. изм</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
                ) : products.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Ничего не найдено</td></tr>
                ) : (
                  products.map((p) => (
                    <tr key={p.id} onClick={() => toggle(p)} className="cursor-pointer hover:bg-muted/40">
                      <td className="px-3 py-2"><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p)} onClick={(e) => e.stopPropagation()} /></td>
                      <td className="px-3 py-2 text-primary">{p.name}</td>
                      <td className="px-3 py-2 text-muted-foreground tabular-nums">{p.barcode ?? "—"}</td>
                      {canSeeCost && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(p.cost ?? p.price)}</td>}
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(p.price)}</td>
                      <td className="px-3 py-2">{unitLabel(p.unit)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Всего товаров: {total}</span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded p-1 hover:bg-accent disabled:opacity-30">‹</button>
                <span>{page} / {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded p-1 hover:bg-accent disabled:opacity-30">›</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
