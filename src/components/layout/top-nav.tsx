"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Bell, Check, ChevronDown, Globe2, Loader2, LogOut } from "lucide-react";
import { signOut } from "@/lib/auth-client";
import { setLocale } from "@/app/actions/locale-actions";
import { cn } from "@/lib/utils";
import { SyncStatusBadge } from "./sync-status-badge";
import { DarkModeToggle } from "./dark-mode-toggle";
import { navForRole, isProductsNsKey, type NavItem } from "./nav-config";
import { StoreLink } from "@/components/store/store-link";
import { useStrippedPathname } from "@/components/store/store-provider";
import { StoreSwitcher } from "@/components/store/store-switcher";

interface TopNavProps {
  user: { name: string; email: string; role?: string };
  businessName: string;
}

type AppNotification = {
  id: string;
  level: "warning" | "error";
  title: string;
  description: string;
  href: string;
};

const LANGUAGES = [
  ["ru", "Русский"],
  ["en", "English"],
] as const;

export function TopNav({ user, businessName }: TopNavProps) {
  const pathname = useStrippedPathname();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("nav");
  const tp = useTranslations("products");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [isChangingLanguage, setIsChangingLanguage] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const rootRef = useRef<HTMLElement>(null);

  const role = user.role ?? "CASHIER";
  const items = navForRole(role);

  // Close any open dropdown on outside click / Escape / route change.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpenKey(null);
        setUserMenuOpen(false);
        setNotificationsOpen(false);
        setLanguageMenuOpen(false);
      }
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenKey(null);
        setUserMenuOpen(false);
        setNotificationsOpen(false);
        setLanguageMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadNotifications() {
      try {
        const response = await fetch("/api/notifications", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { notifications?: AppNotification[] };
        if (!cancelled) setNotifications(data.notifications ?? []);
      } catch {
        // A missing alert must never interrupt point-of-sale work.
      }
    }

    void loadNotifications();
    const interval = window.setInterval(loadNotifications, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  // Close any open dropdown when the route changes — adjusted during render
  // (not an effect) per React's guidance for resetting state on a prop change.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    if (openKey !== null) setOpenKey(null);
    if (userMenuOpen) setUserMenuOpen(false);
    if (notificationsOpen) setNotificationsOpen(false);
    if (languageMenuOpen) setLanguageMenuOpen(false);
  }

  function isActive(item: NavItem): boolean {
    const hrefs = item.href ? [item.href] : (item.children ?? []).map((c) => c.href);
    return hrefs.some((h) =>
      h === "/" ? pathname === "/" : pathname === h || pathname.startsWith(h + "/")
    );
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await signOut();
      router.push("/login");
    } catch {
      setIsSigningOut(false);
    }
  }

  async function handleLocaleChange(nextLocale: string) {
    if (nextLocale === locale || isChangingLanguage) {
      setLanguageMenuOpen(false);
      return;
    }

    setIsChangingLanguage(true);
    try {
      await setLocale(nextLocale);
      setLanguageMenuOpen(false);
      router.refresh();
    } finally {
      setIsChangingLanguage(false);
    }
  }

  // "products" namespace label helper for dropdown items borrowed from there
  function labelFor(key: string): string {
    if (isProductsNsKey(key)) return tp(key);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return t(key as any);
  }

  return (
    <header ref={rootRef} className="bg-background relative z-40 shrink-0 border-b print:hidden">
      <div className="from-primary h-[3px] w-full bg-gradient-to-r to-[var(--primary)]/60" />
      <div className="flex h-14 items-center gap-1 px-3 sm:px-4">
        {/* Logo */}
        <StoreLink href="/" className="mr-2 flex shrink-0 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/korgen-kassa-mark.png"
            alt="Korgen Kassa POS"
            className="h-8 w-8 rounded-lg border bg-white object-contain p-0.5"
          />
          <span className="hidden text-sm font-bold tracking-tight sm:inline">Korgen Kassa</span>
        </StoreLink>

        {/* Nav items */}
        <nav className="flex flex-1 items-center gap-0.5">
          {items.map((item) => {
            const active = isActive(item);
            if (!item.children) {
              return (
                <StoreLink
                  key={item.key}
                  href={item.href!}
                  prefetch={false}
                  className={cn(
                    "shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "text-primary"
                      : "text-foreground/80 hover:bg-accent hover:text-foreground"
                  )}
                >
                  {t(item.key as any)}
                </StoreLink>
              );
            }
            const open = openKey === item.key;
            return (
              <div key={item.key} className="relative shrink-0">
                <button
                  onClick={() => setOpenKey(open ? null : item.key)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "text-primary"
                      : "text-foreground/80 hover:bg-accent hover:text-foreground"
                  )}
                >
                  {t(item.key as any)}
                  <ChevronDown
                    className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
                  />
                </button>
                {open && (
                  <div className="bg-card absolute top-full left-0 z-50 mt-1 min-w-48 rounded-md border py-1 shadow-lg">
                    {item.children.map((child) => (
                      <StoreLink
                        key={child.href}
                        href={child.href}
                        prefetch={false}
                        onClick={() => setOpenKey(null)}
                        className={cn(
                          "hover:bg-accent block px-3.5 py-2 text-sm",
                          pathname === child.href || pathname.startsWith(child.href + "/")
                            ? "text-primary font-medium"
                            : "text-foreground/90"
                        )}
                      >
                        {labelFor(child.key)}
                      </StoreLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Right cluster */}
        <div className="flex shrink-0 items-center gap-1">
          <div className="relative hidden sm:block">
            <button
              type="button"
              onClick={() => setNotificationsOpen((open) => !open)}
              className="text-muted-foreground hover:bg-accent hover:text-foreground relative inline-flex rounded-md p-2"
              aria-label="Notifications"
              aria-expanded={notificationsOpen}
            >
              <Bell className="h-4 w-4" />
              {notifications.length > 0 && (
                <span className="bg-destructive text-destructive-foreground absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold">
                  {notifications.length > 9 ? "9+" : notifications.length}
                </span>
              )}
            </button>
            {notificationsOpen && (
              <div className="bg-card absolute top-full right-0 z-50 mt-1 w-80 rounded-md border py-1 shadow-lg">
                <div className="border-b px-3.5 py-2 text-sm font-semibold">Уведомления</div>
                {notifications.length === 0 ? (
                  <p className="text-muted-foreground px-3.5 py-4 text-sm">Нет новых уведомлений</p>
                ) : (
                  notifications.map((notification) => (
                    <StoreLink
                      key={notification.id}
                      href={notification.href}
                      prefetch={false}
                      onClick={() => setNotificationsOpen(false)}
                      className="hover:bg-accent flex gap-2 px-3.5 py-3 text-sm"
                    >
                      <AlertTriangle
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0",
                          notification.level === "error" ? "text-destructive" : "text-amber-600"
                        )}
                      />
                      <span>
                        <span className="block font-medium">{notification.title}</span>
                        <span className="text-muted-foreground block text-xs">
                          {notification.description}
                        </span>
                      </span>
                    </StoreLink>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="relative hidden sm:block">
            <button
              type="button"
              onClick={() => setLanguageMenuOpen((open) => !open)}
              className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex items-center gap-1 rounded-md px-2 py-2 text-xs font-semibold uppercase"
              aria-label="Change language"
              aria-expanded={languageMenuOpen}
            >
              <Globe2 className="h-4 w-4" />
              {locale}
              <ChevronDown className="h-3 w-3" />
            </button>
            {languageMenuOpen && (
              <div className="bg-card absolute top-full right-0 z-50 mt-1 max-h-80 w-52 overflow-y-auto rounded-md border py-1 shadow-lg">
                {LANGUAGES.map(([code, label]) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => handleLocaleChange(code)}
                    disabled={isChangingLanguage}
                    className="hover:bg-accent flex w-full items-center justify-between px-3.5 py-2 text-left text-sm disabled:cursor-wait disabled:opacity-50"
                  >
                    <span>{label}</span>
                    {locale === code && <Check className="text-primary h-4 w-4" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <StoreSwitcher currentPath={pathname} businessName={businessName} />
          <DarkModeToggle />
          <SyncStatusBadge />

          {/* User menu */}
          <div className="relative ml-1">
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className="hover:bg-accent flex items-center gap-2 rounded-md py-1 pr-2 pl-1"
            >
              <div className="bg-primary text-primary-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                {(user.name || user.email).charAt(0).toUpperCase()}
              </div>
              <span className="hidden max-w-28 truncate text-sm font-medium sm:inline">
                {user.name}
              </span>
            </button>
            {userMenuOpen && (
              <div className="bg-card absolute top-full right-0 z-50 mt-1 w-48 rounded-md border py-1 shadow-lg">
                <div className="border-b px-3.5 py-2">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="text-muted-foreground truncate text-xs">{user.email}</p>
                </div>
                <StoreLink
                  href="/pos"
                  prefetch={false}
                  onClick={() => setUserMenuOpen(false)}
                  className="hover:bg-accent block px-3.5 py-2 text-sm"
                >
                  {t("pos")}
                </StoreLink>
                <StoreLink
                  href="/settings/profile"
                  prefetch={false}
                  onClick={() => setUserMenuOpen(false)}
                  className="hover:bg-accent block px-3.5 py-2 text-sm"
                >
                  {t("store_menu_profile")}
                </StoreLink>
                <StoreLink
                  href="/settings"
                  prefetch={false}
                  onClick={() => setUserMenuOpen(false)}
                  className="hover:bg-accent block px-3.5 py-2 text-sm"
                >
                  {t("store_menu_settings")}
                </StoreLink>
                <button
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  className="text-destructive hover:bg-accent flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm disabled:opacity-50"
                >
                  {isSigningOut ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <LogOut className="h-3.5 w-3.5" />
                  )}
                  {isSigningOut ? t("signing_out") : t("sign_out")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
