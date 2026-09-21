import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/employees";

// POST /api/management/employees/:id/status { fired: boolean } — «Уволить» / restore
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const fired = body?.fired === true;

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  if (fired) {
    if (id === session.user.id) return NextResponse.json({ error: "Нельзя уволить самого себя" }, { status: 400 });
    if (user.role === "ADMIN" && (await prisma.user.count({ where: { role: "ADMIN", firedAt: null } })) <= 1) {
      return NextResponse.json({ error: "Нельзя уволить последнего администратора" }, { status: 400 });
    }
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { firedAt: fired ? new Date() : null } }),
    ...(fired ? [prisma.session.deleteMany({ where: { userId: id } })] : []),
  ]);
  return NextResponse.json({ ok: true });
}
