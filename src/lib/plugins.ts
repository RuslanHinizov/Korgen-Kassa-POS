/**
 * Olgax POS Plugin System
 *
 * Lightweight hook-based plugin registry that lets extensions tap into
 * key application events without modifying core code.
 *
 * Usage:
 *   import { pluginRegistry } from "@/lib/plugins";
 *   pluginRegistry.on("onSaleComplete", (payload) => { ... });
 *   // In core code:
 *   await pluginRegistry.fire("onSaleComplete", { saleId, total, ... });
 */

// ---------------------------------------------------------------------------
// Hook payload types
// ---------------------------------------------------------------------------

export interface SaleCompletePayload {
  saleId: string;
  total: number;
  taxAmount: number;
  tipAmount: number;
  items: Array<{
    productId: string | null;
    name: string;
    quantity: number;
    price: number;
  }>;
  customerId: string | null;
  paymentMethod: string;
  loyaltyPointsUsed: number;
}

export interface ProductUpdatePayload {
  productId: string;
  changes: Record<string, unknown>;
}

export interface CheckoutRenderPayload {
  cartTotal: number;
  customerId: string | null;
}

// ---------------------------------------------------------------------------
// Hook map
// ---------------------------------------------------------------------------

export type HookName = "onSaleComplete" | "onProductUpdate" | "onCheckoutRender";

type HookPayloadMap = {
  onSaleComplete: SaleCompletePayload;
  onProductUpdate: ProductUpdatePayload;
  onCheckoutRender: CheckoutRenderPayload;
};

type Handler<K extends HookName> = (
  payload: HookPayloadMap[K]
) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Plugin manifest (mirrors plugin.json schema)
// ---------------------------------------------------------------------------

export interface PluginManifest {
  /** Unique plugin identifier (e.g. "com.example.my-plugin") */
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  hooks: HookName[];
  permissions?: string[];
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// PluginRegistry
// ---------------------------------------------------------------------------

class PluginRegistry {
  private handlers = new Map<HookName, Handler<HookName>[]>();
  private manifests: PluginManifest[] = [];
  // getPlugins() is read via useSyncExternalStore, which requires a stable
  // reference across calls when nothing changed — otherwise React treats
  // every render as a store update and loops (Maximum update depth exceeded).
  private snapshot: PluginManifest[] = [];
  private snapshotStale = true;

  /**
   * Register a plugin manifest. The registry uses this for the settings UI.
   */
  registerPlugin(manifest: PluginManifest): void {
    const existing = this.manifests.findIndex((m) => m.id === manifest.id);
    if (existing >= 0) {
      this.manifests[existing] = manifest;
    } else {
      this.manifests.push(manifest);
    }
    this.snapshotStale = true;
  }

  /**
   * Subscribe a handler to a hook.
   * @param hook  The hook name (e.g. "onSaleComplete")
   * @param handler  Callback invoked when the hook fires
   */
  on<K extends HookName>(hook: K, handler: Handler<K>): () => void {
    if (!this.handlers.has(hook)) {
      this.handlers.set(hook, []);
    }
    this.handlers.get(hook)!.push(handler as Handler<HookName>);
    // Return unsubscribe function
    return () => this.off(hook, handler);
  }

  /**
   * Unsubscribe a handler from a hook.
   */
  off<K extends HookName>(hook: K, handler: Handler<K>): void {
    const list = this.handlers.get(hook);
    if (!list) return;
    const idx = list.indexOf(handler as Handler<HookName>);
    if (idx >= 0) list.splice(idx, 1);
  }

  /**
   * Fire a hook, calling all registered handlers in registration order.
   * Errors in individual handlers are caught and logged; they do not block other handlers.
   */
  async fire<K extends HookName>(hook: K, payload: HookPayloadMap[K]): Promise<void> {
    const list = this.handlers.get(hook);
    if (!list || list.length === 0) return;
    for (const handler of list) {
      try {
        await (handler as Handler<K>)(payload);
      } catch (err) {
        console.error(`[PluginRegistry] Error in ${hook} handler:`, err);
      }
    }
  }

  /**
   * Get registered plugin manifests (for settings UI).
   */
  getPlugins(): PluginManifest[] {
    if (this.snapshotStale) {
      this.snapshot = [...this.manifests];
      this.snapshotStale = false;
    }
    return this.snapshot;
  }

  /**
   * Enable or disable a plugin by ID.
   * Note: disabling does NOT remove handlers already registered.
   * Plugins should check `manifest.enabled` before registering handlers.
   */
  setEnabled(pluginId: string, enabled: boolean): void {
    const manifest = this.manifests.find((m) => m.id === pluginId);
    if (manifest) manifest.enabled = enabled;
    this.snapshotStale = true;
  }
}

/**
 * Singleton registry — import this in both core code and plugins.
 */
export const pluginRegistry = new PluginRegistry();
