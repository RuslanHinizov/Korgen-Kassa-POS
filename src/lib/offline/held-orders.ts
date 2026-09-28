/**
 * Отложка (hold/recall) has no reason to depend on a connection — pausing and resuming a sale is
 * purely this till's own working state. Held orders are kept locally first; a synced copy is also
 * pushed to the server (best effort) so other tills in the store can see it once online. An order
 * created offline is recalled/deleted from this list even before it ever reaches the server.
 */
import { cacheConfig, getCachedConfig } from "./config-cache";

export interface LocalHeldOrder {
  id: string;
  serverId: string | null;
  label: string | null;
  createdAt: string;
  cartSnapshot: unknown;
}

const KEY = "held-orders";

export async function listLocalHeldOrders(): Promise<LocalHeldOrder[]> {
  return (await getCachedConfig<LocalHeldOrder[]>(KEY)) ?? [];
}

export async function addLocalHeldOrder(order: Omit<LocalHeldOrder, "id" | "createdAt">): Promise<LocalHeldOrder> {
  const all = await listLocalHeldOrders();
  const entry: LocalHeldOrder = { ...order, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  await cacheConfig(KEY, [entry, ...all]);
  return entry;
}

export async function markLocalHeldOrderSynced(localId: string, serverId: string): Promise<void> {
  const all = await listLocalHeldOrders();
  await cacheConfig(KEY, all.map((o) => (o.id === localId ? { ...o, serverId } : o)));
}

export async function removeLocalHeldOrder(localId: string): Promise<void> {
  const all = await listLocalHeldOrders();
  await cacheConfig(KEY, all.filter((o) => o.id !== localId));
}
