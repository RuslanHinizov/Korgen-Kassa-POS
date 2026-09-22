"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth-client";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const t = useTranslations("settings");
  const { data: session } = useSession();
  const role = session?.user?.role;
  const isAdmin = role === "ADMIN";
  const isPrivileged = role === "ADMIN" || role === "MANAGER";

  const tabs = [
    { label: t("tab_users"), href: "/management/employees", id: "users", show: isAdmin },
    { label: t("tab_audit"), href: "/settings/audit", id: "audit", show: isPrivileged },
    { label: t("tab_profile"), href: "/settings/profile", id: "profile", show: true },
  ];

  const visibleTabs = tabs.filter((tab) => tab.show);

  return (
    <div className="flex flex-col">
      {/* Navigation tabs */}
      {/* z-30, not z-40: this sticky bar sits in the page content, a DOM sibling of
          the app's <header> (also z-40) — with equal z-index the later sibling wins,
          which let this bar paint over the header's open dropdown menus. */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30">
        <div className="flex max-w-4xl px-4 sm:px-6">
          {visibleTabs.map((tab) => (
            <Link
              key={tab.id}
              href={tab.href}
              className={cn(
                "px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                pathname === tab.href
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Content */}
      <div>{children}</div>
    </div>
  );
}
