"use client";

import { useRef, useState } from "react";
import { importPackage, type ImportResult } from "@/lib/offline/package-import";

const ERRORS: Record<Exclude<ImportResult, { ok: true }>["reason"], string> = {
  "not-json": "Это не файл пакета магазина.",
  "not-a-package": "Это не файл пакета магазина.",
  "newer-version": "Пакет создан более новой версией. Обновите программу кассы.",
  damaged: "Файл повреждён или скопирован не полностью. Создайте пакет заново.",
  "unsent-sales": "На кассе есть неотправленные продажи другого магазина. Сначала отправьте их (нужен интернет).",
  "already-bound": "Эта касса уже привязана к магазину и кассе. Перепривязка с терминала запрещена.",
  "storage-failed": "Не удалось сохранить данные на кассе (нет места?).",
};

/** Picks a market package file and loads it onto this till — works with no connection at all. */
export function PackageLoader({ label, onLoaded }: { label: string; onLoaded: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await importPackage(await file.text());
      if (result.ok) onLoaded();
      else setError(ERRORS[result.reason]);
    } catch {
      setError(ERRORS["storage-failed"]);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <input ref={input} type="file" accept=".kassapack,application/json" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className="inline-block rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50">
        {busy ? "Загрузка…" : label}
      </button>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
