import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveHubActor } from "@/lib/hub-auth";
import { CATALOG_DEFAULT_LIMIT, CATALOG_MAX_LIMIT, fetchCatalogPage } from "@/lib/catalog-query";

/**
 * GET /api/hub/pull — what a local Hub (office computer, see docs/kasa-offline-plan.md §9b) downloads to
 * mirror one store: the product catalogue (same incremental feed as /api/pos/catalog) plus the small,
 * always-sent things a Hub needs to let its own tills work — cashiers (with their password hash, so a
 * cashier can sign in against the Hub's own copy exactly as they do on the cloud) and business settings.
 *
 * Auth: `Authorization: Bearer <hub token>` (src/lib/hub-auth.ts) — never a cashier/office session. A token
 * is scoped to exactly one store; it cannot read or write any other store's data.
 */
export async function GET(req: NextRequest) {
  const actor = await resolveHubActor(req);
  if (!actor) return NextResponse.json({ error: "Invalid or revoked Hub token" }, { status: 401 });
  const { storeId } = actor;

  const sp = req.nextUrl.searchParams;
  const sinceRaw = sp.get("since");
  const afterId = sp.get("afterId") ?? "";
  const rawLimit = Number(sp.get("limit"));
  const take = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, CATALOG_MAX_LIMIT) : CATALOG_DEFAULT_LIMIT;
  const since = sinceRaw ? new Date(sinceRaw) : null;
  const validSince = since && !Number.isNaN(since.getTime()) ? since : null;

  const { products, hasMore } = await fetchCatalogPage(storeId, validSince, afterId, take);

  // Cashiers + warehouse staff assigned to this store, with the password hash Better Auth already stores
  // (Account.password, providerId "credential") — copied as-is so the Hub can verify a sign-in the same way
  // the cloud does, without ever seeing the plaintext password.
  const assignments = await prisma.userStoreAssignment.findMany({
    where: { storeId },
    select: {
      user: {
        select: {
          id: true,
          name: true,
          lastName: true,
          email: true,
          phone: true,
          role: true,
          allowCashierLogin: true,
          firedAt: true,
          accounts: { where: { providerId: "credential" }, select: { password: true }, take: 1 },
        },
      },
    },
  });
  const cashiers = assignments
    .filter((a) => ["CASHIER", "WAREHOUSE", "ADMIN", "MANAGER"].includes(a.user.role))
    .map((a) => ({
      id: a.user.id,
      name: [a.user.name, a.user.lastName].filter(Boolean).join(" "),
      email: a.user.email,
      phone: a.user.phone,
      role: a.user.role,
      allowCashierLogin: a.user.allowCashierLogin,
      firedAt: a.user.firedAt ? a.user.firedAt.toISOString() : null,
      passwordHash: a.user.accounts[0]?.password ?? null,
    }));

  const settings = await prisma.businessSettings.findUnique({ where: { storeId } });

  // Cash registers (see docs/kasa-offline-plan.md §9b.3): a till pairs to one of these by its one-time key,
  // exactly like it pairs to the cloud (src/app/api/pos/cashbox/route.ts) — the Hub just needs its own copy
  // of the row to pair against. accountId/extraAccountId are left out: those point at FinanceAccount rows
  // the Hub doesn't mirror, and cash-balance accounting stays a cloud-side concern for now.
  const cashboxes = await prisma.cashbox.findMany({
    where: { storeId },
    select: {
      id: true,
      no: true,
      name: true,
      active: true,
      oneTimeKey: true,
      receiptHeaderText: true,
      receiptFooterText: true,
      receiptCyrillicCodepage: true,
      receiptPaperWidth: true,
      receiptTabularView: true,
      receiptPrintVat: true,
    },
  });

  return NextResponse.json({
    storeId,
    products,
    hasMore,
    cashiers,
    cashboxes,
    settings,
    serverTime: new Date().toISOString(),
  });
}
