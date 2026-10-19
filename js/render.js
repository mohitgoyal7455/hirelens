import { escapeHTML, formatPay, freshness, freshnessScore, hueFor, timeAgo } from "./utils.js";

export const WITHIN_LABELS = Object.freeze({ "3h": "Last 3 hours", "24h": "Last 24 hours", "7d": "Last 7 days" });

export function icon(name, className = "icon") {
  return `<svg class="${className}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

export function logoHTML(company, size = "") {
  const letter = escapeHTML(String(company).trim().charAt(0).toUpperCase() || "?");
  const sizeClass = size ? ` logo--${size}` : "";
  return `<span class="logo${sizeClass}" style="--h:${hueFor(company)}" data-logo aria-hidden="true">${letter}</span>`;
}

export function saveLabel(job, saved) {
  return `${saved ? "Unsave" : "Save"} ${job.title} at ${job.company}`;
}

function freshnessPill(job, now) {
  const bucket = freshness(job.postedAt, now);
  if (bucket === "hot") return `<span class="pill pill--new">New</span>`;
  if (bucket === "fresh") return `<span class="pill pill--today">Today</span>`;
  return "";
}

function freshnessBar(job, now, revealed) {
  const bucket = freshness(job.postedAt, now);
  const score = Math.round(freshnessScore(job.postedAt, now) * 100);
  const classes = ["fresh-bar", `fresh-bar--${bucket}`, revealed ? "is-revealed" : ""].filter(Boolean).join(" ");
  return `<span class="${classes}" style="--score:${score}%" data-bar="${escapeHTML(job.id)}" role="img" aria-label="Freshness ${score} percent"><span class="fresh-bar__fill"></span></span>`;
}

function tagsHTML(skills) {
  return `<ul class="tags" aria-label="Skills">${skills.map((skill) => `<li class="tag">${escapeHTML(skill)}</li>`).join("")}</ul>`;
}

export function jobRowHTML(job, { now, saved, compared, revealed, mounting }) {
  const bucket = freshness(job.postedAt, now);
  const classes = ["row", bucket === "hot" ? "is-hot" : "", mounting ? "is-mounting" : ""].filter(Boolean).join(" ");
  const title = escapeHTML(job.title);
  const company = escapeHTML(job.company);
  return `<li class="${classes}" data-id="${escapeHTML(job.id)}">
  ${logoHTML(job.company, "lg")}
  <div class="row__main">
    <p class="row__company">${company}</p>
    <h3 class="row__title"><button class="row__open" type="button" data-action="open" aria-haspopup="dialog">${title}</button></h3>
    <p class="row__meta">
      <span class="meta-item">${icon("pin")}${escapeHTML(job.location)}</span>
      <span class="meta-item">${icon("briefcase")}${escapeHTML(job.type)} · ${escapeHTML(job.level)}</span>
      <span class="meta-item">${icon("coin")}${escapeHTML(formatPay(job))}</span>
    </p>
    ${tagsHTML(job.skills)}
  </div>
  <div class="row__side">
    ${freshnessPill(job, now)}
    <span class="row__time"><time datetime="${escapeHTML(job.postedAt)}" data-time="${escapeHTML(job.postedAt)}">${escapeHTML(timeAgo(job.postedAt, now))}</time></span>
    ${freshnessBar(job, now, revealed)}
  </div>
  <div class="row__actions">
    <label class="compare-check" title="Add to compare">
      <input class="compare-check__input" type="checkbox" data-action="compare" aria-label="Compare ${title} at ${company}"${compared ? " checked" : ""}>
      <span class="compare-check__box">${icon("check")}</span>
    </label>
    <button class="save-btn" type="button" data-action="save" aria-pressed="${saved}" aria-label="${escapeHTML(saveLabel(job, saved))}">${icon("bookmark")}</button>
  </div>
</li>`;
}

export function skeletonRowsHTML(count) {
  const row = `<li class="row row--skeleton" aria-hidden="true"><span class="skeleton skeleton--logo-lg"></span><span class="skeleton-lines"><span class="skeleton skeleton--line"></span><span class="skeleton skeleton--line skeleton--short"></span><span class="skeleton skeleton--line skeleton--tags"></span></span><span class="skeleton skeleton--bar"></span></li>`;
  return row.repeat(count);
}

export function justPostedHTML(jobs, now, { entering = false } = {}) {
  return jobs.map((job, index) => `<li class="mini-row${entering ? " is-entering" : ""}" style="--i:${index}">
  <button class="mini-row__btn" type="button" data-open-job="${escapeHTML(job.id)}" aria-haspopup="dialog">
    ${logoHTML(job.company)}
    <span class="mini-row__text">
      <span class="mini-row__title">${escapeHTML(job.title)}</span>
      <span class="mini-row__meta">${escapeHTML(job.company)} · ${escapeHTML(job.location)}</span>
    </span>
    <time class="mini-row__time" datetime="${escapeHTML(job.postedAt)}" data-time="${escapeHTML(job.postedAt)}">${escapeHTML(timeAgo(job.postedAt, now))}</time>
  </button>
</li>`).join("");
}

export function recentChipsHTML(jobs, now) {
  return jobs.map((job, index) => `<li class="recent-chip" style="--i:${index}">
  <button class="recent-chip__btn" type="button" data-open-job="${escapeHTML(job.id)}" aria-haspopup="dialog" aria-label="${escapeHTML(`${job.title} at ${job.company}`)}">
    ${logoHTML(job.company, "dot")}
    <span class="recent-chip__title">${escapeHTML(job.title)}</span>
    <time class="recent-chip__time" datetime="${escapeHTML(job.postedAt)}" data-time="${escapeHTML(job.postedAt)}">${escapeHTML(timeAgo(job.postedAt, now))}</time>
  </button>
</li>`).join("");
}

export function chipInnerHTML(chip) {
  if (chip.key === "__clear") {
    return `<button class="link-btn" type="button" data-remove-chip="__clear">${escapeHTML(chip.label)}</button>`;
  }
  const prefix = chip.prefix ? `<span class="chip__key">${escapeHTML(chip.prefix)}</span>` : "";
  return `${prefix}<span>${escapeHTML(chip.label)}</span><button class="chip__remove" type="button" data-remove-chip="${escapeHTML(chip.key)}" aria-label="Remove ${escapeHTML(chip.prefix ? `${chip.prefix} ` : "")}filter ${escapeHTML(chip.label)}">${icon("x")}</button>`;
}

export function chipHTML(chip) {
  const className = chip.key === "__clear" ? "chip-clear" : "chip";
  return `<li class="${className}" data-key="${escapeHTML(chip.key)}">${chipInnerHTML(chip)}</li>`;
}

const EMPTY_ART = `<svg class="state__art" viewBox="0 0 160 120" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <rect x="34" y="14" width="72" height="92" rx="10" fill="var(--surface-2)" stroke="var(--line-strong)" stroke-width="2"/>
  <path d="M48 34h44M48 46h32M48 58h38" stroke="var(--line-strong)" stroke-width="3" stroke-dasharray="2 7"/>
  <circle cx="104" cy="70" r="20" fill="var(--surface)" stroke="currentColor" stroke-width="5"/>
  <path d="M96 64c2-3 5-4 8-4" stroke="currentColor" stroke-width="3" opacity=".5"/>
  <path d="M119 85l16 16" stroke="currentColor" stroke-width="8"/>
  <path d="M20 96h18M124 22l6-6M130 30h8" stroke="var(--line-strong)" stroke-width="2"/>
</svg>`;

const ERROR_ART = `<svg class="state__art" viewBox="0 0 160 120" aria-hidden="true" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <path d="M44 74a20 20 0 0 1 4-39.6A28 28 0 0 1 102 30a22 22 0 0 1 14 44z" fill="var(--surface-2)" stroke="var(--line-strong)" stroke-width="2.5"/>
  <path d="M58 92v-8a6 6 0 0 1 6-6h6v14M64 78v-6" stroke="currentColor" stroke-width="4"/>
  <path d="M60 92h16" stroke="currentColor" stroke-width="4"/>
  <path d="M100 86v-6a6 6 0 0 0-6-6h-4v14h4a6 6 0 0 0 6-6zM100 80h8M100 86h8" stroke="var(--danger)" stroke-width="4"/>
  <path d="M80 70l4 6-5 4 5 6" stroke="var(--muted)" stroke-width="2.5"/>
  <path d="M68 102c-4 4-12 4-16 0M96 98c4 6 14 6 18 2" stroke="var(--line-strong)" stroke-width="2.5"/>
</svg>`;

export function emptyStateHTML({ savedOnly = false } = {}) {
  if (savedOnly) {
    return `<div class="state">
  ${EMPTY_ART}
  <h3 class="state__title">No saved jobs yet</h3>
  <p class="state__copy">Tap the bookmark on any role and it will wait for you here, even offline.</p>
  <button class="btn btn--primary" type="button" data-action="show-all">Browse all jobs</button>
</div>`;
  }
  return `<div class="state">
  ${EMPTY_ART}
  <h3 class="state__title">No jobs match those filters</h3>
  <p class="state__copy">Try a broader search or widen the posted-within window.</p>
  <button class="btn btn--primary" type="button" data-action="clear-filters">Clear filters</button>
</div>`;
}

export function errorStateHTML({ offline = false } = {}) {
  return `<div class="state" role="alert">
  ${ERROR_ART}
  <h3 class="state__title">${offline ? "You're offline" : "We couldn't load jobs"}</h3>
  <p class="state__copy">${offline ? "Reconnect and we'll fetch the latest roles right away." : "Something went wrong on our side. Give it another go."}</p>
  <button class="btn btn--primary" type="button" data-action="retry">Try again</button>
</div>`;
}

function payBreakdownHTML(job) {
  const k = (value) => `₹${Math.round(value / 1000)}k`;
  const row = (label, value) => `<div class="pay-row"><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`;
  if (Array.isArray(job.salaryLPA)) {
    const [min, max] = job.salaryLPA;
    const monthly = min === max ? k((min * 100000) / 12) : `${k((min * 100000) / 12)} – ${k((max * 100000) / 12)}`;
    return `<dl class="pay">${row("Per year", formatPay(job))}${row("Per month, before tax", monthly)}</dl><p class="detail__note">Monthly is the yearly figure divided by 12. Take-home depends on the company's pay structure and tax.</p>`;
  }
  if (job.stipendK) {
    return `<dl class="pay">${row("Per month", `₹${job.stipendK}k`)}${row("Over 12 months", `₹${(job.stipendK * 12) / 100} LPA equivalent`)}</dl>`;
  }
  return `<p class="detail__summary">Pay not disclosed.</p>`;
}

