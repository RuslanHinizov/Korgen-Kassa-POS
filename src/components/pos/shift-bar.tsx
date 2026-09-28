"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations, useLocale } from "next-intl";
import { Printer, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Report = any;

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
