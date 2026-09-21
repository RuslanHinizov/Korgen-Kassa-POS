import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { serialize } from "@/lib/serialize";
import { getOpenShift, computeShiftReport } from "@/lib/shift";
import { getStoreId } from "@/lib/store-context";
import { logAudit } from "@/lib/audit";
import { resolvePosActor } from "@/lib/pos-actor";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { xlsxResponse } from "@/lib/xlsx-response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const scope = req.nextUrl.searchParams.get("scope") ?? "current";
  // Cashiers query through their paired kiosk.  Office administrators also need
  // to read the all-shifts report, but must not gain POS write access from it.
  let actor = await resolvePosActor();
  if (!actor && scope === "all") {
    const session = await auth.api.getSession({ headers: await headers() });
    if (session && ["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
      actor = { userId: session.user.id, role: session.user.role ?? "" };
    }
  }
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (scope === "all") {
    if (!["ADMIN", "MANAGER"].includes(actor.role ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const sp = req.nextUrl.searchParams;
    const from = sp.get("from");
    const to = sp.get("to");
    const userId = sp.get("userId") || "";

    const storeId = await getStoreId();
    const where: Prisma.ShiftWhereInput = {
      storeId,
      ...(from || to ? { openedAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
      ...(userId ? { userId } : {}),
    };

    const shifts = await prisma.shift.findMany({
      where,
      orderBy: { openedAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
    });

    const reports = await Promise.all(shifts.map((s) => computeShiftReport(s.id)));
    const rows = shifts.map((s, i) => {
      const r = reports[i];
      return {
        id: s.id,
        userName: s.user.name,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        status: s.status,
        openingFloat: Number(s.openingFloat),
        cashIn: (r?.cashSales ?? 0) + (r?.cashIn ?? 0),
        cashOut: r?.cashOut ?? 0,
        countedCash: s.countedCash != null ? Number(s.countedCash) : null,
        difference: s.difference != null ? Number(s.difference) : null,
        profit: r?.profit ?? 0,
      };
    });

    if (sp.get("export") === "xlsx") {
      const header = ["Кассир", "Время открытия", "Время закрытия", "Н. Остаток", "Приход", "Расход", "К. Остаток", "Разница", "Прибыль"];
      return xlsxResponse({
        filename: "otchety-po-smenam",
        sheetName: "Смены",
        rows: [header, ...rows.map((r) => [
          r.userName,
          new Date(r.openedAt),
          r.closedAt ? new Date(r.closedAt) : "Не закрыта",
          r.openingFloat, r.cashIn, r.cashOut,
          r.countedCash ?? "-", r.difference ?? "-", r.profit,
        ])],
      });
    }

    return NextResponse.json({ shifts: serialize(rows) });
  }

  const shift = await getOpenShift(actor.userId, await getStoreId());
  return NextResponse.json({ shift: shift ? serialize(shift) : null });
}

const openSchema = z.object({ openingFloat: z.number().min(0).default(0) });

export async function POST(req: NextRequest) {
  const actor = await resolvePosActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = openSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const storeId = await getStoreId();
  const existing = await getOpenShift(actor.userId, storeId);
  if (existing) {
    return NextResponse.json({ error: "A shift is already open", shift: serialize(existing) }, { status: 409 });
  }

  const shift = await prisma.shift.create({
    data: { storeId, userId: actor.userId, openingFloat: parsed.data.openingFloat, status: "OPEN" },
  });

  await logAudit({
    userId: actor.userId,
    action: "SHIFT_OPEN",
    entityType: "Shift",
    entityId: shift.id,
    details: { openingFloat: parsed.data.openingFloat },
  });

  return NextResponse.json({ shift: serialize(shift) }, { status: 201 });
}
