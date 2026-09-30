// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { programCanPrint, printerEnabled, printReceiptOnProgram, receiptDocument, PRINTER_ENABLED_KEY } from "@/lib/program-print";

const setShell = (s: unknown) => ((window as unknown as { korgenShell?: unknown }).korgenShell = s);

beforeEach(() => {
  delete (window as unknown as { korgenShell?: unknown }).korgenShell;
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  localStorage.clear();
});

describe("program printing", () => {
  it("is not available in a browser", async () => {
    expect(programCanPrint()).toBe(false);
    expect((await printReceiptOnProgram()).ok).toBe(false);
  });

  it("hands the receipt on screen, with the page's styles, to the program", async () => {
    const printReceipt = vi.fn(async () => ({ ok: true }));
    setShell({ printReceipt });
    document.head.innerHTML = '<link rel="stylesheet" href="/_next/static/a.css"><style>.x{color:red}</style>';
    document.body.innerHTML = '<div id="receipt-print"><p>Хлеб 150 ₸</p></div>';
    expect(programCanPrint()).toBe(true);
    const r = await printReceiptOnProgram();
    expect(r.ok).toBe(true);
    const html = (printReceipt.mock.calls[0] as unknown as [string])[0];
    expect(html).toContain("Хлеб 150 ₸");
    expect(html).toContain("/_next/static/a.css");
    expect(html).toContain('<base href="http://localhost:3000/">');
    expect(html).toContain('id="receipt-print-overlay"');
    expect(html).toContain("@page{size:72mm auto;margin:0}");
  });

  it("says so when no receipt is on screen", async () => {
    setShell({ printReceipt: vi.fn() });
    expect((await printReceiptOnProgram()).ok).toBe(false);
  });

  it("the printer switch defaults to on and turns off with 0", () => {
    expect(printerEnabled()).toBe(true);
    localStorage.setItem(PRINTER_ENABLED_KEY, "0");
    expect(printerEnabled()).toBe(false);
  });

  it("wraps the receipt so the modal's print rule cannot hide it", () => {
    expect(receiptDocument("<p>a</p>", "", "http://x")).toContain('<div id="receipt-print-overlay"><p>a</p></div>');
  });
});

import { elementDocument, printElementOnProgram } from "@/lib/program-print";

describe("printing any block (label, shift report)", () => {
  it("centres it in a 66 mm column and frees it from scroll limits", () => {
    const html = elementDocument('<div id="x">A</div>', "", "http://x");
    expect(html).toContain('<div class="korgen-print-root"><div id="x">A</div></div>');
    expect(html).toContain("width:66mm");
    expect(html).toContain("max-height:none!important");
  });

  it("sends the block with the page's styles, and says so when it is missing", async () => {
    const printReceipt = vi.fn(async () => ({ ok: true }));
    (window as unknown as { korgenShell?: unknown }).korgenShell = { printReceipt };
    document.head.innerHTML = '<link rel="stylesheet" href="/a.css">';
    document.body.innerHTML = '<div id="pos-label-print"><p>Лимон ₸500</p></div>';
    expect((await printElementOnProgram("pos-label-print")).ok).toBe(true);
    expect((printReceipt.mock.calls[0] as unknown as [string])[0]).toContain("Лимон ₸500");
    expect((await printElementOnProgram("nope")).ok).toBe(false);
  });
});
