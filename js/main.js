import { createStore } from "./store.js";
import { createSavedJobsDB } from "./db.js";
import { debounce, hydrateJobs, filterJobs, filtersToQuery, queryToFilters, DEFAULT_FILTERS } from "./utils.js";
import { jobRow, feedItem, skeletons, emptyState, jobDetail } from "./render.js";

const PAGE_SIZE = 10;
const $ = (sel, root = document) => root.querySelector(sel);

const els = {
  form: $("#filters"),
  search: $("#q"),
  list: $("#results"),
  count: $("#result-count"),
  sentinel: $("#sentinel"),
  feed: $("#feed"),
  todayCount: $("#today-count"),
  dialog: $("#job-dialog"),
  dialogBody: $("#dialog-body"),
  toast: $("#toast"),
  offline: $("#offline-banner"),
  savedCount: $("#saved-count"),
  theme: $("#theme-toggle"),
  filterToggle: $("#filter-toggle"),
  sidebar: $("#sidebar"),
};

const store = createStore({
  jobs: [],
  saved: new Set(),
  filters: queryToFilters(location.search),
  visible: PAGE_SIZE,
  status: "loading",
});

let db;
let lastTrigger = null;

async function loadJobs() {
  store.set({ status: "loading" });
  try {
    const res = await fetch("data/jobs.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { jobs } = await res.json();
    store.set({ jobs: hydrateJobs(jobs), status: "ready" });
  } catch (err) {
    console.error(err);
    store.set({ status: "error" });
  }
}

let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

function renderFeed(jobs, now) {
  const newest = filterJobs(jobs, {}, { now }).slice(0, 5);
  els.feed.innerHTML = newest.map((j) => feedItem(j, now)).join("");
  const today = jobs.filter((j) => now - new Date(j.postedAt).getTime() <= 86_400_000).length;
  els.todayCount.textContent = today;
}

function render() {
  const { jobs, saved, filters, visible, status } = store.get();
  els.savedCount.textContent = saved.size;
  els.savedCount.hidden = saved.size === 0;

  if (status === "loading") {
    els.list.setAttribute("aria-busy", "true");
    els.list.innerHTML = skeletons();
    els.feed.innerHTML = skeletons(4);
    return;
  }
  els.list.removeAttribute("aria-busy");
  if (status === "error") {
    els.list.innerHTML = `<li class="empty"><h3>Jobs didn't load</h3><p>Check your connection, then try again.</p><button class="btn" data-action="retry">Try again</button></li>`;
    els.count.textContent = "Jobs didn't load";
    return;
  }

  const now = Date.now();
  renderFeed(jobs, now);

  const matches = filterJobs(jobs, filters, { savedIds: saved, now });
  const active = document.activeElement;
  const focusId = els.list.contains(active) ? active.closest(".job")?.dataset.id : null;
  const focusAction = focusId ? active.dataset.action : null;
  els.list.innerHTML = matches.length
    ? matches.slice(0, visible).map((j) => jobRow(j, saved.has(j.id), now)).join("")
    : emptyState(filters.saved);
  els.count.textContent = `${matches.length} ${matches.length === 1 ? "job" : "jobs"}`;
  if (focusId) els.list.querySelector(`[data-id="${CSS.escape(focusId)}"] [data-action="${focusAction}"]`)?.focus();
  els.sentinel.hidden = visible >= matches.length;
  if (!els.sentinel.hidden) rearmPager();
}

function syncFormFromState() {
  const { filters } = store.get();
  for (const [key, value] of Object.entries(filters)) {
    const field = els.form.elements[key];
    if (!field) continue;
    if (field.type === "checkbox") field.checked = value;
    else field.value = value;
  }
  syncChips();
}

function setFilters(patch) {
  const filters = { ...store.get().filters, ...patch };
  store.set({ filters, visible: PAGE_SIZE });
  history.replaceState(null, "", location.pathname + filtersToQuery(filters) + location.hash);
  syncChips();
}

function syncChips() {
  const q = store.get().filters.q.toLowerCase();
  document.querySelectorAll("[data-chip]").forEach((chip) =>
    chip.setAttribute("aria-pressed", String(q === chip.dataset.chip.toLowerCase())));
}

function resetFilters() {
  store.set({ filters: { ...DEFAULT_FILTERS }, visible: PAGE_SIZE });
  history.replaceState(null, "", location.pathname + location.hash);
  syncFormFromState();
}

const onSearch = debounce((value) => setFilters({ q: value.trim() }), 250);

document.addEventListener("input", (ev) => {
  const field = ev.target;
  if (field.form !== els.form || !field.name) return;
  if (field.name === "q") return onSearch(field.value);
  setFilters({ [field.name]: field.type === "checkbox" ? field.checked : field.value });
});
els.form.addEventListener("submit", (ev) => ev.preventDefault());
$("#hero-search").addEventListener("submit", (ev) => {
  ev.preventDefault();
  onSearch.cancel();
  setFilters({ q: els.search.value.trim() });
  $("#jobs").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
});

document.addEventListener("click", (ev) => {
  const chip = ev.target.closest("[data-chip]");
  if (chip) {
    const value = chip.getAttribute("aria-pressed") === "true" ? "" : chip.dataset.chip;
    els.search.value = value;
    setFilters({ q: value });
    return;
  }
  const feedLink = ev.target.closest("[data-open]");
  if (feedLink) openDetail(feedLink.dataset.open, feedLink);
});

async function toggleSave(id) {
  const prev = store.get().saved;
  const next = new Set(prev);
  const adding = !next.has(id);
  adding ? next.add(id) : next.delete(id);
  store.set({ saved: next });

  try {
    await (adding ? db.add(id) : db.remove(id));
    toast(adding ? "Job saved" : "Job removed from saved");
  } catch (err) {
    console.error(err);
    store.set({ saved: prev });
    toast("Saved jobs couldn't be updated");
  }
  if (els.dialog.open) openDetail(id, lastTrigger);
}

function openDetail(id, trigger) {
  const job = store.get().jobs.find((j) => j.id === id);
  if (!job) return;
  lastTrigger = trigger;
  els.dialogBody.innerHTML = jobDetail(job, store.get().saved.has(id));
  if (!els.dialog.open) els.dialog.showModal();
}
els.dialog.addEventListener("close", () => lastTrigger?.focus());
els.dialog.addEventListener("click", (ev) => {
  if (ev.target === els.dialog) return els.dialog.close();
  const btn = ev.target.closest("[data-action]");
  if (!btn) return;
  if (btn.dataset.action === "close") els.dialog.close();
  if (btn.dataset.action === "save") toggleSave(btn.dataset.id);
  if (btn.dataset.action === "apply") toast("Demo build: applications open on the employer's site");
});

els.list.addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-action]");
  if (!btn) return;
  const id = btn.closest(".job")?.dataset.id;
  switch (btn.dataset.action) {
    case "open": return openDetail(id, btn);
    case "save": return toggleSave(id);
    case "retry": return loadJobs();
    case "reset": return resetFilters();
  }
});
$("#clear-filters").addEventListener("click", resetFilters);

