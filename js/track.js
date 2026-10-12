/* Our own visit counter (11 Oct 2026) — no third-party analytics, no cookies banner needed.
   Sends one "view" per page load and one "click" per tapped link to /api/hit; the numbers live
   at badscandal.com/stats (code-gated). Server side: netlify/functions/hit.mjs + stats.mjs.

   Where a visit came from, first match wins:
     1. ?src=… on the URL — the IG bio link is badscandal.com/ig (= /listen?src=ig, _redirects)
     2. an in-app browser: Instagram / Facebook / TikTok put their name in the user agent
     3. the referrer's site (google, youtube, …), else "direct"
   The source is kept for the tab's session, so link taps carry it too, and ?src is stripped
   from the address bar so a copied link doesn't count as Instagram.

   Unique visitors: a random id kept in localStorage — one per phone/browser, nothing personal.
   Don't count yourself: open the page once with ?nostat=1 on each of your devices
   (?nostat=0 undoes it). */
(function () {
  "use strict";
  var PAGE = document.body.getAttribute("data-track"); /* >>> EDIT HERE <<< <body data-track="listen"> */
  if (!PAGE || !/^https?:$/.test(location.protocol)) return;
  if (/^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname)) return;

  function get(store, k) { try { return window[store].getItem(k); } catch (e) { return null; } }
  function set(store, k, v) { try { window[store].setItem(k, v); } catch (e) {} }
  function clean(v) { return String(v || "").toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 24); }

  var q = new URLSearchParams(location.search);
  if (q.has("nostat")) {
    if (q.get("nostat") === "0") { try { localStorage.removeItem("bs_nostat"); } catch (e) {} }
    else set("localStorage", "bs_nostat", "1");
  }

  var src = clean(q.get("src") || q.get("utm_source"));
  if (!src) {
    var ua = navigator.userAgent;
    if (/Instagram/i.test(ua)) src = "ig";
    else if (/FBAN|FBAV|FB_IAB/i.test(ua)) src = "facebook";
    else if (/musical_ly|TikTok|BytedanceWebview/i.test(ua)) src = "tiktok";
  }
  if (!src && document.referrer) {
    var host = "";
    try { host = new URL(document.referrer).hostname.replace(/^www\.|^m\.|^l\.|^lm\./, ""); } catch (e) {}
    if (host && host !== location.hostname) {
      var known = { "instagram.com": "ig", "facebook.com": "facebook", "tiktok.com": "tiktok", "t.co": "x", "x.com": "x",
        "twitter.com": "x", "youtube.com": "youtube", "linktr.ee": "linktree", "open.spotify.com": "spotify" };
      src = known[host] || (/^google\./.test(host) ? "google" : /bing\.com$/.test(host) ? "bing" : clean(host));
    }
  }
  src = src || get("sessionStorage", "bs_src") || "direct";
  set("sessionStorage", "bs_src", src);

  if (q.has("src") || q.has("nostat")) {
    q.delete("src"); q.delete("nostat");
    var rest = q.toString();
    try { history.replaceState(null, "", location.pathname + (rest ? "?" + rest : "") + location.hash); } catch (e) {}
  }

  if (get("localStorage", "bs_nostat") === "1") return;

  var vid = get("localStorage", "bs_vid");
  if (!vid) {
    vid = "";
    for (var i = 0; i < 4; i++) vid += Math.random().toString(36).slice(2, 7);
    vid = vid.replace(/[^a-z0-9]/g, "").slice(0, 20);
    set("localStorage", "bs_vid", vid);
    if (get("localStorage", "bs_vid") !== vid) vid = ""; /* storage blocked: server hashes instead */
  }

  function send(type, target) {
    var body = JSON.stringify({ t: type, p: PAGE, s: src, v: vid, k: target || "" });
    if (navigator.sendBeacon && navigator.sendBeacon("/api/hit", body)) return;
    if (window.fetch) fetch("/api/hit", { method: "POST", body: body, keepalive: true }).catch(function () {});
  }

  send("view");

  /* Link taps: the listen rows say which platform in data-link / data-rel-link / data-rel. */
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("a[href]");
    if (!a) return;
    var target = a.getAttribute("data-link") ||
      (a.getAttribute("data-rel-link") && "release-" + a.getAttribute("data-rel-link")) ||
      (a.getAttribute("data-rel") === "cta" && "release");
    if (target) send("click", target);
  }, true);
})();
