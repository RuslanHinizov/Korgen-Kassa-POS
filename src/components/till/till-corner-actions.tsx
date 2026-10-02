"use client";

import { useState } from "react";
import { useOfflineStatus } from "@/lib/offline/use-offline-status";
import { resetTill } from "@/lib/offline/clear";
import { exitProgram } from "@/lib/till-shell";

/**
 * Two ways out of the till program's start screens (activation code, staff sign-in): close the program (it is full
 * screen with no window frame), and — once bound — take the register off its market to enter a new activation code.
 * Unsent sales block the second: they belong to the old market and would be lost.
 */
export function TillCornerActions({ bound, onChanged }: { bound: boolean; onChanged: () => void }) {
  const { pending } = useOfflineStatus();
  const [busy, setBusy] = useState(false);
  const inProgram = typeof window !== "undefined" && Boolean((window as unknown as { korgenShell?: unknown }).korgenShell);

  async function rebind() {
    if (pending > 0) {
      window.alert(`На кассе ${pending} не отправленных продаж. Подключите интернет и дождитесь отправки: пока они не отправлены, кассу нельзя привязать заново.`);
      return;
    }
    if (!window.confirm("Отвязать кассу от магазина? После этого нужно ввести новый код активации.")) return;
    setBusy(true);
    try {
      await resetTill();
    } finally {
      setBusy(false);
    }
    onChanged();
  }

  const btn = "rounded-md border bg-card px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-50";
  return (
    <div className="fixed right-4 top-4 z-50 flex flex-wrap items-center justify-end gap-3">
      {bound && <button type="button" disabled={busy} onClick={() => void rebind()} className={btn}>Сменить привязку кассы (новый код активации)</button>}
      {inProgram && <button type="button" onClick={() => void exitProgram()} className={`${btn} border-red-300 text-red-700 hover:bg-red-50`}>Выйти из программы</button>}
    </div>
  );
}
