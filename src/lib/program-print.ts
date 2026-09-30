/**
 * Receipt printing on the till program (Electron): the receipt on screen is handed to the program, which prints it
 * silently on the receipt printer through its Windows driver (see till-app/main.js). A browser register has no such
 * bridge and keeps using the browser's print dialog / Web Serial (src/lib/thermal-print.ts).
 */

export const PRINTER_ENABLED_KEY = "korgen-printer-enabled";

interface PrintBridge {
  printReceipt?: (html: string) => Promise<{ ok: boolean; error?: string; printer?: string }>;
}

function bridge(): PrintBridge | undefined {
  return typeof window === "undefined" ? undefined : (window as unknown as { korgenShell?: PrintBridge }).korgenShell;
}

export function programCanPrint(): boolean {
  return typeof bridge()?.printReceipt === "function";
}

/** ДОП. ФУНКЦИИ → ВКЛ/ВЫКЛ ПРИНТЕР (on unless the cashier switched it off). */
export function printerEnabled(): boolean {
  try {
    return localStorage.getItem(PRINTER_ENABLED_KEY) !== "0";
  } catch {
    return true;
  }
}

/** The page around the receipt element, made printable on a 76 mm roll. Exported for tests. */
export function receiptDocument(receiptHtml: string, headHtml: string, origin: string): string {
  return (
    `<!doctype html><html><head><meta charset="utf-8"><base href="${origin}/">${headHtml}` +
    `<style>@page{size:76mm auto;margin:0}html,body{margin:0;padding:0;background:#fff}` +
    `#receipt-print{width:64mm!important;max-width:64mm!important;margin:0 auto!important;padding:2mm 0!important;font-size:10pt!important}</style>` +
    // the wrapper id keeps the modal's own print rule ("hide everything but the overlay") from hiding the receipt
    `</head><body><div id="receipt-print-overlay">${receiptHtml}</div></body></html>`
  );
}

/** Prints the receipt that is open on screen (element #receipt-print). */
export async function printReceiptOnProgram(): Promise<{ ok: boolean; error?: string }> {
  const b = bridge();
  const el = typeof document === "undefined" ? null : document.getElementById("receipt-print");
  if (!b?.printReceipt) return { ok: false, error: "no program printer" };
  if (!el) return { ok: false, error: "no receipt on screen" };
  const head = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((n) => n.outerHTML).join("");
  return b.printReceipt(receiptDocument(el.outerHTML, head, window.location.origin));
}
