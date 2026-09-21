"use client";

import { useCallback, useEffect, useState } from "react";
import { StoreLink as Link } from "@/components/store/store-link";
import { useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/utils";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Loader2, RefreshCw, ShoppingCart, Wallet, Landmark } from "lucide-react";
import { useStoreId, useStrippedPathname } from "@/components/store/store-provider";

type Range = "today" | "yesterday" | "week" | "month30" | "month90";
interface Summary {
  revenue: number;
  grossProfit: number;
  avgTransaction: number;
}
interface RevenueDay {
  date: string;
  revenue: number;
  transactions: number;
}
interface Receipt {
  id: string;
  supplierName: string;
  total: number;
  receivedAt: string;
  status: "DRAFT" | "POSTED";
}
interface Stock {
  saleValue: number;
  costValue: number;
}
interface Cashbox {
  id: string;
  name: string;
  balance: number | null;
  status: string;
}
interface FinanceAccount {
  id: string;
  name: string;
  balance: number;
}
interface Store {
  id: string;
  name: string;
}

const RANGE_LABEL: Record<Range, string> = {
  today: "Сегодня",
  yesterday: "Вчера",
  week: "7 дней",
  month30: "30 дней",
  month90: "90 дней",
};

export function DashboardHome() {
  const t = useTranslations("dashboard");
  const storeId = useStoreId();
  const pathname = useStrippedPathname();
  const [range, setRange] = useState<Range>("week");
  const [rangeOpen, setRangeOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [revenueByDay, setRevenueByDay] = useState<RevenueDay[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [stock, setStock] = useState<Stock | null>(null);
  const [cashboxes, setCashboxes] = useState<Cashbox[]>([]);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [expenses, setExpenses] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/dashboard?range=${range}&tz=${new Date().getTimezoneOffset()}`);
      if (!r.ok) throw new Error("Не удалось загрузить показатели");
      const d = await r.json();
      setSummary(d.summary ?? null);
      setRevenueByDay(d.revenueByDay ?? []);
      setReceipts(d.receipts ?? []);
      setStock(d.stock ?? null);
      setCashboxes(d.cashboxes ?? []);
      setAccounts(d.accounts ?? []);
      setExpenses(d.expenses ?? 0);
      setUpdatedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить показатели");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    fetch("/api/stores")
      .then((r) => (r.ok ? r.json() : { stores: [] }))
      .then((d) => setStores(d.stores ?? []))
      .catch(() => setStores([]));
  }, []);

  function switchStore(nextStoreId: string) {
    if (nextStoreId !== storeId) window.location.assign(`/store/${nextStoreId}${pathname}`);
  }

  return (
    <div className="space-y-4">
      {/* Filters + refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={storeId}
            onChange={(e) => switchStore(e.target.value)}
            aria-label="Выберите магазин"
            className="bg-background h-9 min-w-44 rounded-md border px-3 text-sm font-medium"
          >
            {stores.length === 0 ? (
              <option value={storeId}>Магазин</option>
            ) : (
              stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))
            )}
          </select>
          <div className="relative">
            <button
              onClick={() => setRangeOpen((v) => !v)}
              className="bg-background hover:bg-accent inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium"
            >
              {RANGE_LABEL[range]}
            </button>
            {rangeOpen && (
              <div className="bg-card absolute top-10 left-0 z-10 w-44 rounded-md border py-1 shadow-lg">
                {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      setRange(r);
                      setRangeOpen(false);
                    }}
                    className="hover:bg-accent block w-full px-3 py-1.5 text-left text-sm"
                  >
                    {RANGE_LABEL[r]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="text-muted-foreground flex items-center gap-3 text-sm">
          {updatedAt && (
            <span>
              {t("updated_at")}:{" "}
              {updatedAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="hover:bg-accent inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {t("refresh")}
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-4 py-3 text-sm"
        >
          {error}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label={t("revenue")}
          value={formatCurrency(summary?.revenue ?? 0)}
          loading={loading}
        />
        <KpiCard
          label={t("avg_check")}
          value={formatCurrency(summary?.avgTransaction ?? 0)}
          loading={loading}
        />
        <KpiCard
          label={t("profit")}
          value={formatCurrency(summary?.grossProfit ?? 0)}
          loading={loading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        {/* Revenue chart */}
        <div className="bg-card rounded-lg border p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            {t("revenue_chart")}
          </h2>
          <div className="h-64">
            {loading ? (
              <div className="text-muted-foreground flex h-full items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueByDay} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="currentColor"
                    opacity={0.1}
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) =>
                      new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })
                    }
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => formatCurrency(v)}
                    width={70}
                  />
                  <Tooltip
                    formatter={(v?: number) => formatCurrency(v ?? 0)}
                    labelFormatter={(d) => new Date(d).toLocaleDateString("ru-RU")}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    fill="url(#revFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Приёмки panel */}
        <div className="bg-card rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ShoppingCart className="text-primary h-4 w-4" /> {t("receipts")}
            </h2>
            <Link href="/purchases" className="text-primary text-xs font-medium hover:underline">
              {t("all_receipts")}
            </Link>
          </div>
          {loading ? (
            <div className="text-muted-foreground flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <>
              <div className="bg-muted/30 mb-3 rounded-md border px-3 py-2 text-center">
                <p className="text-muted-foreground text-xs">Расходы</p>
                <p className="text-lg font-bold">{expenses > 0 ? "−" : ""}{formatCurrency(expenses)}</p>
              </div>
              {receipts.length === 0 && (
                <p className="text-muted-foreground py-6 text-center text-sm">{t("no_receipts")}</p>
              )}
              <ul className="divide-y">
                {receipts.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <Link
                        href={`/purchases/${r.id}`}
                        className="hover:text-primary font-medium hover:underline"
                      >
                        {r.supplierName}
                      </Link>
                      <p className="text-muted-foreground text-xs">
                        <span className="text-primary">
                          ✓ {r.status === "POSTED" ? "Проведен" : "Черновик"}
                        </span>{" "}
                        · {new Date(r.receivedAt).toLocaleDateString("ru-RU")}
                      </p>
                    </div>
                    <p className="font-semibold">{formatCurrency(r.total)}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* Bottom panels: Склад / Кассы / Счета */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="bg-card rounded-lg border p-4">
          <h2 className="mb-3 text-sm font-semibold">{t("stock")}</h2>
          {loading ? (
            <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
          ) : (
            <div className="space-y-2">
              <div>
                <p className="text-lg font-bold">{formatCurrency(stock?.saleValue ?? 0)}</p>
                <p className="text-muted-foreground text-xs">{t("stock_sale_value")}</p>
              </div>
              <div>
                <p className="text-lg font-bold">{formatCurrency(stock?.costValue ?? 0)}</p>
                <p className="text-muted-foreground text-xs">{t("stock_cost_value")}</p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-card rounded-lg border p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Wallet className="text-muted-foreground h-4 w-4" /> {t("registers")}
          </h2>
          {loading ? (
            <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
          ) : cashboxes.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("no_registers")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {cashboxes.map((c) => (
                <div key={c.id} className="rounded-md border p-2">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="text-muted-foreground text-xs">{c.status}</p>
                  <p className="mt-1 text-xs font-medium">
                    {c.balance != null ? formatCurrency(c.balance) : "—"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card rounded-lg border p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Landmark className="text-muted-foreground h-4 w-4" /> {t("accounts")}
          </h2>
          {loading ? (
            <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
          ) : accounts.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("no_accounts")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {accounts.map((a) => (
                <div key={a.id} className="rounded-md border p-2">
                  <p className="font-semibold">{formatCurrency(a.balance)}</p>
                  <p className="text-muted-foreground truncate text-xs">{a.name}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  return (
    <div className="bg-card rounded-lg border p-4">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="mt-1 text-2xl font-bold">
        {loading ? <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" /> : value}
      </p>
    </div>
  );
}
