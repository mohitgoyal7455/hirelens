export function debounce(fn, wait = 250) {
  let timer;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

export function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

export function timeAgo(date, now = Date.now()) {
  const mins = Math.max(0, Math.floor((now - new Date(date).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function freshness(date, now = Date.now()) {
  const hrs = (now - new Date(date).getTime()) / 3_600_000;
  if (hrs <= 3) return "hot";
  if (hrs <= 24) return "fresh";
  return "older";
}

export function freshnessScore(date, now = Date.now(), windowHrs = 168) {
  const hrs = (now - new Date(date).getTime()) / 3_600_000;
  return Math.max(0.04, Math.min(1, 1 - hrs / windowHrs));
}

export function hydrateJobs(rows, now = Date.now()) {
  return rows.map((job) => ({
    ...job,
    postedAt: new Date(now - job.postedMinutesAgo * 60000).toISOString(),
  }));
}

export const DEFAULT_FILTERS = Object.freeze({
  q: "", location: "", type: "", department: "", within: "", sort: "newest", saved: false,
});

const WITHIN_HOURS = { "3h": 3, "24h": 24, "7d": 168 };

export function filterJobs(jobs, filters, { savedIds = new Set(), now = Date.now() } = {}) {
  const f = { ...DEFAULT_FILTERS, ...filters };
  const terms = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  const maxHrs = WITHIN_HOURS[f.within];

  const result = jobs.filter((job) => {
    if (f.saved && !savedIds.has(job.id)) return false;
    if (f.location && job.location !== f.location) return false;
    if (f.type && job.type !== f.type) return false;
    if (f.department && job.department !== f.department) return false;
    if (maxHrs && (now - new Date(job.postedAt).getTime()) / 3_600_000 > maxHrs) return false;
    if (terms.length) {
      const haystack = [job.title, job.company, job.location, ...job.skills].join(" ").toLowerCase();
      if (!terms.every((t) => haystack.includes(t))) return false;
    }
    return true;
  });

  const byDate = (a, b) => new Date(b.postedAt) - new Date(a.postedAt);
  const pay = (j) => (j.salaryLPA ? j.salaryLPA[1] : 0);
  if (f.sort === "salary") result.sort((a, b) => pay(b) - pay(a) || byDate(a, b));
  else result.sort(byDate);
  return result;
}

export function filtersToQuery(filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === DEFAULT_FILTERS[key] || value === "" || value === false) continue;
    params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function queryToFilters(search) {
  const params = new URLSearchParams(search);
  const out = { ...DEFAULT_FILTERS };
  for (const key of Object.keys(DEFAULT_FILTERS)) {
    if (!params.has(key)) continue;
    out[key] = key === "saved" ? params.get(key) === "true" : params.get(key);
  }
  return out;
}

export function formatPay(job) {
  if (job.salaryLPA) return `₹${job.salaryLPA[0]}–${job.salaryLPA[1]} LPA`;
  if (job.stipendK) return `₹${job.stipendK}k / month`;
  return "Not disclosed";
}

export function hueFor(text) {
  let h = 0;
  for (const ch of String(text)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
