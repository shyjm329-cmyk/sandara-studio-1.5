
import { GalleryItem } from "../App";
import { PendingOperation } from "../types";

const DB_NAME = 'SandaraStudioDB';
const STORE_NAME = 'gallery';
const OPS_STORE = 'pending_operations';
const DB_VERSION = 2;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event: any) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(OPS_STORE)) {
        db.createObjectStore(OPS_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

/**
 * 갤러리 아이템 저장 (IndexedDB)
 */
export const saveGalleryItem = async (item: GalleryItem): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  return new Promise((resolve, reject) => {
    const request = store.put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * 모든 갤러리 아이템 로드
 */
export const loadGalleryItems = async (): Promise<GalleryItem[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const items = request.result as GalleryItem[];
      resolve(items.sort((a, b) => b.timestamp - a.timestamp));
    };
    request.onerror = () => reject(request.error);
  });
};

/**
 * 아이템 영구 삭제
 */
export const deleteGalleryItem = async (id: string): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const savePendingOperation = async (op: PendingOperation): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction(OPS_STORE, 'readwrite');
  tx.objectStore(OPS_STORE).put(op);
};

export const loadPendingOperations = async (): Promise<PendingOperation[]> => {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(OPS_STORE, 'readonly');
    const request = tx.objectStore(OPS_STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve([]);
  });
};

export const deletePendingOperation = async (id: string): Promise<void> => {
  const db = await openDB();
  const tx = db.transaction(OPS_STORE, 'readwrite');
  tx.objectStore(OPS_STORE).delete(id);
};
