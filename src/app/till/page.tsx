import type { Metadata } from "next";
import { TillShell } from "@/components/till/till-shell";

export const metadata: Metadata = { title: "Касса" };

/** Static shell: no session, no database. Everything is read from the till's own IndexedDB in the browser. */
export default function TillPage() {
  return <TillShell />;
}
