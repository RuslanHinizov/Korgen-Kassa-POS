"use client";

import { useState } from "react";
import { useOfflineStatus } from "@/lib/offline/use-offline-status";
import { resetTill } from "@/lib/offline/clear";
import { ActivationForm } from "./activation-form";
import { PackageLoader } from "./package-loader";
import { TillCornerActions } from "./till-corner-actions";

/**
 * Shown instead of the till when the server is reachable and refuses this till's key: the market was suspended, deleted,
 * or this till's key was revoked. Nothing new can be sold. Sales already rung up stay on the till (they upload by themselves
 * if the market is switched back on). To tie the till to another market: activation code or package file; if sales of the
 * old market are still waiting, they must be thrown away first ("Сбросить кассу").
 */
export function BlockedScreen({ onChanged }: { onChanged: () => void }) {
  const { pending } = useOfflineStatus();
  const [busy, setBusy] = useState(false);

  async function reset() {
    const note = pending > 0 ? `На кассе ${pending} не отправленных продаж этого магазина — они будут УДАЛЕНЫ. ` : "";
    if (!window.confirm(`${note}Сбросить кассу и привязать её к другому магазину?`)) return;
    setBusy(true);
    try {
      await resetTill();
    } finally {
      setBusy(false);
    }
    onChanged();
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background p-6" data-testid="till-blocked">
      <TillCornerActions bound={false} onChanged={onChanged} />
      <div className="max-w-md rounded-xl border-2 border-red-300 bg-card p-8 text-center shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-red-700">Касса отключена</h1>
        <p className="mb-2 text-sm text-muted-foreground">
          Магазин приостановлен или удалён, либо ключ этой кассы отозван. Продажи сейчас невозможны. Обратитесь к администратору.
        </p>
        {pending > 0 && <p className="mb-2 text-sm font-medium">Не отправлено продаж: {pending} (они сохранены на кассе).</p>}
        <p className="text-xs text-muted-foreground">Если магазин включат снова, касса заработает сама.</p>
        <div className="mt-4 border-t pt-4">
          <p className="mb-2 text-xs text-muted-foreground">Подключить к другому магазину:</p>
          <ActivationForm onLoaded={onChanged} />
          <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
            <PackageLoader label="Загрузить пакет магазина" onLoaded={onChanged} />
            <button type="button" disabled={busy} onClick={() => void reset()} className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50">
              Сбросить кассу
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
