import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { serialize } from "@/lib/serialize";
import { ProductForm } from "@/components/products/product-form";
import { DbError } from "@/components/ui/db-error";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit Product" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditProductPage({ params }: Props) {
  noStore();
  const { id } = await params;

  let product;
  try {
    const storeId = await getStoreId();
    const raw = await prisma.product.findFirst({ where: { id, storeId } });
    if (!raw) notFound();
    product = serialize(raw);
  } catch (e: any) {
    if (e?.name === "NotFoundError") notFound();
    return <DbError page="this product" />;
  }

  const t = await getTranslations("products");
  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      <Breadcrumb items={[
        { label: t("title"), href: "/products" },
        { label: product.name, href: `/products/${id}` },
        { label: t("detail.edit") },
      ]} />
      <h1 className="text-2xl font-bold mb-6">{t("edit")}</h1>
      <ProductForm product={product} />
    </div>
  );
}
