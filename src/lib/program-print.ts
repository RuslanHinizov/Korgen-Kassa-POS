/**
 * Receipt printing on the till program (Electron): the receipt on screen is handed to the program, which prints it
 * silently on the receipt printer through its Windows driver (see till-app/main.js). A browser register has no such
 * bridge and keeps using the browser's print dialog / Web Serial (src/lib/thermal-print.ts).
 */

export const PRINTER_ENABLED_KEY = "korgen-printer-enabled";

export interface PrinterStatus {
  found: boolean;
  ready: boolean;
  name: string | null;
}

interface PrintBridge {
  printerStatus?: () => Promise<PrinterStatus>;
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
    `<style>@page{size:72mm auto;margin:0}html,body{margin:0;padding:0;background:#fff;overflow:hidden}` +
    `#receipt-print{width:66mm!important;max-width:66mm!important;margin:0 auto!important;padding:2mm 0!important;font-size:10pt!important}</style>` +
    // the wrapper id keeps the modal's own print rule ("hide everything but the overlay") from hiding the receipt
    `</head><body><div id="receipt-print-overlay">${receiptHtml}</div></body></html>`
  );
}

/**
 * Any other block on screen (a product label, a shift report) printed the same way on the till program. The block is
 * centred in a 66 mm column and freed from scroll limits so the whole of it is drawn.
 */
export function elementDocument(elementHtml: string, headHtml: string, origin: string): string {
  return (
    `<!doctype html><html><head><meta charset="utf-8"><base href="${origin}/">${headHtml}` +
    `<style>html,body{margin:0;padding:0;background:#fff;overflow:hidden}` +
    `.korgen-print-root{width:66mm;margin:0 auto;padding:2mm 0;color:#000;font-size:10pt}` +
    `.korgen-print-root *{max-height:none!important;overflow:visible!important;box-shadow:none!important}</style>` +
    `</head><body><div class="korgen-print-root">${elementHtml}</div></body></html>`
  );
}

export async function printElementOnProgram(id: string): Promise<{ ok: boolean; error?: string }> {
  const b = bridge();
  const el = typeof document === "undefined" ? null : document.getElementById(id);
  if (!b?.printReceipt) return { ok: false, error: "no program printer" };
  if (!el) return { ok: false, error: "nothing to print" };
  const head = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((n) => n.outerHTML).join("");
  return b.printReceipt(elementDocument(el.outerHTML, head, window.location.origin));
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

/** The receipt printer as the program sees it, or null on a browser register (which keeps its Web Serial/USB check). */
export async function programPrinterStatus(): Promise<PrinterStatus | null> {
  const b = bridge();
  if (!b?.printerStatus) return null;
  try {
    return await b.printerStatus();
  } catch {
    return { found: false, ready: false, name: null };
  }
}
