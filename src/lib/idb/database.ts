import { IDB_NAME, IDB_VERSION, REVISIONES_TABLE } from "@/lib/constants";

export const IDB_STORES = {
  revisiones: REVISIONES_TABLE,
  syncQueue: "sync_queue",
  snapshots: "snapshots",
} as const;

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB"));
  });
}

export function openAppDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);

    request.onupgradeneeded = () => {
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
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () =>
      reject(request.error ?? new Error("No se pudo abrir IndexedDB"));
  });
}

export async function idbPut<T>(storeName: string, value: T): Promise<void> {
  const db = await openAppDatabase();
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).put(value);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB put"));
  });
  db.close();
}

export async function idbGet<T>(
  storeName: string,
  key: IDBValidKey,
): Promise<T | undefined> {
  const db = await openAppDatabase();
  const tx = db.transaction(storeName, "readonly");
  const result = await requestToPromise(
    tx.objectStore(storeName).get(key) as IDBRequest<T | undefined>,
  );
  db.close();
  return result;
}

export async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openAppDatabase();
  const tx = db.transaction(storeName, "readonly");
  const result = await requestToPromise(
    tx.objectStore(storeName).getAll() as IDBRequest<T[]>,
  );
  db.close();
  return result;
}
