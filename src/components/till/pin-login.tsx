"use client";

import { useEffect, useState } from "react";
import { Delete, ArrowLeft } from "lucide-react";
import type { PackageCashier } from "@/lib/till-package-format";
import { listPinCashiers, signInWithPin } from "@/lib/offline/pin-login";

const ROLE_LABEL: Record<string, string> = { CASHIER: "Кассир", MANAGER: "Менеджер", ADMIN: "Администратор", WAREHOUSE: "Складской работник" };

/**
 * Touch sign-in for the till: pick your name, tap your 4-digit PIN. Works with no connection — the PINs come from the
 * market package (plan §12, stage A3). Wrong PINs are counted per employee (5 misses = 5 minutes locked).
 */
export function PinLogin({ storeName, onSignedIn }: { storeName?: string; onSignedIn: () => void }) {
  const [staff, setStaff] = useState<PackageCashier[] | null>(null);
  const [picked, setPicked] = useState<PackageCashier | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    listPinCashiers().then(setStaff).catch(() => setStaff([]));
  }, []);

  async function submit(code: string) {
    if (!picked) return;
    setBusy(true);
    const result = await signInWithPin(picked.id, code).catch(() => ({ ok: false as const, reason: "wrong" as const, waitMs: undefined }));
    setBusy(false);
    if (result.ok) {
      onSignedIn();
      return;
    }
    setPin("");
    setError(
      result.reason === "locked"
        ? `Слишком много попыток. Подождите ${Math.max(1, Math.ceil((result.waitMs ?? 0) / 60000))} мин.`
        : "Неверный PIN-код",
    );
  }

  function press(digit: string) {
    if (busy || pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);
    setError("");
    if (next.length === 4) void submit(next);
  }

  if (!staff) return <div className="h-screen w-screen bg-background" />;

  if (!picked) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm">
          <h1 className="mb-1 text-center text-xl font-semibold">Вход в кассу</h1>
          <p className="mb-6 text-center text-sm text-muted-foreground">{storeName ? `${storeName} · ` : ""}выберите сотрудника</p>
          {staff.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              Ни у одного сотрудника нет PIN-кода. Задайте PIN в «Управление → Сотрудники» и загрузите пакет магазина заново.
            </p>
          ) : (
            <div className="space-y-2">
              {staff.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setPicked(c); setPin(""); setError(""); }}
                  className="flex w-full items-center justify-between rounded-lg border px-4 py-4 text-left hover:bg-accent/10 active:bg-accent/20"
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{ROLE_LABEL[c.role] ?? c.role}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-xs rounded-xl border bg-card p-6 shadow-sm">
        <button type="button" onClick={() => { setPicked(null); setPin(""); setError(""); }} className="mb-3 flex items-center gap-1 text-sm text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Назад
        </button>
        <h1 className="text-center text-lg font-semibold">{picked.name}</h1>
        <p className="mb-4 text-center text-sm text-muted-foreground">Введите PIN-код</p>
        <div className="mb-3 flex justify-center gap-3" aria-label="PIN">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`h-4 w-4 rounded-full border ${i < pin.length ? "bg-primary border-primary" : "bg-transparent"}`} />
          ))}
        </div>
        <p role="alert" className="mb-3 min-h-10 text-center text-sm text-red-600">{error}</p>
        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button key={d} type="button" disabled={busy} onClick={() => press(d)} className="h-16 rounded-lg border text-2xl font-medium active:bg-accent/20 disabled:opacity-50">{d}</button>
          ))}
          <span />
          <button type="button" disabled={busy} onClick={() => press("0")} className="h-16 rounded-lg border text-2xl font-medium active:bg-accent/20 disabled:opacity-50">0</button>
          <button type="button" disabled={busy} onClick={() => { setPin((p) => p.slice(0, -1)); setError(""); }} aria-label="Стереть" className="flex h-16 items-center justify-center rounded-lg border active:bg-accent/20 disabled:opacity-50">
            <Delete className="h-6 w-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
