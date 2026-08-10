const DB_NAME = "gdt-invoice-ext";
const DB_VERSION = 1;
const STORE = "files";
const KEY = "latest-zip";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveZipBlob(blob, filename) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ blob, filename, createdAt: Date.now() }, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function takeZipBlob() {
  const db = await openDb();
  try {
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const getReq = store.get(KEY);
      getReq.onsuccess = () => {
        store.delete(KEY);
        resolve(getReq.result || null);
      };
      getReq.onerror = () => reject(getReq.error);
    });
    return record;
  } finally {
    db.close();
  }
}
