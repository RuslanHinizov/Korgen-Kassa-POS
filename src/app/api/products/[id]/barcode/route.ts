import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { generateEan13 } from "@/lib/barcode";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const storeId = await getStoreId();
  const product = await prisma.product.findFirst({ where: { id, storeId }, select: { id: true, barcode: true } });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  if (product.barcode) return NextResponse.json({ barcode: product.barcode, generated: false });
  for (let attempt = 0; attempt < 20; attempt++) {
    const barcode = generateEan13();
    try {
      await prisma.product.update({ where: { id }, data: { barcode } });
      return NextResponse.json({ barcode, generated: true });
    } catch (error: any) {
      if (error?.code !== "P2002") throw error;
    }
  }
  return NextResponse.json({ error: "Could not allocate a unique barcode" }, { status: 503 });
}
