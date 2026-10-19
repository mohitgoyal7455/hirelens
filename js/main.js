import {
  debounce,
  DEFAULT_FILTERS,
  filterJobs,
  filtersToQuery,
  formatCount,
  fuzzyMatch,
  hydrateJobs,
  queryToFilters,
  SALARY_CAP,
  timeAgo,
} from "./utils.js";
import { createStore, readJSON, writeJSON, readText, writeText } from "./store.js";
import { createSavedJobsDB } from "./db.js";
import * as view from "./render.js";

const PAGE_SIZE = 10;
const MAX_COMPARE = 3;
const MAX_RECENT = 6;
const MAX_TOASTS = 3;
const TOAST_MS = 3500;
const PEEK_DELAY_MS = 350;
const COUNT_UP_MS = 700;
const STAGGER_MS = 28;
const STAGGER_CAP = 8;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
const EASE_SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";
const DUR_1 = 140;
const DUR_2 = 220;
const DUR_3 = 380;

const STORAGE = {
  theme: "hirelens:theme",
  recent: "hirelens:recent",
  lastVisit: "hirelens:lastVisit",
  compare: "hirelens:compare",
  bannerDismissed: "hirelens:newBannerDismissed",
};

const byId = (id) => document.getElementById(id);
const root = document.documentElement;

const els = {
  offlineBanner: byId("offline-banner"),
  savedToggle: byId("saved-toggle"),
  savedCount: byId("saved-count"),
  paletteTrigger: byId("palette-trigger"),
  paletteHint: byId("palette-hint"),
  themeToggle: byId("theme-toggle"),
  heroCount: byId("hero-count"),
  searchForm: byId("search-form"),
  searchInput: byId("search-input"),
  popularChips: [...document.querySelectorAll(".popular-chip")],
  justPosted: byId("just-posted"),
  recent: byId("recent"),
  recentList: byId("recent-list"),
  roles: byId("roles"),
  resultNum: byId("result-count-num"),
  resultLabel: byId("result-count-label"),
  filtersToggle: byId("filters-toggle"),
  filtersCount: byId("filters-count"),
  sortSelect: byId("sort-select"),
  newBanner: byId("new-banner"),
  newBannerText: byId("new-banner-text"),
  newBannerShow: byId("new-banner-show"),
  newBannerDismiss: byId("new-banner-dismiss"),
  chipsWrap: byId("chips-wrap"),
  chips: byId("chips"),
  filters: byId("filters"),
  filtersForm: byId("filters-form"),
  locationSelect: byId("location-select"),
  typeSelect: byId("type-select"),
  departmentSelect: byId("department-select"),
  clearFilters: byId("clear-filters"),
  panel: byId("board-panel"),
  list: byId("job-list"),
  boardState: byId("board-state"),
  sentinel: byId("sentinel"),
  boardEnd: byId("board-end"),
  installButton: byId("install-button"),
  shortcutsButton: byId("shortcuts-button"),
  comparePill: byId("compare-pill"),
  comparePillStack: byId("compare-pill-stack"),
  comparePillLabel: byId("compare-pill-label"),
  jobDialog: byId("job-dialog"),
  jobDialogBody: byId("job-dialog-body"),
  palette: byId("palette"),
  paletteInput: byId("palette-input"),
  paletteList: byId("palette-list"),
  shortcuts: byId("shortcuts"),
  shortcutList: byId("shortcut-list"),
  drawer: byId("compare-drawer"),
  compareBody: byId("compare-body"),
  toasts: byId("toasts"),
  peek: byId("peek"),
  year: byId("year"),
};

const reducedMotionQuery = matchMedia("(prefers-reduced-motion: reduce)");
const darkSchemeQuery = matchMedia("(prefers-color-scheme: dark)");
const hoverPeekQuery = matchMedia("(hover: hover) and (pointer: fine) and (min-width: 960px)");
const standaloneQuery = matchMedia("(display-mode: standalone)");
const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.userAgentData?.platform || navigator.platform || navigator.userAgent);
const prefersReducedMotion = () => reducedMotionQuery.matches;

const store = createStore({
  status: "loading",
  jobs: [],
  filters: queryToFilters(location.search),
  savedIds: new Set(),
  compareIds: readJSON(() => sessionStorage, STORAGE.compare, []),
  recentIds: readJSON(() => localStorage, STORAGE.recent, []),
  visibleCount: PAGE_SIZE,
  now: Date.now(),
  activeJobId: null,
});

const jobsById = new Map();
const revealedBars = new Set();
const mountedRows = new Set();
let savedDB = null;
let deferredInstallPrompt = null;
let resultsCache = { key: null, value: [] };
let panelHeightAnimation = null;

function getResults() {
  const { jobs, filters, savedIds, now } = store.get();
  const key = [jobs, filters, savedIds, now];
  const cached = resultsCache.key;
  if (cached && cached.every((part, index) => part === key[index])) return resultsCache.value;
  const value = filterJobs(jobs, filters, { savedIds, now });
  resultsCache = { key, value };
  return value;
}

let pendingRender = null;

function requestRender(parts) {
  if (!pendingRender) {
    pendingRender = {};
    requestAnimationFrame(flushRender);
  }
  for (const [part, options] of Object.entries(parts)) {
    const previous = pendingRender[part];
    if (part === "list" && previous) {
      pendingRender.list = { flip: previous.flip || options.flip, append: previous.append && options.append };
    } else {
      pendingRender[part] = options;
    }
  }
}

function flushRender() {
  const parts = pendingRender;
  pendingRender = null;
  if (parts.controls) renderControls();
  if (parts.chips) renderChips();
  if (parts.list) renderList(parts.list);
  if (parts.count) renderResultCount();
  if (parts.saved) renderSavedCount(parts.saved);
  if (parts.hero) renderHero(parts.hero);
  if (parts.recent) renderRecent();
  if (parts.compare) renderCompare();
}

function syncURL() {
  const { filters, activeJobId } = store.get();
  const params = new URLSearchParams(filtersToQuery(filters));
  if (activeJobId) params.set("job", activeJobId);
  const query = params.toString();
  const next = `${location.pathname}${query ? `?${query}` : ""}${location.hash}`;
  if (next !== `${location.pathname}${location.search}${location.hash}`) history.replaceState(history.state, "", next);
}

function setFilters(patch, { scroll = false } = {}) {
  const current = store.get().filters;
  const filters = { ...current, ...patch };
  const changed = Object.keys(filters).some((key) => filters[key] !== current[key]);
  if (!changed) return;
  store.set({ filters, visibleCount: PAGE_SIZE });
  document.dispatchEvent(new CustomEvent("hl:feedback", { detail: "filter" }));
  syncURL();
  requestRender({ controls: true, chips: true, list: { flip: true }, count: true });
  if (scroll) scrollToRoles();
}

function clearAllFilters() {
  els.searchInputDebounced?.cancel();
  setFilters({ ...DEFAULT_FILTERS });
}

function scrollToRoles() {
  const top = els.roles.getBoundingClientRect().top;
  if (top < 0 || top > innerHeight * 0.6) {
    els.roles.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }
}

function activeFilterChips(filters) {
  const chips = [];
  if (filters.q) chips.push({ key: "q", label: filters.q, prefix: "Search" });
  if (filters.within) chips.push({ key: "within", label: view.WITHIN_LABELS[filters.within], prefix: "Posted" });
  if (filters.location) chips.push({ key: "location", label: filters.location, prefix: "Location" });
  if (filters.type) chips.push({ key: "type", label: filters.type, prefix: "Type" });
  if (filters.department) chips.push({ key: "department", label: filters.department, prefix: "Team" });
  if (filters.salaryMin > 0 || filters.salaryMax < SALARY_CAP) {
    const top = filters.salaryMax >= SALARY_CAP ? `${SALARY_CAP}+` : filters.salaryMax;
    chips.push({ key: "salary", label: `₹${filters.salaryMin}–${top} LPA`, prefix: "Pay" });
  }
  if (filters.saved) chips.push({ key: "saved", label: "Saved only", prefix: "" });
  if (filters.sort !== DEFAULT_FILTERS.sort) chips.push({ key: "sort", label: "Highest pay", prefix: "Sort" });
  return chips;
}

