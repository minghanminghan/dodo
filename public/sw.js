const STATIC = "dodo-static";
const PAGES = "dodo-pages";
const CURRENT = [STATIC, PAGES];
const ASSET = /\/_next\/static\/[^"'\\\s)]+/g;

self.addEventListener("install", (event) => {
  event.waitUntil(
    cacheShell("/")
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => !CURRENT.includes(n)).map((n) => caches.delete(n))),
      )
      .then(dropQueryPages)
      .then(() => self.clients.claim()),
  );
});

function assetsOf(html) {
  return [...new Set(html.match(ASSET) ?? [])];
}

// Every /?doc= URL serves the same app page, so pages are cached by path only.
function pageKey(url) {
  const u = new URL(url);
  return u.origin + u.pathname;
}

// Older builds stored one page per ?doc= URL.
async function dropQueryPages() {
  const pages = await caches.open(PAGES);
  for (const req of await pages.keys()) {
    const { pathname, search } = new URL(req.url);
    if (search && !pathname.startsWith("/api/")) await pages.delete(req);
  }
}

let shellQueue = Promise.resolve();

// Stores a page only once every /_next/static asset it references is cached,
// so an offline open never loads HTML whose scripts are missing. Runs one at
// a time so a prune never drops assets another page is still collecting.
function cacheShell(url, res) {
  const run = shellQueue.then(() => storeShell(url, res));
  shellQueue = run.catch(() => {});
  return run;
}

async function storeShell(url, res) {
  res = res ?? (await fetch(url));
  if (!res.ok || res.redirected) return;
  const assets = assetsOf(await res.clone().text());
  const statics = await caches.open(STATIC);
  await Promise.all(assets.map(async (a) => (await statics.match(a)) || statics.add(a)));
  const pages = await caches.open(PAGES);
  const old = await pages.match(url);
  const before = old ? assetsOf(await old.text()) : [];
  await pages.put(url, res);
  // Lazy chunks (editor, code parsers) are in no page, so prune only when a deploy changes the page.
  if (before.length !== assets.length || before.some((a) => !assets.includes(a))) await prune();
}

async function prune() {
  const pages = await caches.open(PAGES);
  const used = new Set();
  for (const req of await pages.keys()) {
    const res = await pages.match(req);
    if (!res?.headers.get("content-type")?.includes("text/html")) continue;
    for (const a of assetsOf(await res.text())) used.add(a);
  }
  const statics = await caches.open(STATIC);
  for (const req of await statics.keys()) {
    const { pathname, search } = new URL(req.url);
    if (!used.has(pathname + search)) await statics.delete(req);
  }
}

async function cacheFirst(event) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(event.request);
  if (hit) return hit;
  const res = await fetch(event.request);
  if (res.ok) event.waitUntil(cache.put(event.request, res.clone()).catch(() => {}));
  return res;
}

async function navigate(event) {
  const { request } = event;
  const key = pageKey(request.url);
  const cache = await caches.open(PAGES);
  const hit = await cache.match(key);
  if (hit) {
    event.waitUntil(cacheShell(key).catch(() => {}));
    return hit;
  }
  try {
    const res = await fetch(request);
    event.waitUntil(cacheShell(key, res.clone()).catch(() => {}));
    return res;
  } catch (err) {
    const shell = await cache.match("/");
    if (shell) return shell;
    throw err;
  }
}

async function staleWhileRevalidate(event) {
  const { request } = event;
  const cache = await caches.open(PAGES);
  const hit = await cache.match(request);
  const fresh = fetch(request);
  event.waitUntil(
    fresh
      .then((res) => res.ok && !res.redirected && cache.put(request, res.clone()))
      .catch(() => {}),
  );
  return hit ?? fresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Files seen once show offline.
  if (url.pathname.startsWith("/api/files/")) return event.respondWith(staleWhileRevalidate(event));
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/cli/")) return;
  if (request.headers.has("RSC") || url.searchParams.has("_rsc")) return;

  if (url.pathname.startsWith("/_next/static/")) event.respondWith(cacheFirst(event));
  else if (request.mode === "navigate") event.respondWith(navigate(event));
  else event.respondWith(staleWhileRevalidate(event));
});
