import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const schema = z.object({
  productIds: z.array(z.string().min(1)).min(1),
  categoryId: z.string().min(1).nullable(),
});

// PATCH /api/products/bulk — Действие → Изменить → Категорию
export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const storeId = await getStoreId();
  const category = parsed.data.categoryId
    ? await prisma.category.findFirst({ where: { id: parsed.data.categoryId, storeId }, select: { id: true, name: true } })
    : null;

  const result = await prisma.product.updateMany({
    where: { id: { in: parsed.data.productIds }, storeId },
    data: { categoryId: category?.id ?? null, category: category?.name ?? null },
  });
  return NextResponse.json({ updated: result.count });
}
