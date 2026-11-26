/* 26 Nov 2026, Upcoming review part A.
   1. No zoom on the phone: the viewport stops scaling, double-tap zoom is off (touch-action: manipulation),
      Safari's pinch gestures and two-finger moves are stopped, and every field is 16px on the phone (iOS zooms
      into a field under 16px when it is tapped).
   2. The Upcoming tab no longer throws when the sheet answers before the staff board, and one tab that throws
      can't stop the others drawing. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
const PAGE = read("hq.html");
const CSS = PAGE.slice(PAGE.indexOf("<style>") + 7, PAGE.indexOf("</style>"));
const HQ = read("js/hq.js");

/* the source of `function name() { ... }` in a script, by brace matching */
function fnSource(src, name) {
  const start = src.indexOf("function " + name + "(");
  assert.ok(start >= 0, name + " is in the script");
  let i = src.indexOf("{", start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error("unbalanced " + name);
}

test("the viewport can't be scaled and the page has no double-tap zoom", () => {
  const meta = /<meta name="viewport" content="([^"]+)">/.exec(PAGE);
  assert.ok(meta, "hq.html has a viewport meta");
  const parts = Object.fromEntries(meta[1].split(",").map((p) => p.trim().split("=")));
  assert.deepEqual(parts, { width: "device-width", "initial-scale": "1", "maximum-scale": "1", "user-scalable": "no", "viewport-fit": "cover" });
  assert.match(CSS, /(^|\n)html\{[^}]*touch-action:manipulation/, "html { touch-action: manipulation }");
  assert.match(CSS, /(^|\n)html\{[^}]*-webkit-text-size-adjust:100%/, "html { -webkit-text-size-adjust: 100% }");
  /* the charts keep their own sideways scrub */
  assert.match(CSS, /\.hqchart\{[^}]*touch-action:pan-y/);
  assert.match(CSS, /\.hqchart-svg\{[^}]*touch-action:pan-y/);
});

test("every field is at least 16px on the phone, and the rule that makes it so comes last", () => {
  const safe = /@media \(max-width:899px\)\{input,select,textarea\{font-size:16px !important\}\}/;
  const m = safe.exec(CSS);
  assert.ok(m, "the catch-all 16px field rule is there");
  /* nothing after it can set a field's size again */
  assert.equal(CSS.slice(m.index + m[0].length).trim().replace(/\/\*[\s\S]*?\*\//g, "").trim(), "", "the 16px field rule is the last rule in the style");
  /* and no rule anywhere forces a field under 16px with !important (that would beat the catch-all) */
  const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]+\{[^{}]*\}/g) || [];
  for (const r of rules) {
    const [sel, body] = r.split("{");
    if (!/\b(input|select|textarea)\b|#rangeSel|#fAd|#fCc/.test(sel)) continue;
    const imp = /font(?:-size)?:[^;}]*?(\d+(?:\.\d+)?)px[^;}]*!important/.exec(body);
    if (imp) assert.ok(Number(imp[1]) >= 16, "a field rule forces " + imp[1] + "px: " + sel.trim());
  }
  /* the fields the review named are still the ones it covers */
  for (const id of ["rangeSel", "fAd", "fCc"]) assert.match(PAGE, new RegExp('<select id="' + id + '"'), id + " is a select");
});

test("pinch gestures and two-finger moves are stopped; one finger still scrolls", () => {
  const m = /<script id="hq-nozoom">([\s\S]*?)<\/script>/.exec(PAGE);
  assert.ok(m, "the no-zoom script is in hq.html");
  const handlers = {};
  const document = { addEventListener: (t, fn, o) => { handlers[t] = { fn, o }; } };
  vm.runInNewContext(m[1], { document });
  for (const t of ["gesturestart", "gesturechange", "gestureend", "touchmove"]) {
    assert.ok(handlers[t], t + " is listened to");
    assert.equal(handlers[t].o && handlers[t].o.passive, false, t + " is passive:false so it can be stopped");
  }
  const ev = (touches) => { const e = { touches: new Array(touches).fill({}), cancelable: true, stopped: false, preventDefault() { this.stopped = true; } }; return e; };
  const one = ev(1), two = ev(2), pinch = ev(0);
  handlers.touchmove.fn(one); handlers.touchmove.fn(two); handlers.gesturestart.fn(pinch);
  assert.equal(one.stopped, false, "one finger scrolls");
  assert.equal(two.stopped, true, "two fingers don't zoom");
  assert.equal(pinch.stopped, true, "Safari's pinch is stopped");
});

test("Upcoming draws when the sheet answers before the staff board (board() is still null)", () => {
  const els = {};
  const $ = (id) => (els[id] = els[id] || { innerHTML: "", hidden: false, textContent: "" });
  const sandbox = {
    window: { HQStaff: { drawReleases: () => false, board: () => null }, HQLib: { releaseLists: () => ({ sheetOut: [], sheetOnly: [] }), outLine: () => "" } },
    HQStaff: { drawReleases: () => false, board: () => null },
    $, esc: (s) => String(s), broken: () => false, sheet: {}, sheetReleaseCard: () => "",
  };
  vm.runInNewContext(fnSource(HQ, "drawReleases") + "; drawReleases();", sandbox);
  assert.match(els.relList.innerHTML, /Nothing coming in the sheet yet/);
});

test("one tab that throws doesn't stop the others drawing", () => {
  const ran = [];
  const names = ["drawSheetErrors", "drawToday", "drawBriefing", "drawSongs", "drawAdsTop", "drawGrowth", "drawFans", "drawReleases", "drawTeam", "drawDataHealth"];
  const sandbox = { window: { console: { error() {} } }, console: { error() {} } };
  for (const n of names) sandbox[n] = n === "drawReleases" ? () => { ran.push(n); throw new TypeError("Cannot read properties of null (reading 'releases')"); } : () => ran.push(n);
  vm.runInNewContext(fnSource(HQ, "drawSheet") + "; drawSheet();", sandbox);
  assert.deepEqual(ran, names, "every tab drew, in order, after Upcoming threw");
});
