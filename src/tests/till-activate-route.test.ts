import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = { paired: false, issued: [] as { storeId: string; cashboxId: string | null }[] };
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    cashbox: {
      findFirst: async ({ where }: { where: { oneTimeKey?: string } }) =>
        where.oneTimeKey === "12345678" && !state.paired
          ? { id: "cashbox-1", storeId: "store-1", name: "Касса-1" }
          : null,
      updateMany: async ({ where }: { where: { oneTimeKey: string; pairedAt: null; active: true } }) => {
        if (where.oneTimeKey !== "12345678" || state.paired) return { count: 0 };
        state.paired = true;
        return { count: 1 };
      },
    },
  },
}));
vi.mock("@/lib/hub-auth", () => ({
  createHubToken: async (storeId: string, _label: string, cashboxId?: string | null) => {
    state.issued.push({ storeId, cashboxId: cashboxId ?? null });
    return "hub_test-token";
  },
}));
vi.mock("@/lib/till-activation", () => ({
  normalizeCode: (code: string) => /^\d{8}$/.test(code) ? code : null,
  tooManyAttempts: () => false,
}));
vi.mock("@/lib/till-package", () => ({
  buildTillPackageBody: async () => ({ generatedAt: "2026-10-01T00:00:00.000Z", store: { id: "store-1", name: "Нурай" } }),
}));
vi.mock("@/lib/till-package-format", () => ({ serializePackage: async (body: unknown) => JSON.stringify(body) }));

import { POST } from "@/app/api/till-activate/route";

function request(code: string) {
  return new NextRequest("http://localhost/api/till-activate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
}

beforeEach(() => { state.paired = false; state.issued = []; });

describe("POST /api/till-activate", () => {
  it("consumes the cashbox code once and issues a token scoped to that cashbox", async () => {
    const first = await POST(request("12345678"));
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ cashbox: { id: "cashbox-1" }, deviceToken: "hub_test-token" });
    expect(state.issued).toEqual([{ storeId: "store-1", cashboxId: "cashbox-1" }]);

    const second = await POST(request("12345678"));
    expect(second.status).toBe(400);
    expect(state.issued).toHaveLength(1);
  });

  it("does not accept general or malformed activation codes", async () => {
    expect((await POST(request("87654321"))).status).toBe(400);
    expect((await POST(request("bad-code"))).status).toBe(400);
    expect(state.issued).toHaveLength(0);
  });
});
