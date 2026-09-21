"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations, useLocale } from "next-intl";
import { Clock, Wallet, FileText, Lock, X, Printer } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Shift = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Report = any;

interface ShiftBarProps {
  onShiftChange?: () => void;
  cashMovementEnabled?: boolean;
}

export function ShiftBar({ onShiftChange, cashMovementEnabled = true }: ShiftBarProps) {
  const t = useTranslations("shift");
  const tc = useTranslations("common");
  const [shift, setShift] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | "open" | "cash" | "close" | "x">(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/shifts?scope=current");
      const data = await res.json();
      setShift(data.shift ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function refresh() {
    load();
    onShiftChange?.();
  }

  const openedAt = shift ? new Date(shift.openedAt) : null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-2 text-xs">
        <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        {loading ? (
          <span className="text-muted-foreground">{tc("loading")}</span>
        ) : shift ? (
          <>
            <span className="font-medium">
              {t("open_since", { time: openedAt!.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              {t("opening_float")}: {formatCurrency(Number(shift.openingFloat))}
            </span>
            <div className="ml-auto flex gap-1.5">
              {cashMovementEnabled && (
                <button onClick={() => setModal("cash")} className="flex items-center gap-1 rounded border px-2 py-1 hover:bg-accent transition-colors">
                  <Wallet className="h-3 w-3" /> {t("cash_movement")}
                </button>
              )}
              <button onClick={() => setModal("x")} className="flex items-center gap-1 rounded border px-2 py-1 hover:bg-accent transition-colors">
                <FileText className="h-3 w-3" /> {t("x_report")}
              </button>
              <button onClick={() => setModal("close")} className="flex items-center gap-1 rounded border border-destructive/40 px-2 py-1 text-destructive hover:bg-destructive/10 transition-colors">
                <Lock className="h-3 w-3" /> {t("close_shift")}
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="text-muted-foreground">{t("closed")}</span>
            <button onClick={() => setModal("open")} className="ml-auto flex items-center gap-1 rounded bg-primary px-3 py-1 font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              {t("open_shift")}
            </button>
          </>
        )}
      </div>

      {modal === "open" && <OpenShiftModal onClose={() => setModal(null)} onDone={() => { setModal(null); refresh(); }} />}
      {modal === "cash" && shift && <CashMovementModal onClose={() => setModal(null)} onDone={() => { setModal(null); refresh(); }} />}
      {modal === "x" && shift && <ShiftReportModal shiftId={shift.id} kind="X" onClose={() => setModal(null)} />}
      {modal === "close" && shift && <CloseShiftModal shiftId={shift.id} onClose={() => setModal(null)} onDone={() => { setModal(null); refresh(); }} />}
    </>
  );
}

/* ------------------------------------------------------------------ */

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-semibold text-sm">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function OpenShiftModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const t = useTranslations("shift");
  const tc = useTranslations("common");
  const [float, setFloat] = useState("0");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openingFloat: parseFloat(float) || 0 }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(typeof d.error === "string" ? d.error : t("err_open"));
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("err_open"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title={t("open_shift")} onClose={onClose}>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("opening_float")}</label>
          <input
            type="number"
            min={0}
            step="0.01"
            autoFocus
            value={float}
            onChange={(e) => setFloat(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">{t("opening_float_hint")}</p>
        </div>
        {err && <p className="text-xs text-destructive">{err}</p>}
        <button
          onClick={submit}
          disabled={busy}
          className="w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {busy ? tc("loading") : t("open_shift")}
        </button>
      </div>
    </ModalShell>
  );
}

function CashMovementModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const t = useTranslations("shift");
  const tc = useTranslations("common");
  const [type, setType] = useState<"IN" | "OUT" | "PAYOUT" | "DROP">("IN");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setErr(t("err_amount")); return; }
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/cash-movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, amount: amt, reason: reason || undefined }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(typeof d.error === "string" ? d.error : t("err_cash"));
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("err_cash"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title={t("cash_movement")} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {(["IN", "OUT", "PAYOUT", "DROP"] as const).map((tp) => (
            <button
              key={tp}
              onClick={() => setType(tp)}
              className={
                type === tp
                  ? "rounded-md border-2 border-primary bg-primary/10 py-2 text-xs font-semibold text-primary"
                  : "rounded-md border py-2 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
              }
            >
              {t(`movement_${tp.toLowerCase()}`)}
            </button>
          ))}
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("amount")}</label>
          <input
            type="number"
            min={0}
            step="0.01"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("reason")} <span className="text-muted-foreground font-normal">({tc("optional")})</span></label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {err && <p className="text-xs text-destructive">{err}</p>}
        <button
          onClick={submit}
          disabled={busy}
          className="w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {busy ? tc("loading") : tc("save")}
        </button>
      </div>
    </ModalShell>
  );
}

