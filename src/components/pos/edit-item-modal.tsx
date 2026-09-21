"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { CartItem } from "@/store/cart";

/** "Изменить товар" — edit the active line's note and per-line discount. */
export function EditItemModal({ item, onSave, onClose, discountEnabled = true, priceEditable = false, banPriceDecrease = false, wholesaleEnabled = false }: {
  item: CartItem;
  onSave: (patch: { notes: string; lineDiscount: number; price?: number }) => void;
  onClose: () => void;
  discountEnabled?: boolean;
  priceEditable?: boolean;
  banPriceDecrease?: boolean;
  wholesaleEnabled?: boolean;
}) {
  const [notes, setNotes] = useState(item.notes);
  const [discount, setDiscount] = useState(String(item.lineDiscount || ""));
  const [price, setPrice] = useState(String(item.price));
  const [error, setError] = useState("");
  const catalogPrice = item.catalogPrice ?? item.price;
  const wholesale = wholesaleEnabled && item.wholesalePrice != null ? item.wholesalePrice : null;
  const showPrice = (priceEditable || wholesale != null) && Boolean(item.productId);

  function submit() {
    const val = Number(discount.replace(",", "."));
    const newPrice = Number(price.replace(",", "."));
    const isWholesale = wholesale != null && Math.abs(newPrice - wholesale) < 0.005;
    if (priceEditable && item.productId && !isWholesale) {
      if (!Number.isFinite(newPrice) || newPrice < 0) { setError("Введите корректную цену"); return; }
      if (banPriceDecrease && newPrice < catalogPrice - 0.005) { setError("Понижать цену на кассе запрещено"); return; }
    }
    onSave({ notes, lineDiscount: Number.isFinite(val) && val > 0 ? val : 0, price: showPrice ? newPrice : undefined });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold truncate pr-2">{item.name}</h2>
          <button onClick={onClose} className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Закрыть"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          {showPrice && (
            <div>
              <label className="mb-1 block text-sm font-medium">Цена</label>
              <input inputMode="decimal" value={price} readOnly={!priceEditable} onChange={(e) => { setPrice(e.target.value); setError(""); }} className="h-10 w-full rounded-md border bg-background px-3 text-sm read-only:bg-muted" />
              {wholesale != null && (
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => { setPrice(String(catalogPrice)); setError(""); }} className="rounded-md border px-2 py-1 text-xs hover:bg-muted">Розница: {catalogPrice}</button>
                  <button type="button" onClick={() => { setPrice(String(wholesale)); setError(""); }} className="rounded-md border px-2 py-1 text-xs hover:bg-muted">Оптовая: {wholesale}</button>
                </div>
              )}
              {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
            </div>
          )}
          {discountEnabled && (
            <div>
              <label className="mb-1 block text-sm font-medium">Скидка на позицию</label>
              <input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" className="h-10 w-full rounded-md border bg-background px-3 text-sm" />
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium">Заметка</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm" />
          </div>
        </div>
        <button onClick={submit} className="mt-4 h-11 w-full rounded-lg bg-primary font-medium text-primary-foreground hover:bg-primary/90">
          Сохранить
        </button>
      </div>
    </div>
  );
}
