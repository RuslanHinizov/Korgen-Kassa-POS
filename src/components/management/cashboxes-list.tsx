"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { Loader2, Plus } from "lucide-react";
import { CashboxModal } from "./cashbox-modal";
import { PosPermissionsPanel } from "./pos-permissions-panel";

interface Cashbox {
  id: string;
  no: number;
  name: string;
  active: boolean;
  balance: number | null;
  extraBalance: number | null;
  appVersion: string | null;
  linkedAccountsCount: number;
}

export function CashboxesList() {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const receiptMode = requestedTab === "receipt";
  const [tab, setTab] = useState<"cashboxes" | "permissions">(
    requestedTab === "permissions" ? "permissions" : "cashboxes"
  );
  const [cashboxes, setCashboxes] = useState<Cashbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/management/cashboxes")
      .then((r) => r.json())
      .then((d) => setCashboxes(d.cashboxes ?? []))
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    load();
  }, []);

  async function createCashbox() {
    setCreating(true);
    try {
      const r = await fetch("/api/management/cashboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `Касса-${cashboxes.length + 1}` }),
      });
      if (!r.ok) {
        toast.error("Не удалось создать кассу");
        return;
      }
      load();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold">
          {receiptMode ? "Управление чеком" : "Управление кассами"}
        </h1>
        {receiptMode && (
          <p className="text-muted-foreground mt-1 text-sm">
            Выберите кассу, чтобы настроить заголовок, подвал, ширину бумаги и формат чека.
          </p>
        )}
      </div>

      <div className="flex gap-6 border-b text-sm font-medium">
        <button
          onClick={() => setTab("cashboxes")}
          className={`-mb-px border-b-2 pb-2 ${tab === "cashboxes" ? "border-primary text-primary" : "text-muted-foreground hover:text-foreground border-transparent"}`}
        >
          Кассы
        </button>
        <button
          onClick={() => setTab("permissions")}
          className={`-mb-px border-b-2 pb-2 ${tab === "permissions" ? "border-primary text-primary" : "text-muted-foreground hover:text-foreground border-transparent"}`}
        >
          Настройка разрешений на кассе
        </button>
      </div>

      {tab === "permissions" ? (
        <PosPermissionsPanel />
      ) : (
        <>
          <button
            onClick={createCashbox}
            disabled={creating}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-medium disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{" "}
            Создать кассу
          </button>

          <div className="bg-card overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground border-b text-xs font-medium tracking-wide uppercase">
                  <th className="px-4 py-2.5 text-left">ID</th>
                  <th className="px-4 py-2.5 text-left">Название</th>
                  <th className="px-4 py-2.5 text-left">Статус активности</th>
                  <th className="px-4 py-2.5 text-left">Версия</th>
                  <th className="px-4 py-2.5 text-right">Наличными</th>
                  <th className="px-4 py-2.5 text-right">Безналичными</th>
                  <th className="px-4 py-2.5 text-right">Привязанные счета</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-muted-foreground px-4 py-8 text-center">
                      <Loader2 className="inline h-5 w-5 animate-spin" />
                    </td>
                  </tr>
                ) : cashboxes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-muted-foreground px-4 py-8 text-center">
                      Тут пока пусто
                    </td>
                  </tr>
                ) : (
                  cashboxes.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/40">
                      <td className="text-muted-foreground px-4 py-2.5">{c.no}</td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => setOpenId(c.id)}
                          className="text-primary hover:underline"
                        >
                          {c.name}
                        </button>
                      </td>
                      <td className="px-4 py-2.5">{c.active ? "Активна" : "Не активна"}</td>
                      <td className="text-muted-foreground px-4 py-2.5">{c.appVersion ?? ""}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {c.balance !== null ? formatCurrency(c.balance) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {c.extraBalance !== null ? formatCurrency(c.extraBalance) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">{c.linkedAccountsCount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {openId && (
        <CashboxModal
          id={openId}
          initialTab={receiptMode ? "receipt" : "general"}
          onClose={() => setOpenId(null)}
          onSaved={() => {
            setOpenId(null);
            load();
          }}
          onDeleted={() => {
            setOpenId(null);
            load();
          }}
        />
      )}
    </div>
  );
}
