"use client";

import { useEffect, useState } from "react";
import { StoreProvider } from "@/components/store/store-provider";
import { POSScreen } from "@/components/pos/pos-screen";
import { setCurrencyConfig } from "@/lib/utils";
import { loadTillProfile, type TillProfileResult } from "@/lib/offline/till-profile";
import { getPackageInfo, type PackageInfo } from "@/lib/offline/package-import";
import { PackageLoader } from "./package-loader";
import { PinLogin } from "./pin-login";
import { ActivationForm } from "./activation-form";
import { installDeviceFetch } from "@/lib/offline/device-fetch";

// before anything on this screen fetches: every /api call carries the device token and the working employee
installDeviceFetch();

function Notice({ title, message, children }: { title: string; message: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background p-6">
      <div className="max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        <h1 className="mb-2 text-xl font-semibold">{title}</h1>
        <p className="mb-4 text-sm text-muted-foreground">{message}</p>
        {/* until PIN sign-in (A3) exists, the only way in is the online cashier sign-in */}
        <a href="/kasa-giris" className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Войти (нужен интернет)</a>
        {children && <div className="mt-4 border-t pt-4">{children}</div>}
      </div>
    </div>
  );
}

/**
 * The cash register drawn entirely in the browser from IndexedDB, so it opens with no connection even the first time
 * (unlike /pos, whose layout reads session, market and branding from the server). Plan §12, stage A1.
 */
export function TillShell() {
  const [result, setResult] = useState<TillProfileResult | null>(null);
  const [info, setInfo] = useState<PackageInfo | undefined>();

  const reload = () => {
    loadTillProfile().then(setResult).catch(() => setResult({ state: "unbound" }));
    getPackageInfo().then(setInfo).catch(() => {});
  };
  useEffect(reload, []);

  useEffect(() => {
    if (result?.state === "ready") setCurrencyConfig(result.profile.currency);
  }, [result]);

  if (!result) return <div className="h-screen w-screen bg-background" />;
  if (result.state === "unbound") {
    return (
      <Notice title="Касса не привязана к магазину" message="На этой кассе ещё нет данных магазина. Загрузите пакет магазина (файл из панели управления) или один раз войдите с интернетом.">
        <ActivationForm onLoaded={reload} />
        <p className="my-3 text-xs text-muted-foreground">или, если нет интернета:</p>
        <PackageLoader label="Загрузить пакет магазина" onLoaded={reload} />
      </Notice>
    );
  }
  if (result.state === "signed-out") {
    return (
      <>
        <PinLogin key={info?.loadedAt} storeName={info?.storeName} onSignedIn={reload} />
        <div className="fixed bottom-3 left-0 right-0 flex items-center justify-center gap-3 text-xs">
          <PackageLoader label="Загрузить новый пакет магазина" onLoaded={reload} />
          <a href="/kasa-giris" className="rounded-md border px-4 py-2 text-sm text-muted-foreground">Войти по паролю (нужен интернет)</a>
        </div>
      </>
    );
  }

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
