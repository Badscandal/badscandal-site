/* /touchme — the release smart link for the Meta ads (9 Nov 2026). Runs AFTER the button has
   painted (defer); nothing in here can slow the page down.

   1. Counts the visit and every store tap on our own counter (/api/hit -> /admin), with the ad
      it came from (utm_campaign / utm_content), the speed the button appeared at, and whether
      the visitor has been here before. No cookies, no names: a random id in localStorage.
   2. Tells Meta: Pixel (browser) + /api/capi (server, Conversions API) with the SAME event_id,
      so Meta deduplicates them into one event. PageView + ViewContent on load, SpotifyClick on
      the tap. EU/EEA/UK visitors (netlify/edge-functions/touchme-geo.js, else the phone's time
      zone) are asked first and nothing goes to Meta unless they tap Allow.
   3. Opens the Spotify APP where it can: Android -> intent:// with the web player as fallback;
      iPhone inside Instagram/Facebook/TikTok -> spotify: scheme, web player after 600 ms if the
      page is still showing; iPhone Safari -> the plain https link (a universal link, so iOS opens
      the app itself); desktop -> web player in a new tab.

   4. Real people only (9 Nov 2026): a page load is a person only after a real touch, pointer,
      scroll or key press while it is on screen (sent as an "act" hit). Until then nothing goes
      to Meta. A data-centre IP (data-dc from the edge function), a script-driven or headless
      browser, a "phone" with no touch screen, a page never on screen, or a tap faster than a
      human never gets Pixel or Conversions API events at all. Their visits still go to /api/hit
      with the reason (b) so /admin can show them on request, never in the numbers.

   Don't count yourself: open the page once with ?nostat=1 on each of your devices and in each
   app's browser (?nostat=0 undoes it), or tap "Don't count this device" in /admin. Your visits are
   then stored as "me" (hidden from the numbers). The Pixel still fires, so Meta tests work. */
