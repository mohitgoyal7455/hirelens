import { test } from "node:test";
import assert from "node:assert/strict";
import {
  debounce, escapeHTML, timeAgo, freshness, hydrateJobs,
  filterJobs, filtersToQuery, queryToFilters, formatPay, DEFAULT_FILTERS,
} from "../js/utils.js";

const NOW = Date.parse("2026-10-16T12:00:00Z");
const jobs = hydrateJobs([
  { id: "a", title: "Frontend Developer", company: "Quarkbyte", location: "Mumbai", type: "Full-time", department: "Engineering", skills: ["JavaScript", "CSS"], salaryLPA: [6, 10], postedMinutesAgo: 30 },
  { id: "b", title: "Data Analyst", company: "Lumen", location: "Pune", type: "Internship", department: "Data", skills: ["SQL"], salaryLPA: null, stipendK: 20, postedMinutesAgo: 60 * 30 },
  { id: "c", title: "React Developer", company: "Pixelforge", location: "Remote", type: "Full-time", department: "Engineering", skills: ["React", "JavaScript"], salaryLPA: [8, 14], postedMinutesAgo: 60 * 5 },
], NOW);

test("escapeHTML neutralises markup", () => {
  assert.equal(escapeHTML(`<img src=x onerror="alert(1)">`), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  assert.equal(escapeHTML(null), "");
});

test("timeAgo formats minutes, hours and days", () => {
  assert.equal(timeAgo(NOW - 20 * 1000, NOW), "just now");
  assert.equal(timeAgo(NOW - 45 * 60000, NOW), "45m ago");
  assert.equal(timeAgo(NOW - 5 * 3600000, NOW), "5h ago");
  assert.equal(timeAgo(NOW - 3 * 86400000, NOW), "3d ago");
});

test("freshness buckets", () => {
  assert.equal(freshness(jobs[0].postedAt, NOW), "hot");
  assert.equal(freshness(jobs[2].postedAt, NOW), "fresh");
  assert.equal(freshness(jobs[1].postedAt, NOW), "older");
});

test("filterJobs sorts newest first by default", () => {
  assert.deepEqual(filterJobs(jobs, {}, { now: NOW }).map((j) => j.id), ["a", "c", "b"]);
});

test("filterJobs: multi-word search matches title, company and skills", () => {
  assert.deepEqual(filterJobs(jobs, { q: "javascript react" }, { now: NOW }).map((j) => j.id), ["c"]);
  assert.deepEqual(filterJobs(jobs, { q: "LUMEN" }, { now: NOW }).map((j) => j.id), ["b"]);
});

test("filterJobs: location, type and posted-within filters", () => {
  assert.deepEqual(filterJobs(jobs, { type: "Internship" }, { now: NOW }).map((j) => j.id), ["b"]);
  assert.deepEqual(filterJobs(jobs, { within: "3h" }, { now: NOW }).map((j) => j.id), ["a"]);
  assert.deepEqual(filterJobs(jobs, { within: "24h", location: "Remote" }, { now: NOW }).map((j) => j.id), ["c"]);
});

test("filterJobs: saved-only and salary sort", () => {
  assert.deepEqual(filterJobs(jobs, { saved: true }, { savedIds: new Set(["b"]), now: NOW }).map((j) => j.id), ["b"]);
  assert.deepEqual(filterJobs(jobs, { sort: "salary" }, { now: NOW }).map((j) => j.id), ["c", "a", "b"]);
});

test("filters round-trip through the URL query string", () => {
  const f = { ...DEFAULT_FILTERS, q: "react dev", location: "Mumbai", saved: true };
  const qs = filtersToQuery(f);
  assert.equal(qs, "?q=react+dev&location=Mumbai&saved=true");
  assert.deepEqual(queryToFilters(qs), f);
  assert.equal(filtersToQuery(DEFAULT_FILTERS), "");
});

test("formatPay", () => {
  assert.equal(formatPay(jobs[0]), "₹6–10 LPA");
  assert.equal(formatPay(jobs[1]), "₹20k / month");
});

test("debounce only fires the last call", async () => {
  const calls = [];
  const fn = debounce((v) => calls.push(v), 20);
  fn(1); fn(2); fn(3);
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(calls, [3]);
});
