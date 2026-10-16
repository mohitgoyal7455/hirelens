# HireLens — Fresh-First Job Discovery

A fast, accessible, offline-capable job discovery web app built with **vanilla HTML, CSS and JavaScript** — no frameworks, no build step.
Newly posted jobs are sorted to the top and tagged by how fresh they are, so candidates can apply before the crowd.

**Live demo:** https://mohitgoyal7455.github.io/hirelens/

![HireLens home page](assets/preview.png)

## Features

- **Instant search & filters** — debounced multi-word search across title, company and skills; filter by location, job type, team and "posted within" (3h / 24h / 7d); sort by newest or pay.
- **Shareable URLs** — filter state is synced to the query string (`?q=react&location=Mumbai`) with `history.replaceState`, so any view can be bookmarked or shared.
- **Saved jobs** — bookmarks persist in **IndexedDB**, falling back to `localStorage` when IndexedDB is unavailable. Saving is **optimistic**: the UI updates immediately and rolls back if the write fails.
- **Works offline (PWA)** — a **Service Worker** serves the app shell cache-first and job data stale-while-revalidate; an offline banner appears when the connection drops. Installable via a web app manifest.
- **Infinite scroll** — results render in pages of 12 using `IntersectionObserver`.
- **Accessible by default** — semantic landmarks, skip link, labelled form controls, `aria-live` result count, `aria-pressed` toggle buttons, native `<dialog>` with Esc-to-close and focus returned to the trigger, visible focus rings, `prefers-reduced-motion` support, and a `/` keyboard shortcut to jump to search.
- **Live freshness** — a "Just posted" feed and a per-job freshness bar; relative times refresh every minute without a reload.
- **Light / dark theme** — CSS custom-property design tokens; respects `prefers-color-scheme` and remembers the user's choice.
- **Self-hosted fonts** — Bricolage Grotesque and Figtree are served locally and preloaded, so text renders fast and works offline.
- **Rendering performance** — a single delegated click listener for the whole list, renders batched with `requestAnimationFrame`, `contain: content` on cards, no third-party JS, and skeleton loaders while data loads.
- **Safe rendering** — all dynamic text is escaped before it reaches `innerHTML` to prevent XSS.
- **Unit tested** — pure logic (filtering, sorting, URL sync, time formatting, debounce, escaping) is covered with Node's built-in test runner.

## Tech

HTML5 · CSS3 (Grid, Flexbox, custom properties, `color-mix`) · JavaScript (ES modules) · IndexedDB · Service Worker · Web App Manifest · `node:test`

## Project structure

```
hirelens/
├── index.html            # semantic markup, filters, dialog
├── css/styles.css        # design tokens, layout, components, dark mode
├── js/
│   ├── main.js           # app wiring: events, URL sync, infinite scroll, theme
│   ├── store.js          # tiny observable state store (pub/sub)
│   ├── db.js             # IndexedDB persistence with localStorage fallback
│   ├── render.js         # HTML templates for cards, dialog, empty states
│   └── utils.js          # pure functions (filter, sort, timeAgo, debounce…)
├── sw.js                 # service worker (offline caching)
├── manifest.webmanifest  # PWA manifest
├── assets/               # icon, preview image, self-hosted fonts
├── data/jobs.json        # mock job listings
└── tests/utils.test.js   # unit tests
```

## Run locally

ES modules and service workers need to be served over HTTP (opening `index.html` directly as a file won't work).

```bash
# any one of these, from the project folder
npx serve .
python -m http.server 8000
# or VS Code → "Open with Live Server"
```

Then open http://localhost:3000 (or :8000).

## Run tests

Requires Node.js 18+.

```bash
npm test
```

## Deploy to GitHub Pages

1. Push this folder to a repository named `hirelens`.
2. Go to **Settings → Pages**, set **Source** to *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. The site will be live at `https://<your-username>.github.io/hirelens/`.

All paths are relative, so it works under the `/hirelens/` sub-path without changes.

## Notes

Job listings in `data/jobs.json` are mock data. Each entry stores `postedMinutesAgo`, which is converted to a real timestamp on load so the freshness badges stay meaningful in the demo. Swapping in a real API only requires changing the `fetch` URL in `js/main.js`.

## License

Code: MIT. Fonts: SIL Open Font License 1.1 (see `assets/fonts/OFL.txt`).
