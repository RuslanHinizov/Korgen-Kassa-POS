import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { serialize } from "@/lib/serialize";
import { computeShiftReport, registerCashOfShift } from "@/lib/shift";
import { getStoreId } from "@/lib/store-context";
import { logAudit } from "@/lib/audit";
import { resolvePosActor } from "@/lib/pos-actor";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { trustedTime } from "@/lib/offline-write";
import { resolvePosRequest, isPosRequestError } from "@/lib/pos-request";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  // Viewing a report is allowed from an office admin/manager session as well as
  // from the paired kiosk. POST below remains kiosk-only.
  let actor = await resolvePosActor();
  if (!actor) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (session && ["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
      actor = { userId: session.user.id, role: session.user.role ?? "" };
    }
  }
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const storeId = await getStoreId();
  const report = await computeShiftReport(id);
  if (!report || report.shift.storeId !== storeId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isPrivileged = ["ADMIN", "MANAGER"].includes(actor.role ?? "");
  if (report.shift.userId !== actor.userId && !isPrivileged) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ report: serialize(report) });
}

const closeSchema = z.object({
  action: z.literal("close"),
  countedCash: z.number().min(0),
  notes: z.string().optional(),
  /** Offline till: when it was closed. `offline: true` also makes a repeated upload of the same close a success. */
  closedAt: z.string().datetime().optional(),
  offline: z.boolean().optional(),
});

export async function POST(req: NextRequest, { params }: Ctx) {
  const ctx = await resolvePosRequest(req);
  if (isPosRequestError(ctx)) return ctx.error;
  const { storeId, actor, viaHub } = ctx;

  const { id } = await params;
  const parsed = closeSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const shift = await prisma.shift.findFirst({ where: { id, storeId } });
  if (!shift) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (shift.status === "CLOSED") {
    // an upload that is repeated (lost answer) must not look like a failure
    if (parsed.data.offline) return NextResponse.json({ shift: serialize(shift), duplicate: true }, { status: 200 });
    return NextResponse.json({ error: "Смена уже закрыта" }, { status: 409 });
  }

  const isPrivileged = ["ADMIN", "MANAGER"].includes(actor.role ?? "");
  if (!viaHub && shift.userId !== actor.userId && !isPrivileged && !parsed.data.offline) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const report = await computeShiftReport(id);
  const expected = report?.expectedCash ?? Number(shift.openingFloat);
  const difference = parsed.data.countedCash - expected;
  const timeAdjusted = !!parsed.data.closedAt && !trustedTime(parsed.data.closedAt);

  // The register's cash account holds only the open shift's cash: take this shift's cash back out when it closes.
  const registerCash = await registerCashOfShift(id);
  const [updated] = await prisma.$transaction([
    prisma.shift.update({
      where: { id },
      data: {
        status: "CLOSED",
        closedAt: trustedTime(parsed.data.closedAt) ?? new Date(),
        countedCash: parsed.data.countedCash,
        expectedCash: expected,
        difference,
        notes: parsed.data.notes,
      },
    }),
    ...[...registerCash].filter(([, amount]) => amount !== 0).map(([accountId, amount]) =>
      prisma.financeAccount.update({ where: { id: accountId }, data: { balance: { decrement: amount } } })
    ),
  ]);

  await logAudit({
    userId: actor.userId,
    action: "SHIFT_CLOSE",
    entityType: "Shift",
    entityId: id,
    details: { expected, counted: parsed.data.countedCash, difference },
  });

  const finalReport = await computeShiftReport(id);
  return NextResponse.json({ shift: serialize(updated), report: serialize(finalReport), timeAdjusted });
}
