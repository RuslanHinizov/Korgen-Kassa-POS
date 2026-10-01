import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/superadmin";

const CHARS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
const generate = () => Array.from({ length: 10 }, () => CHARS[randomInt(CHARS.length)]).join("");

// POST /api/superadmin/stores/:id/employees/:userId/reset-password
// The market owner forgot the password: set the one the platform owner types (6+ characters), or issue a random one
// when none is given (shown once), end the old sessions, leave a trace.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const admin = await requireSuperAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: storeId, userId } = await params;

  const target = await prisma.user.findFirst({
    where: { id: userId, role: { not: "SUPERADMIN" }, storeAssignments: { some: { storeId } } },
    select: { id: true, name: true, phone: true },
  });
  if (!target) return NextResponse.json({ error: "Сотрудник не найден в этом магазине" }, { status: 404 });

  const asked = (await req.json().catch(() => null))?.password;
  if (asked !== undefined && asked !== null && asked !== "" && (typeof asked !== "string" || asked.length < 6 || asked.length > 100)) {
    return NextResponse.json({ error: "Пароль — не короче 6 символов" }, { status: 400 });
  }
  const password = typeof asked === "string" && asked ? asked : generate();
  const hash = await hashPassword(password);
  await prisma.$transaction([
    prisma.account.updateMany({ where: { userId, providerId: "credential" }, data: { password: hash } }),
    prisma.session.deleteMany({ where: { userId } }),
    prisma.auditLog.create({
      data: { storeId, userId: admin.user.id, action: "SUPERADMIN_PASSWORD_RESET", entityType: "User", entityId: userId, details: { employee: target.name.trim() } },
    }),
  ]);
  return NextResponse.json({ password, name: target.name.trim(), phone: target.phone });
}
