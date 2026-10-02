"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { drawBarcode } from "@/lib/draw-barcode";
import { Loader2, Printer, Search, X } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { isFractionalUnit, unitLabel } from "@/lib/units";
import type { ProductResult } from "./product-search";
import { programCanPrint, printElementOnProgram } from "@/lib/program-print";
import { CreateProductModal } from "./create-product-modal";
import { searchLocal, syncCatalog } from "@/lib/offline/catalog";

export interface LabelProduct { name: string; price: number; unit: string; barcode: string }

/** Printable shelf/item label: name, price and a scannable barcode (same look as the admin «Этикетка товара»). */
export function ProductLabelModal({ product, onClose }: { product: LabelProduct; onClose: () => void }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current) {
      drawBarcode(svgRef.current, product.barcode, { displayValue: true, margin: 0, height: 46, width: 1.45, fontSize: 12 });
      // Let the bars scale to the label width (58 mm roll) instead of a fixed pixel size.
      const svg = svgRef.current;
      svg.setAttribute("viewBox", `0 0 ${svg.getAttribute("width")} ${svg.getAttribute("height")}`);
      svg.removeAttribute("width"); svg.removeAttribute("height");
    }
  }, [product.barcode]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div id="pos-label-overlay" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <style>{`@media print { @page{size:58mm auto;margin:0} html,body{width:58mm!important} body > *:not(#pos-label-overlay){display:none!important} #pos-label-overlay{position:static!important;display:block!important;background:white!important;padding:0!important} #pos-label-overlay .no-print{display:none!important} #pos-label-overlay .label-card{box-shadow:none!important;border:none!important;margin:0!important;padding:0!important;max-width:none!important;width:58mm!important;background:white!important} #pos-label-overlay .label-body{border:none!important;border-radius:0!important;padding:2mm 3mm!important;width:58mm!important;box-sizing:border-box} #pos-label-overlay .label-body svg{width:100%!important;height:auto!important} #pos-label-overlay .label-body p{margin:0 0 1mm} }`}</style>
      <div className="label-card w-full max-w-sm rounded-xl border bg-background p-5 shadow-2xl">
        <div className="no-print mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Этикетка товара</h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Закрыть"><X className="h-5 w-5" /></button>
        </div>
        <div id="pos-label-print" className="label-body rounded-lg border bg-white p-5 text-center text-black">
          <p className="text-lg font-bold">{product.name}</p>
          <p className="mt-1 text-2xl font-bold">{formatCurrency(product.price)}{isFractionalUnit(product.unit) ? ` / ${unitLabel(product.unit, true)}` : ""}</p>
          <svg ref={svgRef} className="mx-auto mt-3 w-full max-w-[240px]" />
        </div>
        <button onClick={() => { if (programCanPrint()) void printElementOnProgram("pos-label-print").then((r) => { if (!r.ok) toast.error(`Этикетка не напечатана: ${r.error ?? "ошибка принтера"}`); }); else window.print(); }} className="no-print mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary font-medium text-primary-foreground hover:bg-primary/90">
          <Printer className="h-4 w-4" /> Печать
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** «Печать этикетки»: pick any product; if it has no barcode yet, one is generated for it on the spot. */
export function LabelPickerModal({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProductResult[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [label, setLabel] = useState<LabelProduct | null>(null);
  const [creating, setCreating] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) { setResults([]); return; }
    timer.current = setTimeout(() => {
      // the server, or this till's own catalogue copy when there is no connection
      fetch(`/api/products/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
        .catch(async () => (await searchLocal(q.trim(), 30)) as unknown as ProductResult[])
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  async function pick(p: ProductResult) {
    let barcode = p.barcode;
    if (!barcode) {
      setBusyId(p.id);
      try {
        const r = await fetch(`/api/pos/products/${p.id}/barcode`, { method: "POST" });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { toast.error(d.error ?? "Не удалось создать штрихкод"); return; }
        barcode = d.barcode;
      } finally { setBusyId(null); }
    }
    if (barcode) setLabel({ name: p.name, price: Number(p.price), unit: p.unit ?? "pcs", barcode });
  }

  if (label) return <ProductLabelModal product={label} onClose={() => setLabel(null)} />;
  if (creating) {
    // a code the shop does not know: the cashier types the name (and price), the product joins the shop's catalogue
    return (
      <CreateProductModal
        initialBarcode={/^[A-Za-z0-9-]{4,30}$/.test(q.trim()) ? q.trim() : ""}
        submitLabel="Создать и напечатать этикетку"
        overlayClass="z-[75]"
        onClose={() => setCreating(false)}
        onCreated={(product) => {
          void syncCatalog(); // the other tills get it with their next catalogue update
          setCreating(false);
          if (product.barcode) setLabel({ name: product.name, price: Number(product.price), unit: product.unit ?? "pcs", barcode: product.barcode });
        }}
      />
    );
  }
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl border bg-card p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Печать этикетки</h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Закрыть"><X className="h-5 w-5" /></button>
        </div>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название или штрихкод товара" className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm" />
        </div>
        <div className="min-h-0 flex-1 divide-y overflow-y-auto rounded-md border">
          {!q.trim() ? <p className="px-3 py-6 text-center text-sm text-muted-foreground">Найдите товар, чтобы напечатать этикетку</p>
            : results.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                <p>Товар «{q.trim()}» не найден в магазине</p>
                <button onClick={() => setCreating(true)} className="mt-3 h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Добавить новый товар</button>
              </div>
            )
            : results.slice(0, 30).map((p) => (
              <button key={p.id} onClick={() => void pick(p)} disabled={busyId === p.id} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted/50">
                <span className="min-w-0"><span className="block truncate font-medium">{p.name}</span><span className="block text-xs text-muted-foreground">{p.barcode ?? "нет штрихкода — будет создан"}</span></span>
                {busyId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="shrink-0 tabular-nums">{formatCurrency(Number(p.price))}</span>}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
