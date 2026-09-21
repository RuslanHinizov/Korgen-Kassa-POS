"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface ExpenseType { id: string; name: string; active: boolean; manageable: boolean }

export function ExpenseTypesList() {
  const [types, setTypes] = useState<ExpenseType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/finance/expense-types")
      .then((r) => r.json())
      .then((d) => setTypes(d.expenseTypes ?? []))
      .finally(() => setLoading(false));
  }, []);

  const manageable = types.filter((t) => t.manageable);

  function toggle(id: string) {
    setTypes((prev) => prev.map((t) => (t.id === id ? { ...t, active: !t.active } : t)));
  }

  async function save() {
    setSaving(true);
    try {
      const r = await fetch("/api/finance/expense-types", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: manageable.map((t) => ({ id: t.id, active: t.active })) }),
      });
      if (!r.ok) { toast.error("Не удалось сохранить"); return; }
      toast.success("Сохранено");
    } finally { setSaving(false); }
  }

  if (loading) return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <h1 className="text-lg font-semibold">Типы расходов</h1>
      <p className="text-sm text-muted-foreground">Количество типов {manageable.length}</p>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 text-left">Название</th>
              <th className="px-4 py-2.5 text-left">Активно</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {manageable.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-2.5">{t.name}</td>
                <td className="px-4 py-2.5">
                  <input type="checkbox" checked={t.active} onChange={() => toggle(t.id)} className="h-4 w-4 accent-primary" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button onClick={save} disabled={saving} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
        {saving && <Loader2 className="h-4 w-4 animate-spin" />} Сохранить
      </button>
    </div>
  );
}
