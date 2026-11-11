/* BADSCANDAL HQ · offline helper (11 Nov 2026). Registered by js/hq-shell.js with scope "/hq", so it
   only ever sees /hq and what /hq loads: it never touches the rest of badscandal.com.
   It keeps a copy of the PAGE and its SCRIPTS so the home-screen app opens without signal. It never
   keeps the numbers (/api/* always goes to the network; the page shows this device's last good copy
   "as of <time>" when offline). Network first: a new version is used as soon as there is signal. */
var CACHE = "bs-hq-v2"; /* v2 (11 Nov 2026): js/hq-staff.js joined the list */
var SHELL = ["/hq", "/js/hq-lib.js", "/js/hq.js", "/js/hq-staff.js", "/js/hq-pages.js", "/js/hq-shell.js", "/js/crt.js", "/hq.webmanifest", "/assets/hq-icon-192-v1.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).catch(function () {}).then(function () { return self.skipWaiting(); }));
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
  var key = req.mode === "navigate" ? "/hq" : url.pathname;
  if (req.mode !== "navigate" && SHELL.indexOf(key) < 0) return;
  e.respondWith(fetch(req).then(function (res) {
    /* only a real page: never keep an error or a redirect over the good copy */
    if (res.ok && res.type === "basic") { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(key, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(key).then(function (hit) { return hit || Response.error(); });
  }));
});
