import JsBarcode from "jsbarcode";

type Options = { displayValue?: boolean; margin?: number; height?: number; width?: number; fontSize?: number };

/**
 * Draw a label barcode: EAN-13 for a 13-digit code, CODE128 otherwise. A 13-digit code whose check digit is not valid
 * (a typed or foreign code) would make EAN-13 throw and crash the screen, so it is drawn as CODE128 instead.
 */
export function drawBarcode(svg: SVGSVGElement, code: string, options: Options): void {
  try {
    JsBarcode(svg, code, { ...options, format: /^\d{13}$/.test(code) ? "EAN13" : "CODE128" });
  } catch {
    JsBarcode(svg, code, { ...options, format: "CODE128" });
  }
}
