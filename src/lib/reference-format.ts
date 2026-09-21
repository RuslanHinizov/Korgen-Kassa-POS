// Client-safe (no database imports).
export type ReferenceValue = { bookId: string; bookName: string; entryId: string; entryName: string };

export function formatReferenceValues(values: unknown): string {
  if (!Array.isArray(values)) return "";
  return (values as Partial<ReferenceValue>[]).map((v) => `${v.bookName}: ${v.entryName}`).join("; ");
}
