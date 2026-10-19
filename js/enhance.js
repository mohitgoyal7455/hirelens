import { escapeHTML, hydrateJobs, timeAgo } from "./utils.js";

const nav = document.querySelector(".nav");
const onScroll = () => nav?.classList.toggle("is-scrolled", scrollY > 8);
addEventListener("scroll", onScroll, { passive: true });
onScroll();

const words = document.querySelector("[data-words]");
if (words) {
  let n = 0;
  const wrap = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part.trim()) return frag.append(part);
          const span = document.createElement("span");
          span.className = "w"; span.style.setProperty("--n", n++); span.textContent = part;
          frag.append(span);
        });
        child.replaceWith(frag);
      } else if (child.classList?.contains("grad")) {
        const text = child.textContent; child.textContent = "";
        text.split(/(\s+)/).forEach((part) => {
          if (!part.trim()) return child.append(part);
          const span = document.createElement("span");
          span.className = "w"; span.style.setProperty("--n", n++); span.textContent = part;
          child.append(span);
        });
        child.classList.remove("grad"); child.classList.add("grad-wrap");
        child.querySelectorAll(".w").forEach((w) => w.classList.add("grad"));
      }
    });
  };
  wrap(words);
}


const root = document.documentElement;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch {} };

const accents = [...document.querySelectorAll(".accents [data-accent]")];
function setAccent(name) {
  if (name === "moon") root.removeAttribute("data-accent");
  else root.dataset.accent = name;
  accents.forEach((button) => button.setAttribute("aria-checked", String(button.dataset.accent === name)));
  write("hirelens:accent", name);
}
accents.forEach((button) => button.addEventListener("click", () => setAccent(button.dataset.accent)));
const savedAccent = read("hirelens:accent");
if (savedAccent && accents.some((button) => button.dataset.accent === savedAccent)) setAccent(savedAccent);

let ticking = false;
let pointerX = 0;
function paintStars() {
  ticking = false;
  root.style.setProperty("--s1", `${(-scrollY * 0.05) % 420}px`);
  root.style.setProperty("--s2", `${(-scrollY * 0.11) % 640}px`);
  root.style.setProperty("--px", `${pointerX}px`);
}
const queuePaint = () => { if (!ticking && !reduceMotion.matches) { ticking = true; requestAnimationFrame(paintStars); } };
addEventListener("scroll", queuePaint, { passive: true });
if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
  addEventListener("pointermove", (event) => { pointerX = (event.clientX / innerWidth - 0.5) * -14; queuePaint(); }, { passive: true });
}

const soundButton = document.getElementById("sound-toggle");
let soundOn = read("hirelens:sound") === "on";
let audio = null;
const syncSound = () => soundButton.setAttribute("aria-pressed", String(soundOn));
function tone(freqs, length, volume) {
  try {
    audio ||= new AudioContext();
    if (audio.state === "suspended") audio.resume();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const start = audio.currentTime;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(freqs[0], start);
    oscillator.frequency.exponentialRampToValueAtTime(freqs[1], start + length);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + length);
  } catch {}
}
function feedback(kind) {
  if (!soundOn) return;
  if (kind === "save") { tone([520, 880], 0.12, 0.05); navigator.vibrate?.(14); }
  else { tone([360, 300], 0.04, 0.03); navigator.vibrate?.(6); }
}
syncSound();
soundButton.addEventListener("click", () => {
  soundOn = !soundOn;
  write("hirelens:sound", soundOn ? "on" : "off");
  syncSound();
  feedback("save");
});
document.addEventListener("hl:feedback", (event) => feedback(event.detail));

const saveKey = document.getElementById("palette-save-key");
if (saveKey && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)) saveKey.textContent = "⌘ S";

const MAX_SKILLS = 5;
const skillInput = document.getElementById("skill-input");
const skillChips = document.getElementById("skill-chips");
const skillOptions = document.getElementById("skill-options");
const jobList = document.getElementById("job-list");
const detailBody = document.getElementById("job-dialog-body");
let catalog = new Map();
let mySkills = [];
try { mySkills = JSON.parse(read("hirelens:skills") || "[]").slice(0, MAX_SKILLS); } catch {}
const norm = (text) => String(text).trim().toLowerCase();

