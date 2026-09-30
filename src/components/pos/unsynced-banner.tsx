"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useOfflineStatus } from "@/lib/offline/use-offline-status";
import { retryFailed, clearTimeAdjusted } from "@/lib/offline/queue";
import { PackageLoader } from "@/components/till/package-loader";

/**
 * UMAG's «Есть не синхронизированные данные» strip: shown while something made on this till has not reached the server yet.
 * The cashier can close it; it comes back when the number of waiting items changes.
 */
export function UnsyncedBanner() {
  const status = useOfflineStatus();
  const [dismissedFor, setDismissedFor] = useState<number | null>(null);
  const waiting = status.pending;

  if (waiting === 0 && status.failed === 0 && !status.timeAdjusted) return null;

  return (
    <div data-testid="unsynced-banner" className="flex min-h-11 min-w-0 flex-1 flex-wrap items-center gap-3 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800">
      {waiting > 0 && dismissedFor !== waiting && (
        <span className="flex items-center gap-2">
          <span data-testid="unsynced-text">
            {status.online
              ? `Отправка данных на сервер… (не отправлено: ${waiting})`
              : `Есть не синхронизированные данные. Пожалуйста подключите интернет. (${waiting})`}
          </span>
          <button type="button" aria-label="Закрыть" onClick={() => setDismissedFor(waiting)} className="rounded p-0.5 hover:bg-slate-200">
            <X className="h-4 w-4" />
          </button>
        </span>
      )}
      {status.needsLogin && status.online && (
        <span data-testid="needs-login" className="flex items-center gap-2 font-semibold text-red-800">
          {typeof location !== "undefined" && location.pathname.startsWith("/till") ? (
            <>
              Данные ждут отправки: сервер не принял ключ кассы. Пакет магазина отозван или устарел — загрузите новый пакет.
              <PackageLoader label="Загрузить новый пакет" onLoaded={() => window.location.reload()} />
            </>
          ) : (
            <>
              Данные ждут отправки: войдите в кассу заново.
              <a href="/kasa-giris" className="rounded border border-red-300 bg-white px-2 py-0.5 text-xs hover:bg-red-50">Войти</a>
            </>
          )}
        </span>
      )}
      {status.timeAdjusted && (
        <span className="flex items-center gap-2 font-semibold text-red-800">
          <span data-testid="time-adjusted-text">Часы кассы были неверны — часть операций записана со временем сервера.</span>
          <button type="button" onClick={() => clearTimeAdjusted()} className="rounded p-0.5 hover:bg-red-100">
            <X className="h-4 w-4" />
          </button>
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
