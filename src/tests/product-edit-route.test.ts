/** «ИЗМЕНИТЬ ТОВАР» on the server: what each register permission allows, and that office roles are not limited by them. */

import { describe, it, expect, vi, beforeEach } from "vitest";

const state = {
  role: "CASHIER",
  kiosk: true,
  settings: { posEditProductAtPos: true, posChangePriceAtPos: true, posBanPriceDecrease: false } as Record<string, boolean> | null,
  product: { id: "p1", name: "нан", price: 130 } as { id: string; name: string; price: number } | null,
  updates: [] as unknown[],
};

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: async () => ({ user: { id: "u1", role: state.role }, session: { id: "s" } }) } } }));
vi.mock("@/lib/kiosk-device", () => ({ hasKioskAccess: async () => state.kiosk }));
vi.mock("@/lib/store-context", () => ({ getStoreId: async () => "store1" }));
vi.mock("@/lib/audit", () => ({ logAudit: async () => undefined }));
vi.mock("@/lib/db", () => ({
  prisma: {
    product: {
      findFirst: async () => state.product,
      update: async (args: { data: { name?: string; price?: number } }) => { state.updates.push(args.data); return { id: "p1", name: args.data.name ?? state.product!.name, price: args.data.price ?? state.product!.price }; },
    },
    businessSettings: { findUnique: async () => state.settings },
  },
}));

import { POST } from "@/app/api/pos/products/[id]/edit/route";

const call = (body: unknown) => POST(new Request("http://x/api", { method: "POST", body: JSON.stringify(body) }) as never, { params: Promise.resolve({ id: "p1" }) });

beforeEach(() => {
  state.role = "CASHIER";
  state.kiosk = true;
  state.settings = { posEditProductAtPos: true, posChangePriceAtPos: true, posBanPriceDecrease: false };
  state.product = { id: "p1", name: "нан", price: 130 };
  state.updates = [];
});

describe("POST /api/pos/products/:id/edit", () => {
  it("changes the name and price when both are allowed", async () => {
    const r = await call({ name: "нан большой", price: 150 });
    expect(r.status).toBe(200);
    expect(state.updates).toEqual([{ name: "нан большой", price: 150 }]);
  });

  it("refuses a name change without «Изменение товара на кассе», and a price change without «Изменение цены»", async () => {
    state.settings = { posEditProductAtPos: false, posChangePriceAtPos: true, posBanPriceDecrease: false };
    expect((await call({ name: "x" })).status).toBe(403);
    state.settings = { posEditProductAtPos: true, posChangePriceAtPos: false, posBanPriceDecrease: false };
    expect((await call({ price: 200 })).status).toBe(403);
    expect(state.updates).toHaveLength(0);
  });

  it("with «Запретить понижать цену» refuses a lower price but allows a higher one", async () => {
    state.settings = { posEditProductAtPos: true, posChangePriceAtPos: true, posBanPriceDecrease: true };
    expect((await call({ price: 100 })).status).toBe(403);
    expect((await call({ price: 140 })).status).toBe(200);
  });

  it("does not limit office roles by the register permissions", async () => {
    state.role = "ADMIN";
    state.kiosk = false;
    state.settings = { posEditProductAtPos: false, posChangePriceAtPos: false, posBanPriceDecrease: true };
    expect((await call({ name: "y", price: 50 })).status).toBe(200);
  });

  it("refuses a caller who is not a till employee, an empty edit, and an unknown product", async () => {
    state.kiosk = false;
    expect((await call({ price: 200 })).status).toBe(401);
    state.kiosk = true;
    expect((await call({})).status).toBe(400);
    state.product = null;
    expect((await call({ price: 200 })).status).toBe(404);
  });

  it("does nothing (and says so) when the values are already what the product has", async () => {
    const r = await call({ name: "нан", price: 130 });
    expect(await r.json()).toMatchObject({ ok: true, unchanged: true });
    expect(state.updates).toHaveLength(0);
  });
});
