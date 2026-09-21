"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "framer-motion";
import { Delete, Check, X } from "lucide-react";

interface NumericKeypadProps {
  open: boolean;
  value: string;
  label?: string;
  /** Pieces are whole numbers; kg/litre/metre may be fractional. */
  allowDecimal?: boolean;
  presets?: number[];
  unit?: string;
  /** Available stock for this line. Omit for a manual/free-price item. */
  max?: number;
  onValueChange: (val: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

const KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0", "⌫"] as const;

export function NumericKeypad({
  open,
  value,
  label,
  allowDecimal = true,
  presets = [],
  unit,
  max,
  onValueChange,
  onConfirm,
  onCancel,
}: NumericKeypadProps) {
  const tc = useTranslations("common");
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "Enter") { e.preventDefault(); onConfirm(); }
      if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      if (e.key === "Backspace") {
        onValueChange(value.length > 1 ? value.slice(0, -1) : "0");
      }
      if (/^[0-9]$/.test(e.key) || (allowDecimal && e.key === ".")) {
        handleTap(e.key);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value, allowDecimal, onCancel, onConfirm, onValueChange]);

  function handleTap(key: string) {
    if (key === "⌫") {
      onValueChange(value.length > 1 ? value.slice(0, -1) : "0");
      return;
    }
    if (key === ".") {
      if (!allowDecimal) return;
      if (value.includes(".")) return;
      onValueChange(value + ".");
      return;
    }
    const next = value === "0" ? key : value + key;
    // Prevent ridiculously long numbers
    if (next.length > 8) return;
    onValueChange(next);
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="keypad-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9998] bg-black/40"
            onClick={onCancel}
          />

          {/* Keypad sheet */}
          <motion.div
            key="keypad-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-[9999] max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-t-3xl border-t bg-background shadow-2xl"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0px)" }}
          >
            {/* Display */}
            <div className="border-b px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  {label && <p className="mb-1 text-sm font-medium text-muted-foreground">{label}</p>}
              {Number.isFinite(max) && (
                    <p className="mb-2 text-base text-emerald-800">
                  В наличии: <strong>{max} {unit ?? ""}</strong> · максимум {max} {unit ?? ""}
                </p>
              )}
                  <span className="text-4xl font-mono font-bold tracking-tight text-slate-900">
                  {value || "0"}
                </span>
                </div>
                <button
                  type="button"
                  onClick={onCancel}
                  className="flex h-14 shrink-0 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 text-base font-semibold text-red-700 active:scale-95"
                  aria-label={tc("cancel")}
                >
                  <X className="h-6 w-6" /> {tc("cancel")}
                </button>
              </div>
            </div>

            {/* Key grid */}
            <div className="grid grid-cols-3 gap-3 p-4">
              {(allowDecimal ? KEYS : KEYS.filter((key) => key !== ".")).map((key) => (
                <button
                  key={key}
                  onClick={() => handleTap(key)}
                  className={`flex h-16 items-center justify-center rounded-2xl text-2xl font-semibold transition-colors active:scale-95
                    ${key === "⌫"
                      ? "bg-red-100 text-red-800 hover:bg-red-200"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-accent"
                    }`}
                >
                  {key === "⌫" ? <><Delete className="mr-2 h-7 w-7" />Стереть</> : key}
                </button>
              ))}
            </div>

            {presets.length > 0 && (
              <div className="grid grid-cols-5 gap-3 px-4 pb-4">
                {presets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => onValueChange(String(Number.isFinite(max) ? Math.min(preset, max!) : preset))}
                    className="h-12 rounded-xl border bg-muted/60 text-base font-semibold active:bg-accent"
                  >
                    {preset} {unit ?? ""}
                  </button>
                ))}
              </div>
            )}

            {/* Confirm button */}
            <div className="px-4 pb-4">
              <button
                ref={confirmRef}
                onClick={onConfirm}
                className="flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-primary text-primary-foreground text-xl font-bold transition-colors hover:bg-primary/90 active:scale-[0.98]"
              >
                <Check className="h-7 w-7" />
                {tc("confirm")}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