export function detailHTML(job, { now, saved }) {
  const facts = [
    ["Pay", formatPay(job)],
    ["Level", job.level],
    ["Type", job.type],
    ["Location", job.location],
    ["Team", job.department],
    ["Posted", timeAgo(job.postedAt, now)],
  ];
  return `<header class="detail__head">
  ${logoHTML(job.company, "xl")}
  <div class="detail__heading">
    <p class="detail__company">${escapeHTML(job.company)}</p>
    <h2 class="detail__title" id="job-dialog-title" tabindex="-1">${escapeHTML(job.title)}</h2>
  </div>
  <button class="icon-btn" type="button" data-action="close" aria-label="Close job details" autofocus>${icon("x")}</button>
</header>
<div class="detail__content">
  <dl class="facts">${facts.map(([label, value]) => `<div class="fact"><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`).join("")}</dl>
  <div>
    <h3 class="detail__label">About the role</h3>
    <p class="detail__summary">${escapeHTML(job.summary)}</p>
  </div>
  <div>
    <h3 class="detail__label">Pay breakdown</h3>
    ${payBreakdownHTML(job)}
  </div>
  <div>
    <h3 class="detail__label">What you'll need</h3>
    <p class="detail__summary">${escapeHTML(job.level)} level, ${escapeHTML(job.type.toLowerCase())}. Skills listed for this role:</p>
    ${tagsHTML(job.skills)}
  </div>
  <p class="detail__note">Sample listing. The demo data has no full description, qualifications or application link.</p>
</div>
<footer class="detail__actions">
  <button class="btn btn--primary" type="button" data-action="apply">Apply now ${icon("arrow")}</button>
  <button class="btn btn--ghost${saved ? " is-saved" : ""}" type="button" data-action="save" aria-pressed="${saved}">${icon("bookmark")}<span data-label>${saved ? "Saved" : "Save job"}</span></button>
  <button class="btn btn--ghost" type="button" data-action="copy-link">${icon("link")}Copy link</button>
</footer>`;
}