function renderControls() {
  const { filters } = store.get();
  if (document.activeElement !== els.searchInput && els.searchInput.value !== filters.q) {
    els.searchInput.value = filters.q;
  }
  els.sortSelect.value = filters.sort;
  els.locationSelect.value = filters.location;
  els.typeSelect.value = filters.type;
  els.departmentSelect.value = filters.department;
  const radio = els.filtersForm.querySelector(`input[name="within"][value="${filters.within}"]`);
  if (radio) radio.checked = true;
  els.savedToggle.setAttribute("aria-pressed", String(filters.saved));
  const terms = filters.q.toLowerCase();
  for (const chip of els.popularChips) {
    const pressed = chip.dataset.type
      ? filters.type === chip.dataset.type
      : containsPhrase(terms, chip.dataset.term.toLowerCase());
    chip.setAttribute("aria-pressed", String(pressed));
  }
  syncSalaryControls(filters);
  const filterCount = ["location", "type", "department", "within"].filter((key) => filters[key]).length + (filters.salaryMin > 0 || filters.salaryMax < SALARY_CAP ? 1 : 0);
  els.filtersCount.hidden = filterCount === 0;
  els.filtersCount.textContent = String(filterCount);
}

function syncSalaryControls(filters) {
  const low = byId("salary-min");
  const high = byId("salary-max");
  if (!low || !high) return;
  low.value = filters.salaryMin;
  high.value = filters.salaryMax;
  const top = filters.salaryMax >= SALARY_CAP ? `${SALARY_CAP}+` : filters.salaryMax;
  byId("salary-out").textContent = `₹${filters.salaryMin} – ${top} LPA`;
  const track = byId("salary-track");
  track.style.setProperty("--a", `${(filters.salaryMin / SALARY_CAP) * 100}%`);
  track.style.setProperty("--b", `${(filters.salaryMax / SALARY_CAP) * 100}%`);
  for (const chip of els.filtersForm.querySelectorAll("[data-chip-type]")) {
    chip.setAttribute("aria-pressed", String(filters.type === chip.dataset.chipType));
  }
  const remote = els.filtersForm.querySelector("[data-chip-remote]");
  if (remote) remote.setAttribute("aria-pressed", String(filters.location === "Remote"));
}

function containsPhrase(text, phrase) {
  return ` ${text} `.includes(` ${phrase} `);
}

function togglePopularTerm(term) {
  const { q } = store.get().filters;
  const lower = q.toLowerCase();
  const phrase = term.toLowerCase();
  const next = containsPhrase(lower, phrase)
    ? ` ${q} `.replace(new RegExp(` ${escapeRegExp(term)} `, "i"), " ").trim().replace(/\s+/g, " ")
    : `${q} ${term}`.trim();
  els.searchInputDebounced.cancel();
  els.searchInput.value = next;
  setFilters({ q: next }, { scroll: true });
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderChips() {
  const chips = activeFilterChips(store.get().filters);
  if (chips.length >= 2) chips.push({ key: "__clear", label: "Clear all", prefix: "" });
  const wanted = new Set(chips.map((chip) => chip.key));
  const existing = new Map();
  for (const node of els.chips.children) {
    if (!node.classList.contains("is-leaving")) existing.set(node.dataset.key, node);
  }
  for (const [key, node] of existing) {
    if (!wanted.has(key)) removeWithAnimation(node, "is-leaving");
  }
  let anchor = null;
  for (const chip of [...chips].reverse()) {
    let node = existing.get(chip.key);
    const html = view.chipHTML(chip);
    if (node) {
      if (node.dataset.html !== html) {
        node.innerHTML = view.chipInnerHTML(chip);
        node.dataset.html = html;
      }
    } else {
      const template = document.createElement("template");
      template.innerHTML = html;
      node = template.content.firstElementChild;
      node.dataset.html = html;
      node.classList.add("is-entering");
      node.addEventListener("animationend", () => node.classList.remove("is-entering"), { once: true });
      els.chips.insertBefore(node, anchor);
    }
    anchor = node;
  }
  els.chipsWrap.dataset.open = String(chips.length > 0);
}

function removeWithAnimation(node, className) {
  if (prefersReducedMotion()) {
    node.remove();
    return;
  }
  node.classList.add(className);
  const fallback = setTimeout(() => node.remove(), DUR_3 + 80);
  node.addEventListener("animationend", () => {
    clearTimeout(fallback);
    node.remove();
  }, { once: true });
}

function rowContext(job, state) {
  const context = {
    now: state.now,
    saved: state.savedIds.has(job.id),
    compared: state.compareIds.includes(job.id),
    revealed: revealedBars.has(job.id),
    mounting: !mountedRows.has(job.id),
  };
  mountedRows.add(job.id);
  return context;
}

function captureListFocus() {
  const active = document.activeElement;
  if (!active || !els.list.contains(active)) return null;
  const row = active.closest("[data-id]");
  if (!row) return null;
  return {
    id: row.dataset.id,
    action: active.dataset.action || "open",
    index: [...els.list.children].indexOf(row),
  };
}

function restoreListFocus(memo) {
  if (!memo) return;
  const row = els.list.querySelector(`[data-id="${CSS.escape(memo.id)}"]`)
    || els.list.children[Math.min(memo.index, els.list.children.length - 1)];
  const target = row?.querySelector(`[data-action="${memo.action}"]`) || row?.querySelector(".row__open");
  if (target) target.focus({ preventScroll: true });
  else els.searchInput.focus({ preventScroll: true });
}

function renderList({ flip = false, append = false } = {}) {
  const state = store.get();
  if (state.status !== "ready") return;
  const results = getResults();
  const visible = results.slice(0, state.visibleCount);
  const animate = flip && !append && !prefersReducedMotion();

  const focusMemo = captureListFocus();
  const firstRects = new Map();
  const oldNodes = new Map();
  let panelRect = null;
  if (animate) {
    panelRect = els.panel.getBoundingClientRect();
    for (const node of els.list.children) {
      if (!node.dataset.id) continue;
      oldNodes.set(node.dataset.id, node);
      firstRects.set(node.dataset.id, node.getBoundingClientRect());
    }
  }

  hidePeek();
  els.list.setAttribute("aria-busy", "false");
  let appendedNodes = [];
  if (append) {
    const start = els.list.children.length;
    els.list.insertAdjacentHTML("beforeend", visible.slice(start).map((job) => view.jobRowHTML(job, rowContext(job, state))).join(""));
    appendedNodes = [...els.list.children].slice(start);
  } else {
    els.list.innerHTML = visible.map((job) => view.jobRowHTML(job, rowContext(job, state))).join("");
  }
  renderBoardState(results.length === 0);
  els.boardEnd.hidden = results.length === 0 || visible.length < results.length;
  observeBars();
  rearmSentinel();
  restoreListFocus(focusMemo);

  if (append) {
    if (!prefersReducedMotion()) appendedNodes.forEach((node, index) => animateEnter(node, Math.min(index, STAGGER_CAP) * STAGGER_MS));
    return;
  }
  if (!animate) return;

  const viewportBottom = innerHeight;
  const measured = [];
  for (const node of els.list.children) {
    const first = firstRects.get(node.dataset.id);
    measured.push({ node, first, last: node.getBoundingClientRect() });
  }
  const newPanelHeight = els.panel.getBoundingClientRect().height;

  let enterIndex = 0;
  for (const { node, first, last } of measured) {
    const onScreen = last.bottom > 0 && last.top < viewportBottom;
    if (first) {
      const deltaX = first.left - last.left;
      const deltaY = first.top - last.top;
      const wasOnScreen = first.bottom > 0 && first.top < viewportBottom;
      if ((deltaX || deltaY) && (onScreen || wasOnScreen)) animateMove(node, deltaX, deltaY);
    } else if (onScreen) {
      animateEnter(node, Math.min(enterIndex, STAGGER_CAP) * STAGGER_MS);
      enterIndex += 1;
    }
  }

  const keptIds = new Set(measured.map(({ node }) => node.dataset.id));
  for (const [id, node] of oldNodes) {
    if (keptIds.has(id)) continue;
    const rect = firstRects.get(id);
    if (rect.bottom < 0 || rect.top > viewportBottom) continue;
    animateGhost(node, rect, panelRect);
  }

  if (Math.abs(newPanelHeight - panelRect.height) > 1) {
    panelHeightAnimation?.cancel();
    els.panel.style.overflow = "clip";
    panelHeightAnimation = els.panel.animate(
      [{ height: `${panelRect.height}px` }, { height: `${newPanelHeight}px` }],
      { duration: DUR_3, easing: EASE_OUT },
    );
    const release = () => {
      els.panel.style.overflow = "";
      panelHeightAnimation = null;
    };
    panelHeightAnimation.onfinish = release;
    panelHeightAnimation.oncancel = release;
  }
}

function withWillChange(node, animation) {
  node.style.willChange = "transform, opacity";
  const release = () => {
    node.style.willChange = "";
  };
  animation.onfinish = release;
  animation.oncancel = release;
  return animation;
}

function animateMove(node, deltaX, deltaY) {
  return withWillChange(node, node.animate(
    [{ transform: `translate(${deltaX}px, ${deltaY}px)` }, { transform: "none" }],
    { duration: DUR_3, easing: EASE_OUT },
  ));
}

function animateEnter(node, delay) {
  return withWillChange(node, node.animate(
    [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }],
    { duration: DUR_3, easing: EASE_OUT, delay, fill: "backwards" },
  ));
}

