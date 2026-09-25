import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/db";
import { setCurrencyConfig } from "@/lib/utils";
import { StoreProvider } from "@/components/store/store-provider";
import { resolveStoreAccess } from "@/lib/store-context";
import { StoreBlocked } from "@/components/store/store-blocked";
import { SupportChat } from "@/components/support/support-chat";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Full-screen kiosk shell for the cash register — no admin TopNav/sidebar,
 * matching UMAG's dedicated kassa screen instead of sitting inside the admin chrome.
 * It is reachable only by a cashier's own authenticated account. */
export default async function KioskLayout({ children }: { children: React.ReactNode }) {
  noStore();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/kasa-giris");
  // Складской работник can also be issued a kassa PIN (see hasKioskAccess) — same screen.
  if (!["CASHIER", "WAREHOUSE"].includes(session.user.role)) redirect("/");

  const access = await resolveStoreAccess();
  if (access.noAccess) return <StoreBlocked title="Нет доступа" message="Ваш аккаунт не привязан ни к одному магазину. Обратитесь к администратору." />;
  if (access.suspended) {
    return <StoreBlocked title="Доступ к магазину приостановлен" message={access.suspended.message || "Работа этого магазина временно приостановлена. Свяжитесь с поддержкой Korgen Kassa."} />;
  }
  const storeId = access.storeId;
  const assigned = await prisma.userStoreAssignment.findUnique({ where: { userId_storeId: { userId: session.user.id, storeId } } });
  if (!assigned) redirect("/profile");
  const settings = await prisma.businessSettings.findUnique({ where: { storeId } }).catch(() => null);

  const primary = settings?.primaryColor ?? "#15503A";
  const accent = settings?.accentColor ?? "#22B24C";
  const currencySymbol = settings?.currency ?? "$";
  const currencyDecimals = settings?.currencyDecimals ?? 2;
  const currencyLocale = settings?.language ?? "en";
  setCurrencyConfig({ symbol: currencySymbol, decimals: currencyDecimals, locale: currencyLocale });

  const brandingCSS = `
    :root:not(.dark) {
      --primary: ${primary};
      --primary-foreground: oklch(0.985 0 0);
    }
    .dark {
      --primary: ${accent};
    }
    :root {
      --accent: ${accent};
      --ring: ${accent};
    }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: brandingCSS }} />
      <script
        dangerouslySetInnerHTML={{
          __html: `window.__olgaxCurrency=${JSON.stringify({
            symbol: currencySymbol,
            decimals: currencyDecimals,
            locale: currencyLocale,
          })}`,
        }}
      />
      <StoreProvider storeId={storeId}>
        <div className="h-screen w-screen overflow-hidden bg-background">{children}</div>
        <SupportChat compact />
      </StoreProvider>
    </>
  );
}
