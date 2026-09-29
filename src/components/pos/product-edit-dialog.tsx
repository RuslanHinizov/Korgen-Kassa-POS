"use client";

import { useEffect, useRef, useState } from "react";
import { useNumberEntry } from "./use-number-entry";

/**
 * UMAG's «ИЗМЕНИТЬ ТОВАР»: "Название товара" (typed text field, teal frame), "Продажная цена" (number field, text selected,
 * changed with the teal keys 1-9 / 0 wide «.» ←) and Отменить / Сохранить. What each field lets you change follows the
 * register permissions: name needs «Изменение товара», price needs «Изменение цены»; «Запретить понижать цену» refuses lower.
 */
export function ProductEditDialog({
  name: initialName,
  price: initialPrice,
  catalogPrice,
  canEditName,
  canEditPrice,
  banPriceDecrease,
  wholesalePrice,
  onSave,
  onCancel,
}: {
  name: string;
  price: number;
  catalogPrice: number;
  canEditName: boolean;
  canEditPrice: boolean;
  banPriceDecrease: boolean;
  wholesalePrice?: number | null;
  onSave: (patch: { name: string; price: number }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const entry = useNumberEntry(initialPrice.toFixed(3), true, 10);
  const { text: price, selected } = entry;
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  function press(key: string) {
    if (!canEditPrice) return;
    setError("");
    entry.press(key);
  }
  function back() {
    if (!canEditPrice) return;
    setError("");
    entry.remove();
  }
  function save() {
    const value = Number(entry.get().replace(",", "."));
    if (!name.trim()) { setError("Введите название товара"); return; }
    if (!Number.isFinite(value) || value < 0) { setError("Введите корректную цену"); return; }
    if (canEditPrice && banPriceDecrease && value < catalogPrice - 0.005 && !(wholesalePrice != null && Math.abs(value - wholesalePrice) < 0.005)) {
      setError("Понижать цену на кассе запрещено");
      return;
    }
    onSave({ name: name.trim(), price: value });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onCancel(); return; }
      if (document.activeElement === nameRef.current) {
        if (e.key === "Enter") { e.preventDefault(); save(); }
        return;
      }
      if (e.key === "Enter") { e.preventDefault(); save(); }
      else if (e.key === "Backspace") { e.preventDefault(); back(); }
      else if (/^[0-9]$/.test(e.key) || e.key === "." || e.key === ",") { e.preventDefault(); press(e.key === "," ? "." : e.key); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const key = "flex h-14 w-16 items-center justify-center rounded-sm bg-[#1abc9c] text-2xl text-white active:bg-[#16a085] disabled:opacity-50";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-[27rem] bg-white px-6 pt-6 pb-8 text-center shadow-2xl">
        <p className="mb-2 text-lg">Название товара</p>
        <input
          ref={nameRef}
          value={name}
          readOnly={!canEditName}
          onChange={(e) => { setName(e.target.value); setError(""); }}
          className="mb-4 h-12 w-full border-2 border-[#1abc9c] px-3 text-center text-lg outline-none read-only:bg-slate-50"
        />
        <p className="mb-2 text-lg">Продажная цена</p>
        <div className="mx-auto mb-3 flex h-12 w-3/4 items-center justify-center border-2 border-[#3aa6d0] text-xl">
          <span data-testid="product-edit-price" className={selected && canEditPrice ? "bg-[#0a84c6] px-1 text-white" : "px-1"}>{price}</span>
        </div>
        {wholesalePrice != null && canEditPrice && (
          <div className="mb-3 flex justify-center gap-2 text-xs">
            <button type="button" className="rounded border px-2 py-1 hover:bg-slate-50" onClick={() => { entry.set(catalogPrice.toFixed(3)); setError(""); }}>Розница: {catalogPrice}</button>
            <button type="button" className="rounded border px-2 py-1 hover:bg-slate-50" onClick={() => { entry.set(wholesalePrice.toFixed(3)); setError(""); }}>Оптовая: {wholesalePrice}</button>
          </div>
        )}
        {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="mx-auto mb-5 flex w-[13.5rem] flex-col gap-2">
          <div className="flex gap-2">{["1", "2", "3"].map((d) => <button key={d} type="button" disabled={!canEditPrice} className={key} onClick={() => press(d)}>{d}</button>)}</div>
          <div className="flex gap-2">{["4", "5", "6"].map((d) => <button key={d} type="button" disabled={!canEditPrice} className={key} onClick={() => press(d)}>{d}</button>)}</div>
          <div className="flex gap-2">{["7", "8", "9"].map((d) => <button key={d} type="button" disabled={!canEditPrice} className={key} onClick={() => press(d)}>{d}</button>)}</div>
          <div className="flex gap-2">
            <button type="button" disabled={!canEditPrice} className={`${key} w-[8.5rem]`} onClick={() => press("0")}>0</button>
            <button type="button" disabled={!canEditPrice} className={`${key} w-12`} onClick={() => press(".")}>.</button>
            <button type="button" disabled={!canEditPrice} className="flex h-14 w-14 items-center justify-center rounded-sm border border-[#1abc9c] bg-white text-2xl text-slate-700 disabled:opacity-50" onClick={back} aria-label="Стереть">←</button>
          </div>
        </div>
        <div className="flex justify-center gap-4">
          <button type="button" onClick={onCancel} className="h-14 w-44 bg-[#d05a4e] text-lg text-white hover:bg-[#bd4d42]">Отменить</button>
          <button type="button" onClick={save} className="h-14 w-44 bg-[#1abc9c] text-lg text-white hover:bg-[#16a085]">Сохранить</button>
        </div>
      </div>
    </div>
  );
}
