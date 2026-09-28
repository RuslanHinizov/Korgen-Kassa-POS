/**
 * This till's own copy of the customer list, so attaching a customer to a sale (or looking one up for
 * В долг) still works with no connection — the same offline-cache pattern as promotions/settings, see
 * config-cache.ts. Refreshed at most once a minute; a search already only needs "good enough", not
 * up-to-the-second, and this avoids re-downloading the whole list on every keystroke.
 */
import { cacheConfig, getCachedConfig } from "./config-cache";

export interface CachedCustomer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

const KEY = "customers";
let lastRefresh = 0;

export async function refreshCustomerCache(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  if (Date.now() - lastRefresh < 60_000) return;
  lastRefresh = Date.now();
  try {
    const res = await fetch(`/api/customers?limit=1000`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const summaries: CachedCustomer[] = (data.customers ?? []).map(
      (c: { id: string; name: string; phone: string | null; email: string | null }) => ({ id: c.id, name: c.name, phone: c.phone, email: c.email })
    );
    await cacheConfig(KEY, summaries);
  } catch {
    /* best effort — the till just keeps whatever it cached last time */
  }
}

export async function searchCachedCustomers(query: string): Promise<CachedCustomer[]> {
  const q = query.trim().toLowerCase();
  const all = (await getCachedConfig<CachedCustomer[]>(KEY)) ?? [];
  if (!q) return all;
  return all.filter(
    (c) => c.name.toLowerCase().includes(q) || (c.phone ?? "").includes(q) || (c.email ?? "").toLowerCase().includes(q)
  );
}
