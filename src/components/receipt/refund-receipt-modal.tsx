"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { X, Printer } from "lucide-react";
import { Receipt } from "@/components/receipt/receipt";
import { printReceipt } from "@/lib/thermal-print";
import { programCanPrint, printReceiptOnProgram } from "@/lib/program-print";

interface RefundItem {
  name: string;
  quantity: number;
  price: number;
  total: number;
  unit?: string;
}

interface RefundReceiptModalProps {
  open: boolean;
  onClose: () => void;
  saleId?: string;
  documentNo?: number;
  referenceText?: string;
  items: RefundItem[];
  refundTotal: number;
  reason?: string;
}

interface ReceiptSettings {
  name: string;
  logoUrl: string | null;
  currency: string;
  currencyDecimals: number;
  taxName: string;
  receiptFooter: string;
}

const FALLBACK_SETTINGS: ReceiptSettings = {
  name: "My Store",
  logoUrl: null,
  currency: "$",
  currencyDecimals: 2,
  taxName: "Tax",
  receiptFooter: "",
};

export function RefundReceiptModal({
  open,
  onClose,
  saleId,
  documentNo,
  referenceText,
  items,
  refundTotal,
  reason,
}: RefundReceiptModalProps) {
  const t = useTranslations("receipt");
  const [settings, setSettings] = useState<ReceiptSettings>(FALLBACK_SETTINGS);

  useEffect(() => {
    if (!open) return;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setSettings({ ...FALLBACK_SETTINGS, ...d }))
      .catch(() => {});
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const receiptData = {
    saleId,
    documentNo,
    referenceText,
    items,
    subtotal: refundTotal,
    discountAmount: 0,
    taxAmount: 0,
    total: refundTotal,
    paymentMethod: "REFUND",
    isRefund: true,
    reason,
  };

  return createPortal(
    <div
      id="refund-receipt-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    >
      <style>{`
        @media print {
          body > *:not(#refund-receipt-overlay) { display: none !important; }
          #refund-receipt-overlay {
            position: static !important;
            display: block !important;
            background: white !important;
          }
          #refund-receipt-overlay .no-print { display: none !important; }
          #refund-receipt-overlay .print-card {
            box-shadow: none !important;
            border: none !important;
            max-width: none !important;
          }
        }
      `}</style>

      <div className="print-card w-full max-w-sm rounded-xl bg-white border shadow-2xl overflow-hidden">
        {/* Toolbar */}
        <div className="no-print flex items-center justify-between border-b px-4 py-3 bg-card">
          <h2 className="font-semibold text-sm text-destructive">{t("refund_receipt")}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void (programCanPrint() ? printReceiptOnProgram() : printReceipt({ data: receiptData, settings }))}
              className="rounded border px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              <Printer className="mr-1 inline h-3.5 w-3.5" /> {t("thermal")}
            </button>
            <button
              onClick={() => void (programCanPrint() ? printReceiptOnProgram() : window.print())}
              className="rounded bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 hover:bg-primary/90 transition-colors"
            >
              <Printer className="h-3.5 w-3.5" />
              {t("print")}
            </button>
            <button onClick={onClose} className="rounded p-1 hover:bg-accent transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Receipt preview with REFUND stamp */}
        <div className="relative overflow-y-auto max-h-[70vh] bg-white p-4 print:max-h-none print:overflow-visible">
          {/* REFUND diagonal stamp */}
          <div
            className="no-print pointer-events-none absolute inset-0 flex items-center justify-center z-10 opacity-20 select-none"
            aria-hidden
          >
            <span
              className="text-5xl font-black text-destructive tracking-widest rotate-[-35deg]"
            >
              {t("refund_stamp")}
            </span>
          </div>
          <Receipt data={receiptData} settings={settings} />
        </div>
      </div>
    </div>,
    document.body
  );
}
