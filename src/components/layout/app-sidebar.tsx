"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronRight, LogOut, Loader2, Store, X } from "lucide-react";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { navForRole, isProductsNsKey } from "./nav-config";
import { StoreLink } from "@/components/store/store-link";
import { useStorePath, useStrippedPathname } from "@/components/store/store-provider";

interface AppSidebarProps {
  user: {
    name: string;
    email: string;
    role?: string;
  };
  businessName: string;
  onLinkClick?: () => void;
}

/** Mobile drawer — same grouped menu as the desktop TopNav (see nav-config.tsx),
 * rendered as an accordion (icon + label + chevron, tap to expand), matching
 * UMAG's own mobile drawer layout instead of the old flat icon list. */
export function AppSidebar({ user, businessName, onLinkClick }: AppSidebarProps) {
  const pathname = useStrippedPathname();
  const router = useRouter();
  const storePath = useStorePath();
  const t = useTranslations("nav");
  const tp = useTranslations("products");
  const role = user.role ?? "CASHIER";
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const items = navForRole(role);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
      router.push("/login");
    } catch (error) {
      console.error("Sign out error:", error);
      setIsSigningOut(false);
    }
  };

  const handleProfileClick = () => {
    router.push(storePath("/settings/profile"));
    onLinkClick?.();
  };

  function labelFor(key: string): string {
    if (isProductsNsKey(key)) return tp(key);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return t(key as any);
  }

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r bg-sidebar">
      {/* Brand + close */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/korgen-kassa-mark.png"
          alt="Korgen Kassa POS"
          className="h-9 w-9 rounded-xl object-contain shrink-0 bg-white p-0.5"
        />
        <div className="flex flex-1 flex-col leading-none">
          <span className="text-sm font-bold tracking-tight text-sidebar-foreground">Korgen Kassa</span>
          <span className="text-[10px] font-semibold tracking-widest uppercase text-sidebar-primary">
            POS
          </span>
        </div>
        {onLinkClick && (
          <button onClick={onLinkClick} className="rounded-md p-1.5 text-sidebar-foreground/60 hover:bg-sidebar-accent" aria-label="Close menu">
            <X className="h-4.5 w-4.5" />
          </button>
        )}
      </div>

      {/* Nav accordion */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          if (!item.children) {
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href + "/"));
            return (
              <StoreLink
                key={item.key}
                href={item.href!}
                prefetch={false}
                onClick={onLinkClick}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {t(item.key as any)}
              </StoreLink>
            );
          }

          const open = openKey === item.key;
          const groupActive = item.children.some((c) => pathname === c.href || pathname.startsWith(c.href + "/"));
          return (
            <div key={item.key}>
              <button
                onClick={() => setOpenKey(open ? null : item.key)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  groupActive && !open ? "text-sidebar-primary" : "text-sidebar-foreground/80",
                  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <span className="flex-1 text-left">{t(item.key as any)}</span>
                <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-90")} />
              </button>
              {open && (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-4">
                  {item.children.map((child) => {
                    const active = pathname === child.href || pathname.startsWith(child.href + "/");
                    return (
                      <StoreLink
                        key={child.href}
                        href={child.href}
                        prefetch={false}
                        onClick={onLinkClick}
                        className={cn(
                          "block rounded-md px-2.5 py-2 text-sm transition-colors",
                          active ? "font-medium text-sidebar-primary" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        )}
                      >
                        {labelFor(child.key)}
                      </StoreLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Касса — not part of UMAG's own admin nav (separate register app there);
            kept reachable here since our app has no separate register app. */}
        <StoreLink
          href="/pos"
          prefetch={false}
          onClick={onLinkClick}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            pathname === "/pos" || pathname.startsWith("/pos/")
              ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          )}
        >
          <Store className="h-4 w-4 shrink-0" />
          {t("pos")}
        </StoreLink>
      </nav>

      {/* Store + user footer */}
      <div className="border-t border-sidebar-border p-3 space-y-2">
        <div className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-sidebar-foreground/60">
          <Store className="h-3.5 w-3.5" />
          {businessName}
        </div>
        <button
          onClick={handleProfileClick}
          className="w-full flex items-center gap-2.5 px-2 py-1 rounded-lg hover:bg-sidebar-accent transition-colors text-left"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground text-xs font-bold">
            {(user.name || user.email).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium leading-none truncate text-sidebar-foreground">{user.name}</p>
            <p className="text-xs text-sidebar-foreground/50 truncate mt-0.5">{user.email}</p>
          </div>
        </button>
        <button
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSigningOut ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
          {isSigningOut ? t("signing_out") : t("sign_out")}
        </button>
      </div>
    </aside>
  );
}