export function peekHTML(job, band) {
  let bandHTML = "";
  if (band) {
    const span = Math.max(1, band.high - band.low);
    const from = ((band.from - band.low) / span) * 100;
    const width = ((band.to - band.from) / span) * 100;
    const unit = (value) => (band.unit === "LPA" ? `₹${value} LPA` : `₹${value}k`);
    bandHTML = `<div class="band">
  <p class="band__label"><span>${escapeHTML(formatPay(job))}</span><span>${escapeHTML(band.scope)}</span></p>
  <div class="band__track"><span class="band__fill" style="--from:${from.toFixed(1)}%;--span:${width.toFixed(1)}%"></span></div>
  <p class="band__ends"><span>${escapeHTML(unit(band.low))}</span><span>${escapeHTML(unit(band.high))}</span></p>
</div>`;
  }
  return `<p class="peek__company">${escapeHTML(job.company)} · ${escapeHTML(job.location)}</p>
<p class="peek__title">${escapeHTML(job.title)}</p>
<p class="peek__summary">${escapeHTML(job.summary)}</p>
${bandHTML}
${tagsHTML(job.skills)}`;
}

function monthlyPay(job) {
  if (job.salaryLPA) return (job.salaryLPA[1] * 100000) / 12;
  if (job.stipendK) return job.stipendK * 1000;
  return 0;
}

