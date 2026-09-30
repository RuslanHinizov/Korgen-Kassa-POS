import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { setCurrencyConfig } from "@/lib/utils";
import { AppShell } from "@/components/layout/app-shell";
import { StoreProvider } from "@/components/store/store-provider";
import { CurrencyInit } from "@/components/layout/currency-init";
import { resolveStoreAccess } from "@/lib/store-context";
import { StoreBlocked } from "@/components/store/store-blocked";
import { SupportChat } from "@/components/support/support-chat";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  noStore();
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }
  // The platform owner has no market of their own — their home is the SUPERADMIN panel.
  if (session.user.role === "SUPERADMIN") {
    redirect("/superadmin");
  }
  // Cashiers have a separate account page and cash-register login. Warehouse
  // workers use the same responsive shell, but only see the receipt module.
  if (!['ADMIN', 'MANAGER', 'WAREHOUSE'].includes(session.user.role ?? '')) {
    redirect('/profile');
  }

  const access = await resolveStoreAccess();
  if (access.noAccess) return <StoreBlocked title="Нет доступа" message="Ваш аккаунт не привязан ни к одному магазину. Обратитесь к администратору." />;
  if (access.suspended) {
    return <StoreBlocked title="Доступ к магазину приостановлен" message={access.suspended.message || "Работа этого магазина временно приостановлена. Свяжитесь с поддержкой Korgen Kassa."} />;
  }
  // The URL named a market this user doesn't belong to — send them to their own.
  if (access.mismatch) redirect(`/store/${access.storeId}`);
  const storeId = access.storeId;

  const settings = await prisma.businessSettings
    .findUnique({ where: { storeId } })
    .catch(() => null);

  // Inject branding CSS vars from business settings.
  //
  // IMPORTANT: --primary must NOT be injected via inline style because inline
  // styles override CSS class rules (.dark), causing the wrong primary on dark
  // backgrounds. Instead we use a <style> tag: light mode gets the (darker)
  // primary colour, dark mode gets the brighter accent colour so filled buttons
  // stay legible on the near-black dark background.
  const primary = settings?.primaryColor ?? "#15503A";
  const accent = settings?.accentColor ?? "#22B24C";

  // Currency symbol / decimals for `formatCurrency` (server render).
  const currencySymbol = settings?.currency ?? "$";
  const currencyDecimals = settings?.currencyDecimals ?? 2;
  const currencyLocale = settings?.language ?? "en";
  setCurrencyConfig({ symbol: currencySymbol, decimals: currencyDecimals, locale: currencyLocale });

  // brandingCSS injected as a <style> tag (server-rendered, no flash).
  const brandingCSS = `
    :root:not(.dark) {
      --primary: ${primary};
      --primary-foreground: oklch(0.985 0 0);
    }
    .dark {
      --primary: ${accent};
    }
    :root {
      --sidebar: ${primary};
      --sidebar-primary: ${accent};
      --sidebar-primary-foreground: oklch(0.13 0.05 253);
      --accent: ${accent};
      --ring: ${accent};
    }
  `;

  // Sidebar vars still applied inline so they apply to the specific subtree
  // (avoids any cascade issues from the global :root override above).
  const cssVars: React.CSSProperties = {
    "--sidebar": primary,
    "--sidebar-primary": accent,
  } as React.CSSProperties;

  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: brandingCSS }} />
      {/* Currency config for client-side formatCurrency (set before hydration) */}
      <script
        dangerouslySetInnerHTML={{
          __html: `window.__olgaxCurrency=${JSON.stringify({
            symbol: currencySymbol,
            decimals: currencyDecimals,
            locale: currencyLocale,
          })}`,
        }}
      />
      <CurrencyInit symbol={currencySymbol} decimals={currencyDecimals} locale={currencyLocale} />
      <StoreProvider storeId={storeId}>
        <AppShell user={session.user} businessName={settings?.name ?? "Korgen Kassa"} cssVars={cssVars}>
          {children}
        </AppShell>
        <SupportChat />
      </StoreProvider>
    </>
  );
}
