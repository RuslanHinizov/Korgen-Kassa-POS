"use client";

import { useEffect, useState } from "react";
import { useStoreRouter as useRouter } from "@/components/store/use-store-router";
import { StoreLink as Link } from "@/components/store/store-link";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { ArrowLeft, Loader2 } from "lucide-react";

interface Account { id: string; name: string; type: "CASH" | "NONCASH"; balance: number; allowNegativeBalance: boolean; showAtPos: boolean }
interface HistoryRow { id: string; createdAt: string; type: string; amount: number }

export function AccountDetail({ id }: { id?: string }) {
  const router = useRouter();
  const isCreate = !id;
  const [tab, setTab] = useState<"settings" | "history">("settings");
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(!isCreate);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [type, setType] = useState<"CASH" | "NONCASH">("CASH");
  const [initialBalance, setInitialBalance] = useState("0");
  const [allowNegativeBalance, setAllowNegativeBalance] = useState(false);
  const [showAtPos, setShowAtPos] = useState(false);

  useEffect(() => {
    if (isCreate) return;
    fetch(`/api/finance/accounts/${id}`).then((r) => r.json()).then((d) => {
      const a = d.account as Account;
      setAccount(a); setName(a.name); setType(a.type); setAllowNegativeBalance(a.allowNegativeBalance); setShowAtPos(a.showAtPos);
    }).finally(() => setLoading(false));
  }, [id, isCreate]);

  async function save() {
    if (!name.trim()) { toast.error("Введите название счета"); return; }
    setBusy(true);
    try {
      if (isCreate) {
        const r = await fetch("/api/finance/accounts", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), type, balance: Number(initialBalance) || 0, allowNegativeBalance, showAtPos }),
        });
        if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось создать счет"); return; }
        toast.success("Счет создан");
        router.push("/finance/accounts");
      } else {
        const r = await fetch(`/api/finance/accounts/${id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), type, allowNegativeBalance, showAtPos }),
        });
        if (!r.ok) { toast.error("Не удалось сохранить"); return; }
        toast.success("Сохранено");
      }
    } finally { setBusy(false); }
  }

  if (loading) return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-2xl">
      <Link href="/finance/accounts" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Обзор счетов</Link>

      {!isCreate && (
        <div className="flex gap-6 border-b text-sm font-medium">
          <button onClick={() => setTab("settings")} className={`pb-2 -mb-px border-b-2 ${tab === "settings" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Настройки счета</button>
          <button onClick={() => setTab("history")} className={`pb-2 -mb-px border-b-2 ${tab === "history" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>История счета</button>
        </div>
      )}

      {tab === "settings" || isCreate ? (
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <h1 className="text-lg font-semibold">{isCreate ? "Создание счёта" : "Настройки счета"}</h1>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Название счета*</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="h-9 w-full max-w-sm rounded-md border bg-background px-2 text-sm" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Тип*</label>
            <select value={type} onChange={(e) => setType(e.target.value as "CASH" | "NONCASH")} className="h-9 w-full max-w-sm rounded-md border bg-background px-2 text-sm">
              <option value="CASH">Наличный</option>
              <option value="NONCASH">Безналичный</option>
            </select>
          </div>

          {isCreate && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Начальный баланс</label>
              <input value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} type="number" step="0.01" className="h-9 w-full max-w-sm rounded-md border bg-background px-2 text-sm" />
            </div>
          )}

          {!isCreate && account && (
            <div>
              <p className="text-xs text-muted-foreground">Текущий баланс</p>
              <p className={`text-lg font-semibold ${account.balance < 0 ? "text-destructive" : ""}`}>{formatCurrency(account.balance)}</p>
            </div>
          )}

          <div>
            <label className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <input type="checkbox" checked={allowNegativeBalance} onChange={(e) => setAllowNegativeBalance(e.target.checked)} className="h-4 w-4 accent-primary" />
              Разрешить отрицательный баланс
            </label>
          </div>

          <div>
            <label className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <input type="checkbox" checked={showAtPos} onChange={(e) => setShowAtPos(e.target.checked)} className="h-4 w-4 accent-primary" />
              Отображать на кассе
            </label>
          </div>

          <button onClick={save} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Сохранить
          </button>
        </div>
      ) : (
        <AccountHistory id={id!} />
      )}
    </div>
  );
}

function AccountHistory({ id }: { id: string }) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [account, setAccount] = useState<{ name: string; type: string; balance: number } | null>(null);
  const [totalAmount, setTotalAmount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/finance/accounts/${id}/history`).then((r) => r.json()).then((d) => {
      setRows(d.history ?? []); setAccount(d.account ?? null); setTotalAmount(d.totalAmount ?? 0);
    }).finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      {account && (
        <div className="flex flex-wrap gap-6 text-sm">
          <div><p className="text-xs text-muted-foreground">Название счета</p><p className="font-semibold">{account.name}</p></div>
          <div><p className="text-xs text-muted-foreground">Тип счета</p><p className="font-semibold">{account.type === "CASH" ? "Наличный" : "Безналичный"}</p></div>
          <div><p className="text-xs text-muted-foreground">Общая сумма на счете</p><p className={`font-semibold ${account.balance < 0 ? "text-destructive" : ""}`}>{formatCurrency(account.balance)}</p></div>
        </div>
      )}

      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 text-left">Дата</th>
            <th className="px-3 py-2 text-left">Тип операции</th>
            <th className="px-3 py-2 text-right">Сумма, ₸</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {loading ? (
            <tr><td colSpan={3} className="px-3 py-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">Тут пока пусто</td></tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-1.5 text-muted-foreground">{new Date(r.createdAt).toLocaleString("ru-RU")}</td>
                <td className="px-3 py-1.5">{r.type}</td>
                <td className={`px-3 py-1.5 text-right tabular-nums font-medium ${r.amount < 0 ? "text-destructive" : ""}`}>{formatCurrency(r.amount)}</td>
              </tr>
            ))
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="border-t font-medium">
              <td colSpan={2} className="px-3 py-2">Итого</td>
              <td className={`px-3 py-2 text-right tabular-nums ${totalAmount < 0 ? "text-destructive" : ""}`}>{formatCurrency(totalAmount)}</td>
            </tr>
          </tfoot>
        )}
      </table>
      </div>
    </div>
  );
}
