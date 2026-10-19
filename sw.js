const VERSION = "v6";
const SHELL_CACHE = `hirelens-shell-${VERSION}`;
const DATA_CACHE = `hirelens-data-${VERSION}`;
const ACTIVE_CACHES = [SHELL_CACHE, DATA_CACHE];

const REQUIRED_SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./css/midnight.css",
  "./js/enhance.js",
  "./js/main.js",
  "./js/utils.js",
  "./js/store.js",
  "./js/db.js",
  "./js/render.js",
  "./assets/icon.svg",
  "./manifest.webmanifest",
];

const OPTIONAL_SHELL = [
  "./assets/fonts/bricolage-grotesque.woff2",
  "./assets/fonts/figtree.woff2",
];

const DATA_URLS = ["./data/jobs.json"];

const scopeURL = new URL(self.registration.scope);
const dataPrefix = new URL("./data/", scopeURL).pathname;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    await shell.addAll(REQUIRED_SHELL);
    await Promise.all(OPTIONAL_SHELL.map((url) => shell.add(url).catch(() => null)));
    const data = await caches.open(DATA_CACHE);
    await Promise.all(DATA_URLS.map((url) => data.add(url).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith("hirelens-") && !ACTIVE_CACHES.includes(key))
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function staleWhileRevalidate(event) {
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(event.request, { ignoreSearch: true });
  const network = fetch(event.request)
    .then((response) => {
      if (response.ok) cache.put(event.request, response.clone());
      return response;
    })
    .catch(() => null);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  const fresh = await network;
  return fresh || new Response(JSON.stringify({ jobs: [] }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const lookup = request.mode === "navigate" ? new URL("./index.html", scopeURL).href : request;
  const cached = await cache.match(lookup, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") cache.put(request, response.clone());
    return response;
  } catch {
    if (request.mode === "navigate") {
      const fallback = await cache.match(new URL("./", scopeURL).href);
      if (fallback) return fallback;
    }
    return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith(dataPrefix)) {
    event.respondWith(staleWhileRevalidate(event));
    return;
  }
  event.respondWith(cacheFirst(request));
});
