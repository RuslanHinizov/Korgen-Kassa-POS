"use client";

import { useEffect, useState } from "react";
import { useStoreRouter as useRouter } from "@/components/store/use-store-router";
import { StoreLink as Link } from "@/components/store/store-link";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";

interface Account { id: string; name: string }

export function TransferForm({ id }: { id?: string }) {
  const router = useRouter();
  const isCreate = !id;
  const [loading, setLoading] = useState(!isCreate);
  const [busy, setBusy] = useState(false);
  const [documentNo, setDocumentNo] = useState<number | null>(null);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");

  useEffect(() => {
    fetch("/api/finance/accounts").then((r) => r.json()).then((d) => setAccounts(d.accounts ?? []));
  }, []);

  useEffect(() => {
    if (isCreate) return;
    fetch(`/api/finance/transfers/${id}`).then((r) => r.json()).then((d) => {
      const t = d.transfer;
      setDocumentNo(t.documentNo); setFromAccountId(t.fromAccountId); setToAccountId(t.toAccountId);
      setAmount(String(t.amount)); setComment(t.comment ?? "");
    }).finally(() => setLoading(false));
  }, [id, isCreate]);

  async function save() {
    const val = Number(amount);
    if (!val || val <= 0) { toast.error("Введите сумму"); return; }
    if (!fromAccountId) { toast.error("Выберите счёт списания"); return; }
    if (!toAccountId) { toast.error("Выберите счёт зачисления"); return; }
    if (fromAccountId === toAccountId) { toast.error("Счета должны отличаться"); return; }
    setBusy(true);
    try {
      const url = isCreate ? "/api/finance/transfers" : `/api/finance/transfers/${id}`;
      const r = await fetch(url, {
        method: isCreate ? "POST" : "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromAccountId, toAccountId, amount: val, comment: comment || undefined }),
      });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось сохранить"); return; }
      toast.success("Сохранено");
      router.push("/finance/transfers");
    } finally { setBusy(false); }
  }

  if (loading) return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-2xl">
      <Link href="/finance/transfers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Переводы</Link>

      <div className="rounded-lg border bg-card p-5 space-y-4">
        <h1 className="text-lg font-semibold">Создание перевода {documentNo ? `№ ${documentNo}` : ""}</h1>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Перевести со счета</label>
          <select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)} className="h-9 w-full max-w-sm rounded-md border bg-background px-2 text-sm">
            <option value="">Выберите значение</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Перевести на счёт</label>
          <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} className="h-9 w-full max-w-sm rounded-md border bg-background px-2 text-sm">
            <option value="">Выберите значение</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Сумма</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" step="0.01" placeholder="00.00" className="h-9 w-full max-w-sm rounded-md border bg-background px-2 text-sm" />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Комментарий</label>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
        </div>

        <button onClick={save} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Сохранить
        </button>
      </div>
    </div>
  );
}
