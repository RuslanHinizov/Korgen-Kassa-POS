import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { serialize } from "@/lib/serialize";
import { formatCurrency } from "@/lib/utils";
import { getCustomerBalance } from "@/lib/customer-balance";
import { Star } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { CustomerCreditPanel } from "@/components/customers/customer-credit-panel";
import { getTranslations, getLocale } from "next-intl/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Customer Profile" };

export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const storeId = await getStoreId();
  const raw = await prisma.customer.findFirst({
    where: { id, storeId },
    include: {
      sales: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          items: { select: { id: true, name: true, quantity: true, price: true, total: true, notes: true } },
        },
      },
    },
  });

  if (!raw) notFound();

  const customer = serialize(raw);
  const balance = await getCustomerBalance(id);
  const t = await getTranslations("customers");
  const td = await getTranslations("customers.detail");
  const tp = await getTranslations("pos");
  const tsl = await getTranslations("sales");
  const locale = await getLocale();

  const statusLabel: Record<string, string> = {
    COMPLETED: tsl("status_completed"),
    VOIDED: tsl("status_voided"),
    REFUNDED: tsl("status_refunded"),
  };

  const totalSpend = customer.sales
    .filter((s: any) => s.status === "COMPLETED")
    .reduce((sum: number, s: any) => sum + parseFloat(s.total.toString()), 0);

  const formatter = new Intl.DateTimeFormat(locale, {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <Breadcrumb items={[
        { label: t("title"), href: "/customers" },
        { label: customer.name },
      ]} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Profile */}
        <div className="md:col-span-1 rounded-lg border bg-card p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold">{customer.name}</h2>
              {customer.phone && <p className="text-sm text-muted-foreground">{customer.phone}</p>}
              {customer.email && <p className="text-sm text-muted-foreground">{customer.email}</p>}
              {customer.notes && (
                <p className="text-xs italic text-muted-foreground mt-2">{customer.notes}</p>
              )}
            </div>
          </div>
          <div className="border-t pt-4 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground">{t("total_spent")}</p>
              <p className="text-lg font-bold">{formatCurrency(totalSpend)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("visits")}</p>
              <p className="text-lg font-bold">{customer.sales.filter((s: any) => s.status === "COMPLETED").length}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Star className="h-3 w-3 text-yellow-500" /> {t("loyalty_points")}
              </p>
              <p className="text-lg font-bold">{customer.loyaltyPoints}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{td("member_since")}</p>
              <p className="text-sm font-medium">{new Date(customer.createdAt).toLocaleDateString()}</p>
            </div>
            <CustomerCreditPanel customerId={customer.id} balance={balance} />
          </div>
        </div>

        {/* Purchase history */}
        <div className="md:col-span-2 rounded-lg border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h2 className="text-sm font-semibold">{td("purchase_history")}</h2>
          </div>
          {customer.sales.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground text-sm">
              {td("no_purchases")}
            </div>
          ) : (
            <div className="divide-y overflow-y-auto max-h-[480px]">
              {customer.sales.map((sale: any) => (
                <details key={sale.id} className="group">
                  <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/40 list-none transition-colors">
                    <div>
                      <p className="text-sm font-medium">{formatter.format(new Date(sale.createdAt))}</p>
                      <p className="text-xs text-muted-foreground capitalize">{sale.paymentMethod}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-xs font-medium ${
                          sale.status === "VOIDED" ? "text-destructive" : "text-green-600"
                        }`}
                      >
                        {statusLabel[sale.status] ?? sale.status}
                      </span>
                      <span className="text-sm font-semibold">{formatCurrency(parseFloat(sale.total.toString()))}</span>
                    </div>
                  </summary>
                  <div className="px-4 pb-3 pt-1 space-y-1">
                    {sale.items.map((item: any, i: number) => (
                      <div key={`${item.id}-${i}`} className="flex justify-between text-xs text-muted-foreground">
                        <span>
                          {item.name} × {item.quantity}
                          {item.notes && <em className="ml-2 italic">({item.notes})</em>}
                        </span>
                        <span>{formatCurrency(parseFloat(item.total.toString()))}</span>
                      </div>
                    ))}
                    {sale.tipAmount > 0 && (
                      <div className="flex justify-between text-xs text-muted-foreground border-t pt-1">
                        <span>{tp("tip")}</span>
                        <span>{formatCurrency(parseFloat(sale.tipAmount.toString()))}</span>
                      </div>
                    )}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
