export function createStore(initialState) {
  let state = initialState;
  const listeners = new Set();

  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === "function" ? patch(state) : { ...state, ...patch };
      if (next === state) return;
      const prev = state;
      state = next;
      listeners.forEach((fn) => fn(state, prev));
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
