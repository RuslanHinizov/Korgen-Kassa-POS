import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1).max(200),
  barcode: z.string().max(100).optional(),
  unit: z.enum(["pcs", "kg", "l", "m"]).optional(),
});

// POST /api/products/quick-create — "+ Создать товар" on a Приёмка/Возврат
// line-item panel: a bare-minimum product (price/cost 0, unit pcs) the user
// fills in properly later from Товары.
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const storeId = await getStoreId();
  if (parsed.data.barcode) {
    const existing = await prisma.product.findFirst({ where: { barcode: parsed.data.barcode, storeId }, select: { id: true } });
    if (existing) return NextResponse.json({ error: "Товар с таким штрихкодом уже существует" }, { status: 409 });
  }

  const product = await prisma.product.create({
    data: { storeId, name: parsed.data.name, barcode: parsed.data.barcode || null, price: 0, cost: 0, stock: 0, unit: parsed.data.unit ?? "pcs" },
  });
  return NextResponse.json({ product }, { status: 201 });
}
