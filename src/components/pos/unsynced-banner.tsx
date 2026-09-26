"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useOfflineStatus } from "@/lib/offline/use-offline-status";
import { retryFailed } from "@/lib/offline/queue";

/**
 * UMAG's «Есть не синхронизированные данные» strip: shown while something made on this till has not reached the server yet.
 * The cashier can close it; it comes back when the number of waiting items changes.
 */
export function UnsyncedBanner() {
  const status = useOfflineStatus();
  const [dismissedFor, setDismissedFor] = useState<number | null>(null);
  const waiting = status.pending;

  if (waiting === 0 && status.failed === 0) return null;

  return (
    <div data-testid="unsynced-banner" className="flex shrink-0 flex-wrap items-center gap-3 border-b border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-950">
      {waiting > 0 && dismissedFor !== waiting && (
        <span className="flex items-center gap-2">
          <span data-testid="unsynced-text">
            {status.online
              ? `Отправка данных на сервер… (не отправлено: ${waiting})`
              : `Есть не синхронизированные данные. Пожалуйста подключите интернет. (${waiting})`}
          </span>
          <button type="button" aria-label="Закрыть" onClick={() => setDismissedFor(waiting)} className="rounded p-0.5 hover:bg-amber-200">
            <X className="h-4 w-4" />
          </button>
        </span>
      )}
      {status.needsLogin && status.online && (
        <span data-testid="needs-login" className="flex items-center gap-2 font-semibold text-red-800">
          Данные ждут отправки: войдите в кассу заново.
          <a href="/kasa-giris" className="rounded border border-red-300 bg-white px-2 py-0.5 text-xs hover:bg-red-50">Войти</a>
        </span>
      )}
      {status.failed > 0 && (
        <span className="flex items-center gap-2 font-semibold text-red-800">
          <span data-testid="failed-text">Сервер не принял продаж: {status.failed}. Сообщите администратору.</span>
          <button type="button" onClick={() => void retryFailed()} className="rounded border border-red-300 bg-white px-2 py-0.5 text-xs hover:bg-red-50">
            Повторить
          </button>
        </span>
      )}
    </div>
  );
}
