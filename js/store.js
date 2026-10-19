export function createStore(initialState) {
  let state = initialState;
  const listeners = new Set();

  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === "function" ? patch(state) : { ...state, ...patch };
      if (next === state) return;
      const previous = state;
      state = next;
      for (const listener of listeners) listener(state, previous);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function storageFrom(storageGetter) {
  try {
    return typeof storageGetter === "function" ? storageGetter() : storageGetter;
  } catch {
    return null;
  }
}

export function readText(storage, key, fallback = "") {
  try {
    const value = storageFrom(storage)?.getItem(key);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeText(storage, key, value) {
  try {
    storageFrom(storage)?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function readJSON(storage, key, fallback) {
  try {
    const raw = storageFrom(storage)?.getItem(key);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(fallback) && !Array.isArray(parsed) ? fallback : parsed;
  } catch {
    return fallback;
  }
}

export function writeJSON(storage, key, value) {
  return writeText(storage, key, JSON.stringify(value));
}
