import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/superadmin";
import { MAX_SUPPORT_BODY } from "@/lib/support";

export const dynamic = "force-dynamic";

// GET /api/superadmin/support/:id — the conversation (opening it marks the employee's messages as read)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const thread = await prisma.supportThread.findUnique({
    where: { id },
    select: { id: true, status: true, store: { select: { id: true, name: true } }, user: { select: { name: true, phone: true, role: true } } },
  });
  if (!thread) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  const messages = await prisma.supportMessage.findMany({
    where: { threadId: id }, orderBy: { createdAt: "desc" }, take: 300,
    select: { id: true, sender: true, body: true, pageUrl: true, userAgent: true, createdAt: true },
  });
  await prisma.supportThread.update({ where: { id }, data: { adminLastReadAt: new Date() } });
  return NextResponse.json({ thread, messages: messages.reverse() });
}

// POST /api/superadmin/support/:id { body } — reply
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const data = await req.json().catch(() => null);
  const body = typeof data?.body === "string" ? data.body.trim() : "";
  if (!body || body.length > MAX_SUPPORT_BODY) return NextResponse.json({ error: "Некорректное сообщение" }, { status: 400 });
  if (!(await prisma.supportThread.findUnique({ where: { id }, select: { id: true } }))) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  const message = await prisma.supportMessage.create({ data: { threadId: id, sender: "ADMIN", body }, select: { id: true, sender: true, body: true, createdAt: true } });
  await prisma.supportThread.update({ where: { id }, data: { lastMessageAt: message.createdAt, adminLastReadAt: message.createdAt } });
  return NextResponse.json({ message }, { status: 201 });
}

// PATCH /api/superadmin/support/:id { status: "OPEN" | "CLOSED" }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const data = await req.json().catch(() => null);
  if (data?.status !== "OPEN" && data?.status !== "CLOSED") return NextResponse.json({ error: "Некорректный статус" }, { status: 400 });
  await prisma.supportThread.update({ where: { id }, data: { status: data.status } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
