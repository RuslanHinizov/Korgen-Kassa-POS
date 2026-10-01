"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { CircleHelp, Copy, Loader2, Pencil, Plus } from "lucide-react";
import { CashboxModal } from "./cashbox-modal";
import { PosPermissionsPanel } from "./pos-permissions-panel";

interface Cashbox {
  id: string;
  no: number;
  name: string;
  active: boolean;
  oneTimeKey: string | null;
  pairedAt: string | null;
  balance: number | null;
  extraBalance: number | null;
  appVersion: string | null;
  lastSyncAt: string | null;
  linkedAccountsCount: number;
}

export function CashboxesList() {
  const [tab, setTab] = useState<"cashboxes" | "permissions">("cashboxes");
  const [cashboxes, setCashboxes] = useState<Cashbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openTab, setOpenTab] = useState<"general" | "accounts">("general");

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
      const data = await r.json();
      setOpenTab("general");
      setOpenId(data.cashbox.id);
      load();
    } finally {
      setCreating(false);
    }
  }

  async function copySetupCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Код подключения скопирован");
    } catch {
      toast.error("Не удалось скопировать код");
    }
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <h1 className="flex items-center gap-2 text-lg font-semibold">
        Управление кассами
        <span title="Здесь настраиваются кассы: статус, ключ подключения, чек и счета. Вкладка «Настройка разрешений на кассе» задаёт, что можно делать на кассе." className="text-primary"><CircleHelp className="h-4 w-4" /></span>
      </h1>

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
                  <th className="px-4 py-2.5 text-left">Код подключения</th>
                  <th className="px-4 py-2.5 text-left">Версия</th>
                  <th className="px-4 py-2.5 text-left">Послед. время синхр.</th>
                  <th className="px-4 py-2.5 text-right">Остаток на счету</th>
                  <th className="px-4 py-2.5 text-right">Привязанные счета</th>
                  <th className="w-12 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="text-muted-foreground px-4 py-8 text-center">
                      <Loader2 className="inline h-5 w-5 animate-spin" />
                    </td>
                  </tr>
                ) : cashboxes.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-muted-foreground px-4 py-8 text-center">
                      Тут пока пусто
                    </td>
                  </tr>
                ) : (
                  cashboxes.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/40">
                      <td className="text-muted-foreground px-4 py-2.5">{c.no}</td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => { setOpenTab("general"); setOpenId(c.id); }}
                          className="text-primary hover:underline"
                        >
                          {c.name}
                        </button>
                      </td>
                      <td className="px-4 py-2.5">{c.active ? "Активна" : "Не активна"}</td>
                      <td className="px-4 py-2.5">
                        {c.oneTimeKey ? (
                          <button onClick={() => void copySetupCode(c.oneTimeKey!)} className="inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs hover:bg-accent" aria-label={`Скопировать код ${c.name}`}>
                            <Copy className="h-3.5 w-3.5" /> {c.oneTimeKey}
                          </button>
                        ) : c.pairedAt ? <span className="text-muted-foreground text-xs">Уже подключена</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="text-muted-foreground px-4 py-2.5">{c.appVersion ? `V pos ${c.appVersion}` : ""}</td>
                      <td className="text-muted-foreground px-4 py-2.5 whitespace-nowrap">{c.lastSyncAt ? new Date(c.lastSyncAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {c.balance !== null ? formatCurrency(c.balance) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => { setOpenTab("accounts"); setOpenId(c.id); }} className="text-primary hover:underline">{c.linkedAccountsCount}</button>
                      </td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => { setOpenTab("general"); setOpenId(c.id); }} className="text-primary hover:bg-accent inline-flex h-8 w-8 items-center justify-center rounded" aria-label="Редактировать"><Pencil className="h-4 w-4" /></button>
                      </td>
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
          initialTab={openTab}
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
