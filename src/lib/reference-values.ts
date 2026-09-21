import { prisma } from "@/lib/db";
import type { ReferenceValue } from "@/lib/reference-format";
export { formatReferenceValues } from "@/lib/reference-format";
export type { ReferenceValue } from "@/lib/reference-format";

export type ReferenceModule = "SALE" | "RETURN";
export interface ReferenceChoice { bookId: string; entryId: string }

/**
 * Checks the Справочник values chosen at the kassa against the store's books for `module` and
 * returns a snapshot to store on the document. Every book with entries must be answered.
 */
export async function resolveReferenceValues(
  storeId: string,
  module: ReferenceModule,
  choices: ReferenceChoice[] | undefined
): Promise<{ ok: true; values: ReferenceValue[] } | { ok: false; error: string }> {
  const books = await prisma.referenceBook.findMany({
    where: { storeId, modules: { has: module } },
    orderBy: { createdAt: "asc" },
    include: { entries: { orderBy: { createdAt: "asc" } } },
  });
  const values: ReferenceValue[] = [];
  for (const book of books) {
    if (book.entries.length === 0) continue;
    const choice = choices?.find((c) => c.bookId === book.id);
    const entry = choice ? book.entries.find((e) => e.id === choice.entryId) : undefined;
    if (!entry) return { ok: false, error: `Выберите значение справочника «${book.name}»` };
    values.push({ bookId: book.id, bookName: book.name, entryId: entry.id, entryName: entry.name });
  }
  return { ok: true, values };
}
