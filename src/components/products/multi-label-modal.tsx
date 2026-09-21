"use client";

import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { Printer, WandSparkles, X } from "lucide-react";
import { isFractionalUnit, unitLabel } from "@/lib/units";

export interface LabelProduct { id: string; name: string; barcode: string | null; price: number; unit: string }

function LabelBarcode({ code }: { code: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current) JsBarcode(ref.current, code, { format: /^\d{13}$/.test(code) ? "EAN13" : "CODE128", displayValue: true, margin: 0, height: 36, width: 1.3, fontSize: 11 });
  }, [code]);
  return <svg ref={ref} className="mx-auto max-w-full" />;
}

/** Prints a sheet of price labels (one per copy) for several products at once. */
export function MultiLabelModal({ products, onClose }: { products: LabelProduct[]; onClose: () => void }) {
  const [items, setItems] = useState(products);
  const [copies, setCopies] = useState<Record<string, number>>(() => Object.fromEntries(products.map((p) => [p.id, 1])));
  const [busy, setBusy] = useState(false);
  const missing = items.filter((p) => !p.barcode);

  async function generateMissing() {
    setBusy(true);
    const next = [...items];
    for (let i = 0; i < next.length; i++) {
      if (next[i].barcode) continue;
      try {
        const r = await fetch(`/api/products/${next[i].id}/barcode`, { method: "POST" });
        const d = await r.json();
        if (r.ok) next[i] = { ...next[i], barcode: d.barcode };
      } catch { /* left without barcode, still reported below */ }
    }
    setItems(next);
    setBusy(false);
  }

  const printable = items.filter((p) => p.barcode).flatMap((p) => Array.from({ length: Math.max(1, copies[p.id] ?? 1) }, () => p));

  return (
    <div id="multi-label-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <style>{`@media print { body > *:not(#multi-label-overlay){display:none!important} #multi-label-overlay{position:static!important;display:block!important;background:white!important;padding:0!important} #multi-label-overlay .no-print{display:none!important} #multi-label-overlay .label-sheet{display:grid!important;grid-template-columns:repeat(3,1fr);gap:4mm;max-height:none!important;overflow:visible!important;border:none!important;padding:0!important} #multi-label-overlay .label-card{break-inside:avoid;border:1px dashed #999!important} #multi-label-overlay .sheet-wrap{box-shadow:none!important;border:none!important;max-width:none!important} }`}</style>
      <div className="sheet-wrap flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border bg-background p-5 shadow-2xl">
        <div className="no-print mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Печать этикеток ({printable.length})</h2>
          <button onClick={onClose} aria-label="Закрыть"><X className="h-5 w-5" /></button>
        </div>
        <div className="no-print mb-3 max-h-40 space-y-1 overflow-y-auto rounded-md border p-2 text-sm">
          {items.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3">
              <span className="truncate">{p.name}{!p.barcode && <span className="ml-2 text-xs text-destructive">нет штрихкода</span>}</span>
              <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                Копий
                <input type="number" min={1} max={99} value={copies[p.id] ?? 1} onChange={(e) => setCopies((c) => ({ ...c, [p.id]: Math.min(99, Math.max(1, Number(e.target.value) || 1)) }))} className="h-7 w-14 rounded border bg-background px-1 text-right text-foreground" />
              </label>
            </div>
          ))}
        </div>
        {missing.length > 0 && (
          <button onClick={generateMissing} disabled={busy} className="no-print mb-3 flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50">
            <WandSparkles className="h-4 w-4" />{busy ? "Создание…" : `Создать EAN‑13 для товаров без штрихкода (${missing.length})`}
          </button>
        )}
        <div className="label-sheet grid flex-1 grid-cols-2 gap-3 overflow-y-auto rounded-md border bg-white p-3 text-black sm:grid-cols-3">
          {printable.map((p, i) => (
            <div key={`${p.id}-${i}`} className="label-card rounded border p-2 text-center">
              <p className="line-clamp-2 text-xs font-bold leading-tight">{p.name}</p>
              <p className="my-1 text-base font-bold">₸{p.price.toFixed(2)}{isFractionalUnit(p.unit) ? ` / ${unitLabel(p.unit, true)}` : ""}</p>
              <LabelBarcode code={p.barcode!} />
            </div>
          ))}
          {printable.length === 0 && <p className="col-span-full py-6 text-center text-sm text-muted-foreground">Нет товаров со штрихкодом</p>}
        </div>
        <button onClick={() => window.print()} disabled={printable.length === 0} className="no-print mt-3 flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          <Printer className="h-4 w-4" />Печать
        </button>
      </div>
    </div>
  );
}
