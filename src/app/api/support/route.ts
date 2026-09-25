import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { cleanPageUrl, getSupportActor, MAX_SUPPORT_BODY } from "@/lib/support";

export const dynamic = "force-dynamic";

// GET /api/support            → { messages, unread }  (my conversation with the platform owner)
// GET /api/support?summary=1  → { unread }            (cheap poll for the badge)
// GET /api/support?markRead=1 → also marks the owner's replies as read
export async function GET(req: NextRequest) {
  const actor = await getSupportActor().catch(() => null);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const thread = await prisma.supportThread.findUnique({ where: { storeId_userId: { storeId: actor.storeId, userId: actor.userId } } });
  if (!thread) return NextResponse.json({ messages: [], unread: 0 });

  const sp = req.nextUrl.searchParams;
  const unreadWhere = { threadId: thread.id, sender: "ADMIN" as const, ...(thread.userLastReadAt ? { createdAt: { gt: thread.userLastReadAt } } : {}) };
  if (sp.get("summary") === "1") return NextResponse.json({ unread: await prisma.supportMessage.count({ where: unreadWhere }) });

  const messages = await prisma.supportMessage.findMany({
    where: { threadId: thread.id }, orderBy: { createdAt: "desc" }, take: 200,
    select: { id: true, sender: true, body: true, createdAt: true },
  });
  const markRead = sp.get("markRead") === "1";
  const unread = markRead ? 0 : await prisma.supportMessage.count({ where: unreadWhere });
  if (markRead) await prisma.supportThread.update({ where: { id: thread.id }, data: { userLastReadAt: new Date() } });
  return NextResponse.json({ messages: messages.reverse(), unread });
}

// POST /api/support { body, pageUrl } — write to the platform owner
export async function POST(req: NextRequest) {
  const actor = await getSupportActor().catch(() => null);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await req.json().catch(() => null);
  const body = typeof data?.body === "string" ? data.body.trim() : "";
  if (!body) return NextResponse.json({ error: "Введите сообщение" }, { status: 400 });
  if (body.length > MAX_SUPPORT_BODY) return NextResponse.json({ error: `Не более ${MAX_SUPPORT_BODY} символов` }, { status: 400 });

  const thread = await prisma.supportThread.upsert({
    where: { storeId_userId: { storeId: actor.storeId, userId: actor.userId } },
    create: { storeId: actor.storeId, userId: actor.userId },
    update: {},
  });
  // simple brake against floods: 15 messages per 10 minutes
  const recent = await prisma.supportMessage.count({ where: { threadId: thread.id, sender: "USER", createdAt: { gt: new Date(Date.now() - 10 * 60_000) } } });
  if (recent >= 15) return NextResponse.json({ error: "Слишком много сообщений. Подождите несколько минут." }, { status: 429 });

  const userAgent = ((await headers()).get("user-agent") ?? "").slice(0, 250) || null;
  const message = await prisma.supportMessage.create({
    data: { threadId: thread.id, sender: "USER", body, pageUrl: cleanPageUrl(data?.pageUrl), userAgent },
    select: { id: true, sender: true, body: true, createdAt: true },
  });
  // a new message from the employee re-opens a closed conversation and counts as read on their side
  await prisma.supportThread.update({ where: { id: thread.id }, data: { lastMessageAt: message.createdAt, status: "OPEN", userLastReadAt: message.createdAt } });
  return NextResponse.json({ message }, { status: 201 });
}
