"use client";

import { StoreLink as Link } from "@/components/store/store-link";
import { useStrippedPathname } from "@/components/store/store-provider";

const TABS = [
  { href: "/reports/statistics/products", label: "По товарам" },
  { href: "/reports/statistics/receipts", label: "По чекам" },
  { href: "/reports/statistics/categories", label: "По категориям" },
  { href: "/reports/statistics/suppliers", label: "По поставщикам" },
  { href: "/reports/statistics/customers", label: "По покупателям" },
  { href: "/reports/statistics/compare", label: "Сравнение товаров" },
];

export function StatisticsTabs() {
  const pathname = useStrippedPathname();
  return (
    <div className="flex flex-wrap gap-1">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={
              active
                ? "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                : "rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
