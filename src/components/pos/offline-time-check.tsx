"use client";

import { useMemo, useState } from "react";

const SESSION_KEY = "korgen-offline-time-confirmed";

function clock(value: Date): string {
  return value.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * UMAG asks the cashier to consciously confirm the workstation clock before an
 * offline login. The browser cannot change Windows' clock, so this is a check,
 * not a fake clock-setting control. The server remains authoritative whenever
 * the queued records are uploaded.
 */
export function OfflineTimeCheck() {
  const [visible, setVisible] = useState(() => typeof window !== "undefined" && !navigator.onLine && !sessionStorage.getItem(SESSION_KEY));
  const candidates = useMemo(() => {
    const now = new Date();
    return [
      { id: "now", value: now },
      { id: "plus-day", value: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
      { id: "plus-hour", value: new Date(now.getTime() + 60 * 60 * 1000) },
      { id: "plus-half-hour", value: new Date(now.getTime() + 30 * 60 * 1000) },
    ];
  }, []);

  function continueToLogin(choice: string) {
    sessionStorage.setItem(SESSION_KEY, choice);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#f3f5f6] px-5 text-[#263238]">
      <section className="w-full max-w-3xl rounded border border-slate-300 bg-white p-6 shadow-xl sm:p-9">
        <h1 className="text-center text-xl font-bold uppercase sm:text-2xl">ПРОВЕРКА ПРАВИЛЬНОСТИ УСТАНОВЛЕННОГО ВРЕМЕНИ КАССЫ</h1>
        <p className="mx-auto mt-5 max-w-2xl text-center text-sm leading-6 text-slate-600">
          Интернет недоступен, поэтому время кассы нельзя сравнить с сервером. Оно будет указано в чеках и операциях. Если время неверное, синхронизация не сможет пройти правильно.
        </p>
        <p className="mt-7 text-center text-sm font-bold uppercase">ДЛЯ ПРОВЕРКИ ВЫБЕРИТЕ ПРАВИЛЬНОЕ ТЕКУЩЕЕ ВРЕМЯ</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {candidates.map((candidate, index) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => continueToLogin(candidate.id)}
              className={`min-h-20 rounded border-2 px-4 py-4 text-lg font-semibold transition-colors ${index === 0 ? "border-sky-500 bg-sky-50 text-sky-900" : "border-slate-300 bg-white hover:border-sky-400 hover:bg-sky-50"}`}
            >
              {clock(candidate.value)}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => continueToLogin("none")} className="mt-4 w-full rounded border border-slate-400 bg-white px-4 py-4 text-sm font-semibold uppercase hover:bg-slate-50">
          НИЧТО ИЗ ВЫШЕПЕРЕЧИСЛЕННОГО
        </button>
      </section>
    </div>
  );
}
