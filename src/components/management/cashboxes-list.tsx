"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { CircleHelp, Download, Loader2, Pencil, Plus } from "lucide-react";
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
  lastSyncAt: string | null;
  linkedAccountsCount: number;
}

interface TillKey {
  id: string;
  label: string;
  createdAt: string;
  lastSeenAt: string | null;
}

/** Upload keys handed out inside market packages: revoke one when a flash drive / package file is lost. */
function TillKeys() {
  const [keys, setKeys] = useState<TillKey[] | null>(null);
  function load() {
    fetch("/api/till-package/keys")
      .then((r) => (r.ok ? r.json() : { keys: [] }))
      .then((d) => setKeys(d.keys ?? []))
      .catch(() => setKeys([]));
  }
  useEffect(load, []);
  async function revoke(k: TillKey) {
    if (!confirm(`Отозвать ключ «${k.label}»? Кассы с этим пакетом перестанут отправлять данные, пока не загрузят новый пакет.`)) return;
    const res = await fetch(`/api/till-package/keys/${k.id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Ключ отозван"); load(); } else toast.error("Не удалось отозвать ключ");
  }
  if (!keys || keys.length === 0) return null;
  const fmt = (v: string | null) => (v ? new Date(v).toLocaleString("ru-RU") : "—");
  return (
    <div className="bg-card rounded-lg border">
      <div className="border-b px-4 py-2.5 text-sm font-medium">Ключи касс (выданы вместе с пакетами)</div>
      <table className="w-full text-sm">
        <thead className="text-muted-foreground text-left text-xs">
          <tr><th className="px-4 py-2 font-medium">Ключ</th><th className="px-4 py-2 font-medium">Выдан</th><th className="px-4 py-2 font-medium">Последняя связь</th><th /></tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k.id} className="border-t">
              <td className="px-4 py-2">{k.label}</td>
              <td className="px-4 py-2">{fmt(k.createdAt)}</td>
              <td className="px-4 py-2">{fmt(k.lastSeenAt)}</td>
              <td className="px-4 py-2 text-right">
                <button onClick={() => void revoke(k)} className="text-destructive hover:underline">Отозвать</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One-time code for a new till program: it types it and downloads its market package by itself. */
function ActivationCodeBox({ cashboxes }: { cashboxes: { id: string; name: string }[] }) {
  const [result, setResult] = useState<{ code: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [cashboxId, setCashboxId] = useState("");
  const chosen = cashboxId || cashboxes[0]?.id || "";
  async function create() {
    setBusy(true);
    try {
      const res = await fetch("/api/till-package/activation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cashboxId: chosen || undefined }) });
      if (res.ok) setResult(await res.json());
      else toast.error("Не удалось создать код");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
      <div className="text-sm">
        <div className="font-medium">Код активации кассы</div>
        <div className="text-muted-foreground">Введите код в программе кассы — она сама загрузит данные магазина. Код одноразовый и действует 24 часа.</div>
      </div>
      {cashboxes.length > 0 && (
        <label className="text-sm">
          <span className="text-muted-foreground mr-2">Это касса:</span>
          <select value={chosen} onChange={(e) => { setCashboxId(e.target.value); setResult(null); }} className="bg-background h-9 rounded-md border px-2 text-sm" data-testid="activation-cashbox">
            {cashboxes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      {result ? (
        <div className="text-right">
          <div className="text-2xl font-bold tracking-widest tabular-nums" data-testid="activation-code">{result.code}</div>
          <div className="text-muted-foreground text-xs">до {new Date(result.expiresAt).toLocaleString("ru-RU")}</div>
        </div>
      ) : null}
      <button onClick={() => void create()} disabled={busy} className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-medium disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {result ? "Новый код" : "Создать код"}
      </button>
    </div>
  );
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
      setOpenId(data.cashbox.id);
      load();
    } finally {
      setCreating(false);
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

          <ActivationCodeBox cashboxes={cashboxes} />

          <div className="bg-card overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground border-b text-xs font-medium tracking-wide uppercase">
                  <th className="px-4 py-2.5 text-left">ID</th>
                  <th className="px-4 py-2.5 text-left">Название</th>
                  <th className="px-4 py-2.5 text-left">Статус активности</th>
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
                    <td colSpan={8} className="text-muted-foreground px-4 py-8 text-center">
                      <Loader2 className="inline h-5 w-5 animate-spin" />
                    </td>
                  </tr>
                ) : cashboxes.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-muted-foreground px-4 py-8 text-center">
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

          <div className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
            <div className="text-sm">
              <div className="font-medium">Пакет для офлайн-кассы</div>
              <div className="text-muted-foreground">Файл с товарами, ценами и настройками магазина. Его загружают на кассу с флешки — интернет не нужен.</div>
            </div>
            <a href="/api/till-package" download className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-medium">
              <Download className="h-4 w-4" /> Скачать пакет
            </a>
          </div>

          <TillKeys />
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
