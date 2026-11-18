/* Song pages without Luke's Mac (16 Nov 2026, Luke: "we also need a tool that can allow webmaster to use this
   without my computer"; he chose "GitHub does it"). Webmaster (or Nova) proposes a song page, or the release-day
   Spotify link, with the tool song_page; Luke is asked "is this correct?"; on "Yes, correct" the site asks
   GitHub to run .github/workflows/song-page.yml, which runs tools/song-job.mjs (the cover, the same
   new-song.mjs, every test) and publishes only when everything passes. All names and links are made up. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS, INSTRUCTIONS } from "../netlify/lib/staff-tools.mjs";
import { dispatchSongJob, SONG_EVENT } from "../netlify/lib/github.mjs";
import { checkJob, directLink } from "../tools/song-job.mjs";

const NOW = Date.parse("2026-11-16T15:00:00Z");
const MIN = 60000;
const R = S.DEFAULT_ROSTER;
const fails = (p, re) => assert.rejects(p, (e) => e.name === "StaffError" && re.test(e.message));
const tool = (n) => TOOLS.find((t) => t.name === n);
const call = (d, name, args) => callTool(tool(name), args, { store: d, now: NOW, role: "bot", hq: async () => null });
const TRACK = "https://open.spotify.com/track/AbCdEfGhIjKlMnOpQrStUv";
const NEW = { bot: "Webmaster", kind: "new", slug: "papermoon", title: "Paper Moon", date: "2026-11-27", cover: "https://example.com/paper-moon.jpg" };
const yes = (d, id, from) => S.sendMessage(d, NOW + MIN, R, { from: "Luke", to: from, text: "Yes, correct", re: id, note: "Yes, correct" });
const told = async (d, to) => (await S.listMessages(d, NOW + 2 * MIN)).filter((m) => m.from === "HQ" && m.to === to).pop();

test("a new song page: Webmaster proposes, Luke confirms, and only then is GitHub asked to build it", async (t) => {
  const d = memoryDesk(), sent = [];
  S.useSongDispatch(async (job) => { sent.push(job); return { ok: true }; });
  t.after(() => S.useSongDispatch(null));
  const r = await call(d, "song_page", { ...NEW, why: "Love-style test (made up)" });
  assert.equal(r.asked, true);
  assert.equal(sent.length, 0, "nothing before Luke says yes");
  const m = await S.getMessage(d, r.id);
  assert.deepEqual([m.to, m.needs, m.options, m.proposal.action], ["Luke", "decision", S.PROPOSE_OPTIONS, "page"]);
  assert.match(m.text, /^Webmaster asks: is this correct\? Make the song page badscandal\.com\/papermoon for Paper Moon, out Fri 27 Nov/);
  assert.deepEqual(m.proposal.changes.map((c) => [c.label, c.to]), [["Address", "badscandal.com/papermoon"], ["Title", "Paper Moon"], ["Release day", "Fri 27 Nov"], ["Cover", "https://example.com/paper-moon.jpg"]]);
  const a = await yes(d, r.id, "Webmaster");
  assert.equal(a.proposal.done, true);
  assert.deepEqual(sent, [{ kind: "new", slug: "papermoon", title: "Paper Moon", date: "2026-11-27", cover: "https://example.com/paper-moon.jpg", by: "Webmaster", msg: r.id }]);
  assert.match((await told(d, "Webmaster")).text, /^Done: Luke said yes\. GitHub is building badscandal\.com\/papermoon now/);
});

test("release day: the Spotify track link, the same way", async (t) => {
  const d = memoryDesk(), sent = [];
  S.useSongDispatch(async (job) => { sent.push(job); return { ok: true }; });
  t.after(() => S.useSongDispatch(null));
  const r = await call(d, "song_page", { bot: "Webmaster", kind: "track", slug: "medaseubody", track: TRACK });
  const m = await S.getMessage(d, r.id);
  assert.match(m.text, /Put the Spotify link on badscandal\.com\/medaseubody \(Me Dá Seu Body\)/);
  await yes(d, r.id, "Webmaster");
  assert.deepEqual(sent, [{ kind: "track", slug: "medaseubody", track: TRACK, by: "Webmaster", msg: r.id }]);
});

test("GitHub not set up or refusing: Luke's yes is kept, nothing is built, and Webmaster is told why", async (t) => {
  const d = memoryDesk();
  S.useSongDispatch(async () => ({ ok: false, error: "The site has no GitHub key for song pages yet (Luke runs the helper once)." }));
  t.after(() => S.useSongDispatch(null));
  const r = await call(d, "song_page", NEW);
  const a = await yes(d, r.id, "Webmaster");
  assert.equal(a.settled, true);
  assert.equal(a.proposal.done, false);
  assert.match((await told(d, "Webmaster")).text, /^Not done: The site has no GitHub key/);
  S.useSongDispatch(null);
  const r2 = await call(d, "song_page", { ...NEW, slug: "glasshouse", title: "Glass House" });
  assert.match((await yes(d, r2.id, "Webmaster")).proposal.error, /not connected to GitHub/);
});

test("what is refused before Luke is ever asked", async () => {
  const d = memoryDesk();
  await fails(call(d, "song_page", { ...NEW, slug: "touchme" }), /already has a page/);
  await fails(call(d, "song_page", { ...NEW, slug: "hq" }), /taken by the site/);
  await fails(call(d, "song_page", { ...NEW, slug: "Paper Moon" }), /lowercase letters and digits/);
  await fails(call(d, "song_page", { ...NEW, cover: "dropbox.com/x.jpg" }), /https/);
  await fails(call(d, "song_page", { ...NEW, date: "27/11/2026" }), /YYYY-MM-DD/);
  await fails(call(d, "song_page", { ...NEW, title: "" }), /title/);
  await fails(call(d, "song_page", { bot: "Webmaster", kind: "track", slug: "nosuchsong", track: TRACK }), /no page called/);
  /* 18 Nov 2026: a ?si= on the Spotify link is removed, not refused */
  const si = await call(d, "song_page", { bot: "Webmaster", kind: "track", slug: "medaseubody", track: TRACK + "?si=abc" });
  assert.equal(si.note_link, "Removed ?si= from the Spotify link.");
  await fails(call(d, "song_page", { bot: "Webmaster", kind: "move", slug: "medaseubody" }), /kind/);
  await fails(call(d, "song_page", { ...NEW, bot: "Kevin" }), /Webmaster/);
  const first = await call(d, "song_page", NEW);
  await fails(call(d, "song_page", NEW), new RegExp(first.id));
});

