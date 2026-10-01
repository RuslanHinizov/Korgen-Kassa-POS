"use client";

import { useEffect, useState } from "react";
import { StoreLink as Link } from "@/components/store/store-link";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { Copy, Loader2, X } from "lucide-react";

interface CashboxDetail {
  id: string;
  no: number;
  name: string;
  active: boolean;
  oneTimeKey: string | null;
  pairedAt: string | null;
  accountName: string | null;
  cashBalance: number;
  extraAccountId: string | null;
  extraAccountName: string | null;
  extraBalance: number;
  lastSyncAt: string | null;
  appVersion: string | null;
  platform: string | null;
  receiptHeaderText: string;
  receiptFooterText: string;
  receiptCyrillicCodepage: number;
  receiptPaperWidth: number;
  receiptTabularView: boolean;
  receiptPrintVat: boolean;
}
interface Account {
  id: string;
  name: string;
  type: "CASH" | "NONCASH";
}

const CODEPAGES = [7, 866, 1251];
const PAPER_WIDTHS = [58, 80];

function fmtSync(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CashboxModal({
  id,
  onClose,
  onSaved,
  onDeleted,
  initialTab = "general",
}: {
  id: string;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  initialTab?: "general" | "receipt" | "accounts";
}) {
  const [tab, setTab] = useState<"general" | "receipt" | "accounts">(initialTab);
  const [data, setData] = useState<CashboxDetail | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/management/cashboxes/${id}`).then((r) => r.json()),
      fetch("/api/finance/accounts").then((r) => r.json()),
    ])
      .then(([cb, acc]) => {
        setData(cb.cashbox);
        setAccounts(acc.accounts ?? []);
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function save() {
    if (!data) return;
    if (!data.name.trim()) {
      toast.error("Введите название кассы");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/management/cashboxes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name.trim(),
          active: data.active,
          extraAccountId: data.extraAccountId,
          receiptHeaderText: data.receiptHeaderText,
          receiptFooterText: data.receiptFooterText,
          receiptCyrillicCodepage: data.receiptCyrillicCodepage,
          receiptPaperWidth: data.receiptPaperWidth,
          receiptTabularView: data.receiptTabularView,
          receiptPrintVat: data.receiptPrintVat,
        }),
      });
      if (!r.ok) {
        toast.error((await r.json()).error ?? "Не удалось сохранить");
        return;
      }
      toast.success("Сохранено");
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const r = await fetch(`/api/management/cashboxes/${id}`, { method: "DELETE" });
      if (!r.ok) {
        toast.error("Не удалось удалить");
        return;
      }
      toast.success("Касса удалена");
      onDeleted();
    } finally {
      setBusy(false);
    }
  }

  async function copyKey() {
    if (data?.oneTimeKey) {
      try {
        await navigator.clipboard.writeText(data.oneTimeKey);
        toast.success("Код подключения скопирован");
      } catch {
        toast.error("Не удалось скопировать код");
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-background max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border p-5 shadow-2xl"
      >
        {loading || !data ? (
          <div className="p-6">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Редактирование кассы: &quot;{data.name}&quot;</h2>
              <button onClick={onClose}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 flex gap-4 border-b text-sm font-medium">
              <button
                onClick={() => setTab("general")}
                className={`-mb-px border-b-2 pb-2 ${tab === "general" ? "border-primary text-primary" : "text-muted-foreground hover:text-foreground border-transparent"}`}
              >
                Общие настройки
              </button>
              <button
                onClick={() => setTab("receipt")}
                className={`-mb-px border-b-2 pb-2 ${tab === "receipt" ? "border-primary text-primary" : "text-muted-foreground hover:text-foreground border-transparent"}`}
              >
                Настройка чека
              </button>
              <button
                onClick={() => setTab("accounts")}
                className={`-mb-px border-b-2 pb-2 ${tab === "accounts" ? "border-primary text-primary" : "text-muted-foreground hover:text-foreground border-transparent"}`}
              >
                Счета
              </button>
            </div>

            {tab === "general" && (
              <div className="space-y-3">
                <div>
                  <label className="text-muted-foreground mb-1 block text-xs font-medium">
                    Название
                  </label>
                  <input
                    value={data.name}
                    onChange={(e) => setData({ ...data, name: e.target.value })}
                    className="bg-background h-9 w-full rounded-md border px-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-muted-foreground mb-1 block text-xs font-medium">
                    Статус кассы
                  </label>
                  <select
                    value={data.active ? "1" : "0"}
                    onChange={(e) => setData({ ...data, active: e.target.value === "1" })}
                    className="bg-background h-9 w-full rounded-md border px-2 text-sm"
                  >
                    <option value="1">Активна</option>
                    <option value="0">Не активна</option>
                  </select>
                </div>
                <div>
                  <label className="text-muted-foreground mb-1 block text-xs font-medium">
                    Версия кассы
                  </label>
                  <input
                    disabled
                    value={data.appVersion ?? "—"}
                    className="bg-muted text-muted-foreground h-9 w-full rounded-md border px-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-muted-foreground mb-1 block text-xs font-medium">
                    Платформа
                  </label>
                  <input
                    disabled
                    value={data.platform ?? "—"}
                    className="bg-muted text-muted-foreground h-9 w-full rounded-md border px-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-muted-foreground mb-1 block text-xs font-medium">
                    Время последней синхронизации
                  </label>
                  <input
                    disabled
                    value={fmtSync(data.lastSyncAt)}
                    className="bg-muted text-muted-foreground h-9 w-full rounded-md border px-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-muted-foreground mb-1 block text-xs font-medium">
                    Одноразовый код подключения
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      disabled
                      value={data.oneTimeKey ?? ""}
                      placeholder={data.pairedAt ? "Уже подключена" : "Код создаётся автоматически"}
                      className="bg-muted text-muted-foreground h-9 flex-1 rounded-md border px-2 text-sm"
                    />
                    <button
                      onClick={() => void copyKey()}
                      disabled={!data.oneTimeKey}
                      className="hover:bg-accent rounded p-2 disabled:opacity-40"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">Код создаётся вместе с кассой, используется один раз и после подключения не меняется. Переподключение с терминала отключено.</p>
                </div>
              </div>
            )}

            {tab === "receipt" && (
              <div className="space-y-3">
                <div>
                  <label className="text-muted-foreground mb-1 block text-xs font-medium">
                    Текст заголовка чека
                  </label>
                  <input
                    value={data.receiptHeaderText}
                    onChange={(e) => setData({ ...data, receiptHeaderText: e.target.value })}
                    className="bg-background h-9 w-full rounded-md border px-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-muted-foreground mb-1 block text-xs font-medium">
                    Текст нижнего колонтитула чека
                  </label>
                  <input
                    value={data.receiptFooterText}
                    onChange={(e) => setData({ ...data, receiptFooterText: e.target.value })}
                    className="bg-background h-9 w-full rounded-md border px-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-muted-foreground mb-1 block text-xs font-medium">
                    Номер кодировки кириллицы на принтере
                  </label>
                  <select
                    value={data.receiptCyrillicCodepage}
                    onChange={(e) =>
                      setData({ ...data, receiptCyrillicCodepage: Number(e.target.value) })
                    }
                    className="bg-background h-9 w-full rounded-md border px-2 text-sm"
                  >
                    {CODEPAGES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-muted-foreground mb-1 block text-xs font-medium">
                    Размер ширины бумаги
                  </label>
                  <select
                    value={data.receiptPaperWidth}
                    onChange={(e) =>
                      setData({ ...data, receiptPaperWidth: Number(e.target.value) })
                    }
                    className="bg-background h-9 w-full rounded-md border px-2 text-sm"
                  >
                    {PAPER_WIDTHS.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={data.receiptTabularView}
                    onChange={(e) => setData({ ...data, receiptTabularView: e.target.checked })}
                    className="accent-primary h-4 w-4"
                  />
                  Табличный вид чека
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={data.receiptPrintVat}
                    onChange={(e) => setData({ ...data, receiptPrintVat: e.target.checked })}
                    className="accent-primary h-4 w-4"
                  />
                  Печать НДС в чеке
                </label>
              </div>
            )}

            {tab === "accounts" && (
              <div className="space-y-3">
                <div>
                  <label className="text-muted-foreground mb-1 block text-xs font-medium">
                    Остаток наличными на кассе
                  </label>
                  <input
                    disabled
                    value={formatCurrency(data.cashBalance)}
                    className="bg-muted text-muted-foreground h-9 w-full rounded-md border px-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-muted-foreground mb-1 block text-xs font-medium">
                    Остаток безналичными на кассе
                  </label>
                  <input
                    disabled
                    value={formatCurrency(data.extraAccountId ? data.extraBalance : 0)}
                    className="bg-muted text-muted-foreground h-9 w-full rounded-md border px-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-muted-foreground mb-1 block text-xs font-medium">
                    Привязанные счета
                  </label>
                  <select
                    value={data.extraAccountId ?? ""}
                    onChange={(e) => setData({ ...data, extraAccountId: e.target.value || null })}
                    className="bg-background h-9 w-full rounded-md border px-2 text-sm"
                  >
                    <option value="">{data.accountName ?? "—"}</option>
                    {accounts
                      .filter((a) => a.type === "NONCASH")
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </div>
                <p className="text-muted-foreground text-xs">
                  Подробнее по счетам в разделе{" "}
                  <Link href="/finance/accounts" className="text-primary hover:underline">
                    Финансы
                  </Link>
                </p>
                <p className="text-muted-foreground text-xs">
                  *К кассе можно привязать только безналичные счета
                </p>
              </div>
            )}

            <div className="mt-5 flex gap-2">
              <button
                onClick={save}
                disabled={busy}
                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-medium disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Сохранить
              </button>
              <button
                onClick={remove}
                disabled={busy}
                className="border-destructive/50 text-destructive hover:bg-destructive/10 h-9 rounded-md border px-4 text-sm font-medium"
              >
                Удалить
              </button>
              <button
                onClick={onClose}
                className="hover:bg-accent h-9 rounded-md border px-4 text-sm font-medium"
              >
                Отменить
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
