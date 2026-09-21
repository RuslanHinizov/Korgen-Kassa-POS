"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { X, Printer } from "lucide-react";
import { Receipt } from "./receipt";
import { printReceipt } from "@/lib/thermal-print";

interface ReceiptSettings {
  name: string;
  logoUrl: string | null;
  currency: string;
  currencyDecimals: number;
  taxName: string;
  receiptFooter: string;
}

interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
  total: number;
  unit?: "pcs" | "kg" | "l" | "m" | string;
  notes?: string;
}

interface ReceiptModalProps {
  open: boolean;
  onClose: () => void;
  data: {
    saleId?: string;
    documentNo?: number;
    items: ReceiptItem[];
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    total: number;
    paymentMethod: string;
    amountTendered?: number;
    changeDue?: number;
  };
  settings: ReceiptSettings;
}

export function ReceiptModal({ open, onClose, data, settings }: ReceiptModalProps) {
  const t = useTranslations("receipt");
  const [liveSettings, setLiveSettings] = useState<ReceiptSettings>(settings);

  // Load the real business settings so the receipt shows the configured
  // store name, currency, tax name and footer (not the POS fallback). This
  // modal is always freshly mounted per receipt (see pos-screen.tsx), so a
  // single fetch on mount is enough — no need to react to `open`/`settings`.
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setLiveSettings((prev) => ({ ...prev, ...d })))
      .catch(() => {});
  }, []);

  if (!open || typeof document === "undefined") return null;

  function handleBrowserPrint() {
    window.print();
  }

  async function handleThermalPrint() {
    await printReceipt({ data, settings: liveSettings });
  }

  return createPortal(
    <div
      id="receipt-print-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    >
      {/* Print styles: when printing, only show the receipt overlay */}
      <style>{`
        @media print {
          body > *:not(#receipt-print-overlay) { display: none !important; }
          #receipt-print-overlay {
            position: static !important;
            display: block !important;
            background: white !important;
          }
          #receipt-print-overlay .no-print { display: none !important; }
          #receipt-print-overlay .print-card {
            box-shadow: none !important;
            border: none !important;
            max-width: none !important;
          }
        }
      `}</style>

      <div className="print-card w-full max-w-sm rounded-xl bg-white border shadow-2xl overflow-hidden">
        {/* Toolbar */}
        <div className="no-print flex items-center justify-between border-b px-4 py-3 bg-card">
          <h2 className="font-semibold text-sm">{t("preview")}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleThermalPrint}
              title={t("thermal_title")}
              className="rounded border px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 hover:bg-accent transition-colors"
            >
              <Printer className="h-3.5 w-3.5" />
              {t("thermal")}
            </button>
            <button
              onClick={handleBrowserPrint}
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

        {/* Receipt preview */}
        <div className="overflow-y-auto max-h-[70vh] bg-white p-4 print:max-h-none print:overflow-visible">
          <Receipt data={data} settings={liveSettings} />
        </div>
      </div>
    </div>,
    document.body
  );
}
