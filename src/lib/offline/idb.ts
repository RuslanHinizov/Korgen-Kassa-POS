/**
 * Tiny IndexedDB wrapper for the offline kassa (no dependencies).
 *
 * Stores:
 *   products  – the catalogue copy the till searches when there is no connection   (key: id)
 *   queue     – writes waiting to be uploaded: sales, ...                           (key: id)
 *   meta      – small key/value data: receipt counter, last catalogue sync, ...     (key: key)
 *
 * Every call resolves to a safe value instead of throwing when IndexedDB is unavailable
 * (private window, blocked storage): the kassa then simply behaves as an online-only till.
 */

const DB_NAME = "korgen-till";
const DB_VERSION = 1;

export type StoreName = "products" | "queue" | "meta";

let dbPromise: Promise<IDBDatabase | null> | null = null;

export function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("products")) {
          const products = db.createObjectStore("products", { keyPath: "id" });
          products.createIndex("barcode", "barcode", { unique: false });
        }
        if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", { keyPath: "id" });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function idbPut<T>(store: StoreName, value: T): Promise<boolean> {
  try {
    const db = await openDb();
    if (!db) return false;
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    await finished(tx);
    return true;
  } catch {
    return false;
  }
}

/** Write many rows in one transaction (catalogue download). */
export async function idbPutMany<T>(store: StoreName, values: T[]): Promise<boolean> {
  try {
    const db = await openDb();
    if (!db) return false;
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    for (const v of values) os.put(v);
    await finished(tx);
    return true;
  } catch {
    return false;
  }
}

export async function idbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  try {
    const db = await openDb();
    if (!db) return undefined;
    return (await done(db.transaction(store).objectStore(store).get(key))) as T | undefined;
  } catch {
    return undefined;
  }
}

export async function idbGetAll<T>(store: StoreName): Promise<T[]> {
  try {
    const db = await openDb();
    if (!db) return [];
    return (await done(db.transaction(store).objectStore(store).getAll())) as T[];
  } catch {
    return [];
  }
}

export async function idbDelete(store: StoreName, key: IDBValidKey): Promise<boolean> {
  try {
    const db = await openDb();
    if (!db) return false;
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    await finished(tx);
    return true;
  } catch {
    return false;
  }
}

export async function idbClear(store: StoreName): Promise<boolean> {
  try {
    const db = await openDb();
    if (!db) return false;
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).clear();
    await finished(tx);
    return true;
  } catch {
    return false;
  }
}

export async function idbCount(store: StoreName): Promise<number> {
  try {
    const db = await openDb();
    if (!db) return 0;
    return await done(db.transaction(store).objectStore(store).count());
  } catch {
    return 0;
  }
}

/**
 * Read-modify-write one row atomically (a single readwrite transaction), e.g. the receipt counter:
 * two tabs asking for a number at the same moment can never receive the same one.
 */
export async function idbUpdate<T>(store: StoreName, key: IDBValidKey, fn: (current: T | undefined) => T): Promise<T | undefined> {
  try {
    const db = await openDb();
    if (!db) return undefined;
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    const current = (await done(os.get(key))) as T | undefined;
    const next = fn(current);
    os.put(next);
    await finished(tx);
    return next;
  } catch {
    return undefined;
  }
}
