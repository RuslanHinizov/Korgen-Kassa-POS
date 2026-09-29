/** Owners and managers can work a till, but only with cashier rights: office power never comes from a till's device key. */

import { describe, it, expect, vi } from "vitest";

const found = { role: "ADMIN" as string };
vi.mock("@/lib/hub-auth", () => ({ resolveHubActor: async () => ({ storeId: "s1", tokenId: "t1" }) }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findFirst: async () => ({ id: "u1", name: "Ruslan", email: "r@x", role: found.role, createdAt: new Date(), updatedAt: new Date() }) },
    store: { findUnique: async () => ({ suspendedAt: null, suspendedMessage: null }) },
  },
}));

import { resolveDeviceSession, DEVICE_OK_HEADER, DEVICE_CASHIER_HEADER } from "@/lib/device-access";

const headers = () => new Headers({ [DEVICE_OK_HEADER]: "1", authorization: "Bearer hub_x", [DEVICE_CASHIER_HEADER]: "u1" });

describe("device session roles", () => {
  it("an ADMIN or MANAGER at the till acts as a plain CASHIER", async () => {
    for (const role of ["ADMIN", "MANAGER"]) {
      found.role = role;
      expect((await resolveDeviceSession(headers()))?.user.role, role).toBe("CASHIER");
    }
  });

  it("a cashier and a warehouse worker keep their own role", async () => {
    for (const role of ["CASHIER", "WAREHOUSE"]) {
      found.role = role;
      expect((await resolveDeviceSession(headers()))?.user.role, role).toBe(role);
    }
  });
});
