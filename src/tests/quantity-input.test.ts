import { describe, expect, it } from "vitest";
import { isValidQuantityForUnit, parseQuantityInput } from "@/lib/units";

describe("parseQuantityInput", () => {
  it("treats separators as grouping for piece quantities", () => {
    expect(parseQuantityInput("1,001", "pcs")).toBe(1001);
    expect(parseQuantityInput("1.001", "pcs")).toBe(1001);
    expect(parseQuantityInput("1 001", "pcs")).toBe(1001);
  });

  it("keeps decimal quantities for kg, litres and metres", () => {
    expect(parseQuantityInput("1,001", "kg")).toBe(1.001);
    expect(parseQuantityInput("0,5", "l")).toBe(0.5);
    expect(parseQuantityInput("1.001,5", "m")).toBe(1001.5);
  });

  it("rejects empty, zero and invalid quantities", () => {
    expect(parseQuantityInput("", "pcs")).toBeNull();
    expect(parseQuantityInput("one", "pcs")).toBeNull();
    expect(parseQuantityInput("0", "kg")).toBeNull();
  });

  it("rejects a fractional value for a piece-count API request", () => {
    expect(isValidQuantityForUnit(1.001, "pcs")).toBe(false);
    expect(isValidQuantityForUnit(1001, "pcs")).toBe(true);
    expect(isValidQuantityForUnit(1.001, "kg")).toBe(true);
  });
});
