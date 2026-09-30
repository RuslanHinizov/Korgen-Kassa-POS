import { describe, expect, it } from "vitest";
import { allocateReceiptDiscount } from "@/lib/rounding";

const sum = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) * 100) / 100;

describe("allocateReceiptDiscount", () => {
  it("shares the discount in proportion to what each line costs and adds up exactly", () => {
    const shares = allocateReceiptDiscount([{ gross: 1000, lineDiscount: 0 }, { gross: 3000, lineDiscount: 0 }], 400);
    expect(shares).toEqual([100, 300]);
  });
  it("rounds to 2 decimals and the last line takes the remainder", () => {
    const shares = allocateReceiptDiscount([{ gross: 100, lineDiscount: 0 }, { gross: 100, lineDiscount: 0 }, { gross: 100, lineDiscount: 0 }], 100);
    expect(sum(shares)).toBe(100);
    expect(shares.every((s) => Number.isFinite(s) && s >= 0)).toBe(true);
  });
  it("shares over what is left after a line's own discount", () => {
    const shares = allocateReceiptDiscount([{ gross: 1000, lineDiscount: 500 }, { gross: 500, lineDiscount: 0 }], 100);
    expect(shares).toEqual([50, 50]);
  });
  it("never gives more than a line costs and ignores no discount", () => {
    expect(allocateReceiptDiscount([{ gross: 100, lineDiscount: 0 }], 999)).toEqual([100]);
    expect(allocateReceiptDiscount([{ gross: 100, lineDiscount: 0 }], 0)).toEqual([0]);
    expect(allocateReceiptDiscount([], 10)).toEqual([]);
  });
  it("a free line takes nothing", () => {
    expect(allocateReceiptDiscount([{ gross: 0, lineDiscount: 0 }, { gross: 200, lineDiscount: 0 }], 20)).toEqual([0, 20]);
  });
});
