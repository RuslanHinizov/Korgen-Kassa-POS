import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { appLink, sendAlert } from "@/lib/notify";

export type ErrorSourceKind = "CLIENT" | "SERVER" | "API";

export interface ErrorInput {
  source: ErrorSourceKind;
  message: string;
  stack?: string | null;
  path?: string | null;
  method?: string | null;
  userAgent?: string | null;
  actor?: { userId: string; storeId: string | null; role: string | null } | null;
}

/** Connectivity noise (a till that is offline) and browser-extension errors are not bugs of ours. */
const IGNORE = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /Non-Error promise rejection/i,
  /(chrome|moz|safari)-extension:\/\//i,
  /Failed to fetch/i,
  /Load failed/i,
  /NetworkError/i,
  /Network request failed/i,
  /The user aborted a request/i,
  /AbortError/i,
];

export function shouldIgnore(message: string): boolean {
  return IGNORE.some((re) => re.test(message));
}

/** Same bug ⇒ same text: drop ids, numbers and long hex so counters group properly. */
export function normalizeMessage(message: string): string {
  return message
    .replace(/[a-z0-9]{24,26}/gi, ":id")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":uuid")
    .replace(/\d{3,}/g, "N")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export function normalizePath(path: string | null | undefined): string {
  return (path ?? "").split("?")[0].replace(/\/store\/[^/]+/, "/store/:store").replace(/\/[a-z0-9]{24,26}(?=\/|$)/gi, "/:id").slice(0, 200);
}

function firstFrame(stack: string | null | undefined): string {
  const line = (stack ?? "").split("\n").map((l) => l.trim()).find((l) => l.startsWith("at ") || l.includes("@"));
  return (line ?? "").replace(/:\d+:\d+/g, "").replace(/\?[^)\s]*/g, "").slice(0, 160);
}

export function fingerprintOf(input: Pick<ErrorInput, "source" | "message" | "stack" | "path">): string {
  const key = [input.source, normalizeMessage(input.message), firstFrame(input.stack), input.source === "CLIENT" ? "" : normalizePath(input.path)].join("|");
  return createHash("sha1").update(key).digest("hex");
}

/** Store the error (or bump its counter) and, for a NEW or REOPENED problem, alert the owner. */
export async function recordError(input: ErrorInput): Promise<void> {
  const message = input.message.trim().slice(0, 500);
  if (!message || shouldIgnore(message)) return;

  const fingerprint = fingerprintOf({ ...input, message });
  const now = new Date();

  let storeName: string | null = null, userName: string | null = null, userPhone: string | null = null;
  const storeId = input.actor?.storeId ?? null;
  if (storeId) storeName = (await prisma.store.findUnique({ where: { id: storeId }, select: { name: true } }).catch(() => null))?.name ?? null;
  if (input.actor?.userId) {
    const u = await prisma.user.findUnique({ where: { id: input.actor.userId }, select: { name: true, phone: true } }).catch(() => null);
    userName = u?.name.trim() ?? null; userPhone = u?.phone ?? null;
  }
  const last = {
    lastStoreId: storeId, lastStoreName: storeName, lastUserName: userName, lastUserRole: input.actor?.role ?? null,
    lastUserPhone: userPhone, lastUserAgent: input.userAgent?.slice(0, 250) ?? null,
  };

  const existing = await prisma.errorReport.findUnique({ where: { fingerprint }, select: { id: true, status: true, count: true, storeIds: true } });
  let alertReason: string | null = null;

  if (!existing) {
    await prisma.errorReport.create({
      data: {
        fingerprint, source: input.source, message, stack: input.stack?.slice(0, 4000) ?? null,
        path: normalizePath(input.path) || null, method: input.method ?? null,
        firstSeenAt: now, lastSeenAt: now, storeIds: storeId ? [storeId] : [], ...last,
      },
    }).catch(() => null); // lost a race with an identical error: fine
    alertReason = "Новая ошибка";
  } else {
    const storeIds = storeId && !existing.storeIds.includes(storeId) ? [...existing.storeIds, storeId].slice(0, 30) : existing.storeIds;
    await prisma.errorReport.update({
      where: { id: existing.id },
      data: { count: { increment: 1 }, lastSeenAt: now, status: "OPEN", storeIds, ...last },
    });
    if (existing.status === "RESOLVED") alertReason = "Ошибка вернулась";
  }

  if (alertReason) {
    // deliberately short: the details are in the panel, the phone only says THAT an error was found.
    // In the background: a slow Telegram must never slow down the request.
    void sendAlert(`🔴 Найдена ошибка\n${appLink("/superadmin/errors")}`);
  }
}
