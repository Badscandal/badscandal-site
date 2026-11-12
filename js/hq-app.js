/* BADSCANDAL HQ · the page's side of the HQ apps (12 Nov 2026). The iPhone app and the Mac app are
   native windows around this same page (their code is in a PRIVATE repo, never here). Each one sets
   window.HQApp = { platform, env, app, version, tz } before the page runs (and updates tz when it comes
   back to the front), and listens on window.webkit.messageHandlers.hqApp. This file:

     - takes "logged in" ONLY from HQ's own refresh (js/hq.js "hq:refreshed" with loggedIn: its data
       answered with a good login): then it tells the app { type: "ready", loggedIn: true } (the app
       asks for alerts and hands over its token) and registers the token. The login form -> { type:
       "ready", loggedIn: false }.
     - asks GET /api/hq/push/waiting only for the COUNT, after each logged-in refresh and when the page
       comes back on screen, and draws the line under New release on Today ("3 things waiting on you"
       -> #messages; in a browser too) and tells the app { type: "waiting", count } for the badge.
     - registers the token from the app's "hqapp" event with POST /api/hq/push/register: once per token
       per page load, and again when the zone has changed (Luke flew from São Paulo to Dublin and opened
       the app: quiet hours follow him).
     - Log out (js/hq.js waits for HQAppPage.beforeLogout, at most 3 s): a registration on its way
       finishes first, then POST /api/hq/push/unregister, then { type: "loggedOut" }. Anything that
       started before Log out and answers after it is ignored, so the device can't register again.

   Nothing native happens without window.HQApp, and nothing at all in ?sample=1 except the line.
   Rules: js/hq-lib.js (waitWords, appRegisterBody). Tested in tests/hq-app.test.mjs. */
(function () {
  "use strict";
  var HQ = window.HQ, L = window.HQLib;
  if (!HQ || !L) return;
  var $ = function (id) { return document.getElementById(id); };
  var sample = !!HQ.sample;
  var app = window.HQApp && typeof window.HQApp === "object" ? window.HQApp : null;
  var authed = null;   /* null = not known yet, true = logged in, false = the login form / logged out */
  var session = 0;     /* goes up at every Log out: answers from an older session are dropped */
  var loggedOutAt = 0; /* a refresh that started before this is dropped */
  var lastToken = "", pendingToken = "", sentTz = {}, inflight = null;

  function native(msg) {
    if (!app || sample) return;
    try { window.webkit.messageHandlers.hqApp.postMessage(msg); } catch (e) {}
  }
  /* the app's zone; an app that sends none: this device's own */
  function zone() {
    var z = app && typeof app.tz === "string" ? app.tz : "";
    if (!z) { try { z = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {} }
    return z;
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
  /* the count only: it never decides who is logged in */
  function checkWaiting() {
    if (authed !== true) return;
    var s = session;
    HQ.getJSON("/api/hq/push/waiting" + (sample ? "?sample=1" : "")).then(function (res) {
      if (s !== session || authed !== true) return; /* asked before a Log out */
      if (!res || res.s !== 200 || !res.j || typeof res.j.count !== "number") return; /* keep the last line */
      var n = Math.max(0, Math.floor(res.j.count));
      drawLine(n);
      native({ type: "waiting", count: n });
    }, function () {});
  }
  function register(token) {
    if (!app || sample || !token) return;
    if (authed !== true) { pendingToken = token; return; }
    var tz = zone();
    if (sentTz[token] === tz) return; /* already registered with this zone */
    if (inflight) { pendingToken = token; return; } /* one at a time: this one goes after it */
    pendingToken = "";
    var s = session, body = L.appRegisterBody(app, token);
    body.tz = tz;
    inflight = HQ.postJSON("/api/hq/push/register", body).then(function (res) {
      inflight = null;
      if (s !== session) return; /* Log out came first: beforeLogout unregisters it */
      if (res && res.s === 401) { pendingToken = token; loggedOutSeen(); return; }
      if (!(res && res.s === 200 && res.j && res.j.ok)) { pendingToken = token; return; } /* tried again at the next refresh */
      sentTz[token] = tz;
      /* a newer token, or the zone changed while this was on its way */
      var next = pendingToken || token;
      if (sentTz[next] !== zone()) { pendingToken = ""; register(next); }
    }, function () { inflight = null; if (s === session) pendingToken = token; });
  }

  /* the app's token (the native side dispatches it every time it has one) */
  window.addEventListener("hqapp", function (ev) {
    var d = ev && ev.detail;
    if (!d || d.type !== "token" || typeof d.token !== "string" || !/^[0-9a-fA-F]{64,200}$/.test(d.token)) return;
    lastToken = d.token;
    register(d.token);
  });
  /* js/hq.js: every refresh (on start, every 5 minutes, the button) and the login form */
  document.addEventListener("hq:refreshed", function (ev) {
    var d = (ev && ev.detail) || {};
    if (typeof d.startedAt === "number" && d.startedAt <= loggedOutAt) return; /* began before Log out */
    if (!d.loggedIn) return; /* not known (offline) or refused: the login form says the rest */
    if (authed !== true) { authed = true; native({ type: "ready", loggedIn: true }); }
    if (pendingToken) register(pendingToken);
    checkWaiting();
  });
  document.addEventListener("hq:login", loggedOutSeen);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden || authed !== true) return;
    checkWaiting();
    /* back from somewhere else: the app may be in a new zone */
    if (lastToken && sentTz[lastToken] && sentTz[lastToken] !== zone()) register(lastToken);
  });

  window.HQAppPage = {
    beforeLogout: function () {
      session++; loggedOutAt = Date.now(); authed = false; drawLine(0);
      if (!app || sample) return Promise.resolve();
      var token = lastToken;
      var first = inflight || Promise.resolve();
      var gone = first.then(function () { return token ? HQ.postJSON("/api/hq/push/unregister", { token: token }) : null; }).catch(function () {});
      var late = new Promise(function (r) { setTimeout(r, 3000); });
      return Promise.race([gone, late]).then(function () {
        sentTz = {}; pendingToken = token; /* logging in again on this page registers it again */
        native({ type: "loggedOut" });
      });
    }
  };
})();
