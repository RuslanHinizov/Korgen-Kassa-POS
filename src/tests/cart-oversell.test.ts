import { beforeEach, describe, expect, it, vi } from "vitest";
import { setOversellGuard, useCartStore } from "@/store/cart";

const bread = { productId: "p1", name: "Нан", price: 120, stock: 1, unit: "pcs" as const, categoryId: null };

describe("«Запретить продажу больше остатка»", () => {
  beforeEach(() => {
    useCartStore.getState().clearCart();
    setOversellGuard(false, () => {});
  });

  it("off: the quantity may go above the stock (UMAG-style)", () => {
    useCartStore.getState().addItem(bread, 50);
    expect(useCartStore.getState().items[0].quantity).toBe(50);
  });

  it("on: adding more than the stock is cut to the stock and the cashier is told", () => {
    const notify = vi.fn();
    setOversellGuard(true, notify);
    useCartStore.getState().addItem(bread, 50);
    expect(useCartStore.getState().items[0].quantity).toBe(1);
    expect(notify).toHaveBeenCalledWith(1, "pcs");
  });

  it("on: scanning the same product again cannot pass the stock, and a quantity edit is cut too", () => {
    setOversellGuard(true, () => {});
    useCartStore.getState().addItem({ ...bread, stock: 3 }, 2);
    useCartStore.getState().addItem({ ...bread, stock: 3 }, 2);
    const line = useCartStore.getState().items[0];
    expect(line.quantity).toBe(3);
    useCartStore.getState().updateQuantity(line.id, 10);
    expect(useCartStore.getState().items[0].quantity).toBe(3);
  });

  it("on: a product with no stock is not added; a custom «Универсальный продукт» line is never limited", () => {
    setOversellGuard(true, () => {});
    useCartStore.getState().addItem({ ...bread, stock: 0 }, 1);
    expect(useCartStore.getState().items).toHaveLength(0);
    useCartStore.getState().addCustomItem({ name: "Универсальный продукт", price: 80, quantity: 5 });
    expect(useCartStore.getState().items[0].quantity).toBe(5);
  });
});
