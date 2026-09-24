"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Info, Loader2, Pause, Play, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { signOut } from "@/lib/auth-client";
import { formatPhone } from "@/lib/phone";

interface Overview {
  store: { id: string; name: string; address: string | null; createdAt: string; suspendedAt: string | null; suspendedMessage: string | null };
  generatedAt: string;
  today: { revenue: number; checks: number; avgCheck: number; refunds: { count: number; amount: number }; voided: number; yesterdayTotal: number; yesterdaySameTime: number; lastSaleAt: string | null };
  week: { revenue: number; checks: number };
  month: { revenue: number; checks: number };
  hourly: { hour: number; revenue: number; checks: number; yesterday: number }[];
  daily: { day: string; revenue: number; checks: number }[];
  payments: { method: string; amount: number; checks: number }[];
  cashiers: { name: string; checks: number; revenue: number }[];
  topProducts: { name: string; qty: number; revenue: number }[];
  openShifts: { id: string; cashier: string; openedAt: string; openingFloat: number; checks: number; revenue: number; lastSaleAt: string | null; cashIn: number; cashOut: number }[];
  closedShifts: { id: string; cashier: string; openedAt: string; closedAt: string | null; expectedCash: number | null; countedCash: number | null; difference: number | null }[];
  employees: { id: string; name: string; role: string; phone: string | null; fired: boolean; lastSeenAt: string | null; online: boolean }[];
  inventory: { products: number; zero: number; low: number; negative: number; valueAtCost: number; valueAtSale: number };
  counts: { customers: number; suppliers: number };
  cashboxes: { id: string; name: string; active: boolean; pairedAt: string | null; platform: string | null; appVersion: string | null; lastSyncAt: string | null }[];
  drafts: { purchaseReceipts: number; stocktakes: number; writeOffs: number };
  docsToday: { purchaseReceipts: number; writeOffs: number; stocktakes: number; stockIns: number };
  alerts: { level: "danger" | "warn" | "info"; text: string }[];
}

type Category = "sale" | "refund" | "cancel" | "cash" | "shift" | "doc" | "settings" | "login" | "device";
interface FeedEvent { id: string; t: string; category: Category; title: string; who: string; text: string; amount: number | null }

const TZ = "Asia/Almaty";
const CATEGORIES: { key: Category; label: string; dot: string }[] = [
  { key: "sale", label: "Продажи", dot: "bg-emerald-500" },
  { key: "refund", label: "Возвраты", dot: "bg-orange-500" },
  { key: "cancel", label: "Отмены в чеке", dot: "bg-red-500" },
  { key: "cash", label: "Касса", dot: "bg-sky-500" },
  { key: "shift", label: "Смены", dot: "bg-violet-500" },
  { key: "doc", label: "Документы", dot: "bg-amber-500" },
  { key: "settings", label: "Настройки", dot: "bg-slate-500" },
  { key: "device", label: "Терминалы", dot: "bg-teal-500" },
  { key: "login", label: "Входы", dot: "bg-slate-400" },
];
const ROLE_LABEL: Record<string, string> = { ADMIN: "Администратор", MANAGER: "Менеджер", CASHIER: "Кассир", WAREHOUSE: "Складской" };

const money = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} ₸`;
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("ru-RU", { timeZone: TZ }) : "—");
const dateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ru-RU", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("ru-RU", { timeZone: TZ, day: "numeric", month: "long" });
function ago(iso: string | null, now: number) {
  if (!iso) return "никогда";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} с назад`;
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`;
  return `${Math.floor(s / 86400)} дн назад`;
}
function duration(iso: string, now: number) {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  return `${Math.floor(m / 60)} ч ${m % 60} мин`;
}

function Card({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-xl border bg-white p-4 ${className}`}>
      {title && <h2 className="mb-3 text-sm font-semibold text-slate-700">{title}</h2>}
      {children}
    </section>
  );
}
function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className={`mt-0.5 text-xs ${tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : "text-slate-500"}`}>{sub}</p>}
    </div>
  );
}

