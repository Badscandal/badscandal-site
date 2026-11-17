#!/usr/bin/env node
/* The song-page build's report to the desk (A2, 17 Nov 2026, Webmaster: the /loveyou build failed and the desk
   kept saying "sent to GitHub: not live yet", never "Not done").
   Run by .github/workflows/song-page.yml as its LAST step, whatever happened before (if: always()). It reads:
     JOB      the job the site sent (client_payload; msg = the desk's question id)
     STEPS    the workflow's steps as JSON (${{ toJSON(steps) }}): tools, install, make, songtests, publish, alltests
     RUN_URL  this run's page on GitHub
     .song-error       what tools/song-job.mjs said when it stopped
     .song-tests.log   the song-page checks' output
     .all-tests.log    every other test, run AFTER the page went live (never blocks it)
   and prints ONE JSON report: { msg, slug, kind, ok, step?, reason?, others?, run, at }. The workflow pushes it to
   the song-builds branch as builds/<msg>.json; the site reads it there (netlify/lib/github.mjs readSongReport) and
   the desk tells the bot that asked (netlify/lib/staff.mjs checkSongBuilds). The repo is public: a report holds
   only the song's address, step names, test names and the job's own error sentence. No desk id: no report. */
import { readFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const MSG_RE = /^m[0-9a-z]{12,13}$/;
const BLOCKING = [
  ["tools", "Picture tools"], ["install", "Install"], ["make", "Make the page"], ["songtests", "Song-page checks"], ["publish", "Publish"],
];
const line = (s, max = 300) => {
  const t = String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).replace(/\s+\S*$/, "") + "…" : t;
};
/* the failing tests' names from node --test output (spec "✖ name (3ms)" or tap "not ok 2 - name") */
export function failedTests(log) {
  const names = [];
  for (const raw of String(log || "").split("\n")) {
    const m = /^\s*✖\s+(.+?)(?:\s+\(\d[\d.]*m?s\))?\s*$/.exec(raw) || /^\s*not ok \d+ - (.+?)\s*$/.exec(raw);
    if (!m || /^(failing tests:|tests\/)/.test(m[1])) continue;
    const n = m[1].trim();
    if (!names.some((x) => x === n || x.startsWith(n) || n.startsWith(x))) names.push(n);
  }
  return names;
}
const outcome = (s) => (s && (s.outcome || s.conclusion)) || "";

export function buildReport({ job, steps, runUrl, at, songError, songLog, allLog }) {
  const j = job || {};
  if (!MSG_RE.test(String(j.msg || ""))) return null;
  const base = { msg: j.msg, slug: line(j.slug, 60), kind: line(j.kind, 10) };
  const s = steps || {};
  for (const [id, label] of BLOCKING) {
    const o = outcome(s[id]);
    if (o === "success") continue;
    if (o === "skipped" || o === "") continue;
    let reason;
    if (o === "cancelled") reason = "the build was stopped (it took longer than 10 minutes, or it was cancelled); ask again";
    else if (id === "make") reason = line(songError) || "the page could not be made";
    else if (id === "songtests") { const f = failedTests(songLog); reason = "a song-page check failed" + (f.length ? ": " + f.slice(0, 3).join("; ") + (f.length > 3 ? ` (+${f.length - 3} more)` : "") : ""); }
    else if (id === "publish") reason = "the page was made and checked, but the site changed at the same moment and it could not be pushed; ask again";
    else reason = "GitHub could not set up the build tools; ask again later";
    return { ...base, ok: false, step: label, reason: line(reason), run: runUrl, at };
  }
  /* a step that never ran because an earlier one failed is "skipped": if nothing failed but Publish did not
     succeed, it did not go live */
  if (outcome(s.publish) !== "success") return { ...base, ok: false, step: "Publish", reason: "the build ended before the page was published; ask again", run: runUrl, at };
  const out = { ...base, ok: true, run: runUrl, at };
  if (outcome(s.alltests) === "failure") {
    const f = failedTests(allLog);
    out.others = line((f.length ? `${f.length} other test${f.length === 1 ? "" : "s"} failed` : "Other tests failed") + " after it went live (they don't stop song pages)" + (f.length ? ": " + f.slice(0, 4).join("; ") + (f.length > 4 ? ` (+${f.length - 4} more)` : "") : ""), 400);
  }
  return out;
}

function main() {
  const rd = (f) => (existsSync(f) ? readFileSync(f, "utf8") : "");
  let job = null, steps = {};
  try { job = JSON.parse(process.env.JOB || "null"); } catch {}
  try { steps = JSON.parse(process.env.STEPS || "{}"); } catch {}
  const r = buildReport({ job, steps, runUrl: /^https:\/\/github\.com\//.test(process.env.RUN_URL || "") ? process.env.RUN_URL : "", at: new Date().toISOString(),
    songError: rd(".song-error"), songLog: rd(".song-tests.log").slice(-20000), allLog: rd(".all-tests.log").slice(-60000) });
  if (!r) { console.error("no desk id in the job: no report"); process.exit(3); }
  process.stdout.write(JSON.stringify(r, null, 2) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
