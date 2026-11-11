/* /hq stage 1 (11 Nov 2026): the Data health rules (js/hq-lib.js), the install manifest and the
   offline helper (hq-sw.js: never the numbers, never the rest of the site). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

await import("../js/hq-lib.js");
const L = globalThis.HQLib;
const NOW = Date.parse("2026-11-11T12:00:00Z");
const min = 60000;
const sheetOk = { connected: true, sheetErrors: {}, health: { sheetAt: new Date(NOW - 4 * min).toISOString(), fx: { month: "2026-11", rate: 1.1204, days: 8, at: new Date(NOW - 3 * 3600000).toISOString() } } };
const ovOk = { metaKey: { state: "ok", text: "Meta key: reading OK", at: NOW - 12 * min }, lastEventAt: NOW - 2 * min };

test("ago: plain words", () => {
  assert.equal(L.ago(10 * 1000), "just now");
  assert.equal(L.ago(12 * min), "12 min ago");
  assert.equal(L.ago(3 * 3600000), "3 h ago");
  assert.equal(L.ago(72 * 3600000), "3 days ago");
  assert.equal(L.ago(null), "");
});

test("data health: all fine -> four green rows and a green dot", () => {
  const rows = L.healthRows({ sheet: sheetOk, ov: ovOk }, NOW);
  assert.deepEqual(rows.map((r) => [r.label, r.state, r.text]), [
    ["Sheet", "ok", "Read 4 min ago"],
    ["Meta", "ok", "Key reading OK, last read 12 min ago"],
    ["Page counter", "ok", "Last visit 2 min ago"],
    ["Exchange rate", "ok", "1 EUR = 1.1204 USD (average of 8 days) · 3 h ago"],
  ]);
  assert.equal(L.healthState(rows), "ok");
});

test("data health: problems turn the dot red and say what is wrong", () => {
  const withErr = { ...sheetOk, sheetErrors: { Income: { cells: 1, first: "#REF!", readable: 0 } } };
  let rows = L.healthRows({ sheet: withErr, ov: ovOk }, NOW);
  assert.equal(rows[0].state, "bad"); assert.match(rows[0].text, /^1 tab shows an error \(Income\)/);
  assert.equal(L.healthState(rows), "bad");
  rows = L.healthRows({ sheet: sheetOk, ov: { ...ovOk, metaKey: { state: "expired", text: "The Meta key has expired: make a new one" } } }, NOW);
  assert.deepEqual([rows[1].state, rows[1].text], ["bad", "The Meta key has expired: make a new one"]);
  rows = L.healthRows({ sheet: { ...sheetOk, health: { sheetAt: sheetOk.health.sheetAt, fx: null } }, ov: ovOk }, NOW);
  assert.equal(rows[3].state, "bad"); assert.match(rows[3].text, /EUR estimates are missing/);
  rows = L.healthRows({ sheet: null, sheetProblem: "Not connected (HQ_SHEET_ID missing on Netlify)", ov: ovOk }, NOW);
  assert.deepEqual([rows[0].state, rows[0].text], ["bad", "Not connected (HQ_SHEET_ID missing on Netlify)"]);
});

test("data health: no visits for a while is grey, not red (it may just be quiet); nothing read yet is grey", () => {
  let rows = L.healthRows({ sheet: sheetOk, ov: { ...ovOk, lastEventAt: NOW - 3 * 86400000 } }, NOW);
  assert.deepEqual([rows[2].state, rows[2].text], ["off", "Last visit 3 days ago"]);
  assert.equal(L.healthState(rows), "off");
  rows = L.healthRows({ sheet: null, ov: null }, NOW);
  assert.deepEqual(rows.map((r) => r.state), ["off", "off", "off", "off"]);
  assert.equal(L.healthState(rows), "off");
  assert.equal(L.healthRows({ sheet: sheetOk, ov: { ...ovOk, lastEventAt: null } }, NOW)[2].text, "No visits in this range");
});

test("install manifest: name, full screen, own icons (new -v1 files), scope /hq only", () => {
  const m = JSON.parse(readFileSync(new URL("../hq.webmanifest", import.meta.url), "utf8"));
  assert.equal(m.name, "BADSCANDAL HQ"); assert.equal(m.display, "standalone");
  assert.equal(m.scope, "/hq"); assert.match(m.start_url, /^\/hq/);
  for (const i of m.icons) { assert.match(i.src, /^\/assets\/hq-icon-\d+-v1\.png$/); readFileSync(new URL(".." + i.src, import.meta.url)); }
  const page = readFileSync(new URL("../hq.html", import.meta.url), "utf8");
  assert.match(page, /<link rel="manifest" href="\/hq\.webmanifest">/);
  assert.match(page, /apple-touch-icon" href="\/assets\/hq-icon-180-v1\.png"/);
});

/* run hq-sw.js in a sandbox and see what its fetch handler does */
function sw() {
  const handlers = {};
  const ctx = { self: { addEventListener: (t, f) => { handlers[t] = f; }, skipWaiting() {}, clients: { claim() {} } }, location: { origin: "https://badscandal.com" },
    caches: { open: async () => ({ addAll: async () => {}, put: async () => {} }), keys: async () => [], match: async () => null, delete: async () => true },
    fetch: async () => new Response("ok"), Response, URL, Promise };
  ctx.self.location = ctx.location;
  vm.runInNewContext(readFileSync(new URL("../hq-sw.js", import.meta.url), "utf8"), ctx);
  return (url, mode = "no-cors", method = "GET") => { let used = false; handlers.fetch({ request: { url, mode, method }, respondWith: () => { used = true; } }); return used; };
}
test("offline helper: keeps only the /hq page and its scripts; never the numbers, never other sites or pages", () => {
  const f = sw();
  assert.equal(f("https://badscandal.com/hq", "navigate"), true);
  assert.equal(f("https://badscandal.com/js/hq.js"), true);
  assert.equal(f("https://badscandal.com/api/hq/data"), false, "the numbers always come from the network");
  assert.equal(f("https://badscandal.com/api/admin/overview?range=7d"), false);
  assert.equal(f("https://badscandal.com/api/admin/login", "cors", "POST"), false);
  assert.equal(f("https://badscandal.com/js/main.js"), false, "not the rest of the site");
  assert.equal(f("https://fonts.googleapis.com/css2"), false);
  assert.match(readFileSync(new URL("../js/hq-shell.js", import.meta.url), "utf8"), /register\("\/hq-sw\.js", \{ scope: "\/hq" \}\)/);
});
