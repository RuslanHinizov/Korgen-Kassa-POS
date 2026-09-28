"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { formatPhoneInput } from "@/lib/phone";
import { refreshCustomerCache, searchCachedCustomers } from "@/lib/offline/customers";
import { X } from "lucide-react";

export interface Debtor {
  id: string;
  name: string;
  phone: string | null;
  balance: number;
  lastVisit: string | null;
}

/**
 * В ДОЛГ — full-screen debtor picker, matching UMAG exactly (docs/kasa-offline-plan.md §3.0, §6b, §7):
 * turquoise top bar, НОВЫЙ ДОЛЖНИК + search + table (Полное имя/Тел. номер/Сумма/Дата и время).
 * Two modes, matching the two places UMAG opens this same screen from:
 *   - "credit" (from the payment screen's В долг tab): bottom card shows the sale-to-debt summary,
 *     НАЗАД (returns to the sale screen, cart kept) / ЗАПИСАТЬ.
 *   - "repay" (from Доп. функции → ДОЛГ): no sale to attach, just pick a debtor and pay down their
 *     balance — НАЗАД / ПОГАСИТЬ.
 *
 * Reuses the existing customer search/create/balance endpoints (`/api/customers`) — no new API needed.
 */
export function DebtScreen({
  mode = "credit",
  saleTotal = 0,
  onBack,
  onRecord,
  onRepay,
  recording,
  error,
}: {
  mode?: "credit" | "repay";
  saleTotal?: number;
  onBack: () => void;
  onRecord?: (debtor: Debtor) => void;
  onRepay?: (debtor: Debtor, amount: number) => void;
  recording?: boolean;
  error?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Debtor[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Debtor | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [repayAmount, setRepayAmount] = useState("");

  async function search(q: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/customers?q=${encodeURIComponent(q)}&limit=50`);
      if (!res.ok) throw new Error("offline");
      const data = await res.json();
      setResults(
        (data.customers ?? []).map((c: { id: string; name: string; phone: string | null; balance: number; lastVisit: string | null }) => ({
          id: c.id, name: c.name, phone: c.phone, balance: c.balance, lastVisit: c.lastVisit,
        }))
      );
      void refreshCustomerCache();
    } catch {
      // No connection: this till's own cached customer list, name/phone only — a stale balance would be
      // misleading, so it's shown as unknown (0) rather than guessed; the credit sale itself still queues
      // safely offline regardless (see submitSale) and the server has the real balance when it uploads.
      const cached = await searchCachedCustomers(q);
      setResults(cached.map((c) => ({ id: c.id, name: c.name, phone: c.phone, balance: 0, lastVisit: null })));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => void search(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  function select(c: Debtor) {
    setSelected(c);
    setRepayAmount(c.balance > 0 ? String(c.balance) : "");
  }

  const totalDebt = selected ? selected.balance + saleTotal : 0;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-white text-[#172b1d]">
      <div className="flex h-10 shrink-0 items-center gap-3 bg-[#1a9ba8] px-3 text-sm font-semibold text-white">
        В долг
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-4">
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="rounded-sm bg-[#24bb69] px-4 py-2 text-xs font-bold text-white hover:bg-[#1fa45c]"
          >
            НОВЫЙ ДОЛЖНИК
          </button>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по имени или телефону"
            className="h-9 flex-1 rounded-sm border border-slate-300 px-3 text-sm outline-none focus:border-[#1a9ba8]"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-sm border border-slate-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#e9ecef] text-left text-xs font-bold uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2">Полное имя</th>
                <th className="px-3 py-2">Тел. номер</th>
                <th className="px-3 py-2 text-right">Сумма</th>
                <th className="px-3 py-2">Дата и время</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400">Загрузка…</td></tr>
              ) : results.length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400">Ничего не найдено</td></tr>
              ) : (
                results.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => select(c)}
                    className={`cursor-pointer border-t ${selected?.id === c.id ? "bg-[#1a9ba8]/10" : "hover:bg-slate-50"}`}
                  >
                    <td className="px-3 py-2 font-medium">{c.name}</td>
                    <td className="px-3 py-2">{c.phone ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(c.balance)}</td>
                    <td className="px-3 py-2">{c.lastVisit ? new Date(c.lastVisit).toLocaleString("ru-RU") : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="shrink-0 border-t bg-slate-50 p-4">
        {mode === "credit" ? (
          <div className="mb-3 rounded-sm border border-slate-200 bg-white p-3 text-sm">
            <p>Продажа в долг на сумму <strong>{formatCurrency(saleTotal)}</strong></p>
            <p>Должник: <strong>{selected ? selected.name : "не выбран"}</strong></p>
            <p>Общая сумма долга <strong>{formatCurrency(totalDebt)}</strong></p>
          </div>
        ) : (
          <div className="mb-3 rounded-sm border border-slate-200 bg-white p-3 text-sm">
            <p>Должник: <strong>{selected ? selected.name : "не выбран"}</strong></p>
            <p className="mb-2">Текущий долг: <strong>{formatCurrency(selected?.balance ?? 0)}</strong></p>
            {selected && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-600">Сумма погашения</label>
                <input
                  type="number"
                  min={0}
                  max={selected.balance}
                  step={0.01}
                  value={repayAmount}
                  onChange={(e) => setRepayAmount(e.target.value)}
                  className="h-8 w-32 rounded-sm border border-slate-300 px-2 text-sm outline-none focus:border-[#1a9ba8]"
                />
              </div>
            )}
          </div>
        )}
        {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-sm bg-slate-300 px-6 py-3 text-sm font-bold text-slate-700 hover:bg-slate-400"
          >
            НАЗАД
          </button>
          {mode === "credit" ? (
            <button
              type="button"
              disabled={!selected || recording}
              onClick={() => selected && onRecord?.(selected)}
              className="flex-1 rounded-sm bg-[#24bb69] py-3 text-sm font-bold text-white hover:bg-[#1fa45c] disabled:pointer-events-none disabled:opacity-50"
            >
              {recording ? "…" : "ЗАПИСАТЬ"}
            </button>
          ) : (
            <button
              type="button"
              disabled={!selected || !(parseFloat(repayAmount) > 0) || recording}
              onClick={() => selected && onRepay?.(selected, parseFloat(repayAmount))}
              className="flex-1 rounded-sm bg-[#24bb69] py-3 text-sm font-bold text-white hover:bg-[#1fa45c] disabled:pointer-events-none disabled:opacity-50"
            >
              {recording ? "…" : "ПОГАСИТЬ"}
            </button>
          )}
        </div>
      </div>

      {newOpen && (
        <NewDebtorForm
          onCancel={() => setNewOpen(false)}
          onCreated={(c) => { select(c); setNewOpen(false); }}
        />
      )}
    </div>
  );
}

function NewDebtorForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (d: Debtor) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+7");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    if (!name.trim() || phone.replace(/\D/g, "").length < 11) {
      setError("Заполните имя и телефон");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Не удалось создать");
        return;
      }
      onCreated({ id: data.customer.id, name: data.customer.name, phone: data.customer.phone, balance: 0, lastVisit: null });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-sm border bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold">Новый должник</h2>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-600">*Полное имя</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 h-9 w-full rounded-sm border border-slate-300 px-3 text-sm outline-none focus:border-[#1a9ba8]"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">*Номер телефона</label>
            <input
              value={phone}
              onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
              placeholder="+7 (7__) ___ __ __"
              className="mt-1 h-9 w-full rounded-sm border border-slate-300 px-3 text-sm outline-none focus:border-[#1a9ba8]"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={onCancel} className="flex-1 rounded-sm border border-slate-300 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">
              ОТМЕНИТЬ
            </button>
            <button
              onClick={create}
              disabled={busy}
              className="flex-1 rounded-sm bg-[#24bb69] py-2 text-xs font-bold text-white hover:bg-[#1fa45c] disabled:opacity-50"
            >
              {busy ? "…" : "СОЗДАТЬ"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