export function StoreDetail({ storeId, userName }: { storeId: string; userName: string }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendMessage, setSuspendMessage] = useState("");

  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [active, setActive] = useState<Set<Category>>(new Set(CATEGORIES.map((c) => c.key)));
  const activeRef = useRef(active);
  activeRef.current = active;

  const loadOverview = useCallback(async () => {
    try {
      const r = await fetch(`/api/superadmin/stores/${storeId}/overview`);
      if (r.status === 404) { setError("Магазин не найден"); return; }
      if (!r.ok) { setError("Не удалось загрузить данные"); return; }
      setData(await r.json());
      setError(null);
    } catch { setError("Нет связи с сервером"); }
  }, [storeId]);

  const feedUrl = useCallback((before?: string | null) => {
    const sp = new URLSearchParams({ limit: "60", categories: [...activeRef.current].join(",") });
    if (before) sp.set("before", before);
    return `/api/superadmin/stores/${storeId}/activity?${sp}`;
  }, [storeId]);

  const loadFeed = useCallback(async (reset: boolean) => {
    try {
      const r = await fetch(feedUrl());
      if (!r.ok) return;
      const d = await r.json();
      setEvents((prev) => {
        if (reset) return d.events;
        const fresh = new Set<string>(d.events.map((e: FeedEvent) => e.id));
        return [...d.events, ...prev.filter((e) => !fresh.has(e.id))].sort((a, b) => b.t.localeCompare(a.t));
      });
      if (reset) { setHasMore(d.hasMore); setNextBefore(d.nextBefore); }
    } finally { setFeedLoading(false); }
  }, [feedUrl]);

  async function loadMore() {
    const r = await fetch(feedUrl(nextBefore));
    if (!r.ok) return;
    const d = await r.json();
    setEvents((prev) => [...prev, ...d.events.filter((e: FeedEvent) => !prev.some((p) => p.id === e.id))]);
    setHasMore(d.hasMore); setNextBefore(d.nextBefore);
  }

  useEffect(() => { loadOverview(); const t = setInterval(loadOverview, 30_000); return () => clearInterval(t); }, [loadOverview]);
  useEffect(() => { setFeedLoading(true); loadFeed(true); }, [loadFeed, active]);
  useEffect(() => { if (!live) return; const t = setInterval(() => loadFeed(false), 8_000); return () => clearInterval(t); }, [live, loadFeed]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  function toggleCategory(c: Category) {
    setActive((prev) => { const next = new Set(prev); if (next.has(c)) next.delete(c); else next.add(c); return next.size ? next : prev; });
  }

  async function patch(body: object, okText: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/superadmin/stores/${storeId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) { toast.error("Не удалось выполнить"); return; }
      toast.success(okText); setSuspendOpen(false); loadOverview();
    } finally { setBusy(false); }
  }

  const header = (
    <header className="flex items-center gap-3 bg-[#15503A] px-6 py-3 text-white">
      <img src="/korgen-kassa-mark.png" alt="" className="h-8 w-8 rounded-lg bg-white object-contain p-0.5" />
      <span className="font-semibold">Korgen Kassa · Super Admin</span>
      <span className="ml-auto text-sm text-white/80">{userName}</span>
      <button onClick={() => signOut().then(() => { window.location.href = "/login"; })} className="rounded-md border border-white/30 px-3 py-1 text-sm hover:bg-white/10">Выйти</button>
    </header>
  );

  if (error && !data) return <div className="min-h-screen bg-slate-50">{header}<main className="p-6"><Link href="/superadmin" className="text-sm text-[#15503A] underline">← Все магазины</Link><p className="mt-4 text-red-600">{error}</p></main></div>;
  if (!data) return <div className="min-h-screen bg-slate-50">{header}<div className="p-16 text-center"><Loader2 className="inline h-6 w-6 animate-spin" /></div></div>;

  const d = data;
  const delta = d.today.yesterdaySameTime > 0 ? ((d.today.revenue - d.today.yesterdaySameTime) / d.today.yesterdaySameTime) * 100 : null;
  const nowHour = Number(new Date(now).toLocaleString("ru-RU", { timeZone: TZ, hour: "numeric", hour12: false }));
  const hourly = d.hourly.map((h) => ({ ...h, label: `${String(h.hour).padStart(2, "0")}`, yesterdayLine: h.yesterday }));
  const hourlyShown = hourly.slice(0, Math.max(nowHour + 1, 1));
  const daily = d.daily.map((x) => ({ ...x, label: x.day.slice(8) + "." + x.day.slice(5, 7) }));
  const totalPay = d.payments.reduce((a, p) => a + p.amount, 0);
  const grouped = events.reduce<Record<string, FeedEvent[]>>((acc, e) => { (acc[dayKey(e.t)] ??= []).push(e); return acc; }, {});

  return (
    <div className="min-h-screen bg-slate-50">
      {header}
      <main className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/superadmin" className="inline-flex items-center gap-1 text-sm text-[#15503A] hover:underline"><ArrowLeft className="h-4 w-4" /> Все магазины</Link>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{d.store.name}</h1>
              {d.store.suspendedAt
                ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">Приостановлен</span>
                : <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">Активен</span>}
            </div>
            <p className="text-sm text-slate-500">{d.store.address || "Адрес не указан"} · создан {new Date(d.store.createdAt).toLocaleDateString("ru-RU")}</p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-slate-500"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>обновлено {time(d.generatedAt)}</span>
            <button onClick={() => { loadOverview(); loadFeed(false); }} className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-white px-3 text-sm hover:bg-accent"><RefreshCw className="h-4 w-4" /> Обновить</button>
            {d.store.suspendedAt
              ? <button onClick={() => patch({ suspended: false }, "Магазин снова активен")} disabled={busy} className="h-9 rounded-md bg-[#15503A] px-4 text-sm font-medium text-white">Возобновить</button>
              : <button onClick={() => { setSuspendMessage(""); setSuspendOpen(true); }} className="h-9 rounded-md border border-amber-400 bg-white px-4 text-sm font-medium text-amber-700 hover:bg-amber-50">Приостановить</button>}
          </div>
        </div>

        {d.alerts.length > 0 && (
          <div className="space-y-2">
            {d.alerts.map((a, i) => (
              <div key={i} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${a.level === "danger" ? "border-red-300 bg-red-50 text-red-800" : a.level === "warn" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-sky-200 bg-sky-50 text-sky-900"}`}>
                {a.level === "info" ? <Info className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}{a.text}
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Kpi label="Выручка сегодня" value={money(d.today.revenue)} sub={delta == null ? `вчера за день: ${money(d.today.yesterdayTotal)}` : `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}% к вчера в это же время`} tone={delta == null ? undefined : delta >= 0 ? "good" : "bad"} />
          <Kpi label="Чеков сегодня" value={String(d.today.checks)} sub={`средний чек ${money(d.today.avgCheck)}`} />
          <Kpi label="Возвраты сегодня" value={String(d.today.refunds.count)} sub={d.today.refunds.count ? money(d.today.refunds.amount) : "нет"} tone={d.today.refunds.count ? "bad" : undefined} />
          <Kpi label="Отменено чеков" value={String(d.today.voided)} sub="сегодня" tone={d.today.voided ? "bad" : undefined} />
          <Kpi label="За 7 дней" value={money(d.week.revenue)} sub={`${d.week.checks} чеков`} />
          <Kpi label="За 30 дней" value={money(d.month.revenue)} sub={`${d.month.checks} чеков`} />
        </div>
        <p className="-mt-2 text-xs text-slate-500">Последняя продажа: {d.today.lastSaleAt ? `${dateTime(d.today.lastSaleAt)} (${ago(d.today.lastSaleAt, now)})` : "продаж ещё не было"}</p>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Продажи по часам сегодня (столбцы) и вчера (линия)">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <ComposedChart data={hourlyShown} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={52} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                  <Tooltip formatter={(v, n) => [money(Number(v)), n === "revenue" ? "Сегодня" : "Вчера"]} labelFormatter={(l) => `${l}:00`} />
                  <Bar dataKey="revenue" fill="#22B24C" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  <Line dataKey="yesterdayLine" name="yesterday" stroke="#94a3b8" strokeWidth={2} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card title="Выручка за 14 дней">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={daily} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={52} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                  <Tooltip formatter={(v) => [money(Number(v)), "Выручка"]} />
                  <Bar dataKey="revenue" fill="#15503A" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Открытые смены сейчас">
            {d.openShifts.length === 0 ? <p className="text-sm text-slate-500">Сейчас нет открытых смен</p> : (
              <div className="space-y-3">
                {d.openShifts.map((s) => (
                  <div key={s.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between"><b>{s.cashier}</b><span className="text-xs text-emerald-600">● идёт {duration(s.openedAt, now)}</span></div>
                    <p className="text-xs text-slate-500">открыта {dateTime(s.openedAt)} · нач. остаток {money(s.openingFloat)}</p>
                    <p className="mt-1">{s.checks} чеков · <b>{money(s.revenue)}</b></p>
                    <p className="text-xs text-slate-500">внесено {money(s.cashIn)} · изъято {money(s.cashOut)} · посл. продажа {ago(s.lastSaleAt, now)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title="Кассиры сегодня">
            {d.cashiers.length === 0 ? <p className="text-sm text-slate-500">Продаж сегодня нет</p> : (
              <table className="w-full text-sm"><tbody className="divide-y">
                {d.cashiers.map((c) => <tr key={c.name}><td className="py-1.5">{c.name}</td><td className="py-1.5 text-right tabular-nums text-slate-500">{c.checks} чек.</td><td className="py-1.5 text-right font-medium tabular-nums">{money(c.revenue)}</td></tr>)}
              </tbody></table>
            )}
            <h3 className="mb-2 mt-4 text-xs font-semibold uppercase text-slate-500">Способы оплаты</h3>
            {d.payments.length === 0 ? <p className="text-sm text-slate-500">—</p> : d.payments.map((p) => (
              <div key={p.method} className="mb-2 text-sm">
                <div className="flex justify-between"><span>{p.method}</span><span className="tabular-nums">{money(p.amount)} · {totalPay ? Math.round((p.amount / totalPay) * 100) : 0}%</span></div>
                <div className="mt-1 h-1.5 rounded bg-slate-100"><div className="h-1.5 rounded bg-[#22B24C]" style={{ width: `${totalPay ? (p.amount / totalPay) * 100 : 0}%` }} /></div>
              </div>
            ))}
          </Card>
          <Card title="Топ товаров сегодня">
            {d.topProducts.length === 0 ? <p className="text-sm text-slate-500">Продаж сегодня нет</p> : (
              <table className="w-full text-sm"><tbody className="divide-y">
                {d.topProducts.map((p) => <tr key={p.name}><td className="max-w-[12rem] truncate py-1.5" title={p.name}>{p.name}</td><td className="py-1.5 text-right tabular-nums text-slate-500">×{Number(p.qty.toFixed(2))}</td><td className="py-1.5 text-right font-medium tabular-nums">{money(p.revenue)}</td></tr>)}
              </tbody></table>
            )}
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={`Сотрудники (${d.employees.length})`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-slate-500"><tr><th className="py-1.5 text-left">Имя</th><th className="py-1.5 text-left">Роль</th><th className="py-1.5 text-left">Телефон</th><th className="py-1.5 text-left">Активность</th></tr></thead>
                <tbody className="divide-y">
                  {d.employees.map((e) => (
                    <tr key={e.id} className={e.fired ? "text-slate-400" : ""}>
                      <td className="py-1.5">{e.name}{e.fired && " (уволен)"}</td>
                      <td className="py-1.5">{ROLE_LABEL[e.role] ?? e.role}</td>
                      <td className="whitespace-nowrap py-1.5">{formatPhone(e.phone)}</td>
                      <td className="py-1.5">{e.online ? <span className="text-emerald-600">● в сети</span> : <span className="text-slate-500">{ago(e.lastSeenAt, now)}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Последние закрытые смены">
            {d.closedShifts.length === 0 ? <p className="text-sm text-slate-500">Закрытых смен ещё нет</p> : (
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="text-xs uppercase text-slate-500"><tr><th className="py-1.5 text-left">Кассир</th><th className="py-1.5 text-left">Закрыта</th><th className="py-1.5 text-right">Ожидалось</th><th className="py-1.5 text-right">Посчитано</th><th className="py-1.5 text-right">Разница</th></tr></thead>
                <tbody className="divide-y">
                  {d.closedShifts.map((s) => (
                    <tr key={s.id}>
                      <td className="py-1.5">{s.cashier}</td><td className="py-1.5 text-slate-500">{dateTime(s.closedAt)}</td>
                      <td className="py-1.5 text-right tabular-nums">{s.expectedCash == null ? "—" : money(s.expectedCash)}</td>
                      <td className="py-1.5 text-right tabular-nums">{s.countedCash == null ? "—" : money(s.countedCash)}</td>
                      <td className={`py-1.5 text-right font-medium tabular-nums ${s.difference != null && Math.abs(s.difference) >= 0.5 ? "text-red-600" : "text-emerald-600"}`}>{s.difference == null ? "—" : money(s.difference)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Склад и товары">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Активных товаров</dt><dd className="tabular-nums">{d.inventory.products.toLocaleString("ru-RU")}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Нулевой остаток</dt><dd className="tabular-nums">{d.inventory.zero.toLocaleString("ru-RU")}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Заканчиваются</dt><dd className="tabular-nums">{d.inventory.low.toLocaleString("ru-RU")}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Отрицательный остаток</dt><dd className={`tabular-nums ${d.inventory.negative ? "font-medium text-red-600" : ""}`}>{d.inventory.negative}</dd></div>
              <div className="flex justify-between border-t pt-1.5"><dt className="text-slate-500">Склад по закупочной</dt><dd className="tabular-nums">{money(d.inventory.valueAtCost)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Склад по продажной</dt><dd className="tabular-nums">{money(d.inventory.valueAtSale)}</dd></div>
              <div className="flex justify-between border-t pt-1.5"><dt className="text-slate-500">Покупателей / поставщиков</dt><dd className="tabular-nums">{d.counts.customers} / {d.counts.suppliers}</dd></div>
            </dl>
          </Card>
          <Card title="Документы">
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Приёмок проведено сегодня</dt><dd>{d.docsToday.purchaseReceipts}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Оприходований сегодня</dt><dd>{d.docsToday.stockIns}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Списаний сегодня</dt><dd>{d.docsToday.writeOffs}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Инвентаризаций сегодня</dt><dd>{d.docsToday.stocktakes}</dd></div>
              <div className="flex justify-between border-t pt-1.5"><dt className="text-slate-500">Черновики приёмок</dt><dd>{d.drafts.purchaseReceipts}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Незавершённые инвентаризации</dt><dd>{d.drafts.stocktakes}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Черновики списаний</dt><dd>{d.drafts.writeOffs}</dd></div>
            </dl>
          </Card>
          <Card title="Кассы (терминалы)">
            {d.cashboxes.length === 0 ? <p className="text-sm text-slate-500">Кассы не настроены</p> : (
              <div className="space-y-2">
                {d.cashboxes.map((c) => (
                  <div key={c.id} className="rounded-lg border p-2.5 text-sm">
                    <div className="flex items-center justify-between"><b>{c.name}</b><span className={`text-xs ${!c.active ? "text-slate-400" : c.pairedAt ? "text-emerald-600" : "text-amber-600"}`}>{!c.active ? "выключена" : c.pairedAt ? "привязана" : "не привязана"}</span></div>
                    <p className="text-xs text-slate-500">{c.platform ?? "устройство не определено"}{c.appVersion ? ` · v${c.appVersion}` : ""}</p>
                    <p className="text-xs text-slate-500">на связи: {ago(c.lastSyncAt, now)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-700">Живая лента событий</h2>
            <button onClick={() => setLive((v) => !v)} className={`ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs ${live ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "bg-white text-slate-600"}`}>
              {live ? <><Pause className="h-3.5 w-3.5" /> Обновляется каждые 8 с</> : <><Play className="h-3.5 w-3.5" /> Приостановлено</>}
            </button>
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button key={c.key} onClick={() => toggleCategory(c.key)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${active.has(c.key) ? "border-slate-400 bg-white font-medium" : "bg-slate-50 text-slate-400"}`}>
                <span className={`h-2 w-2 rounded-full ${active.has(c.key) ? c.dot : "bg-slate-300"}`} />{c.label}
              </button>
            ))}
          </div>
          {feedLoading ? <div className="py-10 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div> : events.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Событий пока нет</p> : (
            <div className="max-h-[36rem] overflow-y-auto">
              {Object.entries(grouped).map(([day, list]) => (
                <div key={day}>
                  <p className="sticky top-0 bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{day}</p>
                  <ul className="divide-y">
                    {list.map((e) => {
                      const cat = CATEGORIES.find((c) => c.key === e.category)!;
                      return (
                        <li key={e.id} className="flex items-start gap-3 px-2 py-2 text-sm">
                          <span className="w-16 shrink-0 pt-0.5 font-mono text-xs text-slate-500">{time(e.t)}</span>
                          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${cat.dot}`} />
                          <div className="min-w-0 flex-1">
                            <p><b>{e.title}</b> <span className="text-slate-500">· {e.who}</span></p>
                            {e.text && <p className="break-words text-xs text-slate-500">{e.text}</p>}
                          </div>
                          {e.amount != null && <span className={`shrink-0 font-medium tabular-nums ${e.amount < 0 ? "text-red-600" : ""}`}>{e.amount < 0 ? "−" : ""}{money(Math.abs(e.amount))}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              {hasMore && <div className="py-3 text-center"><button onClick={loadMore} className="h-9 rounded-md border bg-white px-4 text-sm hover:bg-accent">Показать ещё</button></div>}
            </div>
          )}
        </Card>
      </main>

      {suspendOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md space-y-3 rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Приостановить «{d.store.name}»?</h2>
            <p className="text-sm text-slate-500">Никто из сотрудников не сможет войти — они увидят сообщение. Данные сохраняются.</p>
            <textarea className="w-full rounded-md border p-2 text-sm" rows={3} placeholder="Сообщение сотрудникам (необязательно)" value={suspendMessage} onChange={(e) => setSuspendMessage(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button onClick={() => setSuspendOpen(false)} className="h-9 rounded-md border px-4 text-sm hover:bg-accent">Отмена</button>
              <button onClick={() => patch({ suspended: true, message: suspendMessage || null }, "Магазин приостановлен")} disabled={busy} className="h-9 rounded-md bg-amber-600 px-4 text-sm font-medium text-white disabled:opacity-50">Приостановить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