function CloseShiftModal({ shiftId, onClose, onDone }: { shiftId: string; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("shift");
  const tc = useTranslations("common");
  const [report, setReport] = useState<Report | null>(null);
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<Report | null>(null);

  useEffect(() => {
    fetch(`/api/shifts/${shiftId}`)
      .then((r) => r.json())
      .then((d) => {
        setReport(d.report);
        // When no cash is expected, the only correct counted amount is zero.
        // Prefill it so a cashier does not get a confusing validation error.
        if (Number(d.report?.expectedCash ?? 0) === 0) setCounted("0");
      })
      .catch(() => {});
  }, [shiftId]);

  const expected = report?.expectedCash ?? 0;
  const diff = counted !== "" ? parseFloat(counted) - expected : null;

  async function submit() {
    if (counted === "") { setErr(t("err_amount")); return; }
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/shifts/${shiftId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close", countedCash: parseFloat(counted), notes: notes || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : t("err_close"));
      setDone(d.report);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("err_close"));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return <ShiftReportModal report={done} kind="Z" onClose={() => { onDone(); }} />;
  }

  return (
    <ModalShell title={t("close_shift")} onClose={onClose}>
      <div className="space-y-3">
        <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm space-y-1">
          <Row label={t("opening_float")} value={formatCurrency(report?.openingFloat ?? 0)} />
          <Row label={t("cash_sales")} value={formatCurrency(report?.cashSales ?? 0)} />
          <Row label={t("cash_in")} value={formatCurrency(report?.cashIn ?? 0)} />
          <Row label={t("cash_out")} value={`-${formatCurrency(report?.cashOut ?? 0)}`} />
          <Row label={t("refunds")} value={`-${formatCurrency(report?.refundTotal ?? 0)}`} />
          <div className="border-t pt-1 font-semibold">
            <Row label={t("expected_cash")} value={formatCurrency(expected)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("counted_cash")}</label>
          <input
            type="number" min={0} step="0.01" autoFocus
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {diff !== null && (
          <p className={`text-sm font-medium ${Math.abs(diff) < 0.005 ? "text-green-600" : "text-destructive"}`}>
            {t("difference")}: {diff >= 0 ? "+" : ""}{formatCurrency(diff)}
          </p>
        )}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("notes")} <span className="text-muted-foreground font-normal">({tc("optional")})</span></label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>
        {err && <p className="text-xs text-destructive">{err}</p>}
        <button
          onClick={submit}
          disabled={busy}
          className="w-full rounded-md bg-destructive py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors"
        >
          {busy ? tc("loading") : t("close_confirm")}
        </button>
      </div>
    </ModalShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function ShiftReportModal({
  shiftId,
  report: passedReport,
  kind,
  onClose,
}: {
  shiftId?: string;
  report?: Report;
  kind: "X" | "Z";
  onClose: () => void;
}) {
  const t = useTranslations("shift");
  const locale = useLocale();
  const [report, setReport] = useState<Report | null>(passedReport ?? null);

  useEffect(() => {
    if (!passedReport && shiftId) {
      fetch(`/api/shifts/${shiftId}`).then((r) => r.json()).then((d) => setReport(d.report)).catch(() => {});
    }
  }, [shiftId, passedReport]);

  if (typeof document === "undefined") return null;

  const r = report;
  const dt = (v: string | null) => (v ? new Date(v).toLocaleString(locale) : "—");

  return createPortal(
    <div id="shift-report-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <style>{`
        @media print {
          body > *:not(#shift-report-overlay) { display: none !important; }
          #shift-report-overlay { position: static !important; display: block !important; background: white !important; }
          #shift-report-overlay .no-print { display: none !important; }
          #shift-report-overlay .print-card { box-shadow: none !important; border: none !important; max-width: none !important; }
        }
      `}</style>
      <div className="print-card w-full max-w-sm rounded-xl bg-white text-black border shadow-2xl overflow-hidden">
        <div className="no-print flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold text-sm">{kind === "Z" ? t("z_report") : t("x_report")}</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="rounded bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium flex items-center gap-1.5">
              <Printer className="h-3.5 w-3.5" /> {t("print")}
            </button>
            <button onClick={onClose} className="rounded p-1 hover:bg-black/5"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-5 font-mono text-xs print:max-h-none">
          {!r ? (
            <p className="text-center text-gray-500">…</p>
          ) : (
            <>
              <p className="text-center font-bold text-sm mb-1">{kind === "Z" ? t("z_report") : t("x_report")}</p>
              <p className="text-center text-[10px] text-gray-500 mb-3">{r.shift.user?.name}</p>
              <Line l={t("opened_at")} v={dt(r.shift.openedAt)} />
              <Line l={t("closed_at")} v={dt(r.shift.closedAt)} />
              <Hr />
              <Line l={t("transactions")} v={String(r.txCount)} />
              <Line l={t("gross_sales")} v={formatCurrency(r.grossSales)} />
              <Line l={t("discounts")} v={formatCurrency(r.discountTotal)} />
              <Line l={t("tax")} v={formatCurrency(r.taxTotal)} />
              <Line l={t("tips")} v={formatCurrency(r.tipTotal)} />
              <Hr />
              <Line l={t("pay_cash")} v={formatCurrency(r.byMethod.CASH ?? 0)} />
              <Line l={t("pay_card")} v={formatCurrency(r.byMethod.CARD ?? 0)} />
              <Line l={t("pay_other")} v={formatCurrency(r.byMethod.OTHER ?? 0)} />
              {r.byMethod.CREDIT > 0 && <Line l={t("pay_credit")} v={formatCurrency(r.byMethod.CREDIT)} />}
              <Hr />
              <Line l={t("voided")} v={String(r.voidedCount)} />
              <Line l={t("refunds")} v={`${r.refundCount} / ${formatCurrency(r.refundTotal)}`} />
              <Hr />
              <Line l={t("opening_float")} v={formatCurrency(r.openingFloat)} />
              <Line l={t("cash_sales")} v={formatCurrency(r.cashSales)} />
              <Line l={t("cash_in")} v={formatCurrency(r.cashIn)} />
              <Line l={t("cash_out")} v={`-${formatCurrency(r.cashOut)}`} />
              <Line l={t("expected_cash")} v={formatCurrency(r.expectedCash)} bold />
              {r.countedCash != null && (
                <>
                  <Line l={t("counted_cash")} v={formatCurrency(r.countedCash)} />
                  <Line l={t("difference")} v={`${(r.difference ?? 0) >= 0 ? "+" : ""}${formatCurrency(r.difference ?? 0)}`} bold />
                </>
              )}
              {r.movements?.length > 0 && (
                <>
                  <Hr />
                  <p className="font-bold mb-1">{t("cash_movements")}</p>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {r.movements.map((m: any) => (
                    <Line key={m.id} l={`${t(`movement_${m.type.toLowerCase()}`)}${m.reason ? ` (${m.reason})` : ""}`} v={formatCurrency(Number(m.amount))} />
                  ))}
                </>
              )}
              {r.shift.notes && (
                <>
                  <Hr />
                  <p className="text-[10px] italic">{r.shift.notes}</p>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function Line({ l, v, bold }: { l: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold" : ""}`}>
      <span>{l}</span>
      <span>{v}</span>
    </div>
  );
}
function Hr() {
  return <div className="border-t border-dashed border-black my-1.5" />;
}