test("Nova may ask for Webmaster; the bots are told the way", async () => {
  const d = memoryDesk();
  assert.equal((await call(d, "song_page", { ...NEW, bot: "Nova" })).asked, true);
  assert.match(tool("song_page").description, /Luke is asked/);
  assert.match(INSTRUCTIONS, /song_page/);
});

test("dispatchSongJob: one POST to GitHub's dispatches, the key only in the header, plain sentences back", async () => {
  const calls = [];
  const fetchOk = async (url, init) => { calls.push({ url, init }); return { status: 204, ok: true, text: async () => "" }; };
  const job = { kind: "new", slug: "papermoon", title: "Paper Moon", date: "2026-11-27", cover: "https://example.com/c.jpg", by: "Webmaster", msg: "m1" };
  assert.deepEqual(await dispatchSongJob({ GITHUB_SONG_TOKEN: "made-up-key-123" }, job, fetchOk), { ok: true });
  assert.equal(calls[0].url, "https://api.github.com/repos/Badscandal/badscandal-site/dispatches");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer made-up-key-123");
  assert.deepEqual(JSON.parse(calls[0].init.body), { event_type: SONG_EVENT, client_payload: job });
  assert.equal(SONG_EVENT, "song-page");
  const no = await dispatchSongJob({}, job, fetchOk);
  assert.equal(no.ok, false); assert.match(no.error, /no GitHub key/);
  for (const [st, re] of [[401, /refused the site's key/], [403, /refused the site's key/], [404, /refused the site's key/], [422, /GitHub said no \(422\)/], [500, /GitHub did not answer/]]) {
    const r = await dispatchSongJob({ GITHUB_SONG_TOKEN: "made-up-key-123" }, job, async () => ({ status: st, ok: false, text: async () => "made-up-key-123" }));
    assert.equal(r.ok, false); assert.match(r.error, re); assert.doesNotMatch(r.error, /made-up-key/);
  }
  const down = await dispatchSongJob({ GITHUB_SONG_TOKEN: "k" }, job, async () => { throw new Error("offline"); });
  assert.match(down.error, /could not reach GitHub/);
});

test("song-job: GitHub checks the job again itself (it never trusts what it is sent)", () => {
  assert.deepEqual(checkJob({ kind: "new", slug: "papermoon", title: "Paper Moon", date: "2026-11-27", cover: "https://example.com/c.jpg", by: "Webmaster", msg: "m1" }),
    { kind: "new", slug: "papermoon", title: "Paper Moon", date: "2026-11-27", cover: "https://example.com/c.jpg", by: "Webmaster" });
  assert.deepEqual(checkJob({ kind: "track", slug: "medaseubody", track: TRACK, by: "Nova" }), { kind: "track", slug: "medaseubody", track: TRACK, by: "Nova" });
  for (const bad of [{ kind: "new", slug: "../x", title: "T", date: "2026-11-27", cover: "https://e.com/c.jpg" }, { kind: "new", slug: "ok", title: "T", date: "2026-11-27", cover: "http://e.com/c.jpg" },
    { kind: "new", slug: "ok", title: "T\n$(rm -rf)", date: "2026-11-27", cover: "https://e.com/c.jpg" }, { kind: "new", slug: "ok", title: "T", date: "x", cover: "https://e.com/c.jpg" },
    { kind: "track", slug: "ok", track: TRACK + "?si=1" }, { kind: "rm", slug: "ok" }, null, "x"]) assert.throws(() => checkJob(bad), undefined, JSON.stringify(bad));
  assert.equal(directLink("https://www.dropbox.com/scl/fi/abc/cover.jpg?rlkey=xyz&dl=0"), "https://www.dropbox.com/scl/fi/abc/cover.jpg?rlkey=xyz&dl=1");
  assert.equal(directLink("https://www.dropbox.com/s/abc/cover.jpg"), "https://www.dropbox.com/s/abc/cover.jpg?dl=1");
  assert.equal(directLink("https://example.com/c.jpg"), "https://example.com/c.jpg");
});

test("the workflow: started only by the site, the job never pasted into a shell, the song-page checks before publishing, files added by name", () => {
  const y = readFileSync(new URL("../.github/workflows/song-page.yml", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  assert.match(y, /repository_dispatch:\s*\n\s*types: \[song-page\]/);
  assert.doesNotMatch(y, /\bpush:|pull_request|workflow_dispatch|schedule:/, "nothing else starts it");
  assert.match(y, /contents: write/);
  const runs = y.split("\n").filter((l) => /^\s*(run:|- run:)|^\s{10,}\S/.test(l)).join("\n");
  assert.doesNotMatch(runs, /\$\{\{\s*github\.event/, "client_payload only through env, never inside a run line");
  assert.match(y, /JOB: \$\{\{ toJSON\(github\.event\.client_payload\) \}\}/);
  /* changed 17 Nov 2026 (A2, Webmaster via Luke): only the song-page checks run before the push; the whole suite
     runs after it and never blocks a page (unrelated bank tests held /loveyou up for ~20 minutes) */
  assert.ok(y.indexOf("npm run test:song") > 0 && y.indexOf("npm run test:song") < y.indexOf("git push origin HEAD:main"), "song-page checks before the push");
  assert.doesNotMatch(y, /git add (-A|\.|--all)/);
  assert.match(y, /git add --pathspec-from-file/);
});