export function compareTableHTML(jobs, now) {
  const bestPay = Math.max(...jobs.map(monthlyPay));
  const freshest = Math.max(...jobs.map((job) => job.postedAtMs));
  const highlight = jobs.length > 1;
  const best = (content, label) => `<span class="best">${content}<span class="best__label">${escapeHTML(label)}</span></span>`;
  const cell = (job, render) => `<td>${render(job)}</td>`;
  const rows = [
    ["Pay", (job) => {
      const text = escapeHTML(formatPay(job));
      return highlight && monthlyPay(job) === bestPay && bestPay > 0 ? best(text, "Best") : text;
    }],
    ["Level", (job) => escapeHTML(job.level)],
    ["Type", (job) => escapeHTML(job.type)],
    ["Location", (job) => escapeHTML(job.location)],
    ["Skills", (job) => tagsHTML(job.skills.slice(0, 4))],
    ["Freshness", (job) => {
      const text = escapeHTML(timeAgo(job.postedAt, now));
      return highlight && job.postedAtMs === freshest ? best(text, "Freshest") : text;
    }],
  ];
  return `<table class="compare-table">
  <caption class="visually-hidden">Side-by-side comparison of shortlisted jobs</caption>
  <thead><tr><td></td>${jobs.map((job) => `<th scope="col">
    <div class="compare-col">
      ${logoHTML(job.company)}
      <span class="compare-col__title">${escapeHTML(job.title)}</span>
      <span class="compare-col__company">${escapeHTML(job.company)}</span>
      <button class="link-btn" type="button" data-action="open-compare" data-id="${escapeHTML(job.id)}">View role</button>
      <button class="link-btn" type="button" data-action="remove-compare" data-id="${escapeHTML(job.id)}" aria-label="Remove ${escapeHTML(job.title)} from shortlist">Remove</button>
    </div>
  </th>`).join("")}</tr></thead>
  <tbody>${rows.map(([label, render]) => `<tr><th scope="row">${escapeHTML(label)}</th>${jobs.map((job) => cell(job, render)).join("")}</tr>`).join("")}</tbody>
</table>`;
}

export function comparePillStackHTML(jobs) {
  return jobs.map((job) => logoHTML(job.company)).join("");
}

function highlightText(text, indices) {
  if (!indices?.length) return escapeHTML(text);
  const marked = new Set(indices);
  let html = "";
  let open = false;
  [...text].forEach((character, index) => {
    const hit = marked.has(index);
    if (hit && !open) {
      html += "<mark>";
      open = true;
    } else if (!hit && open) {
      html += "</mark>";
      open = false;
    }
    html += escapeHTML(character);
  });
  return open ? `${html}</mark>` : html;
}

export function paletteHTML(items, activeIndex) {
  if (!items.length) return `<p class="palette__empty">No jobs or commands match that.</p>`;
  const groups = new Map();
  items.forEach((item, index) => {
    if (!groups.has(item.group)) groups.set(item.group, []);
    groups.get(item.group).push({ ...item, index });
  });
  let html = "";
  for (const [group, entries] of groups) {
    const headingId = `palette-group-${group.toLowerCase()}`;
    html += `<div class="palette__group" role="group" aria-labelledby="${headingId}">
  <p class="palette__heading" id="${headingId}" role="presentation">${escapeHTML(group)}</p>
  ${entries.map((item) => `<div class="palette__item" role="option" id="palette-option-${item.index}" data-index="${item.index}" aria-selected="${item.index === activeIndex}">
    ${item.company ? logoHTML(item.company) : `<span class="palette__icon">${icon(item.icon || "arrow")}</span>`}
    <span class="palette__text">
      <span class="palette__label">${highlightText(item.label, item.highlight)}</span>
      <span class="palette__sub">${escapeHTML(item.sub || "")}</span>
    </span>
    <span class="palette__keys" aria-hidden="true">${item.keys.map((key) => `<kbd class="kbd">${escapeHTML(key)}</kbd>`).join("")}</span>
  </div>`).join("")}
</div>`;
  }
  return html;
}

export function shortcutsHTML(shortcuts) {
  return shortcuts.map(({ keys, label }) => `<div class="shortcut-row"><dt>${escapeHTML(label)}</dt><dd>${keys.map((key) => `<kbd class="kbd">${escapeHTML(key)}</kbd>`).join("")}</dd></div>`).join("");
}

export function toastHTML({ message, tone, actionLabel, icon: iconName, duration }) {
  const role = tone === "error" ? ' role="alert"' : "";
  const action = actionLabel ? `<button class="toast__action" type="button" data-toast-action>${escapeHTML(actionLabel)}</button>` : "";
  return `<div class="toast toast--${escapeHTML(tone)}"${role} style="--toast-ms:${Number(duration) || 3500}ms">
  ${icon(iconName, "icon toast__icon")}
  <p class="toast__msg">${escapeHTML(message)}</p>
  ${action}
  <button class="icon-btn toast__close" type="button" data-toast-close aria-label="Dismiss notification">${icon("x")}</button>
  <span class="toast__progress" aria-hidden="true"></span>
</div>`;
}
