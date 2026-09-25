import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/superadmin";

export const dynamic = "force-dynamic";

// GET /api/superadmin/errors?status=OPEN|RESOLVED|ALL  (default OPEN)   ·   ?summary=1 → { open }
export async function GET(req: NextRequest) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  if (sp.get("summary") === "1") return NextResponse.json({ open: await prisma.errorReport.count({ where: { status: "OPEN" } }) });

  const status = sp.get("status") === "RESOLVED" ? "RESOLVED" : sp.get("status") === "ALL" ? undefined : "OPEN";
  const [errors, open] = await Promise.all([
    prisma.errorReport.findMany({ where: status ? { status } : {}, orderBy: { lastSeenAt: "desc" }, take: 200 }),
    prisma.errorReport.count({ where: { status: "OPEN" } }),
  ]);
  return NextResponse.json({ errors, open });
}

// PATCH /api/superadmin/errors { id, status } — mark fixed / reopen
export async function PATCH(req: NextRequest) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json().catch(() => null);
  if (typeof data?.id !== "string" || (data?.status !== "OPEN" && data?.status !== "RESOLVED")) return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  await prisma.errorReport.update({ where: { id: data.id }, data: { status: data.status } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
