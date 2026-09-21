"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { productFormSchema } from "@/lib/validations/product";
import { getStoreId } from "@/lib/store-context";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/** Server actions are directly callable endpoints — only catalogue staff may change products. */
async function assertCatalogStaff() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) throw new Error("Forbidden");
}

/** Check if a P2002 error relates to a given field name */
function isConstraintOn(e: any, field: string): boolean {
  // Prisma 7 with adapter uses meta.constraint (the raw PG constraint name)
  // Older versions use meta.target (array of field names)
  const constraint: string = e.meta?.constraint ?? "";
  const target: unknown = e.meta?.target;
  const fieldLower = field.toLowerCase();

  if (constraint && constraint.toLowerCase().includes(fieldLower)) return true;
  if (Array.isArray(target)) return target.some((t: string) => t.toLowerCase().includes(fieldLower));
  if (typeof target === "string") return target.toLowerCase().includes(fieldLower);
  return false;
}

/**
 * Resolve the category fields: when a categoryId is chosen, `category` (the
 * denormalised name the POS grid reads) follows it; otherwise fall back to any
 * typed free-text name.
 */
async function resolveCategory(storeId: string, categoryId?: string, typed?: string): Promise<{ categoryId: string | null; category: string | null }> {
  if (categoryId) {
    const cat = await prisma.category.findFirst({ where: { id: categoryId, storeId }, select: { name: true } });
    if (cat) return { categoryId, category: cat.name };
  }
  return { categoryId: null, category: typed || null };
}

export async function createProduct(formData: FormData) {
  await assertCatalogStaff();
  const raw = Object.fromEntries(formData.entries());
  const parsed = productFormSchema.safeParse(raw);

  if (!parsed.success) {
    return { error: parsed.error.flatten() };
  }

  const storeId = await getStoreId();
  const { categoryId: _cid, category: _cname, ...rest } = parsed.data;
  const data = {
    ...rest,
    storeId,
    sku: parsed.data.sku || null,
    barcode: parsed.data.barcode || null,
    scalePlu: parsed.data.scalePlu || null,
    imageUrl: parsed.data.imageUrl || null,
    ...(await resolveCategory(storeId, _cid, _cname)),
  };

  try {
    await prisma.product.create({ data });
  } catch (e: any) {
    console.error("createProduct error:", e.code, JSON.stringify(e.meta));
    if (e.code === "P2002") {
      if (isConstraintOn(e, "sku")) {
        return { error: { formErrors: [], fieldErrors: { sku: ["A product with this SKU already exists"] } } };
      }
      if (isConstraintOn(e, "barcode")) {
        return { error: { formErrors: [], fieldErrors: { barcode: ["A product with this Barcode already exists"] } } };
      }
      return { error: { formErrors: ["A duplicate value was found. Please check SKU or barcode."], fieldErrors: {} } };
    }
    return { error: { formErrors: ["An unexpected error occurred. Please try again."], fieldErrors: {} } };
  }

  revalidatePath("/products");
  redirect(`/store/${await getStoreId()}/products`);
}

export async function updateProduct(id: string, formData: FormData) {
  await assertCatalogStaff();
  const raw = Object.fromEntries(formData.entries());
  const parsed = productFormSchema.safeParse(raw);

  if (!parsed.success) {
    return { error: parsed.error.flatten() };
  }

  const storeId = await getStoreId();
  const existing = await prisma.product.findFirst({ where: { id, storeId, deletedAt: null } });
  if (!existing) {
    return { error: { formErrors: ["Product not found"], fieldErrors: {} } };
  }

  const { categoryId: _cid, category: _cname, ...rest } = parsed.data;
  const data = {
    ...rest,
    sku: parsed.data.sku || null,
    barcode: parsed.data.barcode || null,
    scalePlu: parsed.data.scalePlu || null,
    imageUrl: parsed.data.imageUrl || null,
    ...(await resolveCategory(storeId, _cid, _cname)),
  };

  try {
    await prisma.product.update({ where: { id }, data });
  } catch (e: any) {
    console.error("updateProduct error:", e.code, JSON.stringify(e.meta));
    if (e.code === "P2002") {
      if (isConstraintOn(e, "sku")) {
        return { error: { formErrors: [], fieldErrors: { sku: ["A product with this SKU already exists"] } } };
      }
      if (isConstraintOn(e, "barcode")) {
        return { error: { formErrors: [], fieldErrors: { barcode: ["A product with this Barcode already exists"] } } };
      }
      return { error: { formErrors: ["A duplicate value was found. Please check SKU or barcode."], fieldErrors: {} } };
    }
    return { error: { formErrors: ["An unexpected error occurred. Please try again."], fieldErrors: {} } };
  }

  revalidatePath("/products");
  redirect(`/store/${await getStoreId()}/products`);
}

export async function deleteProduct(id: string) {
  await assertCatalogStaff();
  const storeId = await getStoreId();
  const existing = await prisma.product.findFirst({ where: { id, storeId, deletedAt: null } });
  if (!existing) return;
  await prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/products");
}