function decorateRow(row) {
  const job = catalog.get(row.dataset.id);
  row.querySelector(".match")?.remove();
  if (!job) return;
  const mine = new Set(mySkills.map(norm));
  let hits = 0;
  row.querySelectorAll(".tag").forEach((tag) => {
    const hit = mine.has(norm(tag.textContent));
    tag.classList.toggle("is-match", hit);
    if (hit) hits++;
  });
  if (hits) {
    const badge = document.createElement("span");
    badge.className = "match";
    badge.textContent = `${Math.round((hits / job.skills.length) * 100)}% match`;
    badge.title = `You have ${hits} of ${job.skills.length} listed skills`;
    row.querySelector(".row__side")?.prepend(badge);
  }
}
const decorateAll = () => {
  jobList.querySelectorAll(".row[data-id]").forEach(decorateRow);
  const mine = new Set(mySkills.map(norm));
  detailBody.querySelectorAll(".tag").forEach((tag) => tag.classList.toggle("is-match", mine.has(norm(tag.textContent))));
};
new MutationObserver(decorateAll).observe(jobList, { childList: true });
new MutationObserver(decorateAll).observe(detailBody, { childList: true });

function renderSkills() {
  skillChips.innerHTML = "";
  mySkills.forEach((skill) => {
    const item = document.createElement("li");
    item.className = "skill-chip";
    const label = document.createElement("span");
    label.textContent = skill;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove skill ${skill}`);
    remove.addEventListener("click", () => { mySkills = mySkills.filter((entry) => entry !== skill); commitSkills(); });
    item.append(label, remove);
    skillChips.append(item);
  });
  skillInput.disabled = mySkills.length >= MAX_SKILLS;
  skillInput.placeholder = mySkills.length >= MAX_SKILLS ? "Remove one to add another" : "e.g. Python, SQL, AWS";
}
function commitSkills() {
  write("hirelens:skills", JSON.stringify(mySkills));
  renderSkills();
  decorateAll();
}
function addSkill(raw) {
  const value = raw.trim().replace(/,$/, "");
  if (!value || mySkills.length >= MAX_SKILLS || mySkills.some((skill) => norm(skill) === norm(value))) return;
  const known = [...catalog.values()].flatMap((job) => job.skills).find((skill) => norm(skill) === norm(value));
  mySkills.push(known || value);
  commitSkills();
}
skillInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === ",") {
    event.preventDefault();
    addSkill(skillInput.value);
    skillInput.value = "";
  }
});
skillInput?.addEventListener("change", () => { if (skillInput.value) { addSkill(skillInput.value); skillInput.value = ""; } });
renderSkills();

try {
  const res = await fetch("./data/jobs.json");
  const jobs = hydrateJobs((await res.json()).jobs).sort((a, b) => b.postedAtMs - a.postedAtMs);
  catalog = new Map(jobs.map((job) => [job.id, job]));
  const skillNames = [...new Set(jobs.flatMap((job) => job.skills))].sort();
  skillOptions.innerHTML = skillNames.map((name) => `<option value="${escapeHTML(name)}"></option>`).join("");
  const navCount = document.getElementById("nav-count");
  if (navCount) navCount.textContent = jobs.length;
  const items = jobs.slice(0, 10).map((j) => `<button class="strip__item" type="button" data-open-job="${escapeHTML(j.id)}">${escapeHTML(j.title)} <span>${escapeHTML(j.company)} · ${escapeHTML(timeAgo(j.postedAt))}</span></button>`).join("");
  const track = document.getElementById("strip-track");
  track.innerHTML = items + `<span aria-hidden="true" style="display:contents">${items.replace(/data-open-job/g, 'tabindex="-1" data-open-job')}</span>`;
  document.getElementById("strip").hidden = false;
} catch {}
