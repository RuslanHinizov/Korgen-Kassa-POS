/** An activation code is 8 digits, works once, expires, and guessing it is rate-limited. */

import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = { codeHash: string; storeId: string; usedAt: Date | null; expiresAt: Date };
const rows: Row[] = [];
vi.mock("@/lib/db", () => ({
  prisma: {
    activationCode: {
      create: async ({ data }: { data: Row }) => {
        if (rows.some((r) => r.codeHash === data.codeHash)) throw Object.assign(new Error("dup"), { code: "P2002" });
        rows.push({ ...data, usedAt: null });
      },
      updateMany: async ({ where, data }: { where: { codeHash: string; usedAt: null; expiresAt: { gt: Date } }; data: { usedAt: Date } }) => {
        const r = rows.find((x) => x.codeHash === where.codeHash && x.usedAt === null && x.expiresAt > where.expiresAt.gt);
        if (r) r.usedAt = data.usedAt;
        return { count: r ? 1 : 0 };
      },
      findUnique: async ({ where }: { where: { codeHash: string } }) => rows.find((r) => r.codeHash === where.codeHash) ?? null,
    },
  },
}));

import { createActivationCode, redeemActivationCode, normalizeCode, formatCode, tooManyAttempts } from "@/lib/till-activation";

beforeEach(() => { rows.length = 0; });

describe("code format", () => {
  it("accepts 8 digits in any grouping and nothing else", () => {
    expect(normalizeCode("1234-5678")).toBe("12345678");
    expect(normalizeCode("1234 5678")).toBe("12345678");
    expect(normalizeCode("12345678")).toBe("12345678");
    expect(normalizeCode("1234567")).toBeNull();
    expect(normalizeCode("123456789")).toBeNull();
    expect(normalizeCode("abcdefgh")).toBeNull();
    expect(formatCode("00120034")).toBe("0012-0034");
  });
});

describe("create and redeem", () => {
  it("is stored only as a hash, never the digits", async () => {
    const { code } = await createActivationCode("s1", "u1");
    expect(JSON.stringify(rows)).not.toContain(code.replace("-", ""));
  });

  it("gives the market to the first redeem and refuses every later one (one-time)", async () => {
    const { code } = await createActivationCode("s1", "u1");
    expect(await redeemActivationCode(code)).toBe("s1");
    expect(await redeemActivationCode(code)).toBeNull();
  });

  it("accepts the code typed with or without the dash", async () => {
    const { code } = await createActivationCode("s2", "u1");
    expect(await redeemActivationCode(code.replace("-", ""))).toBe("s2");
  });

  it("refuses an expired code and an unknown one", async () => {
    const { code } = await createActivationCode("s1", "u1");
    rows[0].expiresAt = new Date(Date.now() - 1000);
    expect(await redeemActivationCode(code)).toBeNull();
    expect(await redeemActivationCode("00000000")).toBeNull();
    expect(await redeemActivationCode("garbage")).toBeNull();
  });
});

describe("rate limit", () => {
  it("blocks a client after 8 attempts in 10 minutes, but not another client", () => {
    const results = Array.from({ length: 10 }, () => tooManyAttempts("1.2.3.4"));
    expect(results.slice(0, 8).every((r) => r === false)).toBe(true);
    expect(results[8]).toBe(true);
    expect(tooManyAttempts("5.6.7.8")).toBe(false);
  });
});
