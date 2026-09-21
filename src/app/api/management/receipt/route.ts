import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { logAudit } from "@/lib/audit";

async function requireStaff() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) return null;
  return session;
}

// GET /api/management/receipt — «Управление чеком»
export async function GET() {
  if (!(await requireStaff())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const storeId = await getStoreId();
  const s = await prisma.businessSettings.findUnique({ where: { storeId }, select: { name: true, receiptHeader: true, receiptFooter: true, receiptPrintVat: true } });
  return NextResponse.json({
    receiptHeader: s?.receiptHeader || s?.name || "",
    receiptFooter: s?.receiptFooter ?? "",
    receiptPrintVat: s?.receiptPrintVat ?? true,
  });
}

const schema = z.object({
  receiptHeader: z.string().max(240),
  receiptFooter: z.string().max(2000),
  receiptPrintVat: z.boolean(),
});

// PATCH /api/management/receipt
export async function PATCH(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Верхняя часть — до 240 символов, нижняя — до 2000" }, { status: 400 });

  const storeId = await getStoreId();
  const settings = await prisma.businessSettings.findUnique({ where: { storeId }, select: { id: true } });
  if (!settings) return NextResponse.json({ error: "Настройки магазина не найдены" }, { status: 404 });
  await prisma.businessSettings.update({ where: { storeId }, data: parsed.data });
  await logAudit({ userId: session.user.id, action: "SETTINGS_UPDATE", entityType: "BusinessSettings", details: { section: "receipt" } });
  return NextResponse.json({ ok: true });
}
