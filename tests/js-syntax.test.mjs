/* Every browser script must parse (17 Nov 2026: an apostrophe in a single-quoted string in js/hq.js, PR #56, stopped
   the whole HQ page and both HQ apps from opening; no test loaded js/hq.js in a way that parsed it). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";

const files = readdirSync("js").filter((f) => f.endsWith(".js")).map((f) => "js/" + f).concat(["hq-sw.js"]);
test("every browser script parses", () => {
  const bad = [];
  for (const f of files) { try { new vm.Script(readFileSync(f, "utf8"), { filename: f }); } catch (e) { bad.push(f + ": " + e.message); } }
  assert.deepEqual(bad, []);
});
test("every inline <script> in hq.html parses", () => {
  const html = readFileSync("hq.html", "utf8"), bad = [];
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/(?:ld\+)?json")[^>]*>([\s\S]*?)<\/script>/g)) {
    try { new vm.Script(m[1]); } catch (e) { bad.push(e.message); }
  }
  assert.deepEqual(bad, []);
});
