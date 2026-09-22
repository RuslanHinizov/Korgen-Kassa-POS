import type { Metadata } from "next";
import { StoreLink as Link } from "@/components/store/store-link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { serialize } from "@/lib/serialize";
import { formatCurrency } from "@/lib/utils";
import { Edit, Package, TrendingUp, TrendingDown } from "lucide-react";
import { StockAdjustButton } from "@/components/products/stock-adjust-button";
import { BarcodeLabelButton } from "@/components/products/barcode-label-button";
import { DbError } from "@/components/ui/db-error";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { getTranslations, getLocale } from "next-intl/server";
import { unitLabel } from "@/lib/units";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const storeId = await getStoreId();
  const product = await prisma.product.findFirst({ where: { id, storeId }, select: { name: true } }).catch(() => null);
  return { title: product ? `${product.name} — Inventory` : "Product" };
}

export default async function ProductDetailPage({ params }: Props) {
  noStore();
  const { id } = await params;

  let product;
  let adjustments;
  try {
    const storeId = await getStoreId();
    const rawProduct = await prisma.product.findFirst({
      where: { id, storeId },
      include: { supplier: { select: { id: true, name: true } } },
    });
    if (!rawProduct) notFound();
    product = serialize(rawProduct);

    const rawAdj = await prisma.stockAdjustment.findMany({
      where: { productId: id },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    adjustments = serialize(rawAdj);
  } catch (e: any) {
    if (e?.name === "NotFoundError") notFound();
    return <DbError page="product" />;
  }

  const t = await getTranslations("products.detail");
  const ts = await getTranslations("products.stockAdj");
  const tp = await getTranslations("products");
  const locale = await getLocale();

  const reasonLabel: Record<string, string> = {
    RECEIVED: ts("reason_received"),
    DAMAGED: ts("reason_damaged"),
    THEFT: ts("reason_theft"),
    CORRECTION: ts("reason_correction"),
    OPENING_COUNT: ts("reason_opening_count"),
  };

  const formatter = new Intl.DateTimeFormat(locale, {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
  const stock = parseFloat(product.stock.toString());
  const isLowStock = stock <= product.lowStockThreshold;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb items={[
        { label: tp("title"), href: "/products" },
        { label: product.name },
      ]} />

      {/* Actions */}
      <div className="flex items-center gap-2">
        <StockAdjustButton
          productId={product.id}
          productName={product.name}
          currentStock={stock}
          unit={["kg", "l", "m"].includes(product.unit) ? (product.unit as "kg" | "l" | "m") : "pcs"}
        />
        <BarcodeLabelButton productId={product.id} productName={product.name} initialBarcode={product.barcode} price={parseFloat(String(product.price))} unit={product.unit} />
        <Link
          href={`/products/${id}/edit`}
          className="flex items-center gap-2 border border-border bg-background text-foreground px-3 py-1.5 rounded-md text-sm font-medium hover:bg-muted transition-colors"
        >
          <Edit className="h-3.5 w-3.5" /> {t("edit")}
        </Link>
      </div>

      {/* Product summary */}
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="flex items-start gap-4">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={product.name}
              className="h-20 w-20 rounded-lg object-cover border shrink-0"
            />
          ) : (
            <div className="h-20 w-20 rounded-lg border bg-muted flex items-center justify-center shrink-0">
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold truncate">{product.name}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
              {product.sku && <span>{tp("sku")}: <span className="font-mono">{product.sku}</span></span>}
              {product.barcode && <span>{tp("barcode")}: <span className="font-mono">{product.barcode}</span></span>}
              {product.category && <span>{tp("category")}: {product.category}</span>}
              {product.supplier && <span>{tp("supplier")}: {product.supplier.name}</span>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase font-medium">{t("current_stock")}</p>
            <p className={`text-2xl font-bold ${isLowStock ? "text-amber-600 dark:text-amber-400" : ""}`}>
              {stock} {unitLabel(product.unit)}
              {isLowStock && (
                <span className="ml-2 text-xs font-normal bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded">{t("low")}</span>
              )}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase font-medium">{t("sale_price")}</p>
            <p className="text-2xl font-bold">{formatCurrency(parseFloat(String(product.price)))}</p>
          </div>
          {product.cost && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase font-medium">{tp("cost")}</p>
              <p className="text-2xl font-bold">{formatCurrency(parseFloat(String(product.cost)))}</p>
            </div>
          )}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase font-medium">{t("low_stock_at")}</p>
            <p className="text-2xl font-bold">{product.lowStockThreshold}</p>
          </div>
        </div>
      </div>

      {/* Inventory Log */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h2 className="text-sm font-semibold">{t("stock_history")}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t("log_subtitle")}</p>
        </div>

        {adjustments.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
            <Package className="h-10 w-10 opacity-30" />
            <p className="text-sm">{t("no_adjustments")}</p>
            <p className="text-xs">{t("no_adjustments_hint")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr className="text-xs text-muted-foreground uppercase font-medium">
                <th className="px-4 py-3 text-left">{t("date")}</th>
                <th className="px-4 py-3 text-left">{t("reason")}</th>
                <th className="px-4 py-3 text-right">{t("change")}</th>
                <th className="px-4 py-3 text-left">{t("note")}</th>
                <th className="px-4 py-3 text-left">{t("by")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {adjustments.map((adj: any) => (
                <tr key={adj.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {formatter.format(new Date(adj.createdAt))}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium">{reasonLabel[adj.reason] ?? adj.reason}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-flex items-center gap-1 text-sm font-semibold ${
                      adj.delta > 0 ? "text-green-600 dark:text-green-400" : "text-destructive"
                    }`}>
                      {adj.delta > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                      {adj.delta > 0 ? `+${adj.delta}` : adj.delta}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">
                    {adj.note ?? <span className="opacity-40">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {adj.user?.name ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
