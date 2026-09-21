"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { RotateCcw } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { isFractionalUnit, unitLabel } from "@/lib/units";
import { RefundModal } from "./refund-modal";
import { formatReferenceValues } from "@/lib/reference-format";
import { ManagerGate } from "@/components/pos/manager-gate";

interface SaleItem {
  id: string;
  name: string;
  quantity: { toString(): string } | number;
  unit?: string;
  price: { toString(): string };
  total: { toString(): string };
  notes?: string | null;
  productId?: string | null;
}

interface Sale {
  id: string;
  documentNo: number;
  createdAt: Date;
  total: { toString(): string };
  paymentMethod: string;
  status: string;
  items: SaleItem[];
  user: { name: string } | null;
  referenceValues?: unknown;
}

interface SalesTableProps {
  sales: Sale[];
}

export function SalesTable({ sales }: SalesTableProps) {
  const t = useTranslations("sales");
  const tr = useTranslations("receipt");
  const locale = useLocale();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refunding, setRefunding] = useState<Sale | null>(null);
  const [pendingRefund, setPendingRefund] = useState<Sale | null>(null);

  const statusLabel: Record<string, string> = {
    COMPLETED: t("status_completed"),
    VOIDED: t("status_voided"),
    REFUNDED: t("status_refunded"),
  };

  const saleDateFormatter = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

  if (sales.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-muted-foreground text-sm">
        {t("no_sales")}
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border overflow-x-auto text-sm">
      <table className="w-full">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left font-medium">{t("date")}</th>
            <th className="px-4 py-3 text-left font-medium">{t("cashier")}</th>
            <th className="px-4 py-3 text-left font-medium">{t("payment")}</th>
            <th className="px-4 py-3 text-left font-medium">{t("status")}</th>
            <th className="px-4 py-3 text-right font-medium">{t("total")}</th>
            <th className="px-4 py-3 text-center font-medium">{t("actions")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {sales.flatMap((sale, idx) => {
            const saleTimestamp = new Date(sale.createdAt).getTime();
            const saleKey = `${sale.id ?? "no-id"}-${saleTimestamp}-${idx}`;

            const mainRow = (
              <tr
                key={`${saleKey}-main`}
                className="hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => setExpanded(expanded === sale.id ? null : sale.id)}
              >
                <td className="px-4 py-3">
                  {saleDateFormatter.format(new Date(sale.createdAt))}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{sale.user?.name ?? "—"}</td>
                <td className="px-4 py-3">{sale.paymentMethod}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      sale.status === "VOIDED"
                        ? "text-destructive"
                        : "text-green-600"
                    }
                  >
                    {statusLabel[sale.status] ?? sale.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-medium">
                  {formatCurrency(parseFloat(sale.total.toString()))}
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-center">
                    {sale.status === "COMPLETED" && (
                      <button
                        onClick={() => setPendingRefund(sale)}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                        title={t("issue_refund")}
                      >
                        <RotateCcw className="h-3 w-3" /> {t("refund")}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );

            if (expanded !== sale.id) {
              return [mainRow];
            }

            const detailRow = (
              <tr className="bg-muted/20" key={`${saleKey}-details`}>
                <td colSpan={6} className="px-6 py-3">
                  {formatReferenceValues(sale.referenceValues) && (
                    <p className="mb-2 text-xs text-muted-foreground">Справочники: {formatReferenceValues(sale.referenceValues)}</p>
                  )}
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className="text-left py-1">{tr("items")}</th>
                        <th className="text-right py-1">{tr("qty")}</th>
                        <th className="text-right py-1">{tr("price")}</th>
                        <th className="text-right py-1">{tr("amount")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sale.items.map((item, i) => {
                        const itemKey = `${item.id ?? "no-item-id"}-${saleKey}-${i}`;
                        return (
                          <>
                            <tr key={itemKey}>
                              <td className="py-1">{item.name}</td>
                              <td className="text-right py-1">{typeof item.quantity === "number" ? item.quantity : item.quantity.toString()}{isFractionalUnit(item.unit) ? ` ${unitLabel(item.unit, true)}` : ""}</td>
                              <td className="text-right py-1">
                                {formatCurrency(parseFloat(item.price.toString()))}
                              </td>
                              <td className="text-right py-1">
                                {formatCurrency(parseFloat(item.total.toString()))}
                              </td>
                            </tr>
                            {item.notes && (
                              <tr key={`${itemKey}-notes`}>
                                <td colSpan={4} className="pb-1 pl-3 text-[10px] italic text-muted-foreground">{item.notes}</td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </td>
              </tr>
            );

            return [mainRow, detailRow];
          })}
        </tbody>
      </table>
    </div>

    <ManagerGate
      open={!!pendingRefund}
      context="refund"
      onAuthorized={() => { setRefunding(pendingRefund); setPendingRefund(null); }}
      onCancel={() => setPendingRefund(null)}
    />

    {refunding && (
      <RefundModal
        saleId={refunding.id}
        documentNo={refunding.documentNo}
        saleTotal={parseFloat(refunding.total.toString())}
        items={refunding.items.map((item) => ({
          ...item,
          quantity: typeof item.quantity === "number" ? item.quantity : parseFloat(item.quantity.toString()),
        }))}
        onClose={() => setRefunding(null)}
      />
    )}
    </>
  );
}
