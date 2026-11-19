/* The shared /hq line chart (19 Nov 2026): lookup at x, last/this period, gaps stay gaps. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

await import("../js/hq-chart.js");
const C = globalThis.HQChart;

const streams = [
  { d: "2026-11-08", v: 10 },
  { d: "2026-11-09", v: 20 },
  { d: "2026-11-11", v: 40 }
];

test("a missing day is a gap, and the scrub does not invent a value", () => {
  const m = C.model(streams);
  assert.equal(m.points.length, 4);
  assert.equal(m.points[2].d, "2026-11-10");
  assert.equal(m.points[2].v, null);
  assert.equal(m.points[2].gap, true);
  const at = C.valueAt(m, 2 / 3);
  assert.equal(at.index, 2);
  assert.equal(at.date, "2026-11-10");
  assert.equal(at.value, null);
  assert.equal(at.gap, true);
  assert.equal(at.label, "11/10/26 • no reading");
  assert.notEqual(at.value, 30);
  const px = C.valueAt(m, m.w * (2 / 3), m.w);
  assert.equal(px.value, null);
  assert.equal(px.gap, true);
  assert.equal(C.valueAt(m, 0).value, 10);
  assert.equal(C.valueAt(m, 1).label, "11/11/26 • 40");
  assert.equal(C.periodTotals(m), null, "a gap in either window means no total");
  const html = C.html(streams, { totals: true, label: "Streams per day" });
  assert.doesNotMatch(html, /Last period/);
  assert.equal((html.match(/class="hqchart-line"/g) || []).length, 1, "the line stops at the gap; the single day is a dot");
  assert.match(html, /hqchart-dotpt/);
});

test("lookup at x reads the point under the finger, and the example pill is the real number", () => {
  const series = [];
  for (let day = 1; day <= 10; day++) series.push({ d: "2026-11-" + String(day).padStart(2, "0"), v: day === 10 ? 26605 : day * 1000 });
  const m = C.model(series);
  assert.equal(C.valueAt(m, 1).label, "11/10/26 • 26,605");
  assert.equal(C.valueAt(m, 0).label, "11/1/26 • 1,000");
  assert.deepEqual(m.ticks.map((t) => t.text), ["0", "20K", "40K"]);
  const edge = C.valueAt(m, m.plot.r, m.w);
  assert.equal(edge.value, 26605);
  assert.equal(edge.gap, false);
  const html = C.html(series, { totals: true, label: "Streams per day" });
  assert.match(html, /touch-action:pan-y/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, />0</);
  assert.match(html, />20K</);
  assert.match(html, />40K</);
  assert.match(html, />11\/1\/26</);
  assert.match(html, />11\/10\/26</);
  assert.match(html, /Last period <b>15,000<\/b>/);
  assert.match(html, /This period <b>56,605<\/b>/);
});

test("last period and this period are the same length, and a zero is not a gap", () => {
  const even = C.model([
    { d: "2026-11-01", v: 10 }, { d: "2026-11-02", v: 20 },
    { d: "2026-11-03", v: 30 }, { d: "2026-11-04", v: 40 }
  ]);
  assert.deepEqual(C.periodTotals(even), { window: 2, last: 30, current: 70 });
  const odd = C.model([1, 2, 3, 4, 5]);
  assert.deepEqual(C.periodTotals(odd), { window: 2, last: 5, current: 9 });
  const html = C.html([1, 2, 3, 4, 5], { totals: true });
  assert.match(html, /Last period <b>5<\/b>/);
  assert.match(html, /This period <b>9<\/b>/);
  assert.doesNotMatch(html, /hqchart-x/);
  const z = C.model([{ d: "2026-11-01", v: 0 }, { d: "2026-11-02", v: 40 }]);
  assert.equal(z.points[0].gap, false);
  assert.equal(z.points[0].v, 0);
  assert.equal(z.points[0].y, 100);
  assert.equal(C.valueAt(z, 0).value, 0);
  assert.equal(C.valueAt(z, 0).label, "11/1/26 • 0");
});

test("a level chart omits the totals, and arrows move one point at a time including a gap", () => {
  const html = C.html([{ d: "2026-11-01", v: 100 }, { d: "2026-11-02", v: 140 }], { totals: false, label: "Followers" });
  assert.doesNotMatch(html, /Last period/);
  assert.match(html, /aria-label="Followers/);
  assert.equal(C.html([{ d: "2026-11-01", v: 5 }]), "");
  assert.equal(C.html([null, null]), "");
  assert.equal(C.stepIndex(null, 4, "ArrowRight"), 3);
  assert.equal(C.stepIndex(null, 4, "ArrowLeft"), 2);
  assert.equal(C.stepIndex(2, 4, "ArrowLeft"), 1);
  assert.equal(C.stepIndex(0, 4, "ArrowLeft"), 0);
  assert.equal(C.stepIndex(1, 4, "Home"), 0);
  assert.equal(C.stepIndex(1, 4, "End"), 3);
  const src = readFileSync(new URL("../js/hq-chart.js", import.meta.url), "utf8");
  assert.match(src, /ArrowLeft/);
  assert.match(src, /setPointerCapture/);
  assert.match(src, /touch-action:pan-y/);
  assert.match(src, /Math\.abs\(dy\) > Math\.abs\(dx\)/);
});
