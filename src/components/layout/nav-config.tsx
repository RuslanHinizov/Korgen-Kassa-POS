import {
  LayoutDashboard,
  BarChart3,
  ClipboardList,
  ShoppingCart,
  Package,
  CreditCard,
  Users,
  Grid3x3,
  type LucideIcon,
} from "lucide-react";

export interface NavChild {
  href: string;
  key: string;
  /** When set, only these roles see this dropdown item (defaults to the parent's roles). */
  roles?: string[];
}
export interface NavItem {
  key: string;
  href?: string;
  roles: string[];
  icon: LucideIcon;
  children?: NavChild[];
}

/** Single source of truth for the app menu — shared by the desktop TopNav
 * (UMAG-style horizontal bar with dropdowns) and the mobile drawer (accordion),
 * so the two can never drift out of sync with each other again. */
export const NAV: NavItem[] = [
  { key: "home", href: "/", roles: ["ADMIN", "MANAGER"], icon: LayoutDashboard },
  {
    key: "reports",
    roles: ["ADMIN", "MANAGER"],
    icon: BarChart3,
    children: [
      { key: "reports_statistics", href: "/reports/statistics" },
      { key: "shifts", href: "/shifts" },
      { key: "reports_cashiers", href: "/reports/cashiers" },
      { key: "reports_discounts", href: "/reports/discounts" },
      { key: "reports_consultants_report", href: "/reports/consultants" },
      { key: "reports_cash_flow", href: "/reports/cash-flow" },
      { key: "reports_profit_loss", href: "/reports/profit-loss" },
      { key: "reports_abc", href: "/reports/abc" },
    ],
  },
  {
    // UMAG's own Складской работник sees only "Возврат покупателя" under Продажи
    // (no История продаж / Отмененные товары — those stay office-only below).
    key: "sales",
    roles: ["ADMIN", "MANAGER", "CASHIER", "WAREHOUSE"],
    icon: ClipboardList,
    children: [
      { key: "sales_history", href: "/sales", roles: ["ADMIN", "MANAGER", "CASHIER"] },
      { key: "sales_voided", href: "/sales/voided", roles: ["ADMIN", "MANAGER", "CASHIER"] },
      { key: "sales_returns", href: "/sales/returns" },
    ],
  },
  {
    // UMAG gives Складской работник Приёмка + Возвраты поставщикам, but not Платежи.
    key: "purchases",
    roles: ["ADMIN", "MANAGER", "WAREHOUSE"],
    icon: ShoppingCart,
    children: [
      { key: "purchases_receiving", href: "/purchases" },
      { key: "purchases_returns", href: "/purchases/returns" },
      { key: "purchases_payments", href: "/purchases/payments", roles: ["ADMIN", "MANAGER"] },
    ],
  },
  {
    // UMAG hides the catalog itself (Список товаров/Артикул) and Комплекты/Наценка
    // config from Складской работник — only the physical-stock documents + Склад.
    key: "products",
    roles: ["ADMIN", "MANAGER", "WAREHOUSE"],
    icon: Package,
    children: [
      { key: "products_list", href: "/products", roles: ["ADMIN", "MANAGER"] },
      { key: "categories_link", href: "/products/categories", roles: ["ADMIN", "MANAGER"] },
      { key: "products_sku", href: "/products/sku", roles: ["ADMIN", "MANAGER"] },
      { key: "quick_products_link", href: "/products/quick" },
      { key: "products_warehouse_stock", href: "/products/stock", roles: ["WAREHOUSE"] },
      { key: "inventory", href: "/inventory", roles: ["ADMIN", "MANAGER"] },
      { key: "products_write_off", href: "/products/write-off" },
      { key: "products_stock_in", href: "/products/stock-in" },
      { key: "products_stocktake", href: "/products/stocktake" },
      { key: "products_transfer", href: "/products/transfer" },
      { key: "promotions", href: "/promotions", roles: ["ADMIN", "MANAGER"] },
    ],
  },
  {
    key: "finance",
    roles: ["ADMIN", "MANAGER"],
    icon: CreditCard,
    children: [
      { key: "finance_accounts", href: "/finance/accounts" },
      { key: "finance_payments", href: "/finance/payments" },
      { key: "finance_transfers", href: "/finance/transfers" },
    ],
  },
  {
    key: "contragents",
    roles: ["ADMIN", "MANAGER", "WAREHOUSE"],
    icon: Users,
    children: [
      { key: "customers", href: "/customers" },
      { key: "suppliers", href: "/suppliers" },
    ],
  },
  {
    key: "management",
    roles: ["ADMIN", "MANAGER"],
    icon: Grid3x3,
    children: [
      { key: "management_users", href: "/management/employees", roles: ["ADMIN"] },
      { key: "management_settings", href: "/management/settings" },
      { key: "management_receipt", href: "/management/receipt" },
      { key: "management_registers", href: "/management/cashboxes" },
      { key: "management_consultants", href: "/management/consultants" },
      { key: "management_expense_types", href: "/management/expense-types" },
      { key: "management_permissions", href: "/management/permissions" },
      { key: "management_reference", href: "/management/reference" },
    ],
  },
];

/** Menu items visible to a role, with role-restricted dropdown children filtered out. */
export function navForRole(role: string): NavItem[] {
  return NAV.filter((i) => i.roles.includes(role)).map((i) =>
    i.children ? { ...i, children: i.children.filter((c) => !c.roles || c.roles.includes(role)) } : i
  );
}

/** Dropdown-child labels that live in the "products" i18n namespace instead of "nav". */
const PRODUCTS_NS_KEYS = new Set(["categories_link", "quick_products_link"]);
export function isProductsNsKey(key: string): boolean {
  return PRODUCTS_NS_KEYS.has(key);
}
