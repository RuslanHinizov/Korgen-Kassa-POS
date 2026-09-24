import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { hasKioskAccess } from "@/lib/kiosk-device";
import { generateEan13 } from "@/lib/barcode";

// POST /api/pos/products/:id/barcode — give a barcode-less product an internal (290…) barcode from the kassa,
// so a cashier can print its label without going to the admin. A product that already has one just returns it.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const office = ["ADMIN", "MANAGER"].includes(session.user.role ?? "");
  if (!office && !(await hasKioskAccess())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const storeId = await getStoreId();
  if (!office) {
    const settings = await prisma.businessSettings.findUnique({ where: { storeId }, select: { posCreateProduct: true } });
    if (settings && !settings.posCreateProduct) return NextResponse.json({ error: "Создание штрихкодов на кассе отключено администратором" }, { status: 403 });
  }

  const product = await prisma.product.findFirst({ where: { id, storeId, deletedAt: null }, select: { id: true, barcode: true } });
  if (!product) return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
  if (product.barcode) return NextResponse.json({ barcode: product.barcode, generated: false });

  for (let attempt = 0; attempt < 20; attempt++) {
    const barcode = generateEan13();
    try {
      await prisma.product.update({ where: { id }, data: { barcode } });
      return NextResponse.json({ barcode, generated: true });
    } catch (e) {
      if ((e as { code?: string })?.code !== "P2002") throw e;
    }
  }
  return NextResponse.json({ error: "Не удалось создать уникальный штрихкод" }, { status: 503 });
}
