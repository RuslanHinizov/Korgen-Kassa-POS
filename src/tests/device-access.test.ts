/** A device token opens only the API the till itself uses, and only when the proxy vouched for the path. */

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/hub-auth", () => ({ resolveHubActor: async () => null }));

import { deviceMayCall, resolveDeviceSession, DEVICE_OK_HEADER, DEVICE_CASHIER_HEADER } from "@/lib/device-access";

describe("deviceMayCall", () => {
  it("allows the till's own endpoints, including sub-paths", () => {
    for (const p of ["/api/sales", "/api/pos/sales", "/api/pos/catalog", "/api/shifts/abc", "/api/held-orders", "/api/customers/x/payments", "/api/products/search", "/api/settings"]) {
      expect(deviceMayCall(p), p).toBe(true);
    }
  });

  it("refuses office endpoints and look-alike prefixes", () => {
    for (const p of ["/api/management/employees", "/api/reports/full-export", "/api/superadmin/stores", "/api/users", "/api/salesforce", "/api/pos-admin", "/api/products", "/api/auth/get-session"]) {
      expect(deviceMayCall(p), p).toBe(false);
    }
  });
});

describe("resolveDeviceSession", () => {
  it("is null unless the proxy set the flag", async () => {
    const h = new Headers({ authorization: "Bearer hub_x", [DEVICE_CASHIER_HEADER]: "u1" });
    expect(await resolveDeviceSession(h)).toBeNull();
  });

  it("is null without a working employee, and null for an unknown token", async () => {
    expect(await resolveDeviceSession(new Headers({ [DEVICE_OK_HEADER]: "1", authorization: "Bearer hub_x" }))).toBeNull();
    expect(await resolveDeviceSession(new Headers({ [DEVICE_OK_HEADER]: "1", authorization: "Bearer hub_x", [DEVICE_CASHIER_HEADER]: "u1" }))).toBeNull();
  });
});
