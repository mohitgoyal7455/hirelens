const DB_NAME = "hirelens";
const DB_VERSION = 1;
const STORE_NAME = "saved";
const FALLBACK_KEY = "hirelens:saved";

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB blocked"));
  });
}

function runTransaction(database, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("Transaction aborted"));
  });
}

function readFallback() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FALLBACK_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeFallback(ids) {
  localStorage.setItem(FALLBACK_KEY, JSON.stringify([...ids]));
}

function createFallbackBackend() {
  return {
    backend: "localStorage",
    async all() {
      return readFallback();
    },
    async add(id) {
      const ids = readFallback();
      ids.add(id);
      writeFallback(ids);
    },
    async remove(id) {
      const ids = readFallback();
      ids.delete(id);
      writeFallback(ids);
    },
  };
}

function createIndexedBackend(database) {
  return {
    backend: "IndexedDB",
    async all() {
      const rows = await runTransaction(database, "readonly", (store) => store.getAll());
      return new Set((rows || []).map((row) => row.id));
    },
    async add(id) {
      await runTransaction(database, "readwrite", (store) => store.put({ id, savedAt: Date.now() }));
    },
    async remove(id) {
      await runTransaction(database, "readwrite", (store) => store.delete(id));
    },
  };
}

export async function createSavedJobsDB() {
  try {
    const database = await openDatabase();
    const indexed = createIndexedBackend(database);
    const legacy = readFallback();
    if (legacy.size) {
      await Promise.all([...legacy].map((id) => indexed.add(id)));
      try {
        localStorage.removeItem(FALLBACK_KEY);
      } catch {
        return indexed;
      }
    }
    return indexed;
  } catch {
    return createFallbackBackend();
  }
}
