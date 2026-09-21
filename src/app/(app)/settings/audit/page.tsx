"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Log = any;

const ACTIONS = [
  "",
  "SALE_REFUND",
  "SALE_VOID",
  "DISCOUNT_OVERRIDE",
  "STOCK_ADJUST",
  "MANAGER_OVERRIDE",
  "SETTINGS_UPDATE",
  "SHIFT_OPEN",
  "SHIFT_CLOSE",
  "CASH_IN",
  "CASH_OUT",
  "USER_CREATE",
  "USER_DELETE",
];

export default function AuditPage() {
  const t = useTranslations("audit");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  function load(reset = true, cur: string | null = null) {
    setLoading(true);
    const qs = new URLSearchParams();
    if (filter) qs.set("action", filter);
    if (cur) qs.set("cursor", cur);
    fetch(`/api/audit?${qs}`)
      .then((r) => (r.ok ? r.json() : { logs: [], nextCursor: null }))
      .then((d) => {
        setLogs((prev) => (reset ? d.logs : [...prev, ...d.logs]));
        setCursor(d.nextCursor);
        setMore(Boolean(d.nextCursor));
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(true, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>

      <select
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="h-9 rounded-md border bg-background px-3 text-sm"
      >
        {ACTIONS.map((a) => (
          <option key={a} value={a}>
            {a === "" ? tc("all") : t(`action_${a}`)}
          </option>
        ))}
      </select>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr className="text-xs text-muted-foreground uppercase font-medium">
              <th className="px-4 py-3 text-left">{t("when")}</th>
              <th className="px-4 py-3 text-left">{t("who")}</th>
              <th className="px-4 py-3 text-left">{t("action")}</th>
              <th className="px-4 py-3 text-left">{t("details")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {logs.length === 0 && !loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">{t("none")}</td>
              </tr>
            ) : (
              logs.map((l) => (
                <tr key={l.id} className="hover:bg-muted/30 transition-colors align-top">
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(l.createdAt).toLocaleString(locale)}
                  </td>
                  <td className="px-4 py-3 text-xs">{l.user?.name ?? l.userId}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs rounded bg-muted px-2 py-0.5 font-medium">{t(`action_${l.action}`)}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground font-mono break-all max-w-xs">
                    {l.entityType ? `${l.entityType}${l.entityId ? `#${String(l.entityId).slice(-6)}` : ""} ` : ""}
                    {l.details ? JSON.stringify(l.details) : ""}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {more && (
        <button
          onClick={() => load(false, cursor)}
          disabled={loading}
          className="w-full rounded-md border py-2 text-sm text-muted-foreground hover:bg-accent transition-colors disabled:opacity-50"
        >
          {loading ? tc("loading") : tc("load_more")}
        </button>
      )}
    </div>
  );
}
