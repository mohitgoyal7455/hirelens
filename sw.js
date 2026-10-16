const VERSION = "v2";
const SHELL_CACHE = `hirelens-shell-${VERSION}`;
const DATA_CACHE = `hirelens-data-${VERSION}`;
const SHELL = [
  "./", "index.html", "css/styles.css",
  "js/main.js", "js/utils.js", "js/store.js", "js/db.js", "js/render.js",
  "assets/icon.svg", "assets/fonts/figtree.woff2", "assets/fonts/bricolage-grotesque.woff2",
  "manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL_CACHE, DATA_CACHE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== location.origin) return;

  if (request.url.includes("/data/")) {
    event.respondWith(
      caches.open(DATA_CACHE).then(async (cache) => {
        const cached = await cache.match(request, { ignoreSearch: true });
        const network = fetch(request)
          .then((res) => { if (res.ok) cache.put(request, res.clone()); return res; })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => hit || fetch(request))
  );
});
