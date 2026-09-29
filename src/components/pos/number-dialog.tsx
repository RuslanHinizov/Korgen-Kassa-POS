"use client";

import { useEffect } from "react";
import { useNumberEntry } from "./use-number-entry";

/**
 * UMAG's number window (КОЛИЧЕСТВО, УНИВЕРСАЛЬНЫЙ ПРОДУКТ): white card on a dimmed screen, teal title, one big field with
 * its text selected, grey keys 7-8-9 / 4-5-6 / 1-2-3 / 0 wide + «.», and a column УДАЛИТЬ / ОТМЕНА / OK on the right.
 * The first key replaces the selected value; УДАЛИТЬ removes the last character. Enter = OK, Esc = ОТМЕНА.
 */
export function NumberDialog({
  title,
  initial,
  allowDecimal = true,
  error,
  onOk,
  onCancel,
}: {
  title: React.ReactNode;
  initial: string;
  allowDecimal?: boolean;
  error?: string;
  onOk: (value: number) => void;
  onCancel: () => void;
}) {
  const entry = useNumberEntry(initial, allowDecimal, 9);
  const { text, selected, press, remove } = entry;
  function ok() {
    const n = Number(entry.get().replace(",", "."));
    onOk(Number.isFinite(n) ? n : 0);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter") { e.preventDefault(); ok(); }
      else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      else if (e.key === "Backspace") { e.preventDefault(); remove(); }
      else if (/^[0-9]$/.test(e.key) || e.key === "." || e.key === ",") { e.preventDefault(); press(e.key === "," ? "." : e.key); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const key = "flex h-[4.5rem] items-center justify-center rounded-sm border border-slate-300 bg-gradient-to-b from-[#f4f4f4] to-[#dcdcdc] text-3xl font-normal text-[#1f1f1f] shadow-sm active:from-[#dcdcdc] active:to-[#c9c9c9]";
  const side = "flex h-[4.5rem] items-center justify-center rounded-sm text-lg font-normal text-white";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-[27rem] bg-white px-4 pt-5 pb-5 shadow-2xl">
        <p className="mb-4 text-center text-lg leading-snug font-bold tracking-wide text-[#1abc9c] uppercase">{title}</p>
        <div className="mb-4 flex h-20 items-center justify-center border-2 border-[#3aa6d0] bg-white text-4xl">
          <span data-testid="number-dialog-value" className={selected ? "bg-[#0a84c6] px-1 text-white" : "px-1"}>{text}</span>
        </div>
        {error && <p role="alert" className="mb-3 text-center text-sm text-red-600">{error}</p>}
        <div className="grid grid-cols-[1fr_1fr_1fr_1.15fr] gap-2">
          {["7", "8", "9"].map((d) => <button key={d} type="button" className={key} onClick={() => press(d)}>{d}</button>)}
          <button type="button" className={`${side} bg-[#4a4a4a]`} onClick={remove}>УДАЛИТЬ</button>
          {["4", "5", "6"].map((d) => <button key={d} type="button" className={key} onClick={() => press(d)}>{d}</button>)}
          <button type="button" className={`${side} bg-[#d05a4e]`} onClick={onCancel}>ОТМЕНА</button>
          {["1", "2", "3"].map((d) => <button key={d} type="button" className={key} onClick={() => press(d)}>{d}</button>)}
          <button type="button" className={`${side} bg-[#1abc9c] text-2xl`} onClick={ok}>OK</button>
          <button type="button" className={`${key} col-span-2`} onClick={() => press("0")}>0</button>
          <button type="button" className={key} onClick={() => press(".")}>.</button>
        </div>
      </div>
    </div>
  );
}
