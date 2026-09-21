"use client";

import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { Barcode, Printer, WandSparkles, X } from "lucide-react";
import { isFractionalUnit, unitLabel } from "@/lib/units";

export function BarcodeLabelButton({ productId, productName, initialBarcode, price, unit, iconOnly, hidden }: { productId: string; productName: string; initialBarcode?: string | null; price: number; unit: string; iconOnly?: boolean; hidden?: boolean }) {
  const [open, setOpen] = useState(false);
  const [barcode, setBarcode] = useState(initialBarcode ?? "");
  const [busy, setBusy] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => { if (open && barcode && svgRef.current) JsBarcode(svgRef.current, barcode, { format: /^\d{13}$/.test(barcode) ? "EAN13" : "CODE128", displayValue: true, margin: 0, height: 46, width: 1.45, fontSize: 12 }); }, [open, barcode]);
  // Lets a toolbar-level "Печать" action (e.g. the Список товаров bulk bar) open
  // this exact row's label modal without lifting state up to a shared parent.
  useEffect(() => {
    if (!iconOnly && !hidden) return;
    function onExternalPrint(e: Event) { if ((e as CustomEvent).detail === productId) setOpen(true); }
    window.addEventListener("print-single-label", onExternalPrint);
    return () => window.removeEventListener("print-single-label", onExternalPrint);
  }, [iconOnly, hidden, productId]);
  async function generate() { setBusy(true); try { const r = await fetch(`/api/products/${productId}/barcode`, { method: "POST" }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setBarcode(d.barcode); } catch (e) { alert(e instanceof Error ? e.message : "Штрихкод не создан"); } finally { setBusy(false); } }
  function print() { window.print(); }

  return <>
    {hidden ? null : iconOnly ? (
      <button onClick={() => setOpen(true)} className="rounded p-1.5 text-muted-foreground hover:bg-accent" aria-label="Этикетка"><Printer className="h-3.5 w-3.5" /></button>
    ) : (
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"><Barcode className="h-3.5 w-3.5" />Этикетка</button>
    )}
    {open && <div id="barcode-label-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><style>{`@media print { body > *:not(#barcode-label-overlay){display:none!important} #barcode-label-overlay{position:static!important;display:block!important;background:white!important} #barcode-label-overlay .no-print{display:none!important} #barcode-label-overlay .label-card{box-shadow:none!important;border:none!important;margin:0!important} }`}</style><div className="label-card w-full max-w-sm rounded-xl border bg-background p-5 shadow-2xl"><div className="no-print mb-4 flex items-center justify-between"><h2 className="font-semibold">Этикетка товара</h2><button onClick={() => setOpen(false)}><X className="h-5 w-5" /></button></div>{barcode ? <div className="rounded-lg border bg-white p-5 text-center text-black"><p className="mb-1 text-base font-bold">{productName}</p><p className="mb-3 text-xl font-bold">₸{price.toFixed(2)}{isFractionalUnit(unit) ? ` / ${unitLabel(unit, true)}` : ""}</p><svg ref={svgRef} className="mx-auto max-w-full" /><p className="mt-2 text-xs">Отсканируйте для добавления в кассу</p></div> : <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">У товара нет штрихкода. Создайте внутренний EAN‑13 код.</div>}<div className="no-print mt-4 flex gap-2">{!barcode && <button disabled={busy} onClick={generate} className="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"><WandSparkles className="h-4 w-4" />{busy ? "Создание…" : "Создать EAN‑13"}</button>}{barcode && <button onClick={print} className="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"><Printer className="h-4 w-4" />Печать</button>}</div></div></div>}
  </>;
}
