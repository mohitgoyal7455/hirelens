const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const FRESHNESS_WINDOW_MS = 7 * DAY_MS;
const WITHIN_MS = Object.freeze({ "3h": 3 * HOUR_MS, "24h": DAY_MS, "7d": 7 * DAY_MS });
const HTML_ESCAPES = Object.freeze({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" });

export const DEFAULT_FILTERS = Object.freeze({
  q: "",
  location: "",
  type: "",
  department: "",
  within: "",
  sort: "newest",
  saved: false,
  salaryMin: 0,
  salaryMax: 75,
});

export const SALARY_CAP = 75;

export function debounce(fn, wait = 250) {
  let timer = null;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };
  debounced.cancel = () => {
    clearTimeout(timer);
    timer = null;
  };
  return debounced;
}

export function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"'`]/g, (character) => HTML_ESCAPES[character]);
}

function toMs(date) {
  if (typeof date === "number") return date;
  if (date instanceof Date) return date.getTime();
  return Date.parse(date);
}

export function timeAgo(date, now = Date.now()) {
  const elapsed = Math.max(0, now - toMs(date));
  if (elapsed < MINUTE_MS) return "just now";
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)}m ago`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}h ago`;
  return `${Math.floor(elapsed / DAY_MS)}d ago`;
}

export function freshness(date, now = Date.now()) {
  const elapsed = now - toMs(date);
  if (elapsed <= 3 * HOUR_MS) return "hot";
  if (elapsed <= DAY_MS) return "fresh";
  return "older";
}

export function freshnessScore(date, now = Date.now()) {
  const elapsed = Math.max(0, now - toMs(date));
  return Math.max(0, Math.min(1, 1 - elapsed / FRESHNESS_WINDOW_MS));
}

export function hydrateJobs(rows, now = Date.now()) {
  return rows.map((job) => {
    const postedAtMs = now - Math.max(0, Number(job.postedMinutesAgo) || 0) * MINUTE_MS;
    return { ...job, postedAtMs, postedAt: new Date(postedAtMs).toISOString() };
  });
}

function postedMs(job) {
  return Number.isFinite(job.postedAtMs) ? job.postedAtMs : toMs(job.postedAt);
}

function topPay(job) {
  if (job.salaryLPA) return job.salaryLPA[1] * 100000;
  if (job.stipendK) return job.stipendK * 1000 * 12;
  return 0;
}

export function payRangeLPA(job) {
  if (Array.isArray(job.salaryLPA)) return job.salaryLPA;
  if (job.stipendK) {
    const annual = (job.stipendK * 12) / 100;
    return [annual, annual];
  }
  return null;
}

export function filterJobs(jobs, filters = {}, { savedIds = new Set(), now = Date.now() } = {}) {
  const active = { ...DEFAULT_FILTERS, ...filters };
  const terms = String(active.q).toLowerCase().split(/\s+/).filter(Boolean);
  const withinMs = WITHIN_MS[active.within];
  const salaryActive = active.salaryMin > 0 || active.salaryMax < SALARY_CAP;

  const matches = jobs.filter((job) => {
    if (active.saved && !savedIds.has(job.id)) return false;
    if (active.location && job.location !== active.location) return false;
    if (active.type && job.type !== active.type) return false;
    if (active.department && job.department !== active.department) return false;
    if (salaryActive) {
      const range = payRangeLPA(job);
      if (!range || range[1] < active.salaryMin || (active.salaryMax < SALARY_CAP && range[0] > active.salaryMax)) return false;
    }
    if (withinMs && now - postedMs(job) > withinMs) return false;
    if (terms.length) {
      const haystack = [job.title, job.company, job.location, ...job.skills].join(" ").toLowerCase();
      if (!terms.every((term) => haystack.includes(term))) return false;
    }
    return true;
  });

  const newestFirst = (a, b) => postedMs(b) - postedMs(a);
  if (active.sort === "salary") return matches.sort((a, b) => topPay(b) - topPay(a) || newestFirst(a, b));
  return matches.sort(newestFirst);
}

export function filtersToQuery(filters) {
  const params = new URLSearchParams();
  for (const key of Object.keys(DEFAULT_FILTERS)) {
    const value = filters[key];
    if (value === undefined || value === DEFAULT_FILTERS[key] || value === "" || value === false) continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function queryToFilters(search) {
  const params = new URLSearchParams(search);
  const filters = { ...DEFAULT_FILTERS };
  for (const key of Object.keys(DEFAULT_FILTERS)) {
    if (!params.has(key)) continue;
    const raw = params.get(key);
    if (key === "saved") filters.saved = raw === "true";
    else if (key === "sort") filters.sort = raw === "salary" ? "salary" : "newest";
    else if (key === "within") filters.within = raw in WITHIN_MS ? raw : "";
    else if (key === "salaryMin" || key === "salaryMax") {
      const number = Math.round(Number(raw));
      filters[key] = Number.isFinite(number) ? Math.max(0, Math.min(SALARY_CAP, number)) : DEFAULT_FILTERS[key];
    } else filters[key] = raw.trim();
  }
  return filters;
}

export function formatPay(job) {
  if (Array.isArray(job.salaryLPA)) {
    const [min, max] = job.salaryLPA;
    return min === max ? `₹${min} LPA` : `₹${min}–${max} LPA`;
  }
  if (job.stipendK) return `₹${job.stipendK}k / month`;
  return "Pay not disclosed";
}

export function hueFor(text) {
  let hash = 0;
  for (const character of String(text)) hash = (hash * 31 + character.codePointAt(0)) % 360;
  return hash;
}

export function fuzzyMatch(needle, haystack) {
  const query = String(needle).toLowerCase().replace(/\s+/g, "");
  const text = String(haystack);
  const lower = text.toLowerCase();
  if (!query) return { score: 0, indices: [] };
  const indices = [];
  let score = 0;
  let cursor = 0;
  let previous = -2;
  for (const character of query) {
    const found = lower.indexOf(character, cursor);
    if (found === -1) return null;
    const atWordStart = found === 0 || /[\s\-_/·.]/.test(lower[found - 1]);
    score += 1;
    if (found === previous + 1) score += 3;
    if (atWordStart) score += 4;
    score -= Math.min(3, (found - cursor) * 0.1);
    indices.push(found);
    previous = found;
    cursor = found + 1;
  }
  if (lower.startsWith(query)) score += 6;
  else if (lower.includes(query)) score += 3;
  score -= text.length * 0.01;
  return { score, indices };
}

const countFormatter = new Intl.NumberFormat("en-IN");

export function formatCount(n) {
  return countFormatter.format(Math.max(0, Math.round(Number(n) || 0)));
}
