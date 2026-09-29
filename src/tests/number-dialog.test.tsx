// @vitest-environment jsdom
/** UMAG's number window: the first key replaces the selected value, УДАЛИТЬ removes the last character, OK returns the number. */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NumberDialog } from "@/components/pos/number-dialog";
import { ProductEditDialog } from "@/components/pos/product-edit-dialog";

afterEach(cleanup);
const tap = (t: string) => fireEvent.click(screen.getByRole("button", { name: t }));

describe("NumberDialog", () => {
  it("starts with the value selected: the first key replaces it, later keys append", () => {
    const onOk = vi.fn();
    render(<NumberDialog title="КОЛИЧЕСТВО" initial="1" onOk={onOk} onCancel={() => {}} />);
    tap("2"); tap("5");
    expect(screen.getByTestId("number-dialog-value").textContent).toBe("25");
    tap("OK");
    expect(onOk).toHaveBeenCalledWith(25);
  });

  it("УДАЛИТЬ removes the last character; on a selected value it clears to 0", () => {
    render(<NumberDialog title="x" initial="12" onOk={() => {}} onCancel={() => {}} />);
    tap("УДАЛИТЬ");
    expect(screen.getByTestId("number-dialog-value").textContent).toBe("0");
    tap("7"); tap("8"); tap("УДАЛИТЬ");
    expect(screen.getByTestId("number-dialog-value").textContent).toBe("7");
  });

  it("takes one decimal point only when decimals are allowed, and never for whole pieces", () => {
    const { unmount } = render(<NumberDialog title="x" initial="1" onOk={() => {}} onCancel={() => {}} />);
    tap("."); tap("5"); tap("."); tap("2");
    expect(screen.getByTestId("number-dialog-value").textContent).toBe("0.52");
    unmount();
    render(<NumberDialog title="x" initial="1" allowDecimal={false} onOk={() => {}} onCancel={() => {}} />);
    tap("3"); tap(".");
    expect(screen.getByTestId("number-dialog-value").textContent).toBe("3");
  });

  it("ОТМЕНА and Escape cancel; Enter confirms; the physical keyboard types", () => {
    const onCancel = vi.fn();
    const onOk = vi.fn();
    render(<NumberDialog title="x" initial="1" onOk={onOk} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: "4" });
    fireEvent.keyDown(document, { key: "2" });
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onOk).toHaveBeenCalledWith(42);
    fireEvent.keyDown(document, { key: "Escape" });
    tap("ОТМЕНА");
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});

describe("ProductEditDialog", () => {
  const base = { name: "нан", price: 130, catalogPrice: 130, canEditName: true, canEditPrice: true, banPriceDecrease: false, onCancel: () => {} };

  it("shows the price with three decimals, selected, and saves a typed price and name", () => {
    const onSave = vi.fn();
    render(<ProductEditDialog {...base} onSave={onSave} />);
    expect(screen.getByTestId("product-edit-price").textContent).toBe("130.000");
    tap("1"); tap("7"); tap("5");
    fireEvent.change(screen.getByDisplayValue("нан"), { target: { value: "нан большой" } });
    tap("Сохранить");
    expect(onSave).toHaveBeenCalledWith({ name: "нан большой", price: 175 });
  });

  it("refuses a lower price when decreasing is banned, and an empty name", () => {
    const onSave = vi.fn();
    render(<ProductEditDialog {...base} banPriceDecrease onSave={onSave} />);
    tap("1"); tap("0"); tap("0");
    tap("Сохранить");
    expect(screen.getByRole("alert").textContent).toContain("Понижать цену");
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(screen.getByDisplayValue("нан"), { target: { value: " " } });
    tap("Сохранить");
    expect(screen.getByRole("alert").textContent).toContain("название");
  });

  it("without the price permission the keys do nothing", () => {
    render(<ProductEditDialog {...base} canEditPrice={false} onSave={() => {}} />);
    tap("9");
    expect(screen.getByTestId("product-edit-price").textContent).toBe("130.000");
  });
});

describe("fast input", () => {
  it("keeps every digit when keys arrive faster than the screen redraws", () => {
    const onOk = vi.fn();
    render(<NumberDialog title="x" initial="0" onOk={onOk} onCancel={() => {}} />);
    const dlg = screen.getByRole("dialog");
    const click = (t: string) => [...dlg.querySelectorAll("button")].find((b) => b.textContent === t)!.click();
    // three clicks in one go (no waiting between them), like a held key or a scanner
    click("2"); click("5"); click("0");
    click("OK");
    expect(onOk).toHaveBeenCalledWith(250);
  });
});
