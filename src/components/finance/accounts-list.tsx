"use client";

import { useEffect, useState } from "react";
import { StoreLink as Link } from "@/components/store/store-link";
import { formatCurrency } from "@/lib/utils";
import { Loader2, Plus } from "lucide-react";

interface Account { id: string; name: string; type: "CASH" | "NONCASH"; balance: number; allowNegativeBalance: boolean }

const TYPE_LABEL: Record<string, string> = { CASH: "Наличный", NONCASH: "Безналичный" };

export function AccountsList() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/finance/accounts").then((r) => r.json()).then((d) => setAccounts(d.accounts ?? [])).finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Обзор счетов</h1>
        <Link href="/finance/accounts/create" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Счет
        </Link>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 text-left">Счет</th>
              <th className="px-4 py-2.5 text-left">Тип</th>
              <th className="px-4 py-2.5 text-right">Сумма, ₸</th>
              <th className="px-4 py-2.5 text-left">Отрицательный баланс</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
            ) : accounts.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Тут пока пусто</td></tr>
            ) : (
              accounts.map((a) => (
                <tr key={a.id} className="hover:bg-muted/40">
                  <td className="px-4 py-2.5"><Link href={`/finance/accounts/${a.id}`} className="text-primary hover:underline">{a.name}</Link></td>
                  <td className="px-4 py-2.5 text-muted-foreground">{TYPE_LABEL[a.type]}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${a.balance < 0 ? "text-destructive" : ""}`}>{formatCurrency(a.balance)}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{a.allowNegativeBalance ? "Разрешен" : "Не разрешен"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
