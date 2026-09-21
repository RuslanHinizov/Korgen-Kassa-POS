"use client";

import { useState } from "react";
import { X } from "lucide-react";

/** "Универсальный продукт" — a manual name+price cart line not tied to any catalog product. */
export function CustomItemModal({ onAdd, onClose }: { onAdd: (item: { name: string; price: number; quantity: number }) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");

  const priceVal = Number(price.replace(",", "."));
  const qtyVal = Number(quantity.replace(",", "."));
  const valid = name.trim().length > 0 && priceVal > 0 && qtyVal > 0;

  function submit() {
    if (!valid) return;
    onAdd({ name: name.trim(), price: priceVal, quantity: qtyVal });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Универсальный продукт</h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Закрыть"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Название *</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Цена *</label>
              <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Кол-во</label>
              <input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm" />
            </div>
          </div>
        </div>
        <button
          disabled={!valid}
          onClick={submit}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          className="mt-4 h-11 w-full rounded-lg bg-primary font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Добавить
        </button>
      </div>
    </div>
  );
}
