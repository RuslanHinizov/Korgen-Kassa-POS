import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/superadmin";

export const dynamic = "force-dynamic";

// POST /api/superadmin/errors/test — throws on purpose so the owner can see that server-side
// error capture (and the phone alert) really work end to end.
export async function POST() {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  throw new Error("Тестовая ошибка сервера (проверка системы уведомлений)");
}
