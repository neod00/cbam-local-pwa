const CACHE_NAME = "cbam-local-v4";
const APP_SHELL = [
  "/",
  "/announcement",
  "/export",
  "/guide",
  "/installations",
  "/periods",
  "/privacy",
  "/precursors",
  "/processes",
  "/products",
  "/release-notes",
  "/results",
  "/scenarios",
  "/settings",
  "/source-streams",
  "/terms",
  "/upload",
  "/manifest.webmanifest",
  "/update-manifest.json",
  "/icon.svg"
];

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

function isNavigationRequest(request) {
  return request.mode === "navigate" || request.destination === "document" || request.headers.get("accept")?.includes("text/html");
}

function isImmutableAsset(request) {
  const url = new URL(request.url);
  return url.pathname.startsWith("/_next/static/") || url.pathname.endsWith(".svg") || url.pathname.endsWith(".png") || url.pathname.endsWith(".webmanifest");
}

async function putIfCacheable(request, response) {
  if (!response || response.status !== 200 || response.type === "opaque") {
    return response;
  }

  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, fallbackUrl = "/") {
  try {
    const response = await fetch(request, { cache: "no-store" });
    return await putIfCacheable(request, response);
  } catch {
    const cached = await caches.match(request);
    return cached ?? caches.match(fallbackUrl);
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);

  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  return putIfCacheable(request, response);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET" || !isSameOrigin(request)) {
    return;
  }

  if (isNavigationRequest(request) || new URL(request.url).pathname === "/update-manifest.json") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isImmutableAsset(request)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});
