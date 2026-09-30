// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { useCartStore, roundQty } from "./cart";

const base = { productId: "p1", name: "Товар", price: 100, stock: 50, categoryId: null };

describe("cart quantities per unit", () => {
  beforeEach(() => useCartStore.getState().clearCart());

  it("repeated +0.1 taps on kg/l/m stay clean (no 1.2000000000000002)", () => {
    for (const unit of ["kg", "l", "m"]) {
      useCartStore.getState().clearCart();
      useCartStore.getState().addItem({ ...base, unit });
      const id = useCartStore.getState().items[0].id;
      for (let i = 0; i < 3; i++) {
        const q = useCartStore.getState().items[0].quantity;
        useCartStore.getState().updateQuantity(id, q + 0.1);
      }
      expect(useCartStore.getState().items[0].quantity).toBe(1.3);
    }
  });

  it("pieces add up as whole numbers", () => {
    useCartStore.getState().addItem({ ...base, unit: "pcs" });
    useCartStore.getState().addItem({ ...base, unit: "pcs" });
    useCartStore.getState().addItem({ ...base, unit: "pcs" });
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].quantity).toBe(3);
  });

  it("a typed 0.75 kg keeps its value and prices correctly", () => {
    useCartStore.getState().addItem({ ...base, unit: "kg" });
    const id = useCartStore.getState().items[0].id;
    useCartStore.getState().updateQuantity(id, 0.75);
    const item = useCartStore.getState().items[0];
    expect(item.quantity).toBe(0.75);
    expect(useCartStore.getState().lineGrossOf(item)).toBeCloseTo(75, 2);
  });

  it("roundQty trims float noise to 3 decimals", () => {
    expect(roundQty(0.1 + 0.2)).toBe(0.3);
    expect(roundQty(1.0005)).toBe(1.001);
  });
});
