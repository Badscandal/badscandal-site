/* #releases/new before the board (12 Nov 2026, review of the HQ apps): js/hq-staff.js in a sandbox
   with a forgiving fake page. The form's fields come from /api/staff/fields; an old failed try must not
   count while a new one is on its way, and the form opens as soon as the fields land. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as S from "../netlify/lib/staff.mjs";

await import("../js/hq-lib.js");
const L = globalThis.HQLib;
const SRC = readFileSync(new URL("../js/hq-staff.js", import.meta.url), "utf8");
const tick = (n = 3) => new Promise((r) => { let i = 0; const go = () => (++i >= n ? r() : setTimeout(go, 0)); setTimeout(go, 0); });

function element(id) {
  const on = {};
  return { id, hidden: true, textContent: "", innerHTML: "", value: "", disabled: false, style: {}, dataset: {}, children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, on,
    addEventListener: (t, f) => (on[t] = on[t] || []).push(f), removeEventListener() {}, setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    querySelector: () => null, querySelectorAll: () => [], closest: () => null, focus() {}, scrollIntoView() {}, appendChild() {}, insertAdjacentHTML() {} };
}
function page(answer) {
  const els = {}, win = {}, docOn = {};
  const loc = { hash: "", pathname: "/hq", search: "" };
  const document = { getElementById: (id) => els[id] || (els[id] = element(id)), activeElement: null, querySelector: () => null, querySelectorAll: () => [],
    addEventListener: (t, f) => (docOn[t] = docOn[t] || []).push(f), createElement: () => element("x"), body: element("body") };
  const HQ = { sample: false, esc: (s) => String(s == null ? "" : s), getJSON: (url) => answer(url), postJSON: () => Promise.resolve({ s: 500, j: {} }),
    authFail: (res) => res.s === 401, showShell() {}, net() {}, keep() {}, kept: () => null, boardChanged() {}, sheet: () => null, releasesBroken: () => false,
    sheetReleaseCard: () => "", link: () => "", stack() {}, drawFeed() {}, copyText() {} };
  const window = { HQ, HQLib: L, addEventListener: (t, f) => (win[t] = win[t] || []).push(f), location: loc,
    history: { state: null, replaceState: (s, t, url) => { loc.hash = url.slice(url.indexOf("#")); } } };
  window.window = window;
  vm.runInNewContext(SRC, { window, document, location: loc, history: window.history, setTimeout, clearTimeout, Promise, Date, Math, JSON, Intl, Number, String, Object, Array, RegExp, isFinite, encodeURIComponent, decodeURIComponent, console });
  return { els, loc, staff: window.HQStaff,
    go: (hash) => { loc.hash = hash; (win.hashchange || []).forEach((f) => f({})); } };
}
const FIELDS = { s: 200, j: { today: "2026-11-12", packFields: S.packFieldsOut(), releaseSteps: S.releaseStepsOut() } };
const later = () => { let release; const p = new Promise((r) => (release = r)); return { p, release }; };

test("New release before login: a fields answer that failed earlier doesn't stop the form while a new one is on its way, and it opens as soon as the fields land", async () => {
  let fieldsCalls = 0;
  const f2 = later(), board = later();
  const p = page((url) => {
    if (url === "/api/staff/fields") return ++fieldsCalls === 1 ? Promise.resolve({ s: 401, j: {} }) : f2.p;
    if (url.startsWith("/api/staff/board")) return board.p;
    return Promise.resolve({ s: 404, j: {} });
  });
  p.go("#releases/new");
  await tick();
  assert.equal(p.loc.hash, "#releases", "the address goes back to #releases");
  assert.equal(fieldsCalls, 1);
  assert.equal(p.els.relForm.hidden, true, "not logged in yet: no fields, no form");
  /* logged in: HQ's refresh asks for the fields and the board again */
  p.staff.reload();
  await tick();
  assert.equal(fieldsCalls, 2);
  board.release({ s: 500, j: {} }); /* the board fails while the fields are still on their way */
  await tick();
  assert.doesNotMatch(p.els.relMsg.textContent, /needs the team's desk/, "an old failure doesn't count while a new try is on its way");
  assert.equal(p.els.relForm.hidden, true);
  f2.release(FIELDS);
  await tick();
  assert.equal(p.els.relForm.hidden, false, "the form opens from the fields, without the board");
  assert.match(p.els.rfFoot.innerHTML, /Couldn't load the team's desk yet, so Save and Send wait for it/);
  assert.match(p.els.rfFoot.innerHTML, /data-rf-act="save" disabled/);
});

test("New release: only when BOTH the board and the fields failed does it say the form needs the desk", async () => {
  const p = page((url) => Promise.resolve(url === "/api/staff/fields" || url.startsWith("/api/staff/board") ? { s: 500, j: {} } : { s: 404, j: {} }));
  p.staff.reload();
  await tick();
  p.go("#releases/new");
  await tick(6);
  assert.match(p.els.relMsg.textContent, /needs the team's desk/);
  assert.equal(p.els.relForm.hidden, true);
});
