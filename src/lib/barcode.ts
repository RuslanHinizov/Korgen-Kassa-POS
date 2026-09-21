/** Internal-use EAN-13 barcode generation (prefix 290, per GS1's reserved internal-use range). */

export function ean13Checksum(payload: string): string {
  const sum = payload.split("").reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
}

export function generateEan13(): string {
  const payload = `290${Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, "0")}`;
  return payload + ean13Checksum(payload);
}
