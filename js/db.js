const DB_NAME = "hirelens";
const STORE = "saved";
const LS_KEY = "hirelens:saved";

function openDB() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) return reject(new Error("No IndexedDB"));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, run) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = run(t.objectStore(STORE));
    t.oncomplete = () => resolve(result?.result);
    t.onerror = () => reject(t.error);
  });
}

function lsRead() {
  try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) || "[]")); }
  catch { return new Set(); }
}
function lsWrite(ids) {
  try { localStorage.setItem(LS_KEY, JSON.stringify([...ids])); } catch { }
}

export async function createSavedJobsDB() {
  let db = null;
  try { db = await openDB(); } catch { }

  return {
    backend: db ? "IndexedDB" : "localStorage",
    async all() {
      if (!db) return lsRead();
      const rows = await tx(db, "readonly", (s) => s.getAll());
      return new Set((rows || []).map((r) => r.id));
    },
    async add(id) {
      if (!db) { const s = lsRead(); s.add(id); return lsWrite(s); }
      await tx(db, "readwrite", (s) => s.put({ id, savedAt: Date.now() }));
    },
    async remove(id) {
      if (!db) { const s = lsRead(); s.delete(id); return lsWrite(s); }
      await tx(db, "readwrite", (s) => s.delete(id));
    },
  };
}
