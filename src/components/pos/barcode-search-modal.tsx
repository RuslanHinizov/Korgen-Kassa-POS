"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Found { id: string; name: string; barcode: string | null; price: number; stock: number; unit?: string }

/**
 * ШТРИХ КОД — UMAG's dedicated barcode-entry dialog (docs/kasa-offline-plan.md §3.0): a numeric keypad
 * only (no free-text typing), УДАЛИТЬ/ОТМЕНА/OK. An unknown code shows "Не найдено — Продукт с данным
 * кодом не найден" (observed in the return screen; reused here for Доп. функции → ПОИСК ПО ШТРИХКОДУ).
 */
export function BarcodeSearchModal({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Found | null>(null);
  const [notFound, setNotFound] = useState(false);

  async function submit() {
    if (!code) return;
    setLoading(true);
    setResult(null);
    setNotFound(false);
    try {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(code)}&limit=5`);
      const items: Found[] = res.ok ? await res.json() : [];
      const exact = items.find((p) => p.barcode === code) ?? null;
      if (exact) setResult(exact);
      else setNotFound(true);
    } finally {
      setLoading(false);
    }
  }

  function tap(key: string) {
    if (key === "УДЛ.") setCode((c) => c.slice(0, -1));
    else setCode((c) => (c + key).slice(0, 32));
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-sm border bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold">ШТРИХ КОД</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
        </div>

        <input readOnly value={code} className="mb-3 w-full rounded-sm border border-slate-300 px-3 py-2 text-lg tabular-nums" />

        {notFound && (
          <div className="mb-3 rounded-sm border border-red-200 bg-red-50 p-3 text-sm">
            <p className="font-semibold text-red-800">Не найдено</p>
            <p className="text-red-700">Продукт с данным кодом не найден</p>
          </div>
        )}
        {result && (
          <div className="mb-3 rounded-sm border border-emerald-200 bg-emerald-50 p-3 text-sm">
            <p className="font-semibold">{result.name}</p>
            <p>Цена: {formatCurrency(result.price)}</p>
            <p>Остаток: {result.stock} {result.unit ?? ""}</p>
          </div>
        )}

        <div className="mb-3 grid grid-cols-3 gap-1">
          {["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", "."].map((k) => (
            <button key={k} type="button" onClick={() => tap(k)} className="h-11 rounded-sm bg-slate-100 text-lg hover:bg-slate-200">{k}</button>
          ))}
          <button type="button" onClick={() => tap("УДЛ.")} className="h-11 rounded-sm bg-[#c0392b] text-xs font-bold text-white hover:bg-[#a5321f]">УДАЛИТЬ</button>
        </div>

        <div className="flex gap-2">
          <button onClick={() => setCode("")} className="flex-1 rounded-sm border border-slate-300 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">
            ОТМЕНА
          </button>
          <button
            onClick={submit}
            disabled={!code || loading}
            className="flex-1 rounded-sm bg-[#24bb69] py-2 text-xs font-bold text-white hover:bg-[#1fa45c] disabled:opacity-50"
          >
            {loading ? "…" : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
