"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import type { ProductResult } from "./product-search";

const UNITS = [
  { value: "pcs", label: "шт" },
  { value: "kg", label: "кг" },
  { value: "l", label: "л" },
  { value: "m", label: "м" },
] as const;

/** Cashier-side "new product": a missing item is created at the kassa instead of sending someone to the admin. */
export function CreateProductModal({ initialBarcode, onCreated, onClose }: {
  initialBarcode?: string;
  onCreated: (product: ProductResult) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState(initialBarcode ?? "");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState<(typeof UNITS)[number]["value"]>("pcs");
  const [stock, setStock] = useState("1");
  const [busy, setBusy] = useState(false);

  const priceVal = Number(price.replace(",", "."));
  const stockVal = Number(stock.replace(",", "."));
  const valid = name.trim().length > 0 && priceVal > 0 && stockVal >= 0;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/pos/products", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), price: priceVal, barcode: barcode.trim() || undefined, unit, stock: stockVal }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(d.error ?? "Не удалось создать товар"); return; }
      toast.success(`Товар создан${d.product.barcode ? ` · штрихкод ${d.product.barcode}` : ""}`);
      onCreated(d.product);
    } finally { setBusy(false); }
  }

  const field = "h-10 w-full rounded-md border bg-background px-3 text-sm";
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Новый товар</h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Закрыть"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Название *</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Штрихкод</label>
            <input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Отсканируйте или оставьте пустым — создастся сам" className={field} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium">Цена *</label>
              <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={field} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Ед.</label>
              <select value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)} className={field}>
                {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Сколько есть в наличии</label>
            <input inputMode="decimal" value={stock} onChange={(e) => setStock(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void submit(); }} className={field} />
          </div>
        </div>
        <button
          disabled={!valid || busy}
          onClick={() => void submit()}
          className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Создать и добавить в чек
        </button>
      </div>
    </div>
  );
}
