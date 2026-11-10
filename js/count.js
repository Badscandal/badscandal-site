/* The home page's own visit counter (10 Nov 2026) -> /admin, link "Home page". Same counter and
   the same people-only rules as the song pages (js/song.js), but NO Meta: no Pixel, no Conversions
   API, so no consent bar is needed here. Anonymous: a random id in localStorage, no cookies.

   Sends to /api/hit (page "home"): the view once the page is on screen, the first real touch /
   pointer / wheel / key press ("act": what makes it count as a person), and every tap on a music
   or social link (target = spotify, apple, youtube, soundcloud, instagram, tiktok, email, …; the
   release button counts as spotify when it points at Spotify). Bots are flagged, never dropped:
   /admin hides them. ?nostat=1 (or /admin "Don't count this device") files your visits as "me". */
(function () {
  "use strict";
  var d = document, ua = navigator.userAgent;
  if (!/^https?:$/.test(location.protocol) || /^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname)) return;

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function clean(v, n) {
    v = String(v || "");
    try { v = v.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
    return v.toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, n || 24);
  }
  function rid(n) {
    var s = "", a = new Uint8Array(n);
    try { crypto.getRandomValues(a); } catch (e) { for (var i = 0; i < n; i++) a[i] = Math.random() * 256; }
    for (var j = 0; j < n; j++) s += "abcdefghijklmnopqrstuvwxyz0123456789".charAt(a[j] % 36);
    return s;
  }

  var q = new URLSearchParams(location.search);
  if (q.has("nostat")) { if (q.get("nostat") === "0") { try { localStorage.removeItem("bs_nostat"); } catch (e) {} } else put("bs_nostat", "1"); }
  var nostat = get("bs_nostat") === "1";
  var fbclid = q.get("fbclid") || "";
  var src = clean(q.get("utm_source") || q.get("src"));
  if (!src) {
    if (/Instagram/i.test(ua)) src = "ig";
    else if (/FBAN|FBAV|FB_IAB/i.test(ua)) src = "facebook";
    else if (/musical_ly|TikTok|BytedanceWebview/i.test(ua)) src = "tiktok";
  }
  var ref = "";
  try { ref = d.referrer ? new URL(d.referrer).hostname.replace(/^www\./, "") : ""; } catch (e) {}
  if (ref === location.hostname.replace(/^www\./, "")) ref = "";
  if (!src && ref) src = /instagram\.com$/.test(ref) ? "ig" : /facebook\.com$/.test(ref) ? "facebook" : /^google\./.test(ref) ? "google" : clean(ref);
  src = src || "direct";

  var vid = get("bs_vid"), ret = vid ? 1 : 0;
  if (!vid) { vid = rid(20); put("bs_vid", vid); if (get("bs_vid") !== vid) vid = ""; }
  var pv = rid(12);

  var bot = "";
  try {
    if (navigator.webdriver === true) bot = "webdriver";
    else if (/HeadlessChrome|PhantomJS|Electron\//.test(ua) || (navigator.languages && navigator.languages.length === 0) ||
      (window.screen && (screen.width === 0 || screen.height === 0))) bot = "headless";
    else if (/iPhone|iPod|Android.*Mobile/i.test(ua) && !(navigator.maxTouchPoints > 0) && !("ontouchstart" in window)) bot = "notouch";
  } catch (e) {}

  function hit(o) {
    if (nostat) o.x = 1;
    if (bot && !o.b) o.b = bot;
    if (fbclid) o.fb = 1;
    o.p = "home"; o.s = src; o.v = vid; o.pv = pv;
    o.uc = clean(q.get("utm_campaign"), 32); o.ux = clean(String(q.get("utm_content") || "").replace(/\s+/g, "-"), 48); o.rf = clean(ref, 40);
    var s = JSON.stringify(o);
    try { if (navigator.sendBeacon && navigator.sendBeacon("/api/hit", s)) return; } catch (e) {}
    try { fetch("/api/hit", { method: "POST", body: s, keepalive: true }).catch(function () {}); } catch (e) {}
  }

  /* the view, once the page is actually on screen (never shown = a bot, filed when it closes) */
  var started = false, t0 = 0;
  function start() {
    if (started || d.visibilityState === "hidden") return;
    started = true;
    setTimeout(function () { t0 = Math.round(performance.now()); hit({ t: "view", ms: t0, r: ret }); }, 0);
  }
  d.addEventListener("visibilitychange", start);
  window.addEventListener("pagehide", function () { if (!started) { started = true; hit({ t: "view", ms: Math.round(performance.now()), r: ret, b: "hidden" }); } });
  start();

  /* proof of a person */
  var ACT = { pointerdown: "pointer", touchstart: "touch", keydown: "key", wheel: "scroll", pointermove: "pointer" }, human = false;
  function onAct(ev) {
    if (human || ev.isTrusted === false || d.visibilityState !== "visible") return;
    if (ev.type === "pointermove" && ev.pointerType !== "mouse") return;
    human = true;
    for (var k in ACT) window.removeEventListener(k, onAct, true);
    hit({ t: "act", k: ACT[ev.type], ms: Math.round(performance.now()) });
  }
  for (var k in ACT) window.addEventListener(k, onAct, { capture: true, passive: true });

  /* link taps */
  d.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("a[data-link], a[data-rel], a[data-rel-link]");
    if (!a) return;
    var key = a.getAttribute("data-link") || a.getAttribute("data-rel-link") ||
      (/open\.spotify\.com/.test(a.href) ? "spotify" : clean(a.getAttribute("data-rel"), 24));
    var ms = Math.round(performance.now());
    var fake = ev.isTrusted === false ? "synthetic" : "";
    if (!fake && !human) { human = true; hit({ t: "act", k: "tap", ms: ms }); }
    hit({ t: "click", k: clean(key, 24), ms: ms, b: fake || undefined });
  }, true);
})();
