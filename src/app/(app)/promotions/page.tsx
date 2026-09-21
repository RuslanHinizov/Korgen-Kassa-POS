"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { Tag, Plus, Trash2, Loader2, X, CreditCard, Power } from "lucide-react";

type PromoType = "PERCENT_OFF" | "AMOUNT_OFF" | "BUY_X_GET_Y" | "BUNDLE_PRICE";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Promo = any;
type Cat = { id: string; name: string; parentId: string | null };
type Card = { id: string; code: string; holderName: string | null; percent: number; active: boolean; customer?: { name: string } | null };

const TYPE_LABEL: Record<PromoType, string> = {
  PERCENT_OFF: "Скидка %", AMOUNT_OFF: "Скидка сумма", BUY_X_GET_Y: "N+M (напр. 2+1)", BUNDLE_PRICE: "Набор за цену",
};
const DAYS = [["1", "Пн"], ["2", "Вт"], ["3", "Ср"], ["4", "Чт"], ["5", "Пт"], ["6", "Сб"], ["7", "Вс"]] as const;

export default function PromotionsPage() {
  const t = useTranslations("nav");
  const [tab, setTab] = useState<"promos" | "cards">("promos");
  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Tag className="h-6 w-6 text-primary" /> {t("promotions")}</h1>
        <div className="ml-auto flex rounded-lg border p-0.5 text-sm">
          {(["promos", "cards"] as const).map((k) => (
            <button key={k} onClick={() => setTab(k)}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {k === "promos" ? "Акции" : "Карты"}
            </button>
          ))}
        </div>
      </div>
      {tab === "promos" ? <Promotions /> : <Cards />}
    </div>
  );
}

/* ───────────── Promotions ───────────── */

