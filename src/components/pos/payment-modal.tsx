"use client";

import { X } from "lucide-react";
import { PaymentPanel } from "./payment-panel";
import type { ComponentProps } from "react";

/** ОПЛАТА — wraps the existing PaymentPanel (unchanged logic) in a full-screen modal
 * instead of an always-visible sidebar, matching UMAG's kassa where payment is a
 * separate step reached from the bottom action bar. */
export function PaymentModal({
  onClose,
  ...panelProps
}: ComponentProps<typeof PaymentPanel> & { onClose: () => void }) {
  return (
    <div data-pos-payment-dialog className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="pos-payment-card relative flex max-h-[92vh] w-full max-w-[52rem] flex-col overflow-hidden rounded-sm border border-slate-300 bg-white shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 z-10 rounded-sm p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Закрыть"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="pos-payment-content min-h-0 flex-1 overflow-y-auto">
          <PaymentPanel {...panelProps} />
        </div>
      </div>
    </div>
  );
}
