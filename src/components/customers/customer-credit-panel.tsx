"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const METHOD_LABEL: Record<string, string> = { CASH: "Наличные", CARD: "Карта", OTHER: "Другое" };

export function CustomerCreditPanel({ customerId, balance }: { customerId: string; balance: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/finance/accounts").then((r) => r.json()).then((d) => {
      setAccounts(d.accounts ?? []);
      if (d.accounts?.[0]) setAccountId((prev) => prev || d.accounts[0].id);
    });
  }, [open]);

  async function repay() {
    const val = Number(amount);
    if (!val || val <= 0) { toast.error("Введите сумму"); return; }
    if (!accountId) { toast.error("Выберите счёт"); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/customers/${customerId}/payments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: val, method, accountId }),
      });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось погасить долг"); return; }
      toast.success("Долг погашен");
      setAmount("");
      setOpen(false);
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div>
      <p className="text-xs text-muted-foreground">Баланс</p>
      <p className={`text-lg font-bold ${balance > 0 ? "text-red-600" : ""}`}>
        {balance > 0 ? formatCurrency(balance) : "Долга нет"}
      </p>
      {balance > 0 && (
        <>
          {!open ? (
            <button onClick={() => setOpen(true)} className="mt-1 text-xs font-medium text-primary hover:underline">
              Погасить долг
            </button>
          ) : (
            <div className="mt-2 space-y-2 rounded-md border p-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Сумма</label>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" max={balance} step="0.01" className="h-8 w-full rounded-md border bg-background px-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Способ</label>
                <select value={method} onChange={(e) => setMethod(e.target.value)} className="h-8 w-full rounded-md border bg-background px-2 text-sm">
                  {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Счёт</label>
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="h-8 w-full rounded-md border bg-background px-2 text-sm">
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setOpen(false)} className="flex-1 rounded-md border py-1.5 text-xs font-medium hover:bg-accent">Отмена</button>
                <button onClick={repay} disabled={busy} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-primary py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Погасить
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
