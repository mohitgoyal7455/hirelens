import { test } from "node:test";
import assert from "node:assert/strict";
import {
  debounce,
  DEFAULT_FILTERS,
  escapeHTML,
  filterJobs,
  filtersToQuery,
  formatPay,
  freshness,
  hydrateJobs,
  queryToFilters,
  timeAgo,
} from "../js/utils.js";

const NOW = Date.UTC(2026, 9, 19, 12, 0, 0);
const MINUTE = 60 * 1000;

const sampleJobs = hydrateJobs([
  { id: "a", title: "Frontend Engineer", company: "Paisaflow", department: "Engineering", location: "Remote", type: "Full-time", level: "Mid", salaryLPA: [14, 20], stipendK: null, skills: ["React", "TypeScript", "CSS", "Web Performance"], postedMinutesAgo: 30, summary: "" },
  { id: "b", title: "Data Analyst", company: "Kiranakart", department: "Data", location: "Bengaluru", type: "Full-time", level: "Junior", salaryLPA: [7, 10], stipendK: null, skills: ["SQL", "Python", "Tableau", "Excel"], postedMinutesAgo: 600, summary: "" },
  { id: "c", title: "Design Intern", company: "Tiffinly", department: "Design", location: "Pune", type: "Internship", level: "Intern", salaryLPA: null, stipendK: 25, skills: ["Figma", "Visual Design", "Prototyping", "Illustration"], postedMinutesAgo: 3000, summary: "" },
  { id: "d", title: "Senior Frontend Engineer", company: "Kosh Capital", department: "Engineering", location: "Bengaluru", type: "Full-time", level: "Senior", salaryLPA: [32, 42], stipendK: null, skills: ["React", "TypeScript", "Next.js", "GraphQL"], postedMinutesAgo: 11000, summary: "" },
], NOW);

const ids = (jobs) => jobs.map((job) => job.id);

test("escapeHTML neutralises markup and quotes", () => {
  assert.equal(escapeHTML(`<img src=x onerror="alert('x')">&`), "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;");
  assert.equal(escapeHTML(null), "");
  assert.equal(escapeHTML(42), "42");
});

test("timeAgo returns just now, minutes, hours and days", () => {
  assert.equal(timeAgo(NOW - 20 * 1000, NOW), "just now");
  assert.equal(timeAgo(NOW - 12 * MINUTE, NOW), "12m ago");
  assert.equal(timeAgo(NOW - 3 * 60 * MINUTE, NOW), "3h ago");
  assert.equal(timeAgo(NOW - 2 * 24 * 60 * MINUTE, NOW), "2d ago");
  assert.equal(timeAgo(NOW + 5 * MINUTE, NOW), "just now");
});

test("freshness buckets jobs into hot, fresh and older", () => {
  assert.equal(freshness(NOW - 3 * 60 * MINUTE, NOW), "hot");
  assert.equal(freshness(NOW - (3 * 60 + 1) * MINUTE, NOW), "fresh");
  assert.equal(freshness(NOW - 24 * 60 * MINUTE, NOW), "fresh");
  assert.equal(freshness(NOW - (24 * 60 + 1) * MINUTE, NOW), "older");
});

test("filterJobs sorts newest first by default", () => {
  assert.deepEqual(ids(filterJobs(sampleJobs, DEFAULT_FILTERS, { now: NOW })), ["a", "b", "c", "d"]);
  assert.deepEqual(ids(filterJobs([...sampleJobs].reverse(), {}, { now: NOW })), ["a", "b", "c", "d"]);
});

test("search matches every word across title, company, location and skills", () => {
  assert.deepEqual(ids(filterJobs(sampleJobs, { q: "react bengaluru" }, { now: NOW })), ["d"]);
  assert.deepEqual(ids(filterJobs(sampleJobs, { q: "  FRONTEND   typescript " }, { now: NOW })), ["a", "d"]);
  assert.deepEqual(ids(filterJobs(sampleJobs, { q: "react pune" }, { now: NOW })), []);
});

test("location, type and posted-within filters combine", () => {
  assert.deepEqual(ids(filterJobs(sampleJobs, { location: "Bengaluru" }, { now: NOW })), ["b", "d"]);
  assert.deepEqual(ids(filterJobs(sampleJobs, { type: "Internship" }, { now: NOW })), ["c"]);
  assert.deepEqual(ids(filterJobs(sampleJobs, { within: "3h" }, { now: NOW })), ["a"]);
  assert.deepEqual(ids(filterJobs(sampleJobs, { within: "24h" }, { now: NOW })), ["a", "b"]);
  assert.deepEqual(ids(filterJobs(sampleJobs, { within: "7d", location: "Bengaluru" }, { now: NOW })), ["b"]);
});

test("saved-only filter and highest-pay sort", () => {
  const savedIds = new Set(["b", "d", "c"]);
  assert.deepEqual(ids(filterJobs(sampleJobs, { saved: true }, { savedIds, now: NOW })), ["b", "c", "d"]);
  assert.deepEqual(ids(filterJobs(sampleJobs, { saved: true, sort: "salary" }, { savedIds, now: NOW })), ["d", "b", "c"]);
  assert.deepEqual(ids(filterJobs(sampleJobs, { sort: "salary" }, { now: NOW })), ["d", "a", "b", "c"]);
});

test("filters survive a URL query round trip", () => {
  const filters = { ...DEFAULT_FILTERS, q: "react dev", location: "Pune", within: "24h", sort: "salary", saved: true };
  const query = filtersToQuery(filters);
  assert.equal(query, "?q=react+dev&location=Pune&within=24h&sort=salary&saved=true");
  assert.deepEqual(queryToFilters(query), filters);
  assert.equal(filtersToQuery(DEFAULT_FILTERS), "");
  assert.deepEqual(queryToFilters("?within=bogus&sort=nope"), { ...DEFAULT_FILTERS });
});

test("formatPay shows LPA ranges and monthly stipends", () => {
  assert.equal(formatPay({ salaryLPA: [6, 10] }), "₹6–10 LPA");
  assert.equal(formatPay({ salaryLPA: null, stipendK: 20 }), "₹20k / month");
  assert.equal(formatPay({ salaryLPA: null, stipendK: null }), "Pay not disclosed");
});

test("debounce delays calls and cancel() drops the pending call", async () => {
  const calls = [];
  const debounced = debounce((value) => calls.push(value), 20);
  debounced("a");
  debounced("b");
  debounced("c");
  assert.deepEqual(calls, []);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual(calls, ["c"]);
  debounced("d");
  debounced.cancel();
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual(calls, ["c"]);
});

test("salary range keeps jobs whose pay overlaps and converts stipends", () => {
  assert.deepEqual(ids(filterJobs(sampleJobs, { salaryMin: 30, salaryMax: 75 }, { now: NOW })), ["d"]);
  assert.deepEqual(ids(filterJobs(sampleJobs, { salaryMin: 0, salaryMax: 5 }, { now: NOW })), ["c"]);
  assert.deepEqual(ids(filterJobs(sampleJobs, { salaryMin: 8, salaryMax: 15 }, { now: NOW })), ["a", "b"]);
});

test("salary filters round-trip through the URL", () => {
  const query = filtersToQuery({ ...DEFAULT_FILTERS, salaryMin: 10, salaryMax: 40 });
  assert.equal(query, "?salaryMin=10&salaryMax=40");
  const parsed = queryToFilters(query);
  assert.equal(parsed.salaryMin, 10);
  assert.equal(parsed.salaryMax, 40);
  assert.equal(queryToFilters("?salaryMax=900").salaryMax, 75);
});
