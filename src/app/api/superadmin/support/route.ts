import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/superadmin";

export const dynamic = "force-dynamic";

// GET /api/superadmin/support — every conversation, newest first, with unread counts
export async function GET() {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const threads = await prisma.supportThread.findMany({
    orderBy: { lastMessageAt: "desc" }, take: 300,
    select: {
      id: true, status: true, lastMessageAt: true,
      store: { select: { id: true, name: true } },
      user: { select: { name: true, phone: true, role: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, sender: true } },
    },
  });
  const unread = await prisma.$queryRaw<{ id: string; n: bigint }[]>`
    select t.id, count(m.id) as n from "SupportThread" t
    join "SupportMessage" m on m."threadId" = t.id and m.sender = 'USER' and (t."adminLastReadAt" is null or m."createdAt" > t."adminLastReadAt")
    group by t.id`;
  const unreadBy = new Map(unread.map((r) => [r.id, Number(r.n)]));

  const rows = threads.map((t) => ({
    id: t.id, status: t.status, lastMessageAt: t.lastMessageAt,
    storeId: t.store.id, storeName: t.store.name,
    userName: t.user.name.trim(), userPhone: t.user.phone, userRole: t.user.role,
    lastBody: t.messages[0]?.body ?? "", lastSender: t.messages[0]?.sender ?? "USER",
    unread: unreadBy.get(t.id) ?? 0,
  }));
  return NextResponse.json({ threads: rows, totalUnread: rows.reduce((s, r) => s + r.unread, 0) });
}
