/* js/hq-app.js, the page's side of the HQ apps (12 Nov 2026), run in a sandbox with a fake page, a fake
   app bridge and fake answers: who decides "logged in", the zone following Luke, and Log out winning
   over answers that were already on their way. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

await import("../js/hq-lib.js");
const L = globalThis.HQLib;
const SRC = readFileSync(new URL("../js/hq-app.js", import.meta.url), "utf8");
const TOKEN = "ab".repeat(32);
const tick = () => new Promise((r) => setTimeout(r, 0));

/* answers: url -> a function returning { s, j } (or a promise of it) */
function page({ tz = "America/Sao_Paulo", answers = {} } = {}) {
  const on = { win: {}, doc: {} }, posted = [], calls = [];
  const line = { textContent: "", hidden: true };
  const app = { platform: "ios", env: "sandbox", app: "com.badscandal.hq", version: "1.0", tz };
  const reply = (url, body) => { calls.push({ url, body: body === undefined ? undefined : JSON.parse(JSON.stringify(body)) }); /* a plain copy: the sandbox's objects have its own prototypes */ const f = answers[url.replace(/\?.*$/, "")]; return Promise.resolve(f ? f(body) : { s: 200, j: { ok: true } }); };
  const document = { hidden: false, getElementById: (id) => (id === "waitLine" ? line : null), addEventListener: (t, f) => (on.doc[t] = on.doc[t] || []).push(f) };
  const window = { HQLib: L, HQApp: app, HQ: { sample: false, getJSON: (url) => reply(url), postJSON: (url, body) => reply(url, body) },
    webkit: { messageHandlers: { hqApp: { postMessage: (m) => posted.push(JSON.parse(JSON.stringify(m))) } } }, addEventListener: (t, f) => (on.win[t] = on.win[t] || []).push(f) };
  window.window = window;
  vm.runInNewContext(SRC, { window, document, setTimeout, clearTimeout, Promise, Intl, Date, Math, JSON, Number, String, Object, Array, RegExp, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } } });
  const fire = (where, type, detail) => (on[where][type] || []).forEach((f) => f({ type, detail }));
  return { app, posted, calls, line, window, document,
    refreshed: (loggedIn, startedAt = Date.now()) => fire("doc", "hq:refreshed", { loggedIn, startedAt }),
    login: () => fire("doc", "hq:login"),
    token: (t = TOKEN) => fire("win", "hqapp", { type: "token", token: t }),
    visible: () => { document.hidden = false; fire("doc", "visibilitychange"); },
    regs: () => calls.filter((c) => c.url === "/api/hq/push/register"), unregs: () => calls.filter((c) => c.url === "/api/hq/push/unregister") };
}
const waiting = (n) => ({ "/api/hq/push/waiting": () => ({ s: 200, j: { count: n, items: [] } }) });

test("logged in comes from HQ's own refresh, not from /waiting answering", async () => {
  const p = page({ answers: waiting(3) });
  p.token();
  await tick();
  assert.deepEqual(p.posted, [], "nothing before HQ's data has loaded");
  /* a refresh whose answers were refused (offline, a 401): not logged in, whatever /waiting would say */
  p.refreshed(false); await tick(); await tick();
  assert.deepEqual(p.posted, []);
  assert.equal(p.regs().length, 0);
  assert.ok(!p.calls.some((c) => c.url === "/api/hq/push/waiting"), "the count is only asked once logged in");
  p.refreshed(true); await tick(); await tick();
  assert.deepEqual(p.posted, [{ type: "ready", loggedIn: true }, { type: "waiting", count: 3 }]);
  assert.equal(p.regs().length, 1, "the token that came early is registered now");
  assert.deepEqual(p.regs()[0].body, { token: TOKEN, platform: "ios", env: "sandbox", app: "com.badscandal.hq", tz: "America/Sao_Paulo" });
  assert.equal(p.line.textContent, "3 things waiting on you");
  p.refreshed(true); p.token(); await tick(); await tick();
  assert.equal(p.posted.filter((m) => m.type === "ready").length, 1, "ready once");
  assert.equal(p.regs().length, 1, "once per token per page load");
  p.login(); await tick();
  assert.deepEqual(p.posted.at(-1), { type: "ready", loggedIn: false });
  assert.equal(p.line.hidden, true);
});

test("a new time zone on coming back to the app registers again with it", async () => {
  const p = page({ answers: waiting(0) });
  p.refreshed(true); p.token(); await tick(); await tick();
  assert.equal(p.regs().length, 1);
  p.visible(); await tick(); await tick();
  assert.equal(p.regs().length, 1, "same zone: nothing to tell");
  p.app.tz = "Europe/Dublin"; /* the app updates it when it comes to the front */
  p.visible(); await tick(); await tick();
  assert.equal(p.regs().length, 2);
  assert.equal(p.regs()[1].body.tz, "Europe/Dublin");
  p.visible(); await tick(); await tick();
  assert.equal(p.regs().length, 2);
  /* an app that sends no zone: the device's own */
  const q = page({ tz: "", answers: waiting(0) });
  q.refreshed(true); q.token(); await tick(); await tick();
  assert.equal(q.regs()[0].body.tz, Intl.DateTimeFormat().resolvedOptions().timeZone);
});

test("after Log out, answers that started before it are ignored: the device can't register again", async () => {
  let release;
  const slow = { "/api/hq/push/waiting": () => new Promise((r) => { release = () => r({ s: 200, j: { count: 5, items: [] } }); }) };
  const p = page({ answers: slow });
  const before = Date.now() - 5;
  p.refreshed(true, before); p.token(); await tick();
  assert.equal(p.regs().length, 1);
  await p.window.HQAppPage.beforeLogout();
  assert.equal(p.unregs().length, 1);
  assert.deepEqual(p.unregs()[0].body, { token: TOKEN });
  assert.deepEqual(p.posted.at(-1), { type: "loggedOut" });
  const n = p.posted.length;
  /* the count asked before Log out arrives now */
  release(); await tick(); await tick();
  assert.equal(p.posted.length, n, "no badge from before Log out");
  assert.equal(p.line.hidden, true);
  /* a refresh that started before Log out ends now, still "logged in" */
  p.refreshed(true, before); p.token(); await tick(); await tick();
  assert.equal(p.regs().length, 1, "not registered again");
  assert.ok(!p.posted.slice(n).some((m) => m.type === "ready" && m.loggedIn), "no ready from before Log out");
  /* logging in again on this page works */
  p.refreshed(true, Date.now() + 1); await tick(); await tick();
  assert.equal(p.regs().length, 2);
});

test("a registration still on its way at Log out finishes first, then the device is unregistered", async () => {
  let release;
  const p = page({ answers: { ...waiting(0), "/api/hq/push/register": () => new Promise((r) => { release = () => r({ s: 200, j: { ok: true } }); }) } });
  p.refreshed(true); p.token(); await tick();
  const out = p.window.HQAppPage.beforeLogout();
  await tick();
  assert.equal(p.unregs().length, 0, "waits for the registration");
  release(); await out;
  assert.equal(p.unregs().length, 1);
  assert.ok(p.calls.indexOf(p.unregs()[0]) > p.calls.indexOf(p.regs()[0]));
});
