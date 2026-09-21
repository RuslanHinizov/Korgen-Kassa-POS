import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { counterpartyScope } from "@/lib/counterparty-scope";
import { getStoreId } from "@/lib/store-context";

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const { keepId, mergeId } = body as { keepId: string; mergeId: string };

    if (!keepId || !mergeId) {
      return NextResponse.json({ error: "keepId and mergeId are required" }, { status: 400 });
    }
    if (keepId === mergeId) {
      return NextResponse.json({ error: "keepId and mergeId must be different" }, { status: 400 });
    }

    const storeId = await getStoreId();
    // Fetch both customers to confirm they exist in the current store
    const [keepCustomer, mergeCustomer] = await Promise.all([
      prisma.customer.findFirst({ where: { id: keepId, ...(await counterpartyScope(storeId)) } }),
      prisma.customer.findFirst({ where: { id: mergeId, ...(await counterpartyScope(storeId)) } }),
    ]);

    if (!keepCustomer) return NextResponse.json({ error: "Keep customer not found" }, { status: 404 });
    if (!mergeCustomer) return NextResponse.json({ error: "Merge customer not found" }, { status: 404 });

    // Run merge in a transaction
    await prisma.$transaction([
      // Reassign all sales from mergeId → keepId
      prisma.sale.updateMany({
        where: { customerId: mergeId },
        data: { customerId: keepId },
      }),
      // Reassign all loyalty logs from mergeId → keepId
      prisma.loyaltyLog.updateMany({
        where: { customerId: mergeId },
        data: { customerId: keepId },
      }),
      // Add loyalty points from the duplicate to the keeper
      prisma.customer.update({
        where: { id: keepId },
        data: { loyaltyPoints: { increment: mergeCustomer.loyaltyPoints } },
      }),
      // Delete the duplicate customer
      prisma.customer.delete({ where: { id: mergeId } }),
    ]);

    const updatedCustomer = await prisma.customer.findUnique({ where: { id: keepId } });
    return NextResponse.json({ success: true, customer: updatedCustomer });
  } catch (err: any) {
    console.error("[customers/merge]", err);
    return NextResponse.json({ error: err.message ?? "Failed to merge" }, { status: 500 });
  }
}