const pager = new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting && store.get().status === "ready" && !els.sentinel.hidden) {
    store.set((s) => ({ ...s, visible: s.visible + PAGE_SIZE }));
  }
}, { rootMargin: "400px" });

function rearmPager() {
  pager.unobserve(els.sentinel);
  pager.observe(els.sentinel);
}

els.filterToggle.addEventListener("click", () => {
  const open = els.filterToggle.getAttribute("aria-expanded") !== "true";
  els.filterToggle.setAttribute("aria-expanded", String(open));
  els.sidebar.classList.toggle("is-open", open);
});

document.addEventListener("keydown", (ev) => {
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
  if (ev.key === "/" && !typing && !els.dialog.open) {
    ev.preventDefault();
    els.search.focus();
  }
});

let toastTimer;
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("is-visible"), 2400);
}

function updateOnline() {
  els.offline.hidden = navigator.onLine;
}
addEventListener("online", updateOnline);
addEventListener("offline", updateOnline);

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  els.theme.setAttribute("aria-pressed", String(theme === "dark"));
  try { localStorage.setItem("hirelens:theme", theme); } catch {}
}
els.theme.addEventListener("click", () =>
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));

(async function init() {
  let theme = null;
  try { theme = localStorage.getItem("hirelens:theme"); } catch {}
  applyTheme(theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

  $("#year").textContent = new Date().getFullYear();
  store.subscribe(scheduleRender);
  syncFormFromState();
  updateOnline();
  render();

  db = await createSavedJobsDB();
  store.set({ saved: await db.all() });
  await loadJobs();

  setInterval(scheduleRender, 60_000);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((err) => console.warn("Service worker registration failed", err));
  }
})();
