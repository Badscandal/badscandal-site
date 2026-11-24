/* 24 Nov 2026, Luke: "the bar up top notice ok and sources is all meshed together"; "we should have an option for
   all time in the drop down instead of this month because 30 days is already the month"; "remove the night quiet
   thing that's pointless". */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveRange, ALL_FROM } from "../netlify/lib/admin.mjs";

const page = readFileSync(new URL("../hq.html", import.meta.url), "utf8");
const hq = readFileSync(new URL("../js/hq.js", import.meta.url), "utf8");
const phone = readFileSync(new URL("../js/hq-phone.js", import.meta.url), "utf8");
const NOW = Date.parse("2026-11-24T15:00:00Z");

test("All time: every day since the counter started, nothing before it to compare with", () => {
  const r = resolveRange({ range: "all" }, NOW);
  assert.equal(r.range, "all");
  assert.equal(r.days[0], ALL_FROM);
  assert.equal(r.days[r.days.length - 1], "2026-11-24");
  assert.deepEqual(r.prev, []);
  assert.equal(resolveRange({ range: "30d" }, NOW).days.length, 30, "30 days is unchanged");
});

test("the dropdown: Today, 7 days, 30 days, All time, Custom; an old saved This month opens on 30 days", () => {
  const sel = page.slice(page.indexOf('<select id="rangeSel"'), page.indexOf("</select>", page.indexOf('<select id="rangeSel"')));
  assert.deepEqual([...sel.matchAll(/<option value="([^"]+)">([^<]+)</g)].map((m) => m[1] + ":" + m[2]), ["today:Today", "7d:7 days", "30d:30 days", "all:All time", "custom:Custom"]);
  assert.match(hq, /saved\.range === "month"\) state\.range = "30d"/);
});

test("Sources is one pill on one line, and Night quiet is gone", () => {
  const btn = page.slice(page.indexOf('id="healthBtn"'), page.indexOf("</button>", page.indexOf('id="healthBtn"')));
  assert.doesNotMatch(btn, /cmdhint/, "no second Sources word under the first");
  assert.match(page, /\.iconbtn\.hbtn\{[^}]*white-space:nowrap/);
  assert.match(hq, /"Sources OK" : st === "bad" \? "Check sources" : "Sources partly read"/);
  assert.doesNotMatch(page, /quietBtn|Night quiet|body\.quiet/);
  assert.doesNotMatch(phone, /quietBtn|bs_hq_quiet|applyQuiet/);
});