function animateGhost(node, rect, panelRect) {
  node.setAttribute("aria-hidden", "true");
  node.inert = true;
  Object.assign(node.style, {
    position: "absolute",
    top: `${rect.top - panelRect.top}px`,
    left: `${rect.left - panelRect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
    zIndex: "0",
    pointerEvents: "none",
  });
  els.panel.append(node);
  const animation = withWillChange(node, node.animate(
    [{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(0.96)" }],
    { duration: DUR_2, easing: EASE_OUT, fill: "forwards" },
  ));
  animation.finished.then(() => node.remove(), () => node.remove());
}

function renderBoardState(isEmpty) {
  const { status, filters } = store.get();
  if (status === "error") {
    els.boardState.innerHTML = view.errorStateHTML({ offline: !navigator.onLine });
    els.boardState.hidden = false;
    return;
  }
  els.boardState.hidden = !isEmpty;
  if (isEmpty) els.boardState.innerHTML = view.emptyStateHTML({ savedOnly: filters.saved });
}

function renderResultCount() {
  const state = store.get();
  const total = state.status === "ready" ? getResults().length : 0;
  const text = formatCount(total);
  const label = `${total === 1 ? "job" : "jobs"}${state.filters.saved ? " saved" : ""}`;
  if (els.resultLabel.textContent !== label) els.resultLabel.textContent = label;
  if (els.resultNum.textContent === text) return;
  els.resultNum.textContent = text;
  if (!prefersReducedMotion()) {
    els.resultNum.animate(
      [{ opacity: 0, transform: "translateY(-4px)" }, { opacity: 1, transform: "none" }],
      { duration: DUR_2, easing: EASE_OUT },
    );
  }
}

function renderSavedCount({ punch = false } = {}) {
  const count = store.get().savedIds.size;
  els.savedCount.textContent = formatCount(count);
  els.savedCount.setAttribute("aria-label", `${count} saved ${count === 1 ? "job" : "jobs"}`);
  if (punch && !prefersReducedMotion()) {
    els.savedCount.animate(
      [{ transform: "scale(1)" }, { transform: "scale(1.25)", offset: 0.4 }, { transform: "scale(1)" }],
      { duration: DUR_3, easing: EASE_SPRING },
    );
  }
}

function renderHero({ countUp = false } = {}) {
  const { jobs, now } = store.get();
  const recentCount = jobs.filter((job) => now - job.postedAtMs <= DAY_MS).length;
  if (countUp) animateCount(els.heroCount, recentCount);
  else els.heroCount.textContent = formatCount(recentCount);
  const newest = [...jobs].sort((a, b) => b.postedAtMs - a.postedAtMs).slice(0, 5);
  els.justPosted.innerHTML = view.justPostedHTML(newest, now, { entering: countUp });
  els.justPosted.setAttribute("aria-busy", "false");
}

function animateCount(element, target) {
  if (prefersReducedMotion() || target === 0) {
    element.textContent = formatCount(target);
    return;
  }
  const start = performance.now();
  const easeOutCubic = (t) => 1 - (1 - t) ** 3;
  const step = (time) => {
    const progress = Math.min(1, (time - start) / COUNT_UP_MS);
    element.textContent = formatCount(Math.round(target * easeOutCubic(progress)));
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderRecent() {
  const { recentIds, now } = store.get();
  const jobs = recentIds.map((id) => jobsById.get(id)).filter(Boolean);
  els.recent.hidden = jobs.length === 0;
  els.recentList.innerHTML = view.recentChipsHTML(jobs, now);
}

function addRecent(id) {
  const { recentIds } = store.get();
  const next = [id, ...recentIds.filter((existing) => existing !== id)].slice(0, MAX_RECENT);
  store.set({ recentIds: next });
  writeJSON(() => localStorage, STORAGE.recent, next);
  requestRender({ recent: true });
}

const barObserver = "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-revealed");
      revealedBars.add(entry.target.dataset.bar);
      barObserver.unobserve(entry.target);
    }
  }, { rootMargin: "0px 0px -8% 0px" })
  : null;

function observeBars() {
  const bars = els.list.querySelectorAll("[data-bar]:not(.is-revealed)");
  for (const bar of bars) {
    if (barObserver) barObserver.observe(bar);
    else bar.classList.add("is-revealed");
  }
}

const sentinelObserver = "IntersectionObserver" in window
  ? new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    loadNextPage();
  }, { rootMargin: "0px 0px 480px 0px" })
  : null;

function rearmSentinel() {
  if (!sentinelObserver) return;
  sentinelObserver.unobserve(els.sentinel);
  sentinelObserver.observe(els.sentinel);
}

function loadNextPage() {
  const state = store.get();
  if (state.status !== "ready") return;
  const total = getResults().length;
  if (state.visibleCount >= total) return;
  store.set({ visibleCount: state.visibleCount + PAGE_SIZE });
  requestRender({ list: { append: true } });
}

function updateRowInPlace(id) {
  const row = els.list.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (!row) return;
  const state = store.get();
  const saved = state.savedIds.has(id);
  const saveButton = row.querySelector('[data-action="save"]');
  if (saveButton) {
    saveButton.setAttribute("aria-pressed", String(saved));
    saveButton.setAttribute("aria-label", view.saveLabel(jobsById.get(id), saved));
  }
  const compareInput = row.querySelector('[data-action="compare"]');
  if (compareInput) compareInput.checked = state.compareIds.includes(id);
}

function applySaved(id, saved) {
  const savedIds = new Set(store.get().savedIds);
  if (saved) savedIds.add(id);
  else savedIds.delete(id);
  store.set({ savedIds });
  updateRowInPlace(id);
  updateDetailSaveButton(id);
  const parts = { saved: { punch: true } };
  if (store.get().filters.saved) Object.assign(parts, { list: { flip: true }, count: true });
  requestRender(parts);
}

async function toggleSave(id, { reason = "user" } = {}) {
  const job = jobsById.get(id);
  if (!job || !savedDB) return;
  const wasSaved = store.get().savedIds.has(id);
  applySaved(id, !wasSaved);
  if (!wasSaved) document.dispatchEvent(new CustomEvent("hl:feedback", { detail: "save" }));
  try {
    if (wasSaved) await savedDB.remove(id);
    else await savedDB.add(id);
    if (reason === "undo") {
      toast({ message: wasSaved ? "Save undone" : "Restored to saved", icon: "check" });
      return;
    }
    toast({
      message: wasSaved ? `Removed “${job.title}”` : `Saved “${job.title}”`,
      icon: wasSaved ? "bookmark" : "check",
      action: { label: "Undo", run: () => toggleSave(id, { reason: "undo" }) },
    });
  } catch {
    applySaved(id, wasSaved);
    toast({
      message: wasSaved ? "Couldn't remove that job." : "Couldn't save that job.",
      tone: "error",
      icon: "x",
      action: { label: "Retry", run: () => toggleSave(id, { reason }) },
    });
  }
}

function toggleCompare(id, checked, input) {
  const { compareIds } = store.get();
  if (checked && compareIds.length >= MAX_COMPARE && !compareIds.includes(id)) {
    if (input) input.checked = false;
    toast({ message: `You can compare up to ${MAX_COMPARE} jobs`, icon: "columns" });
    return;
  }
  const next = checked
    ? [...new Set([...compareIds, id])]
    : compareIds.filter((existing) => existing !== id);
  store.set({ compareIds: next });
  writeJSON(() => sessionStorage, STORAGE.compare, next);
  updateRowInPlace(id);
  requestRender({ compare: true });
}

function renderCompare() {
  const { compareIds, now } = store.get();
  const jobs = compareIds.map((id) => jobsById.get(id)).filter(Boolean);
  const count = jobs.length;
  document.body.classList.toggle("has-compare", count > 0);
  if (count > 0) {
    els.comparePill.classList.remove("is-leaving");
    els.comparePill.hidden = false;
    els.comparePillStack.innerHTML = view.comparePillStackHTML(jobs);
    els.comparePillLabel.textContent = count === 1 ? "Compare 1 job" : `Compare ${count} jobs`;
  } else if (!els.comparePill.hidden && !els.comparePill.classList.contains("is-leaving")) {
    if (prefersReducedMotion()) {
      els.comparePill.hidden = true;
    } else {
      els.comparePill.classList.add("is-leaving");
      els.comparePill.addEventListener("animationend", () => {
        if (store.get().compareIds.length === 0) els.comparePill.hidden = true;
        els.comparePill.classList.remove("is-leaving");
      }, { once: true });
    }
  }
  if (els.drawer.open) {
    if (count === 0) closeDialog(els.drawer, { restoreFocus: false, fallbackFocus: els.list.querySelector(".row__open") });
    else els.compareBody.innerHTML = view.compareTableHTML(jobs, now);
  }
}

function openCompareDrawer(opener) {
  const { compareIds, now } = store.get();
  const jobs = compareIds.map((id) => jobsById.get(id)).filter(Boolean);
  if (!jobs.length) return;
  els.compareBody.innerHTML = view.compareTableHTML(jobs, now);
  openDialog(els.drawer, { opener });
}

const dialogKeyframes = {
  default: {
    enter: [{ opacity: 0, transform: "translateY(10px) scale(0.98)" }, { opacity: 1, transform: "none" }],
    exit: [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(6px) scale(0.98)" }],
  },
  side: {
    enter: [{ opacity: 0, transform: "translateX(56px)" }, { opacity: 1, transform: "none" }],
    exit: [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(56px)" }],
  },
  drawer: {
    enter: [{ opacity: 0, transform: "translateY(32px)" }, { opacity: 1, transform: "none" }],
    exit: [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(32px)" }],
  },
};

function keyframesFor(dialog) {
  if (dialog === els.jobDialog) return dialogKeyframes.side;
  return dialog === els.drawer ? dialogKeyframes.drawer : dialogKeyframes.default;
}

function animateBackdrop(dialog, entering) {
  try {
    dialog.animate(
      { opacity: entering ? [0, 1] : [1, 0] },
      { duration: entering ? DUR_3 : DUR_2, easing: EASE_OUT, pseudoElement: "::backdrop", fill: "forwards" },
    );
  } catch {
    return null;
  }
  return null;
}

function openDialog(dialog, { opener = document.activeElement, animate = true } = {}) {
  if (dialog.open) return;
  dialog.openerElement = opener instanceof HTMLElement ? opener : null;
  dialog.showModal();
  if (animate && !prefersReducedMotion()) {
    dialog.animate(keyframesFor(dialog).enter, { duration: DUR_3, easing: EASE_OUT });
    animateBackdrop(dialog, true);
  }
}

function closeDialog(dialog, { restoreFocus = true, fallbackFocus = null } = {}) {
  if (!dialog.open || dialog.dataset.closing === "true") return;
  dialog.dataset.closing = "true";
  dialog.restoreFocusOnClose = restoreFocus;
  dialog.fallbackFocus = fallbackFocus;
  const finish = () => {
    delete dialog.dataset.closing;
    dialog.close();
  };
  if (prefersReducedMotion()) {
    finish();
    return;
  }
  animateBackdrop(dialog, false);
  const animation = dialog.animate(keyframesFor(dialog).exit, { duration: DUR_2, easing: EASE_OUT, fill: "forwards" });
  animation.finished.then(finish, finish);
}

function handleDialogClosed(dialog) {
  for (const animation of dialog.getAnimations({ subtree: false })) animation.cancel();
  delete dialog.dataset.closing;
  const shouldRestore = dialog.restoreFocusOnClose !== false;
  dialog.restoreFocusOnClose = true;
  if (dialog === els.jobDialog) {
    const closedId = store.get().activeJobId;
    store.set({ activeJobId: null });
    syncURL();
    if (shouldRestore) {
      const opener = dialog.openerElement;
      const target = opener?.isConnected
        ? opener
        : els.list.querySelector(`[data-id="${CSS.escape(closedId || "")}"] .row__open`);
      (target || dialog.fallbackFocus || els.searchInput).focus({ preventScroll: !opener?.isConnected });
    }
  } else if (shouldRestore) {
    const opener = dialog.openerElement;
    const target = opener?.isConnected ? opener : dialog.fallbackFocus;
    target?.focus();
  } else if (dialog.fallbackFocus?.isConnected) {
    dialog.fallbackFocus.focus();
  }
  dialog.fallbackFocus = null;
  if (dialog === els.palette) els.paletteInput.value = "";
}

function topDialog() {
  const open = [...document.querySelectorAll("dialog[open]")].filter((dialog) => dialog.dataset.closing !== "true");
  return open.at(-1) || null;
}

function focusableIn(container) {
  return [...container.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => element.offsetParent !== null || element === document.activeElement);
}

function trapFocus(event, dialog) {
  const focusable = focusableIn(dialog);
  if (!focusable.length) {
    event.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
    event.preventDefault();
    first.focus();
  }
}

function setupDialogs() {
  for (const dialog of [els.jobDialog, els.palette, els.shortcuts, els.drawer]) {
    let pressStartedOnBackdrop = false;
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeDialog(dialog);
    });
    dialog.addEventListener("close", () => handleDialogClosed(dialog));
    dialog.addEventListener("pointerdown", (event) => {
      pressStartedOnBackdrop = event.target === dialog;
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog && pressStartedOnBackdrop) closeDialog(dialog);
      pressStartedOnBackdrop = false;
      if (event.target.closest("[data-close]")) closeDialog(dialog);
    });
  }

  els.jobDialogBody.addEventListener("click", (event) => {
    const control = event.target.closest("[data-action]");
    if (!control) return;
    const { activeJobId } = store.get();
    const { action } = control.dataset;
    if (action === "save" && activeJobId) toggleSave(activeJobId);
    else if (action === "copy-link" && activeJobId) copyJobLink(activeJobId);
    else if (action === "apply") toast({ message: "This is sample data, so there's no live application.", icon: "briefcase" });
    else if (action === "close") closeDialog(els.jobDialog);
  });

  els.compareBody.addEventListener("click", (event) => {
    const control = event.target.closest("[data-action]");
    if (!control) return;
    const { id, action } = control.dataset;
    if (action === "remove-compare") {
      const buttons = [...els.compareBody.querySelectorAll('[data-action="remove-compare"]')];
      const nextFocusIndex = Math.max(0, buttons.indexOf(control) - 1);
      toggleCompare(id, false);
      requestAnimationFrame(() => {
        const remaining = els.compareBody.querySelectorAll('[data-action="remove-compare"]');
        (remaining[nextFocusIndex] || remaining[0])?.focus();
      });
    } else if (action === "open-compare") {
      closeDialog(els.drawer, { restoreFocus: false });
      openJob(id, { opener: els.comparePill.hidden ? null : els.comparePill, morph: false });
    }
  });

  els.comparePill.addEventListener("click", () => openCompareDrawer(els.comparePill));
  els.shortcutList.innerHTML = view.shortcutsHTML(shortcutDefinitions());
  els.shortcutsButton.addEventListener("click", () => openDialog(els.shortcuts, { opener: els.shortcutsButton }));
}

function updateDetailSaveButton(id) {
  if (!els.jobDialog.open || store.get().activeJobId !== id) return;
  const button = els.jobDialogBody.querySelector('[data-action="save"]');
  if (!button) return;
  const saved = store.get().savedIds.has(id);
  button.classList.toggle("is-saved", saved);
  button.setAttribute("aria-pressed", String(saved));
  button.querySelector("[data-label]").textContent = saved ? "Saved" : "Save job";
}

function logoSourceFor(opener) {
  const host = opener?.closest?.(".row, .recent-chip, .mini-row, .palette__item");
  const logo = host?.querySelector("[data-logo]");
  if (!logo) return null;
  const rect = logo.getBoundingClientRect();
  const visible = rect.bottom > 0 && rect.top < innerHeight && rect.width > 0;
  return visible ? logo : null;
}

function openJob(id, { opener = document.activeElement, morph = true } = {}) {
  const job = jobsById.get(id);
  if (!job) return;
  if (els.jobDialog.open) {
    els.jobDialog.restoreFocusOnClose = false;
    els.jobDialog.close();
  }
  hidePeek();
  const state = store.get();
  store.set({ activeJobId: id });
  syncURL();
  addRecent(id);
  const fillDialog = () => {
    els.jobDialogBody.innerHTML = view.detailHTML(job, { now: state.now, saved: state.savedIds.has(id) });
  };
  const sourceLogo = morph ? logoSourceFor(opener) : null;
  const canMorph = sourceLogo && typeof document.startViewTransition === "function" && !prefersReducedMotion();
  if (!canMorph) {
    fillDialog();
    openDialog(els.jobDialog, { opener });
    return;
  }
  sourceLogo.style.viewTransitionName = "job-logo";
  let targetLogo = null;
  try {
    const transition = document.startViewTransition(() => {
      sourceLogo.style.viewTransitionName = "";
      fillDialog();
      targetLogo = els.jobDialogBody.querySelector("[data-logo]");
      if (targetLogo) targetLogo.style.viewTransitionName = "job-logo";
      openDialog(els.jobDialog, { opener, animate: false });
    });
    const cleanup = () => {
      sourceLogo.style.viewTransitionName = "";
      if (targetLogo) targetLogo.style.viewTransitionName = "";
    };
    transition.finished.then(cleanup, cleanup);
  } catch {
    sourceLogo.style.viewTransitionName = "";
    fillDialog();
    openDialog(els.jobDialog, { opener });
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
    (topDialog() || document.body).append(field);
    field.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    field.remove();
    return copied;
  }
}

async function copyJobLink(id) {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("job", id);
  const copied = await copyText(url.href);
  toast(copied
    ? { message: "Link copied", icon: "link" }
    : { message: "Couldn't copy the link", tone: "error", icon: "x" });
}

async function copyViewLink() {
  const copied = await copyText(location.href);
  toast(copied
    ? { message: "Link to this view copied", icon: "link" }
    : { message: "Couldn't copy the link", tone: "error", icon: "x" });
}

const toastState = new WeakMap();

function toast({ message, tone = "default", action = null, icon = "check" }) {
  const live = [...els.toasts.children].filter((node) => !node.classList.contains("is-leaving"));
  while (live.length >= MAX_TOASTS) dismissToast(live.shift());
  const template = document.createElement("template");
  template.innerHTML = view.toastHTML({ message, tone, actionLabel: action?.label, icon, duration: TOAST_MS });
  const node = template.content.firstElementChild;
  const state = { remaining: TOAST_MS, startedAt: 0, timer: 0, action };
  toastState.set(node, state);
  els.toasts.append(node);
  startToastTimer(node);
  return node;
}

function startToastTimer(node) {
  const state = toastState.get(node);
  if (!state || state.timer) return;
  state.startedAt = performance.now();
  state.timer = setTimeout(() => dismissToast(node), state.remaining);
}

function pauseToastTimer(node) {
  const state = toastState.get(node);
  if (!state || !state.timer) return;
  clearTimeout(state.timer);
  state.timer = 0;
  state.remaining = Math.max(400, state.remaining - (performance.now() - state.startedAt));
}

function dismissToast(node) {
  if (!node || node.classList.contains("is-leaving")) return;
  const state = toastState.get(node);
  if (state?.timer) clearTimeout(state.timer);
  const hadFocus = node.contains(document.activeElement);
  removeWithAnimation(node, "is-leaving");
  if (hadFocus) {
    const target = topDialog() ? focusableIn(topDialog())[0] : els.list.querySelector(".row__open");
    target?.focus({ preventScroll: true });
  }
}

function setupToasts() {
  els.toasts.addEventListener("click", (event) => {
    const node = event.target.closest(".toast");
    if (!node) return;
    if (event.target.closest("[data-toast-action]")) {
      const run = toastState.get(node)?.action?.run;
      dismissToast(node);
      run?.();
    } else if (event.target.closest("[data-toast-close]")) {
      dismissToast(node);
    }
  });
  els.toasts.addEventListener("pointerover", (event) => {
    const node = event.target.closest(".toast");
    if (node) pauseToastTimer(node);
  });
  els.toasts.addEventListener("pointerout", (event) => {
    const node = event.target.closest(".toast");
    if (node && !node.contains(event.relatedTarget)) startToastTimer(node);
  });
  els.toasts.addEventListener("focusin", (event) => {
    const node = event.target.closest(".toast");
    if (node) pauseToastTimer(node);
  });
  els.toasts.addEventListener("focusout", (event) => {
    const node = event.target.closest(".toast");
    if (node && !node.contains(event.relatedTarget)) startToastTimer(node);
  });
}

function currentTheme() {
  const explicit = root.dataset.theme;
  if (explicit === "light" || explicit === "dark") return explicit;
  return darkSchemeQuery.matches ? "dark" : "light";
}

function syncThemeToggle() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  els.themeToggle.setAttribute("aria-label", `Switch to ${next} theme`);
}

function toggleTheme(origin = els.themeToggle) {
  const next = currentTheme() === "dark" ? "light" : "dark";
  const apply = () => {
    root.dataset.theme = next;
    writeText(() => localStorage, STORAGE.theme, next);
    syncThemeToggle();
  };
  if (typeof document.startViewTransition !== "function" || prefersReducedMotion()) {
    apply();
    return;
  }
  const rect = origin?.getBoundingClientRect?.();
  const x = rect && rect.width ? rect.left + rect.width / 2 : innerWidth - 40;
  const y = rect && rect.width ? rect.top + rect.height / 2 : 32;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  root.classList.add("vt-theme");
  try {
    const transition = document.startViewTransition(apply);
    transition.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: DUR_3, easing: EASE_OUT, pseudoElement: "::view-transition-new(root)" },
      );
    }, () => {});
    const cleanup = () => root.classList.remove("vt-theme");
    transition.finished.then(cleanup, cleanup);
  } catch {
    root.classList.remove("vt-theme");
    apply();
  }
}

function isStandalone() {
  return standaloneQuery.matches || navigator.standalone === true;
}

function setupInstall() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    if (isStandalone()) return;
    deferredInstallPrompt = event;
    els.installButton.hidden = false;
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    els.installButton.hidden = true;
    toast({ message: "HireLens is installed", icon: "download" });
  });
  els.installButton.addEventListener("click", installApp);
}

async function installApp() {
  if (!deferredInstallPrompt) {
    toast({ message: isStandalone() ? "HireLens is already installed" : "Use your browser menu to install HireLens", icon: "download" });
    return;
  }
  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;
  els.installButton.hidden = true;
  promptEvent.prompt();
  try {
    const choice = await promptEvent.userChoice;
    if (choice.outcome !== "accepted") {
      deferredInstallPrompt = promptEvent;
      els.installButton.hidden = false;
    }
  } catch {
    els.installButton.hidden = true;
  }
}

function modifierLabel() {
  return isMac ? "⌘" : "Ctrl";
}

function shortcutDefinitions() {
  return [
    { keys: [modifierLabel(), "K"], label: "Open command palette" },
    { keys: ["/"], label: "Focus search" },
    { keys: ["J"], label: "Next job" },
    { keys: ["K"], label: "Previous job" },
    { keys: ["Enter"], label: "Open focused job" },
    { keys: ["S"], label: "Save or unsave focused job" },
    { keys: ["T"], label: "Toggle theme" },
    { keys: ["X"], label: "Clear filters" },
    { keys: ["V"], label: "Show saved jobs" },
    { keys: ["P"], label: "Sort by pay" },
    { keys: ["N"], label: "Sort by newest" },
    { keys: ["L"], label: "Copy link to this view" },
    { keys: ["?"], label: "Show keyboard shortcuts" },
    { keys: ["Esc"], label: "Close any dialog" },
  ];
}

function paletteCommands() {
  const { filters } = store.get();
  const commands = [
    { id: "theme", label: "Toggle theme", sub: `Switch to ${currentTheme() === "dark" ? "light" : "dark"} mode`, icon: "sun", keys: ["T"], run: () => toggleTheme(els.paletteTrigger) },
    { id: "clear", label: "Clear filters", sub: "Reset search, filters and sort", icon: "filter-x", keys: ["X"], run: clearAllFilters },
    { id: "saved", label: filters.saved ? "Show all jobs" : "Show saved", sub: `${store.get().savedIds.size} saved on this device`, icon: "bookmark", keys: ["V"], run: () => setFilters({ saved: !filters.saved }, { scroll: true }) },
    { id: "sort-pay", label: "Sort by pay", sub: "Highest salary first", icon: "coin", keys: ["P"], run: () => setFilters({ sort: "salary" }, { scroll: true }) },
    { id: "sort-new", label: "Sort by newest", sub: "Freshest postings first", icon: "clock", keys: ["N"], run: () => setFilters({ sort: "newest" }, { scroll: true }) },
    { id: "copy-view", label: "Copy this view's link", sub: "Share the current search and filters", icon: "link", keys: ["L"], run: copyViewLink },
    { id: "shortcuts", label: "Open shortcuts", sub: "See every keyboard shortcut", icon: "keyboard", keys: ["?"], run: () => openDialog(els.shortcuts, { opener: els.paletteTrigger }) },
  ];
  if (deferredInstallPrompt) {
    commands.push({ id: "install", label: "Install app", sub: "Add HireLens to your device", icon: "download", keys: ["I"], run: installApp });
  }
  for (const chip of activeFilterChips(filters)) {
    commands.push({
      id: `remove-${chip.key}`,
      label: `Remove filter: ${chip.label}`,
      sub: chip.prefix ? `${chip.prefix} filter` : "Active filter",
      icon: "x",
      keys: ["↵"],
      run: () => removeChip(chip.key),
    });
  }
  return commands;
}

const palette = { items: [], activeIndex: 0 };

function buildPaletteItems(query) {
  const { jobs } = store.get();
  const trimmed = query.trim();
  let jobItems;
  if (!trimmed) {
    jobItems = [...jobs].sort((a, b) => b.postedAtMs - a.postedAtMs).slice(0, 5).map((job) => ({ job, match: null }));
  } else {
    jobItems = jobs
      .map((job) => ({ job, match: fuzzyMatch(trimmed, `${job.title} ${job.company}`) }))
      .filter((entry) => entry.match)
      .sort((a, b) => b.match.score - a.match.score || b.job.postedAtMs - a.job.postedAtMs)
      .slice(0, 8);
  }
  const commandItems = paletteCommands()
    .map((command) => ({ command, match: trimmed ? fuzzyMatch(trimmed, command.label) : null }))
    .filter((entry) => !trimmed || entry.match)
    .sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0));

  const now = store.get().now;
  const items = [];
  for (const { job, match } of jobItems) {
    items.push({
      group: "Jobs",
      jobId: job.id,
      label: job.title,
      highlight: match ? match.indices.filter((index) => index < job.title.length) : [],
      sub: `${job.company} · ${job.location} · ${timeAgo(job.postedAt, now)}`,
      company: job.company,
      keys: ["↵"],
      run: () => openJob(job.id, { opener: els.palette.openerElement, morph: false }),
    });
  }
  for (const { command, match } of commandItems) {
    items.push({
      group: "Commands",
      label: command.label,
      highlight: match ? match.indices : [],
      sub: command.sub,
      icon: command.icon,
      keys: command.keys,
      run: command.run,
    });
  }
  return items;
}

function renderPalette() {
  palette.items = buildPaletteItems(els.paletteInput.value);
  palette.activeIndex = Math.min(palette.activeIndex, Math.max(0, palette.items.length - 1));
  els.paletteList.innerHTML = view.paletteHTML(palette.items, palette.activeIndex);
  syncPaletteActive();
}

function syncPaletteActive() {
  const options = els.paletteList.querySelectorAll('[role="option"]');
  options.forEach((option, index) => option.setAttribute("aria-selected", String(index === palette.activeIndex)));
  const active = options[palette.activeIndex];
  els.paletteInput.setAttribute("aria-activedescendant", active ? active.id : "");
  active?.scrollIntoView({ block: "nearest" });
}

function openPalette() {
  if (els.palette.open) return;
  const opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : els.paletteTrigger;
  palette.activeIndex = 0;
  els.paletteInput.value = "";
  renderPalette();
  openDialog(els.palette, { opener });
  els.paletteInput.focus();
}

function runPaletteItem(index) {
  const item = palette.items[index];
  if (!item) return;
  const opener = els.palette.openerElement;
  const isJob = item.group === "Jobs";
  const opensDialog = isJob || item.label === "Open shortcuts";
  closeDialog(els.palette, { restoreFocus: !opensDialog, fallbackFocus: opener });
  item.run();
}

function setupPalette() {
  els.paletteHint.textContent = `${modifierLabel()} K`;
  els.paletteTrigger.addEventListener("click", openPalette);
  els.paletteInput.addEventListener("input", () => {
    palette.activeIndex = 0;
    renderPalette();
  });
  els.paletteInput.addEventListener("keydown", (event) => {
    const count = palette.items.length;
    if (event.key === "ArrowDown" && count) {
      event.preventDefault();
      palette.activeIndex = (palette.activeIndex + 1) % count;
      syncPaletteActive();
    } else if (event.key === "ArrowUp" && count) {
      event.preventDefault();
      palette.activeIndex = (palette.activeIndex - 1 + count) % count;
      syncPaletteActive();
    } else if (event.key === "Home" && count) {
      event.preventDefault();
      palette.activeIndex = 0;
      syncPaletteActive();
    } else if (event.key === "End" && count) {
      event.preventDefault();
      palette.activeIndex = count - 1;
      syncPaletteActive();
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      const item = palette.items[palette.activeIndex];
      if (item?.jobId) toggleSave(item.jobId);
    } else if (event.key === "Enter") {
      event.preventDefault();
      runPaletteItem(palette.activeIndex);
    }
  });
  els.paletteList.addEventListener("pointermove", (event) => {
    const option = event.target.closest('[role="option"]');
    if (!option) return;
    const index = Number(option.dataset.index);
    if (index !== palette.activeIndex) {
      palette.activeIndex = index;
      syncPaletteActive();
    }
  });
  els.paletteList.addEventListener("click", (event) => {
    const option = event.target.closest('[role="option"]');
    if (option) runPaletteItem(Number(option.dataset.index));
  });
}

function removeChip(key) {
  if (key === "__clear") {
    clearAllFilters();
    return;
  }
  if (key === "q") els.searchInputDebounced.cancel();
  if (key === "salary") setFilters({ salaryMin: DEFAULT_FILTERS.salaryMin, salaryMax: DEFAULT_FILTERS.salaryMax });
  else setFilters({ [key]: DEFAULT_FILTERS[key] });
}

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !["checkbox", "radio", "button", "submit", "reset", "range", "color"].includes(target.type);
  }
  return false;
}

function rowButtons() {
  return [...els.list.querySelectorAll(".row__open")];
}

function moveRowFocus(direction) {
  const buttons = rowButtons();
  if (!buttons.length) return;
  const currentRow = document.activeElement?.closest?.(".row");
  const currentIndex = currentRow ? buttons.findIndex((button) => currentRow.contains(button)) : -1;
  let nextIndex;
  if (currentIndex === -1) nextIndex = direction > 0 ? 0 : buttons.length - 1;
  else nextIndex = Math.min(buttons.length - 1, Math.max(0, currentIndex + direction));
  if (direction > 0 && currentIndex === buttons.length - 1) loadNextPage();
  const target = buttons[nextIndex];
  target.focus({ preventScroll: true });
  target.closest(".row").scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

function focusedRowId() {
  return document.activeElement?.closest?.(".row[data-id]")?.dataset.id || null;
}

function setupKeyboard() {
  document.addEventListener("keydown", (event) => {
    const modifier = event.metaKey || event.ctrlKey;
    if (modifier && !event.altKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (els.palette.open) closeDialog(els.palette);
      else openPalette();
      return;
    }
    const dialog = topDialog();
    if (dialog && event.key === "Tab") {
      trapFocus(event, dialog);
      return;
    }
    if (event.defaultPrevented || modifier || event.altKey || dialog) return;
    if (isTypingTarget(event.target)) {
      if (event.key === "Escape" && event.target === els.searchInput && els.searchInput.value === "") els.searchInput.blur();
      return;
    }
    const key = event.key;
    const handlers = {
      "/": () => {
        els.searchInput.focus();
        els.searchInput.select();
      },
      j: () => moveRowFocus(1),
      k: () => moveRowFocus(-1),
      s: () => {
        const id = focusedRowId();
        if (id) toggleSave(id);
        else toast({ message: "Focus a job with J or K, then press S", icon: "keyboard" });
      },
      "?": () => openDialog(els.shortcuts, { opener: document.activeElement }),
      t: () => toggleTheme(els.themeToggle),
      x: clearAllFilters,
      v: () => setFilters({ saved: !store.get().filters.saved }, { scroll: true }),
      p: () => setFilters({ sort: "salary" }, { scroll: true }),
      n: () => setFilters({ sort: "newest" }, { scroll: true }),
      l: copyViewLink,
    };
    const handler = handlers[key] || handlers[key.toLowerCase()];
    if (!handler || (key.length === 1 && key !== "?" && key !== "/" && event.shiftKey)) return;
    event.preventDefault();
    handler();
  });
}

let peekTimer = 0;
let peekRowId = null;

function salaryBandFor(job) {
  const { jobs } = store.get();
  if (job.salaryLPA) {
    const peers = jobs.filter((other) => other.salaryLPA && other.department === job.department);
    const low = Math.min(...peers.map((other) => other.salaryLPA[0]));
    const high = Math.max(...peers.map((other) => other.salaryLPA[1]));
    return { low, high, from: job.salaryLPA[0], to: job.salaryLPA[1], unit: "LPA", scope: `${job.department} band` };
  }
  if (job.stipendK) {
    const peers = jobs.filter((other) => other.stipendK);
    const low = Math.min(...peers.map((other) => other.stipendK));
    const high = Math.max(...peers.map((other) => other.stipendK));
    return { low, high, from: job.stipendK, to: job.stipendK, unit: "k", scope: "Internship stipends" };
  }
  return null;
}

function schedulePeek(row) {
  clearTimeout(peekTimer);
  const id = row.dataset.id;
  if (peekRowId === id) return;
  hidePeek();
  peekTimer = setTimeout(() => showPeek(row), PEEK_DELAY_MS);
}

function showPeek(row) {
  if (!row.isConnected || !hoverPeekQuery.matches || topDialog()) return;
  const job = jobsById.get(row.dataset.id);
  if (!job) return;
  peekRowId = job.id;
  els.peek.innerHTML = view.peekHTML(job, salaryBandFor(job));
  const rowRect = row.getBoundingClientRect();
  const width = els.peek.offsetWidth;
  const height = els.peek.offsetHeight;
  const navBottom = document.querySelector(".nav").getBoundingClientRect().bottom;
  const gap = 12;
  let x;
  let y;
  if (rowRect.right + gap + width <= innerWidth - gap) {
    x = rowRect.right + gap;
    y = Math.min(Math.max(rowRect.top, navBottom + gap), innerHeight - height - gap);
  } else {
    x = rowRect.right - width - gap;
    const below = rowRect.bottom + 8;
    y = below + height <= innerHeight - gap ? below : Math.max(navBottom + gap, rowRect.top - height - 8);
  }
  els.peek.style.setProperty("--peek-x", `${Math.round(x)}px`);
  els.peek.style.setProperty("--peek-y", `${Math.round(y)}px`);
  els.peek.classList.add("is-visible");
}

function hidePeek() {
  clearTimeout(peekTimer);
  peekTimer = 0;
  peekRowId = null;
  els.peek.classList.remove("is-visible");
}

function setupPeek() {
  els.list.addEventListener("pointerover", (event) => {
    if (event.pointerType !== "mouse" || !hoverPeekQuery.matches) return;
    const row = event.target.closest(".row[data-id]");
    if (row) schedulePeek(row);
  });
  els.list.addEventListener("pointerout", (event) => {
    const row = event.target.closest(".row[data-id]");
    if (row && !row.contains(event.relatedTarget)) hidePeek();
  });
  window.addEventListener("scroll", () => {
    if (peekRowId || peekTimer) hidePeek();
  }, { passive: true });
  hoverPeekQuery.addEventListener("change", hidePeek);
}

function setupList() {
  els.list.addEventListener("click", (event) => {
    const control = event.target.closest("[data-action]");
    if (!control || !els.list.contains(control)) return;
    const id = control.closest("[data-id]")?.dataset.id;
    if (!id) return;
    const { action } = control.dataset;
    if (action === "open") openJob(id, { opener: control });
    else if (action === "save") toggleSave(id);
    else if (action === "compare") toggleCompare(id, control.checked, control);
  });

  els.boardState.addEventListener("click", (event) => {
    const control = event.target.closest("[data-action]");
    if (!control) return;
    if (control.dataset.action === "clear-filters") clearAllFilters();
    else if (control.dataset.action === "show-all") setFilters({ saved: false });
    else if (control.dataset.action === "retry") loadJobs();
  });

  els.justPosted.addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-job]");
    if (button) openJob(button.dataset.openJob, { opener: button });
  });

  byId("strip-track")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-job]");
    if (button) openJob(button.dataset.openJob, { opener: button });
  });

  els.recentList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-job]");
    if (button) openJob(button.dataset.openJob, { opener: button });
  });

  els.chips.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-chip]");
    if (!button) return;
    const chips = [...els.chips.querySelectorAll("[data-remove-chip]")];
    const index = chips.indexOf(button);
    removeChip(button.dataset.removeChip);
    requestAnimationFrame(() => {
      const remaining = [...els.chips.querySelectorAll(".chip:not(.is-leaving) [data-remove-chip]")];
      (remaining[Math.min(index, remaining.length - 1)] || els.searchInput).focus({ preventScroll: true });
    });
  });
}

function setupFilters() {
  const debouncedSearch = debounce((value) => setFilters({ q: value.trim() }), 250);
  els.searchInputDebounced = debouncedSearch;
  els.searchInput.addEventListener("input", () => debouncedSearch(els.searchInput.value));
  els.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    debouncedSearch.cancel();
    setFilters({ q: els.searchInput.value.trim() });
    scrollToRoles();
  });
  els.filtersForm.addEventListener("change", (event) => {
    const { name, value } = event.target;
    if (["within", "location", "type", "department"].includes(name)) setFilters({ [name]: value });
  });
  els.filtersForm.addEventListener("input", (event) => {
    const target = event.target;
    if (target.id !== "salary-min" && target.id !== "salary-max") return;
    let low = Number(byId("salary-min").value);
    let high = Number(byId("salary-max").value);
    if (low > high) [low, high] = target.id === "salary-min" ? [high, high] : [low, low];
    setFilters({ salaryMin: low, salaryMax: high });
  });
  els.filtersForm.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-chip-type], [data-chip-remote]");
    if (!chip) return;
    const { filters } = store.get();
    if (chip.dataset.chipRemote !== undefined) setFilters({ location: filters.location === "Remote" ? "" : "Remote" });
    else setFilters({ type: filters.type === chip.dataset.chipType ? "" : chip.dataset.chipType });
  });
  els.sortSelect.addEventListener("change", () => setFilters({ sort: els.sortSelect.value }));
  els.clearFilters.addEventListener("click", clearAllFilters);
  els.savedToggle.addEventListener("click", () => setFilters({ saved: !store.get().filters.saved }, { scroll: true }));
  for (const chip of els.popularChips) {
    chip.addEventListener("click", () => {
      if (chip.dataset.type) {
        const { type } = store.get().filters;
        setFilters({ type: type === chip.dataset.type ? "" : chip.dataset.type }, { scroll: true });
      } else {
        togglePopularTerm(chip.dataset.term);
      }
    });
  }
  els.filtersToggle.addEventListener("click", () => {
    const open = els.filtersToggle.getAttribute("aria-expanded") !== "true";
    els.filtersToggle.setAttribute("aria-expanded", String(open));
    els.filters.dataset.open = String(open);
    if (open) els.filters.querySelector("input, select")?.focus({ preventScroll: true });
  });
  els.themeToggle.addEventListener("click", () => toggleTheme(els.themeToggle));
  darkSchemeQuery.addEventListener("change", syncThemeToggle);
}

function setupNewSinceBanner(jobs, now) {
  const lastVisit = Number(readText(() => localStorage, STORAGE.lastVisit, "0"));
  writeText(() => localStorage, STORAGE.lastVisit, String(now));
  if (!lastVisit || readText(() => sessionStorage, STORAGE.bannerDismissed, "") === "true") return;
  const count = jobs.filter((job) => job.postedAtMs > lastVisit && now - job.postedAtMs <= WEEK_MS).length;
  if (!count) return;
  els.newBannerText.textContent = `${formatCount(count)} new ${count === 1 ? "job" : "jobs"} since you were last here —`;
  els.newBanner.hidden = false;
}

function hideNewBanner() {
  writeText(() => sessionStorage, STORAGE.bannerDismissed, "true");
  els.newBanner.hidden = true;
}

function setupNewBanner() {
  els.newBannerShow.addEventListener("click", () => {
    hideNewBanner();
    setFilters({ within: "24h" });
    scrollToRoles();
    requestAnimationFrame(() => els.list.querySelector(".row__open")?.focus({ preventScroll: true }));
  });
  els.newBannerDismiss.addEventListener("click", () => {
    hideNewBanner();
    els.list.querySelector(".row__open")?.focus({ preventScroll: true });
  });
}

function setupScrollReveal() {
  const sections = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || prefersReducedMotion()) {
    sections.forEach((section) => section.classList.add("is-visible"));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    }
  }, { rootMargin: "0px 0px -10% 0px", threshold: 0.05 });
  sections.forEach((section) => observer.observe(section));
}

function setupConnectivity() {
  const update = () => {
    els.offlineBanner.hidden = navigator.onLine;
  };
  window.addEventListener("online", () => {
    update();
    if (store.get().status === "error") loadJobs();
  });
  window.addEventListener("offline", update);
  update();
}

function refreshRelativeTimes() {
  const now = Date.now();
  store.set({ now });
  for (const element of document.querySelectorAll("[data-time]")) {
    const label = timeAgo(element.dataset.time, now);
    if (element.textContent !== label) element.textContent = label;
  }
  requestRender({ hero: { countUp: false }, count: true });
}

function renderSkeletons() {
  els.list.setAttribute("aria-busy", "true");
  els.list.innerHTML = view.skeletonRowsHTML(5);
  els.boardState.hidden = true;
}

async function loadJobs() {
  store.set({ status: "loading" });
  renderSkeletons();
  try {
    const response = await fetch("./data/jobs.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const now = Date.now();
    const jobs = hydrateJobs(payload.jobs, now);
    jobsById.clear();
    for (const job of jobs) jobsById.set(job.id, job);
    const known = (ids) => ids.filter((id) => jobsById.has(id));
    const state = store.get();
    store.set({
      status: "ready",
      jobs,
      now,
      compareIds: known(state.compareIds),
      recentIds: known(state.recentIds),
    });
    setupNewSinceBanner(jobs, now);
    requestRender({
      controls: true,
      chips: true,
      list: { flip: false },
      count: true,
      hero: { countUp: true },
      recent: true,
      compare: true,
      saved: { punch: false },
    });
    openDeepLinkedJob();
  } catch {
    store.set({ status: "error" });
    els.list.innerHTML = "";
    els.list.setAttribute("aria-busy", "false");
    els.justPosted.innerHTML = "";
    els.justPosted.setAttribute("aria-busy", "false");
    renderBoardState(false);
    renderResultCount();
  }
}

function openDeepLinkedJob() {
  const id = new URLSearchParams(location.search).get("job");
  if (!id) return;
  if (!jobsById.has(id)) {
    syncURL();
    toast({ message: "That job is no longer listed", tone: "error", icon: "x" });
    return;
  }
  requestAnimationFrame(() => {
    openJob(id, { opener: null, morph: false });
    els.jobDialog.querySelector(".detail__title")?.focus();
  });
}

async function loadSaved() {
  try {
    savedDB = await createSavedJobsDB();
    const savedIds = await savedDB.all();
    store.set({ savedIds });
    requestRender({ saved: { punch: false }, list: { flip: false }, count: true });
  } catch {
    savedDB = null;
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const secure = location.protocol === "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  if (!secure) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
  });
}

function init() {
  els.year.textContent = String(new Date().getFullYear());
  if (isStandalone()) els.installButton.hidden = true;
  syncThemeToggle();
  setupDialogs();
  setupToasts();
  setupPalette();
  setupKeyboard();
  setupList();
  setupFilters();
  setupPeek();
  setupNewBanner();
  setupInstall();
  setupScrollReveal();
  setupConnectivity();
  renderControls();
  renderChips();
  registerServiceWorker();
  Promise.all([loadSaved(), loadJobs()]);
  setInterval(refreshRelativeTimes, 60_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshRelativeTimes();
  });
}

init();
