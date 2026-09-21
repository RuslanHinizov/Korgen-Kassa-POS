import type { Metadata } from "next";
import { ProductForm } from "@/components/products/product-form";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = { title: "New Product" };

export default async function NewProductPage() {
  const t = await getTranslations("products");
  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      <Breadcrumb items={[
        { label: t("title"), href: "/products" },
        { label: t("add") },
      ]} />
      <h1 className="text-2xl font-bold mb-6">{t("add")}</h1>
      <ProductForm />
    </div>
  );
}