function Promotions() {
  const [rows, setRows] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await fetch("/api/promotions").then((r) => r.json())).promotions ?? []); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggle(p: Promo) {
    await fetch(`/api/promotions/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !p.active }) });
    load();
  }
  async function del(p: Promo) {
    if (!confirm(`Удалить «${p.name}»?`)) return;
    await fetch(`/api/promotions/${p.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setCreating(true)} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Новая акция
        </button>
      </div>
      <div className="rounded-lg border bg-card divide-y">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Акций нет</div>
        ) : rows.map((p) => (
          <div key={p.id} className={`flex items-center gap-3 px-4 py-3 ${p.active ? "" : "opacity-50"}`}>
            <button onClick={() => toggle(p)} className={`rounded-full p-1.5 ${p.active ? "text-green-600" : "text-muted-foreground"} hover:bg-accent`} title={p.active ? "Выключить" : "Включить"}>
              <Power className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{p.name}</p>
              <p className="text-xs text-muted-foreground">
                {TYPE_LABEL[p.type as PromoType]}
                {p.scope === "category" && p.category ? ` · ${p.category.name}` : p.scope === "product" && p.product ? ` · ${p.product.name}` : " · вся корзина"}
                {p.type === "PERCENT_OFF" ? ` · −${Number(p.percent)}%` : ""}
                {p.type === "AMOUNT_OFF" ? ` · −${formatCurrency(Number(p.amount))}` : ""}
                {p.type === "BUY_X_GET_Y" ? ` · купи ${p.buyQty}, +${p.getQty} за ${Number(p.getPercent ?? 100)}%` : ""}
                {p.type === "BUNDLE_PRICE" ? ` · ${formatCurrency(Number(p.amount))}` : ""}
                {p.daysOfWeek ? ` · дни ${p.daysOfWeek}` : ""}
                {p.startTime && p.endTime ? ` · ${p.startTime}–${p.endTime}` : ""}
              </p>
            </div>
            <button onClick={() => del(p)} className="rounded p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      {creating && <CreatePromo onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} />}
    </div>
  );
}

function CreatePromo({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [cats, setCats] = useState<Cat[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<PromoType>("PERCENT_OFF");
  const [scope, setScope] = useState<"cart" | "category" | "product">("cart");
  const [categoryId, setCategoryId] = useState("");
  const [productId, setProductId] = useState("");
  const [prodName, setProdName] = useState("");
  const [prodQuery, setProdQuery] = useState("");
  const [prodResults, setProdResults] = useState<{ id: string; name: string }[]>([]);
  const [percent, setPercent] = useState("10");
  const [amount, setAmount] = useState("");
  const [minSubtotal, setMinSubtotal] = useState("");
  const [buyQty, setBuyQty] = useState("2");
  const [getQty, setGetQty] = useState("1");
  const [getPercent, setGetPercent] = useState("100");
  const [priority, setPriority] = useState("0");
  const [days, setDays] = useState<Set<string>>(new Set());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [bundle, setBundle] = useState<{ productId: string; name: string; quantity: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetch("/api/categories").then((r) => r.json()).then((d) => setCats(d.categories ?? [])); }, []);
  useEffect(() => {
    if (!prodQuery.trim()) { setProdResults([]); return; }
    const h = setTimeout(() => fetch(`/api/products/search?q=${encodeURIComponent(prodQuery)}`).then((r) => r.json()).then(setProdResults).catch(() => {}), 250);
    return () => clearTimeout(h);
  }, [prodQuery]);

  async function save() {
    if (!name.trim()) { toast.error("Укажите название"); return; }
    const body: Record<string, unknown> = {
      name: name.trim(), type, active: true, priority: Number(priority) || 0,
      scope: type === "BUNDLE_PRICE" ? "cart" : scope,
      daysOfWeek: days.size ? [...days].sort().join(",") : undefined,
      startTime: startTime || undefined, endTime: endTime || undefined,
      minSubtotal: minSubtotal ? Number(minSubtotal) : undefined,
    };
    if (scope === "category") body.categoryId = categoryId || undefined;
    if (scope === "product") body.productId = productId || undefined;
    if (type === "PERCENT_OFF") body.percent = Number(percent) || 0;
    if (type === "AMOUNT_OFF") body.amount = Number(amount) || 0;
    if (type === "BUY_X_GET_Y") { body.buyQty = Number(buyQty) || 1; body.getQty = Number(getQty) || 1; body.getPercent = Number(getPercent) || 100; }
    if (type === "BUNDLE_PRICE") {
      body.amount = Number(amount) || 0;
      body.bundleItems = bundle.filter((b) => b.productId).map((b) => ({ productId: b.productId, quantity: Number(b.quantity) || 1 }));
      if (!(body.bundleItems as unknown[]).length) { toast.error("Набора товаров нет"); return; }
    }
    setSaving(true);
    try {
      const r = await fetch("/api/promotions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось сохранить"); return; }
      toast.success("Акция создана");
      onDone();
    } finally { setSaving(false); }
  }

  const topCats = cats.filter((c) => !c.parentId);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-lg rounded-xl border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-semibold">Новая акция</h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3 p-5 text-sm">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название акции"
            className="h-9 w-full rounded-md border bg-background px-3" />

          <div className="grid grid-cols-2 gap-2">
            <select value={type} onChange={(e) => setType(e.target.value as PromoType)} className="h-9 rounded-md border bg-background px-2">
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} placeholder="Приоритет" className="h-9 rounded-md border bg-background px-3" />
          </div>

          {type !== "BUNDLE_PRICE" && (
            <div className="flex flex-wrap gap-1.5">
              {(["cart", "category", "product"] as const).map((s) => (
                <button key={s} onClick={() => setScope(s)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${scope === s ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
                  {s === "cart" ? "Вся корзина" : s === "category" ? "Категория" : "Товар"}
                </button>
              ))}
            </div>
          )}
          {scope === "category" && type !== "BUNDLE_PRICE" && (
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2">
              <option value="">— категория —</option>
              {topCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {scope === "product" && type !== "BUNDLE_PRICE" && (
            <div className="relative">
              <input value={productId ? prodName : prodQuery} onChange={(e) => { setProductId(""); setProdQuery(e.target.value); }}
                placeholder="Товар — поиск" className="h-9 w-full rounded-md border bg-background px-3" />
              {prodResults.length > 0 && !productId && (
                <div className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-md border bg-background shadow-lg">
                  {prodResults.map((p) => (
                    <button key={p.id} onClick={() => { setProductId(p.id); setProdName(p.name); setProdResults([]); }} className="block w-full px-3 py-1.5 text-left hover:bg-accent">{p.name}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          {type === "PERCENT_OFF" && (
            <div className="flex items-center gap-2"><span>Скидка</span>
              <input type="number" value={percent} onChange={(e) => setPercent(e.target.value)} className="h-9 w-20 rounded-md border bg-background px-3 text-right" /><span>%</span></div>
          )}
          {type === "AMOUNT_OFF" && (
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Скидка, ₸" className="h-9 rounded-md border bg-background px-3" />
              <input type="number" value={minSubtotal} onChange={(e) => setMinSubtotal(e.target.value)} placeholder="от суммы, ₸" className="h-9 rounded-md border bg-background px-3" />
            </div>
          )}
          {type === "BUY_X_GET_Y" && (
            <div className="flex items-center gap-2 flex-wrap">
              <span>Купи</span><input type="number" value={buyQty} onChange={(e) => setBuyQty(e.target.value)} className="h-9 w-16 rounded-md border bg-background px-2 text-right" />
              <span>получи</span><input type="number" value={getQty} onChange={(e) => setGetQty(e.target.value)} className="h-9 w-16 rounded-md border bg-background px-2 text-right" />
              <span>шт. со скидкой</span><input type="number" value={getPercent} onChange={(e) => setGetPercent(e.target.value)} className="h-9 w-16 rounded-md border bg-background px-2 text-right" /><span>% (100 = бесплатно)</span>
            </div>
          )}
          {type === "BUNDLE_PRICE" && (
            <div className="space-y-2">
              <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Цена набора, ₸" className="h-9 w-full rounded-md border bg-background px-3" />
              <div className="relative">
                <input value={prodQuery} onChange={(e) => setProdQuery(e.target.value)} placeholder="Добавить товар в набор" className="h-9 w-full rounded-md border bg-background px-3" />
                {prodResults.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-md border bg-background shadow-lg">
                    {prodResults.map((p) => (
                      <button key={p.id} onClick={() => { if (!bundle.some((b) => b.productId === p.id)) setBundle((b) => [...b, { productId: p.id, name: p.name, quantity: "1" }]); setProdQuery(""); setProdResults([]); }} className="block w-full px-3 py-1.5 text-left hover:bg-accent">{p.name}</button>
                    ))}
                  </div>
                )}
              </div>
              {bundle.map((b, idx) => (
                <div key={b.productId} className="flex items-center gap-2">
                  <span className="flex-1 truncate text-xs">{b.name}</span>
                  <input type="number" value={b.quantity} onChange={(e) => setBundle((bs) => bs.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))} className="h-8 w-16 rounded border bg-background px-2 text-right text-xs" />
                  <button onClick={() => setBundle((bs) => bs.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}

          <div className="border-t pt-3">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Расписание (необязательно)</p>
            <div className="flex flex-wrap gap-1">
              {DAYS.map(([d, label]) => (
                <button key={d} onClick={() => setDays((s) => { const n = new Set(s); n.has(d) ? n.delete(d) : n.add(d); return n; })}
                  className={`rounded px-2 py-1 text-xs ${days.has(d) ? "bg-primary text-primary-foreground" : "border hover:bg-accent"}`}>{label}</button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="h-9 rounded-md border bg-background px-2" />
              <span>–</span>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="h-9 rounded-md border bg-background px-2" />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t pt-3">
            <button onClick={onClose} className="rounded-md border px-4 py-2 text-sm hover:bg-accent">Отмена</button>
            <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Создать
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────── Discount cards ───────────── */

function Cards() {
  const [rows, setRows] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [holder, setHolder] = useState("");
  const [percent, setPercent] = useState("5");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await fetch("/api/discount-cards").then((r) => r.json())).cards ?? []); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/discount-cards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: code.trim(), holderName: holder || undefined, percent: Number(percent) || 0 }) });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось добавить"); return; }
      setCode(""); setHolder(""); load();
    } finally { setBusy(false); }
  }
  async function toggle(c: Card) { await fetch(`/api/discount-cards/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !c.active }) }); load(); }
  async function del(c: Card) { if (!confirm(`Удалить «${c.code}»?`)) return; await fetch(`/api/discount-cards/${c.id}`, { method: "DELETE" }); load(); }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3 text-sm">
        <CreditCard className="h-4 w-4 text-primary" />
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Код / номер карты" className="h-9 w-40 rounded-md border bg-background px-3" />
        <input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="Владелец (необяз.)" className="h-9 flex-1 min-w-[8rem] rounded-md border bg-background px-3" />
        <input type="number" value={percent} onChange={(e) => setPercent(e.target.value)} className="h-9 w-16 rounded-md border bg-background px-2 text-right" /><span>%</span>
        <button onClick={add} disabled={busy || !code.trim()} className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          <Plus className="h-4 w-4" /> Добавить
        </button>
      </div>
      <div className="rounded-lg border bg-card divide-y">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Карт нет</div>
        ) : rows.map((c) => (
          <div key={c.id} className={`flex items-center gap-3 px-4 py-3 ${c.active ? "" : "opacity-50"}`}>
            <button onClick={() => toggle(c)} className={`rounded-full p-1.5 ${c.active ? "text-green-600" : "text-muted-foreground"} hover:bg-accent`}><Power className="h-4 w-4" /></button>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{c.code} <span className="text-green-600">−{c.percent}%</span></p>
              <p className="text-xs text-muted-foreground">{c.holderName ?? c.customer?.name ?? "—"}</p>
            </div>
            <button onClick={() => del(c)} className="rounded p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
