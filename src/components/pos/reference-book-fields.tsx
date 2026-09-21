"use client";

import { useEffect, useState } from "react";

export interface RefBook { id: string; name: string; entries: { id: string; name: string }[] }

/** Справочники the kassa must ask about for a sale or a return; every book has to be answered. */
export function useReferenceBooks(module: "SALE" | "RETURN") {
  const [books, setBooks] = useState<RefBook[]>([]);
  const [choices, setChoices] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    fetch(`/api/pos/reference-books?module=${module}`)
      .then((r) => (r.ok ? r.json() : { books: [] }))
      .then((d) => { if (alive) setBooks(d.books ?? []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [module]);

  return {
    books,
    choices,
    setChoice: (bookId: string, entryId: string) => setChoices((c) => ({ ...c, [bookId]: entryId })),
    /** Name of the first unanswered book, or null when everything is chosen. */
    missing: () => books.find((b) => !b.entries.some((e) => e.id === choices[b.id]))?.name ?? null,
    payload: () => books.map((b) => ({ bookId: b.id, entryId: choices[b.id] })).filter((c) => c.entryId),
    reset: () => setChoices({}),
  };
}

export function ReferenceBookFields({ state, className = "" }: { state: ReturnType<typeof useReferenceBooks>; className?: string }) {
  if (state.books.length === 0) return null;
  return (
    <div className={`grid gap-2 ${className}`}>
      {state.books.map((b) => (
        <label key={b.id} className="block text-xs font-medium">
          {b.name} <span className="text-red-600">*</span>
          <select
            value={state.choices[b.id] ?? ""}
            onChange={(e) => state.setChoice(b.id, e.target.value)}
            className="mt-1 block h-9 w-full rounded-sm border border-slate-300 bg-white px-2 text-sm text-black"
          >
            <option value="">Выберите…</option>
            {b.entries.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}
