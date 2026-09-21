import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { serialize } from "@/lib/serialize";

// GET /api/customers/duplicates
// Returns groups of customers that share the same phone number (non-null)
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const storeId = await getStoreId();
    // Find phone numbers that appear more than once
    const phoneCounts = await prisma.customer.groupBy({
      by: ["phone"],
      where: { storeId, phone: { not: null } },
      _count: { phone: true },
      having: { phone: { _count: { gt: 1 } } },
    });

    if (phoneCounts.length === 0) {
      return NextResponse.json({ groups: [] });
    }

    const duplicatePhones = phoneCounts.map((g) => g.phone as string);

    const customers = await prisma.customer.findMany({
      where: { storeId, phone: { in: duplicatePhones } },
      include: {
        _count: { select: { sales: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    // Group by phone
    const grouped: Record<string, typeof customers> = {};
    for (const c of customers) {
      const phone = c.phone!;
      if (!grouped[phone]) grouped[phone] = [];
      grouped[phone].push(c);
    }

    const groups = Object.entries(grouped).map(([phone, members]) => ({
      phone,
      customers: serialize(
        members.map((m) => ({ ...m, salesCount: m._count.sales }))
      ),
    }));

    return NextResponse.json({ groups });
  } catch (err: any) {
    console.error("[customers/duplicates]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
