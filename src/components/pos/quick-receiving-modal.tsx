"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

interface Supplier { id: string; name: string }

/**
 * БЫСТРАЯ ПРИЁМКА — matches the UMAG form exactly (docs/kasa-offline-plan.md §3.0,
 * `_umag-sandbox/shots/145-dop.png`): Сумма, Дата приёмки (date + time), Поставщик (search),
 * Комментарии, "Под консигнацию" checkbox, Взнос (advance payment), ОТМЕНА/СОХРАНИТЬ.
 *
 * Posts to the existing `/api/purchase-receipts/quick` (a lump-sum supplier debt, no line items —
 * that endpoint already matched this form before Доп. функции existed) and, if Взнос > 0, immediately
 * follows with `/api/purchase-receipts/:id/payments`.
 */
export function QuickReceivingModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [supplierQuery, setSupplierQuery] = useState("");
  const [supplierResults, setSupplierResults] = useState<Supplier[]>([]);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [comment, setComment] = useState("");
  const [consignment, setConsignment] = useState(false);
  const [advance, setAdvance] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!supplierQuery.trim() || supplier) { setSupplierResults([]); return; }
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/suppliers?q=${encodeURIComponent(supplierQuery.trim())}`);
      const data = await res.json().catch(() => null);
      setSupplierResults(res.ok ? (data.suppliers ?? []) : []);
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [supplierQuery, supplier]);

  async function save() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("Введите сумму"); return; }
    if (!supplier) { setError("Выберите поставщика"); return; }
    setBusy(true);
    setError("");
    try {
      const createdAt = `${date}T${time}:00`;
      const res = await fetch("/api/purchase-receipts/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: supplier.id,
          amount: amt,
          comment: comment.trim() || undefined,
          isConsignment: consignment,
          createdAt,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Не удалось сохранить");
        return;
      }
      const adv = parseFloat(advance);
      if (adv > 0) {
        await fetch(`/api/purchase-receipts/${data.receipt.id}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: adv }),
        }).catch(() => {});
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-sm border bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold">БЫСТРАЯ ПРИЁМКА</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600">Сумма</label>
            <input
              autoFocus
              type="number" min={0} step={0.01}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 h-9 w-full rounded-sm border border-slate-300 px-3 text-sm outline-none focus:border-[#1a9ba8]"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">Дата приёмки</label>
            <div className="mt-1 flex gap-2">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 flex-1 rounded-sm border border-slate-300 px-3 text-sm outline-none focus:border-[#1a9ba8]" />
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-9 w-28 rounded-sm border border-slate-300 px-3 text-sm outline-none focus:border-[#1a9ba8]" />
            </div>
          </div>

          <div className="relative">
            <label className="text-xs font-medium text-slate-600">Поставщик</label>
            {supplier ? (
              <div className="mt-1 flex items-center justify-between rounded-sm border border-[#1a9ba8] bg-[#1a9ba8]/5 px-3 py-2 text-sm">
                <span>{supplier.name}</span>
                <button onClick={() => { setSupplier(null); setSupplierQuery(""); }} className="text-slate-400 hover:text-slate-700"><X className="h-3.5 w-3.5" /></button>
              </div>
            ) : (
              <input
                value={supplierQuery}
                onChange={(e) => setSupplierQuery(e.target.value)}
                placeholder="Поставщик"
                className="mt-1 h-9 w-full rounded-sm border border-slate-300 px-3 text-sm outline-none focus:border-[#1a9ba8]"
              />
            )}
            {supplierResults.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-32 w-full overflow-y-auto rounded-sm border bg-white shadow-lg">
                {supplierResults.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { setSupplier(s); setSupplierResults([]); }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600">Комментарии</label>
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="mt-1 w-full resize-none rounded-sm border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#1a9ba8]"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={consignment} onChange={(e) => setConsignment(e.target.checked)} className="h-4 w-4" />
            Под консигнацию
          </label>

          <div>
            <label className="text-xs font-medium text-slate-600">Взнос</label>
            <input
              type="number" min={0} step={0.01}
              value={advance}
              onChange={(e) => setAdvance(e.target.value)}
              className="mt-1 h-9 w-full rounded-sm border border-slate-300 px-3 text-sm outline-none focus:border-[#1a9ba8]"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 rounded-sm bg-[#c0392b] py-2 text-xs font-bold text-white hover:bg-[#a5321f]">
              ОТМЕНА
            </button>
            <button
              onClick={save}
              disabled={busy}
              className="flex-1 rounded-sm bg-[#24bb69] py-2 text-xs font-bold text-white hover:bg-[#1fa45c] disabled:opacity-50"
            >
              {busy ? "…" : "СОХРАНИТЬ"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