(function () {
  "use strict";
  /* >>> EDIT HERE <<< for a new release page: copy touchme.html + this file, change these. */
  var PAGE = "touchme";
  var TITLE = "Touch Me";
  var TRACK = "6Y0BIHxJvTVIjOmk636Cw3";
  var PIXEL = "1442285344656582";

  var WEB = "https://open.spotify.com/track/" + TRACK;
  var d = document, html = d.documentElement, ua = navigator.userAgent;
  if (!/^https?:$/.test(location.protocol)) return;
  var local = /^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname);

  function get(store, k) { try { return window[store].getItem(k); } catch (e) { return null; } }
  function set(store, k, v) { try { window[store].setItem(k, v); } catch (e) {} }
  function clean(v, n) { return String(v || "").toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, n || 24); }
  function rid(n) {
    var s = "", a = new Uint8Array(n);
    try { crypto.getRandomValues(a); } catch (e) { for (var i = 0; i < n; i++) a[i] = Math.random() * 256; }
    for (var j = 0; j < n; j++) s += "abcdefghijklmnopqrstuvwxyz0123456789".charAt(a[j] % 36);
    return s;
  }
  function beacon(url, obj) {
    if (local) return;
    var s = JSON.stringify(obj);
    try { if (navigator.sendBeacon && navigator.sendBeacon(url, s)) return; } catch (e) {}
    try { fetch(url, { method: "POST", body: s, keepalive: true }).catch(function () {}); } catch (e) {}
  }

  /* ---- language: the inline script under the button picked it ---- */
  var lang = window.__bsLang || "en";
  var T = {
    en: ["We count visits and use the Meta Pixel to measure our ads.", "Privacy",
      "Can we use the Meta Pixel to measure our ads? It shares this visit with Meta.", "Allow", "No thanks"],
    pt: ["Contamos as visitas e usamos o Pixel da Meta para medir nossos anúncios.", "Privacidade",
      "Podemos usar o Pixel da Meta para medir nossos anúncios? Ele compartilha esta visita com a Meta.", "Permitir", "Não, obrigado"],
    es: ["Contamos las visitas y usamos el Píxel de Meta para medir nuestros anuncios.", "Privacidad",
      "¿Podemos usar el Píxel de Meta para medir nuestros anuncios? Comparte esta visita con Meta.", "Permitir", "No, gracias"],
    de: ["Wir zählen Besuche und nutzen das Meta-Pixel, um unsere Werbung zu messen.", "Datenschutz",
      "Dürfen wir das Meta-Pixel nutzen, um unsere Werbung zu messen? Dabei wird dieser Besuch mit Meta geteilt.", "Erlauben", "Nein danke"],
    fr: ["Nous comptons les visites et utilisons le pixel Meta pour mesurer nos publicités.", "Confidentialité",
      "Pouvons-nous utiliser le pixel Meta pour mesurer nos publicités ? Cette visite sera partagée avec Meta.", "Autoriser", "Non merci"],
    it: ["Contiamo le visite e usiamo il Pixel di Meta per misurare i nostri annunci.", "Privacy",
      "Possiamo usare il Pixel di Meta per misurare i nostri annunci? Condivide questa visita con Meta.", "Consenti", "No, grazie"],
    nl: ["We tellen bezoeken en gebruiken de Meta-pixel om onze advertenties te meten.", "Privacy",
      "Mogen we de Meta-pixel gebruiken om onze advertenties te meten? Dit bezoek wordt dan gedeeld met Meta.", "Toestaan", "Nee, bedankt"],
    pl: ["Liczymy odwiedziny i używamy Piksela Meta do mierzenia naszych reklam.", "Prywatność",
      "Czy możemy użyć Piksela Meta do mierzenia naszych reklam? Ta wizyta zostanie udostępniona Meta.", "Zezwól", "Nie, dziękuję"],
    cs: ["Počítáme návštěvy a k měření reklam používáme Meta Pixel.", "Soukromí",
      "Můžeme k měření reklam použít Meta Pixel? Tato návštěva bude sdílena s Meta.", "Povolit", "Ne, děkuji"],
  }[lang];
  function text(id, s) { var el = d.getElementById(id); if (el && s) el.firstChild.nodeValue = s; }
  if (T && lang !== "en") {
    text("note", T[0]); text("pl", T[1]); text("cpl", T[1]); text("ctext", T[2] + " "); text("cyes", T[3]); text("cno", T[4]);
  }

  /* ---- where the visit came from ---- */
  var q = new URLSearchParams(location.search);
  if (q.has("nostat")) {
    if (q.get("nostat") === "0") { try { localStorage.removeItem("bs_nostat"); } catch (e) {} }
    else set("localStorage", "bs_nostat", "1");
  }
  var nostat = get("localStorage", "bs_nostat") === "1";
  var utmContent = String(q.get("utm_content") || "").slice(0, 100);
  var uc = clean(q.get("utm_campaign"), 32), ux = clean(utmContent.replace(/\s+/g, "-"), 48);
  var fbclid = q.get("fbclid") || "";
  var ft = Number(get("sessionStorage", "bs_ft")) || Date.now();
  if (fbclid) set("sessionStorage", "bs_ft", String(ft));

  var src = clean(q.get("utm_source") || q.get("src"));
  if (!src) {
    if (/Instagram/i.test(ua)) src = "ig";
    else if (/FBAN|FBAV|FB_IAB/i.test(ua)) src = "facebook";
    else if (/musical_ly|TikTok|BytedanceWebview/i.test(ua)) src = "tiktok";
  }
  var ref = "";
  try { ref = d.referrer ? new URL(d.referrer).hostname.replace(/^www\./, "") : ""; } catch (e) {}
  if (ref === location.hostname.replace(/^www\./, "")) ref = "";
  if (!src && ref) {
    var known = { "instagram.com": "ig", "l.instagram.com": "ig", "facebook.com": "facebook", "m.facebook.com": "facebook",
      "l.facebook.com": "facebook", "lm.facebook.com": "facebook", "tiktok.com": "tiktok", "t.co": "x", "x.com": "x" };
    src = known[ref] || (/^google\./.test(ref) ? "google" : clean(ref));
  }
  src = src || get("sessionStorage", "bs_src_" + PAGE) || "direct";
  set("sessionStorage", "bs_src_" + PAGE, src);

  /* ---- who (anonymously): one random id per browser, one per page load ---- */
  var vid = get("localStorage", "bs_vid"), ret = vid ? 1 : 0;
  if (!vid) {
    vid = rid(20);
    set("localStorage", "bs_vid", vid);
    if (get("localStorage", "bs_vid") !== vid) vid = ""; /* storage blocked: the server hashes instead */
  }
  var pv = rid(12);

  function hit(o) {
    if (nostat) o.x = 1; /* kept, but filed under "me" and left out of the numbers */
    if (bot && !o.b) o.b = bot;
    if (fbclid) o.fb = 1;
    o.p = PAGE; o.s = src; o.v = vid; o.pv = pv; o.uc = uc; o.ux = ux; o.rf = clean(ref, 40);
    beacon("/api/hit", o);
  }

  /* ---- bots: decided before anything goes to Meta ---- */
  var dc = html.getAttribute("data-dc") === "1"; /* the server re-checks the IP anyway */
  var bot = "";
  try {
    var phoneUA = /iPhone|iPod|Android.*Mobile/i.test(ua);
    if (navigator.webdriver === true) bot = "webdriver";
    else if (/HeadlessChrome|PhantomJS|Electron\//.test(ua) || (navigator.languages && navigator.languages.length === 0) ||
      (window.screen && (screen.width === 0 || screen.height === 0))) bot = "headless";
    else if (phoneUA && !(navigator.maxTouchPoints > 0) && !("ontouchstart" in window)) bot = "notouch";
  } catch (e) {}
  var person = !bot && !dc;

  /* ---- consent: EU/EEA/UK are asked; everyone else sees the one-line notice ---- */
  var eu = html.getAttribute("data-eu");
  if (eu !== "1" && eu !== "0") {
    var tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
    eu = /^Europe\/|^Atlantic\/(Canary|Madeira|Azores|Reykjavik|Faroe)/.test(tz) ? "1" : "0";
  }
  var choice = get("localStorage", "bs_consent");
  /* bs_meta_off: "Turn off Meta on this browser" on /privacy (the opt-out outside the EU). */
  var metaOK = person && get("localStorage", "bs_meta_off") !== "1" && (eu !== "1" || choice === "yes");

  /* ---- Meta Pixel (browser) + Conversions API (server) ----
     The Pixel SCRIPT loads after first paint (so it's ready by the time anyone taps), but no
     event goes to Meta until the visitor has proved to be a person: a real touch, pointer,
     scroll or key press while the page is on screen (human() below). Link scanners and speed
     tests never do that, so Meta never hears about them. */
  var pixel = false, isHuman = false, tracked = false;
  function capi(events) {
    beacon("/api/capi", { ev: events, url: location.href, fbclid: fbclid, ft: ft, ux: utmContent, c: metaOK ? 1 : 0 });
  }
  function loadPixel() {
    if (pixel || !metaOK) return;
    pixel = true;
    var w = window, n = w.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!w._fbq) w._fbq = n;
    n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
    fbq("set", "autoConfig", false, PIXEL); /* no automatic button-click events: only ours */
    fbq("init", PIXEL); /* sets Meta's _fbp cookie; sends no event */
    var s = d.createElement("script");
    s.async = true;
    s.src = "https://connect.facebook.net/en_US/fbevents.js";
    d.head.appendChild(s);
    trackLoad();
  }
  /* PageView + ViewContent: once per page load, only for a person, only with Meta allowed. */
  function trackLoad() {
    if (tracked || !pixel || !isHuman || !metaOK) return;
    tracked = true;
    var a = rid(16), b = rid(16);
    fbq("track", "PageView", {}, { eventID: a });
    fbq("track", "ViewContent", { content_name: TITLE }, { eventID: b });
    capi([{ n: "PageView", id: a }, { n: "ViewContent", id: b }]);
  }

  /* ---- proof of a person: the first real interaction while the page is on screen ---- */
  /* A scroll counts through the finger (touchstart) or the mouse wheel / trackpad (wheel), not
     the bare "scroll" event: browsers fire that on their own when they restore a position. */
  var ACT = { pointerdown: "pointer", touchstart: "touch", keydown: "key", wheel: "scroll", pointermove: "pointer" };
  function human(kind) {
    if (isHuman || d.visibilityState !== "visible") return;
    isHuman = true;
    for (var t in ACT) window.removeEventListener(t, onAct, true);
    hit({ t: "act", k: kind, ms: Math.round(performance.now()) });
    loadPixel(); /* no-op if already loaded; then trackLoad() */
    trackLoad();
  }
  function onAct(ev) {
    if (ev.isTrusted === false || !person) return;
    if (ev.type === "pointermove" && ev.pointerType !== "mouse") return; /* phones: touch/scroll say it */
    human(ACT[ev.type]);
  }
  for (var t in ACT) window.addEventListener(t, onAct, { capture: true, passive: true });

  var bar = d.getElementById("consent");
  if (eu === "1" && !choice && bar) {
    bar.hidden = false;
    html.classList.add("ask");
    var answer = function (yes) {
      set("localStorage", "bs_consent", yes ? "yes" : "no");
      bar.hidden = true;
      html.classList.remove("ask");
      metaOK = yes && person;
      hit({ t: "consent", k: yes ? "yes" : "no" });
      if (metaOK) loadPixel(); /* the Allow tap already proved a person: events go now */
    };
    d.getElementById("cyes").addEventListener("click", function () { answer(true); });
    d.getElementById("cno").addEventListener("click", function () { answer(false); });
  }

  /* ---- after the first paint, once the page is on screen: count the view, load the Pixel.
     A page that is never shown (a scanner, a prerender) is filed as a bot when it closes. ---- */
  var started = false;
  function afterPaint(fn) {
    if (window.requestAnimationFrame) requestAnimationFrame(function () { setTimeout(fn, 0); });
    else setTimeout(fn, 0);
  }
  function start() {
    if (started || d.visibilityState === "hidden") return;
    started = true;
    afterPaint(function () {
      hit({ t: "view", ms: window.__bsReady || Math.round(performance.now()), r: ret });
      loadPixel();
    });
  }
  d.addEventListener("visibilitychange", start);
  window.addEventListener("pagehide", function () {
    if (started) return;
    started = true;
    hit({ t: "view", ms: Math.round(performance.now()), r: ret, b: "hidden" });
  });
  start();

  /* ---- the taps ---- */
  var inApp = /Instagram|FBAN|FBAV|FB_IAB|musical_ly|TikTok|BytedanceWebview|Snapchat|Twitter|LinkedInApp|Line\//i.test(ua);
  var iOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var android = /Android/i.test(ua);

  function openSpotify(ev) {
    if (android) {
      ev.preventDefault();
      location.href = "intent://track/" + TRACK + "#Intent;scheme=spotify;package=com.spotify.music;S.browser_fallback_url=" +
        encodeURIComponent(WEB) + ";end";
      return;
    }
    if (iOS && inApp) {
      ev.preventDefault();
      var start = Date.now(), left = false;
      var gone = function () { left = true; };
      window.addEventListener("blur", gone, { once: true });
      window.addEventListener("pagehide", gone, { once: true });
      d.addEventListener("visibilitychange", function () { if (d.hidden) gone(); }, { once: true });
      location.href = "spotify:track:" + TRACK;
      setTimeout(function () {
        /* still here 600 ms later = no app (or the app refused): the web player instead */
        if (!left && !d.hidden && Date.now() - start < 2500) location.href = WEB;
      }, 600); /* >>> TUNE HERE <<< if the app opens AND the web player also loads, raise this */
      return;
    }
    if (iOS) return; /* Safari & co: let the https link through; iOS hands it to the app */
    ev.preventDefault();
    var w = window.open(WEB, "_blank", "noopener");
    if (!w) location.href = WEB;
  }

  d.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("a[data-store]");
    if (!a) return;
    var store = a.getAttribute("data-store");
    var ms = Math.round(performance.now());
    /* a script's click, or a tap within 150 ms of the button appearing: no human does that */
    var fake = ev.isTrusted === false ? "synthetic" : window.__bsReady && ms - window.__bsReady < 150 ? "fasttap" : "";
    if (store !== "spotify") { hit({ t: "click", k: store, ms: ms, b: fake || undefined }); return; }

    if (!fake) human("tap"); /* normally the touch before this click already did it */
    if (metaOK && !fake) {
      loadPixel(); /* in case the tap beat the after-paint load: the calls queue */
      var id = rid(16);
      fbq("trackCustom", "SpotifyClick", { content_name: TITLE, service: "spotify", utm_content: utmContent }, { eventID: id });
      capi([{ n: "SpotifyClick", id: id }]);
    }
    hit({ t: "click", k: "spotify", ms: ms, m: metaOK && !fake ? 1 : 0, b: fake || undefined });
    openSpotify(ev);
  }, true);
})();
