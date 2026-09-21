"use client";

import { useTranslations } from "next-intl";
import { ChevronRight, Home } from "lucide-react";
import { StoreLink } from "@/components/store/store-link";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  const t = useTranslations("nav");
  return (
    <nav aria-label={t("breadcrumb")} className="flex items-center gap-1 text-sm text-muted-foreground mb-6">
      <StoreLink
        href="/"
        className="flex items-center gap-1 hover:text-foreground transition-colors"
        aria-label={t("home")}
      >
        <Home className="h-3.5 w-3.5" />
      </StoreLink>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          {item.href ? (
            <StoreLink href={item.href} className="hover:text-foreground transition-colors">
              {item.label}
            </StoreLink>
          ) : (
            <span className="text-foreground font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
