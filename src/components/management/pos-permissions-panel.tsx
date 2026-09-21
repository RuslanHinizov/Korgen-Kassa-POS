"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Permissions {
  posCollapseWindow: boolean; posInstantSync: boolean; posShowSalesHistory: boolean; posNewReceiptFormat: boolean; posGlobalSearch: boolean;
  posUniversalProduct: boolean; posEditProductAtPos: boolean; posHoldOrder: boolean; posDiscount: boolean; posCreditSale: boolean; posCashInOut: boolean;
  posSplitCounterparty: boolean; posWholesaleAtPos: boolean;
  posPriceCheck: boolean; posBanPriceDecrease: boolean; posChangePriceAtPos: boolean; posCardPayment: boolean; posSalesOverMillion: boolean;
  posAccessReturn: string; posAccessReturnNoReceipt: string; posAccessDeleteItem: string; posAccessDecreaseQty: string;
  posRoundingWeightItems: string; posRoundingDiscount: string;
}

const ROLE_OPTIONS = [
  { value: "NOBODY", label: "Никто" },
  { value: "ADMIN", label: "Администраторы" },
  { value: "ALL", label: "Все пользователи" },
];

const ROUNDING_OPTIONS = [
  { value: "NONE", label: "Не округлять" },
  { value: "UP_1", label: "1тг вверх" },
  { value: "DOWN_1", label: "1тг вниз" },
  { value: "UP_5", label: "5тг вверх" },
  { value: "DOWN_5", label: "5тг вниз" },
  { value: "UP_10", label: "10тг вверх" },
  { value: "DOWN_10", label: "10тг вниз" },
  { value: "UP_50", label: "50тг вверх" },
  { value: "DOWN_50", label: "50тг вниз" },
  { value: "UP_100", label: "100тг вверх" },
  { value: "DOWN_100", label: "100тг вниз" },
];

const BASIC = [
  { key: "posCollapseWindow", label: "Сворачивать окно кассы" },
  { key: "posInstantSync", label: "Немедленная синхронизация" },
  { key: "posShowSalesHistory", label: "Показывать историю продаж" },
  { key: "posNewReceiptFormat", label: "Чек нового образца (при закрытие смены)" },
  { key: "posGlobalSearch", label: "Поиск по глобальной базе" },
] as const;

const EXTRA = [
  { key: "posUniversalProduct", label: "Продажа универсального продукта" },
  { key: "posEditProductAtPos", label: "Изменение товара на кассе" },
  { key: "posHoldOrder", label: "Отложка" },
  { key: "posDiscount", label: "Скидка" },
  { key: "posCreditSale", label: "Продажа в долг" },
  { key: "posCashInOut", label: "Внос вынос средств" },
  { key: "posSplitCounterparty", label: "Разделение контрагентов" },
  { key: "posWholesaleAtPos", label: "Оптовые продажи на кассе" },
] as const;

const FINANCE = [
  { key: "posPriceCheck", label: "Проверка цены" },
  { key: "posBanPriceDecrease", label: "Запрет на снижение цен" },
  { key: "posChangePriceAtPos", label: "Изменение цены на кассе" },
  { key: "posCardPayment", label: "Безналичный расчет" },
  { key: "posSalesOverMillion", label: "Продажи свыше миллиона" },
] as const;

const ACCESS = [
  { key: "posAccessReturn", label: "Производить возврат товара могут:" },
  { key: "posAccessReturnNoReceipt", label: "Производить возврат товара без чека могут:" },
  { key: "posAccessDeleteItem", label: "Удалять товар из списка могут:" },
  { key: "posAccessDecreaseQty", label: "Уменьшать кол-во товара могут:" },
] as const;

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
      <div className="space-y-2 pt-1">{children}</div>
    </div>
  );
}

export function PosPermissionsPanel() {
  const [perms, setPerms] = useState<Permissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/management/pos-permissions").then((r) => r.json()).then((d) => setPerms(d.permissions)).finally(() => setLoading(false));
  }, []);

  function toggle(key: keyof Permissions) {
    setPerms((p) => p ? { ...p, [key]: !p[key] } : p);
  }
  function setValue(key: keyof Permissions, value: string) {
    setPerms((p) => p ? { ...p, [key]: value } : p);
  }

  async function save() {
    if (!perms) return;
    setSaving(true);
    try {
      const r = await fetch("/api/management/pos-permissions", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(perms),
      });
      if (!r.ok) { toast.error("Не удалось сохранить"); return; }
      toast.success("Сохранено");
    } finally { setSaving(false); }
  }

  if (loading || !perms) return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <button onClick={save} disabled={saving} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
        {saving && <Loader2 className="h-4 w-4 animate-spin" />} Сохранить
      </button>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Section title="Основные разрешения" subtitle="Разрешить/запретить данные функции">
          {BASIC.map((f) => (
            <label key={f.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={perms[f.key] as boolean} onChange={() => toggle(f.key)} className="h-4 w-4 accent-primary" />
              {f.label}
            </label>
          ))}
        </Section>

        <Section title="Дополнительные функции" subtitle="Добавить функционал на кассу">
          {EXTRA.map((f) => (
            <label key={f.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={perms[f.key] as boolean} onChange={() => toggle(f.key)} className="h-4 w-4 accent-primary" />
              {f.label}
            </label>
          ))}
        </Section>

        <Section title="Финансы" subtitle="Разрешить/запретить данные функции">
          {FINANCE.map((f) => (
            <label key={f.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={perms[f.key] as boolean} onChange={() => toggle(f.key)} className="h-4 w-4 accent-primary" />
              {f.label}
            </label>
          ))}
        </Section>

        <Section title="Выдача доступов на действия в кассе" subtitle="Разрешить/запретить данные функции для разных пользователей">
          {ACCESS.map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-xs text-muted-foreground">{f.label}</label>
              <select value={perms[f.key] as string} onChange={(e) => setValue(f.key, e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          ))}
        </Section>

        <Section title="Округление" subtitle="Выберите фиксированное округление">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Округление весовых товаров:</label>
            <select value={perms.posRoundingWeightItems} onChange={(e) => setValue("posRoundingWeightItems", e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              {ROUNDING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Округление скидки или временной наценки:</label>
            <select value={perms.posRoundingDiscount} onChange={(e) => setValue("posRoundingDiscount", e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              {ROUNDING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </Section>
      </div>
    </div>
  );
}
