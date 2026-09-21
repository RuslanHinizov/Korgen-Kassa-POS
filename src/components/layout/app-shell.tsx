"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Menu, ShoppingCart, Package, ReceiptText, BarChart3, Settings, Warehouse } from "lucide-react";
import { AppSidebar } from "./app-sidebar";
import { TopNav } from "./top-nav";
import { SyncStatusBadge } from "./sync-status-badge";
import { DarkModeToggle } from "./dark-mode-toggle";
import { cn } from "@/lib/utils";
import { StoreLink } from "@/components/store/store-link";
import { useStrippedPathname } from "@/components/store/store-provider";

interface AppShellProps {
  user: {
    name: string;
    email: string;
    role?: string;
  };
  businessName: string;
  cssVars: React.CSSProperties;
  children: React.ReactNode;
}

export function AppShell({ user, businessName, cssVars, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = useStrippedPathname();
  const t = useTranslations("nav");

  const bottomNav = [
    { href: "/pos", label: t("pos"), icon: ShoppingCart, roles: ["ADMIN", "CASHIER"] },
    { href: "/products", label: t("products"), icon: Package, roles: ["ADMIN"] },
    { href: "/inventory", label: t("inventory"), icon: Warehouse, roles: ["ADMIN"] },
    { href: "/sales", label: t("sales"), icon: ReceiptText, roles: ["ADMIN", "CASHIER"] },
    { href: "/reports", label: t("reports"), icon: BarChart3, roles: ["ADMIN"] },
    { href: "/settings", label: t("settings"), icon: Settings, roles: ["ADMIN"] },
  ].filter((item) => item.roles.includes(user.role ?? "CASHIER"));

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background print:block print:h-auto print:overflow-visible" style={cssVars}>
      {/* Desktop top nav — UMAG-style horizontal menu with dropdowns, lg+ only */}
      <div className="hidden lg:block shrink-0 print:hidden">
        <TopNav user={user} businessName={businessName} />
      </div>

      {/* Mobile header — hamburger + logo */}
      <header className="flex lg:hidden h-14 shrink-0 items-center gap-2 border-b bg-sidebar px-4 print:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="rounded-md p-2 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/korgen-kassa-mark.png"
          alt="Korgen Kassa POS"
          className="h-7 w-7 rounded-lg object-contain bg-white p-0.5"
        />
        <span className="flex-1 text-sm font-semibold text-white">Korgen Kassa POS</span>
        <DarkModeToggle />
        <SyncStatusBadge />
      </header>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          {/* Sidebar panel */}
          <div className="relative z-10 h-full w-72 shrink-0">
            <AppSidebar user={user} businessName={businessName} onLinkClick={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Page content */}
      <main className="flex-1 overflow-y-auto print:overflow-visible">{children}</main>

      {/* Mobile bottom navigation */}
      <nav className="flex lg:hidden shrink-0 border-t bg-background print:hidden">
        {bottomNav.map(({ href, label, icon: Icon }) => (
          <StoreLink
            key={href}
            href={href}
            prefetch={false}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
              pathname === href || pathname.startsWith(href + "/")
                ? "text-primary"
                : "text-muted-foreground"
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </StoreLink>
        ))}
      </nav>
    </div>
  );
}
