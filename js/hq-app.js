/* BADSCANDAL HQ · the page's side of the HQ apps (12 Nov 2026). The iPhone app and the Mac app are
   native windows around this same page (their code is in a PRIVATE repo, never here). Each one sets
   window.HQApp = { platform, env, app, version, tz } before the page runs, and listens on
   window.webkit.messageHandlers.hqApp. This file:

     - asks GET /api/hq/push/waiting after every refresh and when the page comes back on screen, and
       draws the line under New release on Today ("3 things waiting on you" -> #messages). That line is
       for the browser too: everything below it only happens inside an app.
     - tells the app { type: "ready", loggedIn: true } once HQ's data has loaded with a good login (the
       app then asks for alerts and hands over its token), { type: "ready", loggedIn: false } on the
       login form, { type: "waiting", count } for the badge, and { type: "loggedOut" } after Log out.
     - takes the token from the app's "hqapp" event and posts it to /api/hq/push/register (once per
       token per page load, only while logged in); Log out posts /api/hq/push/unregister first.

   Nothing here runs in ?sample=1 except the line (from the made-up desk). Rules: js/hq-lib.js
   (waitWords, appRegisterBody). */
(function () {
  "use strict";
  var HQ = window.HQ, L = window.HQLib;
  if (!HQ || !L) return;
  var $ = function (id) { return document.getElementById(id); };
  var sample = !!HQ.sample;
  var app = window.HQApp && typeof window.HQApp === "object" ? window.HQApp : null;
  var authed = null; /* null = not known yet, true = logged in, false = the login form */
  var lastToken = "", pendingToken = "", registered = {}, asking = null;

  function native(msg) {
    if (!app || sample) return;
    try { window.webkit.messageHandlers.hqApp.postMessage(msg); } catch (e) {}
  }
  function drawLine(n) {
    var el = $("waitLine"); if (!el) return;
    var w = L.waitWords(n);
    el.textContent = w; el.hidden = !w;
  }
  function loggedOutSeen() {
    drawLine(0);
    if (authed === false) return;
    authed = false;
    native({ type: "ready", loggedIn: false });
  }
  function checkWaiting() {
    if (asking) return asking;
    asking = HQ.getJSON("/api/hq/push/waiting" + (sample ? "?sample=1" : "")).then(function (res) {
      asking = null;
      if (res.s === 401) { loggedOutSeen(); return; }
      if (res.s !== 200 || !res.j || typeof res.j.count !== "number") return; /* keep the last line */
      drawLine(res.j.count);
      if (authed !== true) { authed = true; native({ type: "ready", loggedIn: true }); }
      native({ type: "waiting", count: Math.max(0, Math.floor(res.j.count)) });
      if (pendingToken) register(pendingToken);
    }, function () { asking = null; });
    return asking;
  }
  function register(token) {
    if (!app || sample || !token || registered[token]) return;
    if (authed !== true) { pendingToken = token; return; }
    registered[token] = "sending"; pendingToken = "";
    HQ.postJSON("/api/hq/push/register", L.appRegisterBody(app, token)).then(function (res) {
      if (res.s === 200 && res.j && res.j.ok) { registered[token] = true; return; }
      delete registered[token];
      if (res.s === 401) { pendingToken = token; loggedOutSeen(); }
    }, function () { delete registered[token]; pendingToken = token; });
  }

  /* the app's token (the native side dispatches it every time it has one) */
  window.addEventListener("hqapp", function (ev) {
    var d = ev && ev.detail;
    if (!d || d.type !== "token" || typeof d.token !== "string" || !/^[0-9a-fA-F]{64,200}$/.test(d.token)) return;
    lastToken = d.token;
    register(d.token);
  });
  /* js/hq.js: every refresh (on start, every 5 minutes, the button) and the login form */
  document.addEventListener("hq:refreshed", checkWaiting);
  document.addEventListener("hq:login", loggedOutSeen);
  document.addEventListener("visibilitychange", function () { if (!document.hidden && authed !== false) checkWaiting(); });

  /* Log out (js/hq.js waits for this, at most 3 seconds): this device stops getting alerts while the
     login still works, then the app clears its badge */
  window.HQAppPage = {
    beforeLogout: function () {
      if (!app || sample) return Promise.resolve();
      var token = lastToken;
      var gone = token ? HQ.postJSON("/api/hq/push/unregister", { token: token }).catch(function () {}) : Promise.resolve();
      var late = new Promise(function (r) { setTimeout(r, 3000); });
      return Promise.race([gone, late]).then(function () {
        registered = {}; pendingToken = token; /* logging in again on this page registers it again */
        authed = false; drawLine(0);
        native({ type: "loggedOut" });
      });
    }
  };
})();
