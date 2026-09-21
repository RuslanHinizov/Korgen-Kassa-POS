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
    { label: t("tab_general"), href: "/settings", id: "general", show: isPrivileged },
    { label: t("tab_users"), href: "/settings/users", id: "users", show: isAdmin },
    { label: t("tab_audit"), href: "/settings/audit", id: "audit", show: isPrivileged },
    { label: t("tab_profile"), href: "/settings/profile", id: "profile", show: true },
  ];

  const visibleTabs = tabs.filter((tab) => tab.show);

  return (
    <div className="flex flex-col">
      {/* Navigation tabs */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
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
