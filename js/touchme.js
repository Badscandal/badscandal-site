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

   Don't count yourself: open the page once with ?nostat=1 on each of your devices (?nostat=0
   undoes it). The Pixel still fires with nostat, so Meta test events keep working. */
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
    if (nostat) return;
    o.p = PAGE; o.s = src; o.v = vid; o.pv = pv; o.uc = uc; o.ux = ux; o.rf = clean(ref, 40);
    beacon("/api/hit", o);
  }

  /* ---- consent: EU/EEA/UK are asked; everyone else sees the one-line notice ---- */
  var eu = html.getAttribute("data-eu");
  if (eu !== "1" && eu !== "0") {
    var tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
    eu = /^Europe\/|^Atlantic\/(Canary|Madeira|Azores|Reykjavik|Faroe)/.test(tz) ? "1" : "0";
  }
  var choice = get("localStorage", "bs_consent");
  /* bs_meta_off: "Turn off Meta on this browser" on /privacy (the opt-out outside the EU). */
  var metaOK = get("localStorage", "bs_meta_off") !== "1" && (eu !== "1" || choice === "yes");

  /* ---- Meta Pixel (browser) + Conversions API (server) ---- */
  var pixel = false;
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
    fbq("init", PIXEL);
    var a = rid(16), b = rid(16);
    fbq("track", "PageView", {}, { eventID: a });
    fbq("track", "ViewContent", { content_name: TITLE }, { eventID: b });
    var sent = false;
    /* Server copy goes once fbevents.js has set the _fbp cookie (better match quality). */
    function server() { if (!sent) { sent = true; capi([{ n: "PageView", id: a }, { n: "ViewContent", id: b }]); } }
    var s = d.createElement("script");
    s.async = true;
    s.src = "https://connect.facebook.net/en_US/fbevents.js";
    s.onload = s.onerror = function () { setTimeout(server, 0); };
    setTimeout(server, 3000);
    d.head.appendChild(s);
  }

  var bar = d.getElementById("consent");
  if (eu === "1" && !choice && bar) {
    bar.hidden = false;
    html.classList.add("ask");
    var answer = function (yes) {
      set("localStorage", "bs_consent", yes ? "yes" : "no");
      bar.hidden = true;
      html.classList.remove("ask");
      metaOK = yes;
      hit({ t: "consent", k: yes ? "yes" : "no" });
      if (yes) loadPixel();
    };
    d.getElementById("cyes").addEventListener("click", function () { answer(true); });
    d.getElementById("cno").addEventListener("click", function () { answer(false); });
  }

  /* ---- after the first paint: count the view, then load the Pixel ---- */
  function afterPaint(fn) {
    if (window.requestAnimationFrame) requestAnimationFrame(function () { setTimeout(fn, 0); });
    else setTimeout(fn, 0);
  }
  afterPaint(function () {
    hit({ t: "view", ms: window.__bsReady || Math.round(performance.now()), r: ret });
    loadPixel();
  });

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
    if (store !== "spotify") { hit({ t: "click", k: store, ms: ms }); return; }

    if (metaOK) {
      loadPixel(); /* in case the tap beat the after-paint load: the call queues */
      var id = rid(16);
      fbq("trackCustom", "SpotifyClick", { content_name: TITLE, service: "spotify", utm_content: utmContent }, { eventID: id });
      capi([{ n: "SpotifyClick", id: id }]);
    }
    hit({ t: "click", k: "spotify", ms: ms, m: metaOK ? 1 : 0 });
    openSpotify(ev);
  }, true);
})();
