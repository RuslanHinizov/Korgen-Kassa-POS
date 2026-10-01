import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const captured: { data?: Record<string, unknown> } = {};
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: async () => ({ user: { id: "admin-1", role: "ADMIN" } }) } } }));
vi.mock("@/lib/store-context", () => ({ getStoreId: async () => "store-1" }));
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: async (work: (tx: unknown) => unknown) => work({
      financeAccount: {
        create: async ({ data }: { data: Record<string, unknown> }) => ({ id: data.type === "CASH" ? "cash-account" : "bank-account" }),
        findFirst: async () => ({ id: "bank-account" }),
      },
      cashbox: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          captured.data = data;
          return { id: "cashbox-1", ...data };
        },
      },
    }),
  },
}));

import { POST } from "@/app/api/management/cashboxes/route";

describe("POST /api/management/cashboxes", () => {
  it("creates the existing eight-letter one-time key together with the cashbox", async () => {
    const req = new NextRequest("http://localhost/api/management/cashboxes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Касса-4" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(captured.data?.oneTimeKey).toMatch(/^[a-z]{8}$/);
    expect((await res.json()).cashbox.oneTimeKey).toBe(captured.data?.oneTimeKey);
  });
});
