import { IDB_NAME, IDB_VERSION, REVISIONES_TABLE } from "@/lib/constants";

export const IDB_STORES = {
  revisiones: REVISIONES_TABLE,
  syncQueue: "sync_queue",
  snapshots: "snapshots",
} as const;

const STORAGE_TIMEOUT_MS = 2500;

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("El almacenamiento local no respondió"));
      try { request.transaction?.abort(); } catch { /* Already completed. */ }
    }, STORAGE_TIMEOUT_MS);
    request.onsuccess = () => { clearTimeout(timer); resolve(request.result); };
    request.onerror = () => { clearTimeout(timer); reject(request.error ?? new Error("IndexedDB")); };
  });
}

export function openAppDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    let settled = false;
    const fail = (error: Error | DOMException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error("El almacenamiento local no respondió")), STORAGE_TIMEOUT_MS);
    request.onblocked = () => fail(new Error("El almacenamiento local está ocupado en otra pestaña"));

    request.onupgradeneeded = () => {
      if (settled) { request.transaction?.abort(); return; }
      const db = request.result;

      if (!db.objectStoreNames.contains(IDB_STORES.snapshots)) {
        db.createObjectStore(IDB_STORES.snapshots, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(IDB_STORES.revisiones)) {
        db.createObjectStore(IDB_STORES.revisiones, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(IDB_STORES.syncQueue)) {
        db.createObjectStore(IDB_STORES.syncQueue, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };

    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      settled = true;
      clearTimeout(timer);
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () =>
      fail(request.error ?? new Error("No se pudo abrir IndexedDB"));
  });
}

export async function idbPut<T>(storeName: string, value: T): Promise<void> {
  const db = await openAppDatabase();
  try {
    const tx = db.transaction(storeName, "readwrite");
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("No se pudo confirmar el guardado local"));
        try { tx.abort(); } catch { /* Already completed. */ }
      }, STORAGE_TIMEOUT_MS);
      const fail = () => { clearTimeout(timer); reject(tx.error ?? new Error("IndexedDB put")); };
      tx.oncomplete = () => { clearTimeout(timer); resolve(); };
      tx.onerror = fail;
      tx.onabort = fail;
      try { tx.objectStore(storeName).put(value); }
      catch (error) { clearTimeout(timer); reject(error); }
    });
  } finally { db.close(); }
}

export async function idbGet<T>(
  storeName: string,
  key: IDBValidKey,
): Promise<T | undefined> {
  const db = await openAppDatabase();
  try {
    const tx = db.transaction(storeName, "readonly");
    return await requestToPromise(tx.objectStore(storeName).get(key) as IDBRequest<T | undefined>);
  } finally { db.close(); }
}

export async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openAppDatabase();
  try {
    const tx = db.transaction(storeName, "readonly");
    return await requestToPromise(tx.objectStore(storeName).getAll() as IDBRequest<T[]>);
  } finally { db.close(); }
}
