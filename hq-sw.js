/* BADSCANDAL HQ · offline helper (11 Nov 2026). Registered by js/hq-shell.js with scope "/hq", so it
   only ever sees /hq and what /hq loads: it never touches the rest of badscandal.com.
   It keeps a copy of the PAGE and its SCRIPTS so the home-screen app opens without signal. It never
   keeps the numbers (/api/* always goes to the network; the page shows this device's last good copy
   "as of <time>" when offline). Network first, then the cached copy of that same url.
   An airline network can hang, so each fetch gives up after 8s and uses the cached copy.
   Script urls carry ?v= (one content hash of the HQ scripts, including hq-look.js and hq-workspaces.js).
   The cache key is the full url, so a new page can never be paired with an older script. */
var CACHE = "bs-hq-v18"; /* v18 (21 Nov 2026): Needs you as decision and ask cards, the bots' re-check fixes. v17: Needs you cards, dispute cards, money. */
var V = "36e199d345b7";
var SHELL = ["/hq",
  "/js/crt.js?v=" + V,
  "/js/hq-lib.js?v=" + V,
  "/js/hq-chart.js?v=" + V,
  "/js/hq-growth.js?v=" + V,
  "/js/hq-look.js?v=" + V,
  "/js/hq.js?v=" + V,
  "/js/hq-staff.js?v=" + V,
  "/js/hq-phone.js?v=" + V,
  "/js/hq-shell.js?v=" + V,
  "/js/hq-workspaces.js?v=" + V,
  "/js/hq-app.js?v=" + V,
  "/js/hq-cmd.js?v=" + V,
  "/js/hq-pages.js?v=" + V,
  "/hq.webmanifest",
  "/assets/hq-icon-192-v1.png"];
var FETCH_MS = 8000;

function fetchWithTimeout(req) {
  return new Promise(function (resolve, reject) {
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var settled = false;
    var timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      try { if (ctrl) ctrl.abort(); } catch (e) {}
      reject(new Error("timeout"));
    }, FETCH_MS);
    fetch(req, ctrl ? { signal: ctrl.signal } : undefined).then(function (res) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(res);
    }, function (err) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}
self.addEventListener("install", function (e) {
  /* A hang must not keep the previous worker (the one that mixed versions) in control. */
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(SHELL.map(function (path) {
      return fetchWithTimeout(path).then(function (res) {
        if (res && res.ok && res.type === "basic") return c.put(path, res);
      }).catch(function () {});
    }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf("bs-hq-") === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.indexOf("/api/") === 0) return; /* never the numbers */
  var key = req.mode === "navigate" ? "/hq" : url.pathname + url.search;
  if (req.mode !== "navigate" && SHELL.indexOf(key) < 0) return;
  e.respondWith(fetchWithTimeout(req).then(function (res) {
    /* only a real page: never keep an error or a redirect over the good copy */
    if (res.ok && res.type === "basic") { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(key, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(key).then(function (hit) { return hit || Response.error(); });
  }));
});
