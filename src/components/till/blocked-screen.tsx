"use client";

import { useOfflineStatus } from "@/lib/offline/use-offline-status";

/**
 * Shown instead of the till when the server is reachable and refuses this till's key: the market was suspended, deleted,
 * or this till's key was revoked. Nothing new can be sold. Sales already rung up stay on the till (they upload by themselves
 * if the market is switched back on). The register binding stays fixed on this computer.
 */
export function BlockedScreen() {
  const { pending } = useOfflineStatus();

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background p-6" data-testid="till-blocked">
      <div className="max-w-md rounded-xl border-2 border-red-300 bg-card p-8 text-center shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-red-700">Касса отключена</h1>
        <p className="mb-2 text-sm text-muted-foreground">
          Магазин приостановлен или удалён, либо ключ этой кассы отозван. Продажи сейчас невозможны. Обратитесь к администратору.
        </p>
        {pending > 0 && <p className="mb-2 text-sm font-medium">Не отправлено продаж: {pending} (они сохранены на кассе).</p>}
        <p className="text-xs text-muted-foreground">Если магазин включат снова, касса заработает сама.</p>
        <p className="mt-4 border-t pt-4 text-xs text-muted-foreground">Привязку этой кассы может изменить только администратор в панели управления.</p>
      </div>
    </div>
  );
}
