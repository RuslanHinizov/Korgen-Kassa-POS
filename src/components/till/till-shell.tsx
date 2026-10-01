"use client";

import { useEffect, useState } from "react";
import { StoreProvider } from "@/components/store/store-provider";
import { POSScreen } from "@/components/pos/pos-screen";
import { setCurrencyConfig } from "@/lib/utils";
import { loadTillProfile, type TillProfileResult } from "@/lib/offline/till-profile";
import { getPackageInfo, type PackageInfo } from "@/lib/offline/package-import";
import { PinLogin } from "./pin-login";
import { ActivationForm } from "./activation-form";
import { BlockedScreen } from "./blocked-screen";
import { useOfflineStatus } from "@/lib/offline/use-offline-status";
import { installDeviceFetch } from "@/lib/offline/device-fetch";
import { flushQueue } from "@/lib/offline/queue";
import { enrollDevice } from "@/lib/offline/device-token";
import { refreshPackageCashiers } from "@/lib/offline/pin-login";

// before anything on this screen fetches: every /api call carries the device token and the working employee
installDeviceFetch();

function Notice({ title, message, children }: { title: string; message: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background p-6">
      <div className="max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        <h1 className="mb-2 text-xl font-semibold">{title}</h1>
        <p className="mb-4 text-sm text-muted-foreground">{message}</p>
        {children && <div className="mt-4 border-t pt-4">{children}</div>}
      </div>
    </div>
  );
}

/**
 * The cash register drawn entirely in the browser from IndexedDB, so it opens with no connection even the first time
 * (unlike /pos, whose layout reads session, market and branding from the server). Plan §12, stage A1.
 */
/**
 * While nobody is signed in (end of the day, between cashiers) the till screen — and the manager that sends waiting
 * sales — is not on screen. Sales rung up offline must still go up the moment the connection is back, so this keeps
 * uploading, trading the start key for the till's own key, and refreshing the staff list from the PIN screen too.
 */
function useBackgroundUpload(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const run = () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      void flushQueue();
      void enrollDevice();
      void refreshPackageCashiers();
    };
    run();
    const id = setInterval(run, 20_000);
    window.addEventListener("online", run);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", run);
    };
  }, [active]);
}

export function TillShell() {
  const [result, setResult] = useState<TillProfileResult | null>(null);
  const [info, setInfo] = useState<PackageInfo | undefined>();
  const { needsLogin, online } = useOfflineStatus();

  const reload = () => {
    loadTillProfile().then(setResult).catch(() => setResult({ state: "unbound" }));
    getPackageInfo().then(setInfo).catch(() => {});
  };
  useEffect(reload, []);
  // refused by the server while online = switched off: keep asking, so the till wakes up by itself when the market is back
  const blocked = needsLogin && online && !!result && result.state !== "unbound";
  useBackgroundUpload(result?.state === "signed-out" || blocked);

  useEffect(() => {
    if (result?.state === "ready") setCurrencyConfig(result.profile.currency);
  }, [result]);

  if (!result) return <div className="h-screen w-screen bg-background" />;
  if (blocked) return <BlockedScreen />;
  if (result.state === "unbound") {
    return (
      <Notice title="Касса не привязана к магазину" message="Для первого подключения требуется интернет. Введите одноразовый код, созданный для этой кассы в панели управления.">
        <ActivationForm onLoaded={reload} />
      </Notice>
    );
  }
  if (result.state === "signed-out") return <PinLogin key={info?.loadedAt} storeName={info?.storeName} onSignedIn={reload} />;

  const { profile } = result;
  const brandingCSS = `
    :root:not(.dark) { --primary: ${profile.primaryColor}; --primary-foreground: oklch(0.985 0 0); }
    .dark { --primary: ${profile.accentColor}; }
    :root { --accent: ${profile.accentColor}; --ring: ${profile.accentColor}; }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: brandingCSS }} />
      <StoreProvider storeId={profile.storeId}>
        <div className="h-screen w-screen overflow-hidden bg-background">
          <POSScreen cashierName={profile.cashier.name} cashierRole={profile.cashier.role} cashierId={profile.cashier.userId} storeId={profile.storeId} />
        </div>
      </StoreProvider>
    </>
  );
}
