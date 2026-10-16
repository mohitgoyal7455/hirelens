import { escapeHTML as e, timeAgo, freshness, freshnessScore, formatPay, hueFor } from "./utils.js";

const BADGE = { hot: "New", fresh: "Today", older: "" };

const ICONS = {
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  brief: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M9 8h6M9 12h6M12 12l-3 4"/>',
  save: '<path d="M6 3h12v18l-6-4-6 4z"/>',
};

const icon = (name, size = 16) =>
  `<svg class="ico" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${ICONS[name]}</svg>`;

function logo(company, size = "") {
  const h = hueFor(company);
  return `<span class="logo ${size}" style="--h:${h}" aria-hidden="true">${e(company[0])}</span>`;
}

export function jobRow(job, isSaved, now = Date.now()) {
  const fresh = freshness(job.postedAt, now);
  const score = freshnessScore(job.postedAt, now);
  return `
  <li class="job" data-id="${e(job.id)}" data-fresh="${fresh}">
    ${logo(job.company)}
    <div class="job__main">
      <h3 class="job__title">
        <button class="job__open" data-action="open">${e(job.title)}</button>
      </h3>
      <p class="job__company">${e(job.company)}</p>
      <ul class="job__meta" aria-label="Job details">
        <li>${icon("pin")}${e(job.location)}</li>
        <li>${icon("brief")}${e(job.type)}</li>
        <li>${icon("coin")}${e(formatPay(job))}</li>
      </ul>
      <ul class="tags" aria-label="Skills">${job.skills.map((s) => `<li>${e(s)}</li>`).join("")}</ul>
    </div>
    <div class="job__side">
      <div class="fresh" aria-label="Posted ${timeAgo(job.postedAt, now)}">
        <span class="fresh__time">
          ${BADGE[fresh] ? `<b class="pill pill--${fresh}">${BADGE[fresh]}</b>` : ""}
          <time datetime="${e(job.postedAt)}">${timeAgo(job.postedAt, now)}</time>
        </span>
        <span class="fresh__bar" aria-hidden="true"><i style="--score:${score.toFixed(3)}"></i></span>
      </div>
      <button class="save" data-action="save" aria-pressed="${isSaved}"
        aria-label="${isSaved ? "Remove" : "Save"} ${e(job.title)} at ${e(job.company)}">
        ${icon("save", 18)}<span>${isSaved ? "Saved" : "Save"}</span>
      </button>
    </div>
  </li>`;
}

export function feedItem(job, now = Date.now()) {
  return `
  <li class="feed__item">
    ${logo(job.company, "logo--sm")}
    <div>
      <button class="feed__title" data-open="${e(job.id)}">${e(job.title)}</button>
      <p>${e(job.company)}, ${e(job.location)}</p>
    </div>
    <time datetime="${e(job.postedAt)}">${timeAgo(job.postedAt, now)}</time>
  </li>`;
}

export function skeletons(n = 5) {
  return Array.from({ length: n }, () =>
    `<li class="job job--skeleton" aria-hidden="true"><span class="logo"></span><div><span></span><span></span><span></span></div></li>`
  ).join("");
}

export function emptyState(saved) {
  return `<li class="empty">
    <h3>${saved ? "No saved jobs yet" : "No jobs match these filters"}</h3>
    <p>${saved ? "Select Save on any job to keep it here." : "Remove a filter or try a shorter search."}</p>
    <button class="btn" data-action="reset">Clear filters</button>
  </li>`;
}

export function jobDetail(job, isSaved) {
  return `
    <header class="detail__head">
      ${logo(job.company, "logo--lg")}
      <div>
        <h2 id="dialog-title">${e(job.title)}</h2>
        <p>${e(job.company)}</p>
      </div>
    </header>
    <dl class="detail__facts">
      <div><dt>Pay</dt><dd>${e(formatPay(job))}</dd></div>
      <div><dt>Location</dt><dd>${e(job.location)}</dd></div>
      <div><dt>Type</dt><dd>${e(job.type)}</dd></div>
      <div><dt>Posted</dt><dd><time datetime="${e(job.postedAt)}">${timeAgo(job.postedAt)}</time></dd></div>
    </dl>
    <h3>About the role</h3>
    <p>${e(job.summary)}</p>
    <h3>Skills</h3>
    <ul class="tags">${job.skills.map((s) => `<li>${e(s)}</li>`).join("")}</ul>
    <div class="detail__actions">
      <button class="btn btn--primary" data-action="apply">Apply now</button>
      <button class="btn" data-action="save" data-id="${e(job.id)}" aria-pressed="${isSaved}">${isSaved ? "Saved" : "Save job"}</button>
    </div>`;
}
