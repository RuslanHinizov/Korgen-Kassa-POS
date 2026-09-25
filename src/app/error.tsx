"use client";

import { PageError } from "@/components/ui/page-error";

// Catch-all for pages that have no error screen of their own (cash register, profile, login…).
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageError error={error} reset={reset} />;
}
