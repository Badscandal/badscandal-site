/* "Search or Ask" (the HQ redesign, 12 Nov 2026): one bar (⌘K, or the magnifier) that jumps to any tab,
   song, bot, release or waiting message, or runs an action. Built only from what the page already has;
   the rules are pure (js/hq-lib.js cmdIndex / cmdResults). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sampleBoard } from "../netlify/lib/staff-sample.mjs";

await import("../js/hq-lib.js");
const L = globalThis.HQLib;
const board = sampleBoard(Date.parse("2026-11-12T15:00:00Z"));
const songs = [{ name: "Touch Me", id: "touchme" }, { name: "Me Dá Seu Body", id: "medaseubody" }];
const items = L.cmdIndex({ board, songs });
const hrefs = (list) => list.map((x) => x.href || "action:" + x.action);

test("cmdIndex: every tab, the actions, songs, bots, releases and what waits on Luke", () => {
  const tabs = items.filter((x) => x.kind === "tab");
  assert.deepEqual(tabs.map((x) => x.href), ["#today", "#songs", "#ads", "#pages", "#growth", "#fans", "#releases", "#money", "#team", "#messages"]);
  assert.equal(tabs.find((x) => x.href === "#releases").label, "Upcoming");
  const acts = items.filter((x) => x.kind === "action");
  assert.deepEqual(acts.map((x) => x.label), ["New song", "Refresh the numbers", "Data health", "Copy today's summary"]);
  assert.equal(acts[0].href, "#releases/new");
  assert.deepEqual(acts.slice(1).map((x) => x.action), ["refresh", "health", "copy"]);
  assert.deepEqual(items.filter((x) => x.kind === "song").map((x) => [x.label, x.href]), [["Touch Me", "#songs/touchme"], ["Me Dá Seu Body", "#songs/medaseubody"]]);
  const nova = items.find((x) => x.kind === "bot" && x.label === "Nova");
  assert.equal(nova.href, "#team/nova");
  assert.equal(items.filter((x) => x.kind === "bot").length, board.staff.length);
  const rel = items.filter((x) => x.kind === "release");
  assert.deepEqual(rel.find((x) => x.label === "Survivors"), { kind: "release", label: "Survivors", hint: "In the pipeline", href: "#releases/survivors", words: "release" });
  const msg = items.filter((x) => x.kind === "message");
  assert.equal(msg.length, board.waiting.luke.length);
  assert.equal(msg[0].href, "#messages/" + board.waiting.luke[0].id);
  assert.match(msg[0].label, /^Nova: Survivors on Fri 11 Dec\?/);
  assert.ok(msg[0].label.length <= 80);
  assert.equal(new Set(hrefs(items)).size, items.length, "no doubles");
  /* nothing loaded yet: the tabs and actions are still there */
  assert.equal(L.cmdIndex({}).length, 14);
});

test("cmdResults: nothing typed = what waits on you first, then the tabs", () => {
  const r = L.cmdResults(items, "");
  assert.equal(r.length, 8);
  assert.deepEqual(r.slice(0, 2).map((x) => x.kind), ["message", "message"]);
  assert.equal(r[2].href, "#today");
});

test("cmdResults: starts-with beats contains, accents and capitals don't matter, nothing found = nothing", () => {
  assert.equal(L.cmdResults(items, "nov")[0].href, "#team/nova");
  assert.equal(L.cmdResults(items, "UP")[0].href, "#releases", "Upcoming");
  assert.equal(L.cmdResults(items, "new")[0].href, "#releases/new", "New song");
  assert.deepEqual(hrefs(L.cmdResults(items, "me da")).slice(0, 2).sort(), ["#releases/medaseubody", "#songs/medaseubody"]);
  assert.equal(L.cmdResults(items, "body")[0].label, "Me Dá Seu Body", "a later word of the title");
  assert.equal(L.cmdResults(items, "inbox")[0].href, "#messages", "found by its other words");
  assert.deepEqual(L.cmdResults(items, "zzzq"), []);
  assert.equal(L.cmdResults(items, "e", 3).length, 3, "at most max");
});
