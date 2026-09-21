import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const schema = z.object({
  categoryId: z.string().nullable(), // null = remove from category
  productIds: z.array(z.string()).min(1).max(5000),
});

// POST /api/categories/assign — bulk move products into (or out of) a category
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { categoryId, productIds } = parsed.data;
  const storeId = await getStoreId();
  let name: string | null = null;
  if (categoryId) {
    const cat = await prisma.category.findFirst({ where: { id: categoryId, storeId }, select: { name: true } });
    if (!cat) return NextResponse.json({ error: "Категория не найдена" }, { status: 404 });
    name = cat.name;
  }

  const res = await prisma.product.updateMany({
    where: { id: { in: productIds }, storeId },
    data: { categoryId: categoryId, category: name },
  });
  return NextResponse.json({ updated: res.count });
}
