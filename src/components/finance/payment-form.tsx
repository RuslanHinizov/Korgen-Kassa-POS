"use client";

import { useEffect, useState } from "react";
import { useStoreRouter as useRouter } from "@/components/store/use-store-router";
import { StoreLink as Link } from "@/components/store/store-link";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";

interface Account { id: string; name: string; balance: number }
interface ExpenseType { id: string; name: string; active: boolean }

export function PaymentForm({ direction: directionProp, id }: { direction?: "IN" | "OUT"; id?: string }) {
  const router = useRouter();
  const isCreate = !id;
  const [loading, setLoading] = useState(!isCreate);
  const [busy, setBusy] = useState(false);
  const [documentNo, setDocumentNo] = useState<number | null>(null);
  const [direction, setDirection] = useState<"IN" | "OUT">(directionProp ?? "OUT");

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [expenseTypeId, setExpenseTypeId] = useState("");
  const [comment, setComment] = useState("");

  useEffect(() => {
    fetch("/api/finance/accounts").then((r) => r.json()).then((d) => setAccounts(d.accounts ?? []));
  }, []);

  useEffect(() => {
    if (direction === "OUT") fetch("/api/finance/expense-types?activeOnly=1").then((r) => r.json()).then((d) => setExpenseTypes(d.expenseTypes ?? []));
  }, [direction]);

  useEffect(() => {
    if (isCreate) return;
    fetch(`/api/finance/payments/${id}`).then((r) => r.json()).then((d) => {
      const p = d.payment;
      setDocumentNo(p.documentNo); setDirection(p.direction); setAmount(String(p.amount)); setAccountId(p.accountId);
      setExpenseTypeId(p.expenseTypeId ?? ""); setComment(p.comment ?? "");
    }).finally(() => setLoading(false));
  }, [id, isCreate]);

  async function save() {
    const val = Number(amount);
    if (!val || val <= 0) { toast.error("Введите сумму"); return; }
    if (!accountId) { toast.error("Выберите счет"); return; }
    if (direction === "OUT" && !expenseTypeId) { toast.error("Выберите назначение платежа"); return; }
    setBusy(true);
    try {
      if (isCreate) {
        const r = await fetch("/api/finance/payments", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ direction, amount: val, accountId, expenseTypeId: direction === "OUT" ? expenseTypeId : undefined, comment: comment || undefined }),
        });
        if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось сохранить"); return; }
      } else {
        const r = await fetch(`/api/finance/payments/${id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: val, accountId, expenseTypeId: direction === "OUT" ? expenseTypeId : null, comment: comment || null }),
        });
        if (!r.ok) { toast.error("Не удалось сохранить"); return; }
      }
      toast.success("Сохранено");
      router.push("/finance/payments");
    } finally { setBusy(false); }
  }

  if (loading) return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-2xl">
      <Link href="/finance/payments" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Платежи</Link>

      <div className="rounded-lg border bg-card p-5 space-y-4">
        <h1 className="text-lg font-semibold">
          {direction === "OUT" ? "Расход" : "Приход"} {documentNo ? `№ ${documentNo}` : ""}
        </h1>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Сумма</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" step="0.01" className="h-9 w-full max-w-sm rounded-md border bg-background px-2 text-sm" />
        </div>

        {direction === "OUT" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Назначение платежа</label>
            <select value={expenseTypeId} onChange={(e) => setExpenseTypeId(e.target.value)} className="h-9 w-full max-w-sm rounded-md border bg-background px-2 text-sm">
              <option value="">Выберите значение</option>
              {expenseTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Счет</label>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="h-9 w-full max-w-sm rounded-md border bg-background px-2 text-sm">
            <option value="">Выберите значение</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
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
