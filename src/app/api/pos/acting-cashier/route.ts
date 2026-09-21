import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { verifyPin } from "@/lib/pin";
import { issueActingCashierToken, verifyActingCashierToken, ACTING_CASHIER_COOKIE } from "@/lib/acting-cashier";
import { hasKioskAccess } from "@/lib/kiosk-device";

// GET /api/pos/acting-cashier — resolve the current "who's working" tag, if any.
export async function GET() {
  if (!(await hasKioskAccess())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jar = await cookies();
  const userId = verifyActingCashierToken(jar.get(ACTING_CASHIER_COOKIE)?.value);
  if (!userId) return NextResponse.json({ cashier: null });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true } });
  return NextResponse.json({ cashier: user ?? null });
}

// POST /api/pos/acting-cashier — { userId, pin } → verify PIN, tag this terminal.
export async function POST(req: NextRequest) {
  if (!(await hasKioskAccess())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const pin = typeof body?.pin === "string" ? body.pin : "";
  if (!userId || !pin) return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true, pin: true } });
  if (!user || !verifyPin(pin, user.pin)) {
    return NextResponse.json({ error: "Неверный PIN" }, { status: 401 });
  }

  const jar = await cookies();
  jar.set(ACTING_CASHIER_COOKIE, issueActingCashierToken(user.id), {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 16 * 60 * 60,
  });
  return NextResponse.json({ cashier: { id: user.id, name: user.name, role: user.role } });
}

// DELETE /api/pos/acting-cashier — "switch user" / clear the tag.
export async function DELETE() {
  const jar = await cookies();
  jar.delete(ACTING_CASHIER_COOKIE);
  return NextResponse.json({ success: true });
}
