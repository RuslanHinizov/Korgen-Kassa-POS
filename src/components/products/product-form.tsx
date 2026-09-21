"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { productFormSchema, type ProductFormValues } from "@/lib/validations/product";
import { createProduct, updateProduct } from "@/app/actions/product-actions";
import { cn } from "@/lib/utils";
import { Upload, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { isFractionalUnit, unitLabel } from "@/lib/units";

interface Product {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  scalePlu?: string | null;
  price: { toString(): string };
  cost: { toString(): string } | null;
  wholesalePrice: { toString(): string } | null;
  stock: { toString(): string } | number;
  unit: string;
  category: string | null;
  categoryId?: string | null;
  imageUrl: string | null;
  lowStockThreshold: number;
  active: boolean;
}

interface ProductFormProps {
  product?: Product;
}

export function ProductForm({ product }: ProductFormProps) {
  const t = useTranslations("products");
  const tf = useTranslations("products.form");
  const isEdit = !!product;
  const [uploadLoading, setUploadLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(product?.imageUrl ?? null);

  const {
    register: registerField,
    handleSubmit,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useForm<ProductFormValues, any, any>({
    resolver: zodResolver(productFormSchema) as any,
    defaultValues: product
      ? {
          name: product.name,
          sku: product.sku ?? "",
          barcode: product.barcode ?? "",
          scalePlu: product.scalePlu ?? "",
          price: parseFloat(product.price.toString()),
          cost: product.cost ? parseFloat(product.cost.toString()) : undefined,
          wholesalePrice: product.wholesalePrice ? parseFloat(product.wholesalePrice.toString()) : undefined,
          stock: typeof product.stock === "number" ? product.stock : parseFloat(product.stock.toString()),
          unit: ["kg", "l", "m"].includes(product.unit) ? (product.unit as "kg" | "l" | "m") : "pcs",
          category: product.category ?? "",
          categoryId: product.categoryId ?? "",
          lowStockThreshold: product.lowStockThreshold,
          imageUrl: product.imageUrl ?? "",
          active: product.active,
        }
      : { stock: 0, unit: "pcs", lowStockThreshold: 5, active: true },
  });

  const unit = watch("unit");
  const byWeight = unit === "kg";
  const fractional = isFractionalUnit(unit);
  const unitAbbr = unitLabel(unit);

  const [categories, setCategories] = useState<{ id: string; name: string; parentId: string | null }[]>([]);
  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []))
      .catch(() => {});
  }, []);

  async function onSubmit(values: ProductFormValues) {
    const formData = new FormData();
    Object.entries(values as Record<string, unknown>).forEach(([k, v]) => {
      if (v !== undefined && v !== null) formData.append(k, String(v));
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let res: { error?: any } | undefined;

    if (isEdit) {
      res = await updateProduct(product!.id, formData);
    } else {
      res = await createProduct(formData);
    }

    if (res?.error) {
      const fieldErrors = res.error.fieldErrors || {};
      const formErrors: string[] = res.error.formErrors || [];

      // Set field-level errors (shows red border + message under the field)
      Object.keys(fieldErrors).forEach((key) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setError(key as any, { type: "server", message: fieldErrors[key][0] });
        toast.error(fieldErrors[key][0]);  // also pop a toast for visibility
      });

      // Form-level errors (not tied to a specific field)
      if (Object.keys(fieldErrors).length === 0) {
        toast.error(formErrors[0] ?? tf("err_save"));
      }
      return;
    }

    toast.success(isEdit ? tf("updated") : tf("created"));
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (res.ok) {
        const { url } = await res.json();
        setValue("imageUrl", url);
        setPreviewUrl(url);
      }
    } finally {
      setUploadLoading(false);
    }
  }

  function field(label: string, name: keyof ProductFormValues, props?: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{label}</label>
        <input
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {...registerField(name as any)}
          {...props}
          className={cn(
            "border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            errors[name] && "border-destructive"
          )}
        />
        {errors[name] && (
          <p className="text-xs text-destructive">{String(errors[name]?.message)}</p>
        )}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-4">
      {field(`${t("name")} *`, "name", { placeholder: tf("name_placeholder") })}

      <div className="grid grid-cols-2 gap-4">
        {field(t("sku"), "sku", { placeholder: tf("sku_placeholder") })}
        {field(t("barcode"), "barcode", { placeholder: tf("barcode_placeholder") })}
      </div>

      {/* Unit: piece vs weight */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{tf("unit_label")}</label>
        <select
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {...registerField("unit" as any)}
          className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          <option value="pcs">{tf("unit_pcs")}</option>
          <option value="kg">{tf("unit_kg")}</option>
          <option value="l">{tf("unit_l")}</option>
          <option value="m">{tf("unit_m")}</option>
        </select>
        <p className="text-xs text-muted-foreground">{tf("unit_hint")}</p>
      </div>

      {byWeight && field("PLU весового штрихкода (5 цифр)", "scalePlu", { inputMode: "numeric", maxLength: 5, placeholder: "00001" })}

      <div className="grid grid-cols-2 gap-4">
        {field(`${fractional ? tf("price_per_unit", { unit: unitAbbr }) : t("price")} *`, "price", { type: "number", step: "0.01", min: "0", placeholder: "0.00" })}
        {field(fractional ? tf("cost_per_unit", { unit: unitAbbr }) : t("cost"), "cost", { type: "number", step: "0.01", min: "0", placeholder: "0.00" })}
      </div>

      {field(tf("wholesale_price"), "wholesalePrice", { type: "number", step: "0.01", min: "0", placeholder: "0.00" })}

      <div className="grid grid-cols-2 gap-4">
        {field(fractional ? tf("stock_unit", { unit: unitAbbr }) : t("stock"), "stock", { type: "number", min: "0", step: fractional ? "0.001" : "1" })}
        {field(fractional ? tf("low_stock_alert_unit", { unit: unitAbbr }) : tf("low_stock_alert"), "lowStockThreshold", { type: "number", min: "0", step: fractional ? "0.001" : "1" })}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">{t("category")}</label>
        <select
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {...registerField("categoryId" as any)}
          className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          <option value="">{tf("category_none")}</option>
          {categories.filter((c) => !c.parentId).flatMap((parent) => [
            <option key={parent.id} value={parent.id}>{parent.name}</option>,
            ...categories.filter((c) => c.parentId === parent.id).map((child) => (
              <option key={child.id} value={child.id}>— {child.name}</option>
            )),
          ])}
        </select>
        <p className="text-xs text-muted-foreground">{tf("category_manage_hint")}</p>
      </div>

      {/* Image upload */}
      <div className="space-y-2">
        <label className="text-sm font-medium">{tf("image_label")}</label>
        <div className="flex items-center gap-3">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Product preview"
              className="h-16 w-16 rounded-md border object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-md border bg-muted">
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 space-y-1">
            <label
              htmlFor="image-upload"
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent transition-colors",
                uploadLoading && "pointer-events-none opacity-50"
              )}
            >
              <Upload className="h-4 w-4" />
              {uploadLoading ? tf("uploading") : tf("upload_image")}
              <input
                id="image-upload"
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleImageUpload}
              />
            </label>
            <p className="text-xs text-muted-foreground">{tf("image_hint")}</p>
          </div>
        </div>
        {/* Hidden field for imageUrl */}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <input type="hidden" {...registerField("imageUrl" as any)} />
      </div>

      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <input type="checkbox" id="active" {...registerField("active" as any)} className="h-4 w-4" />
        <label htmlFor="active" className="text-sm font-medium">{tf("active_label")}</label>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center rounded-md px-6 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {isSubmitting ? tf("saving") : isEdit ? tf("update") : tf("create")}
        </button>
      </div>
    </form>
  );
}
