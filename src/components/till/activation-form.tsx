"use client";

import { useState } from "react";
import { importPackage } from "@/lib/offline/package-import";

/**
 * A new till types the 8-digit code from the administrator and fetches its market package by itself (plan §12).
 * Needs a connection only for this one moment; the package file remains the way to install with no internet at all.
 */
export function ActivationForm({ onLoaded }: { onLoaded: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const digits = code.replace(/\D/g, "").slice(0, 8);
  const shown = digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits;

  async function activate() {
    if (digits.length !== 8) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/till-activate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: digits }) });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Не удалось активировать кассу.");
        return;
      }
      const result = await importPackage(await res.text());
      if (result.ok) onLoaded();
      else setError("Не удалось сохранить данные магазина на кассе.");
    } catch {
      setError("Нет связи с сервером. Проверьте интернет или загрузите пакет магазина файлом.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="mb-2 text-sm font-medium">Код активации кассы</p>
      <div className="flex justify-center gap-2">
        <input
          inputMode="numeric"
          value={shown}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void activate()}
          placeholder="0000-0000"
          className="w-40 rounded-md border px-3 py-2 text-center text-lg tracking-widest tabular-nums"
        />
        <button type="button" disabled={busy || digits.length !== 8} onClick={() => void activate()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {busy ? "…" : "Активировать"}
        </button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
