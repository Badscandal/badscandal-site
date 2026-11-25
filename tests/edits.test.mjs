/* Social Farm › Edits (25 Nov 2026): netlify/lib/edits.mjs, netlify/lib/gdrive.mjs, netlify/functions/edits.mjs.
   Drive is a fake (never Google); the Blob store is the in-memory desk. Every name and id is made up. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import * as E from "../netlify/lib/edits.mjs";
import { DriveError, accessToken, drive, forgetTokens, parseRange } from "../netlify/lib/gdrive.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { makeSession } from "../netlify/lib/session.mjs";
import { handleEdits } from "../netlify/functions/edits.mjs";

const NOW = Date.parse("2026-11-25T15:00:00Z");
const ADMIN = "made-up-admin-password";
const WORKER = "made-up-worker-token-0123456789";
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" });
const SA = JSON.stringify({ client_email: "edits@example-project.iam.gserviceaccount.com", private_key: PEM });
const ORIGIN = "https://badscandal.com";

const F = { main: "fileMAIN000001", prev: "filePREV000001", json: "fileJSON000001", main2: "fileMAIN000002", prev2: "filePREV000002" };
const RECIPE = { id: "a1", song: "touchme", style: "movie-card", variant: "serif", grade: "warm-film", hook: { id: "let-go", text: "made-up caption" }, clips: ["m1", "m2"], shots: [{ secret: "x" }], path: "/Users/someone/x.mp4" };

function fakeDrive({ files, recipe = RECIPE, folders } = {}) {
  const map = { "1 Review": "REVIEWFOLDER01", "0 Songs": "SONGSFOLDER001", "0 Clips/Movies": "MOVIESFOLDER01", ...(folders || {}) };
  const calls = { moves: [], made: [], streams: [], reads: 0 };
  files = files || [
    { id: F.main, name: "touchme__movie-card__a1.mp4", size: "9000000", createdTime: "2026-11-25T14:00:00Z" },
    { id: F.prev, name: "touchme__movie-card__a1.preview.mp4", size: "1500000", createdTime: "2026-11-25T14:00:00Z" },
    { id: F.json, name: "touchme__movie-card__a1.json", size: "900", createdTime: "2026-11-25T14:00:00Z" },
    { id: F.main2, name: "touchme__vibe-wall__b2.mp4", size: "8000000", createdTime: "2026-11-25T14:30:00Z" },
    { id: F.prev2, name: "touchme__vibe-wall__b2.preview.mp4", size: "1200000", createdTime: "2026-11-25T14:30:00Z" },
  ];
  return {
    calls,
    async path(root, p, make) { if (map[p]) return map[p]; if (!make) return null; calls.made.push(p); return (map[p] = "MADE" + calls.made.length + "FOLDER0"); },
    async list(id) { return id === map["1 Review"] ? files : id === map["0 Clips/Movies"] ? [{ id: "film1", name: "A Film.mkv" }] : []; },
    async folders(id) { return id === map["0 Songs"] ? [{ id: "FOLDERTOUCHME1", name: "touchme" }, { id: "FOLDERNOTIME01", name: "medaseubody" }] : []; },
    async named(ids, name) { return name === "timings.json" && ids.includes("FOLDERTOUCHME1") ? [{ id: "timings1", parents: ["FOLDERTOUCHME1"] }] : []; },
    async move(f, to, from) { calls.moves.push([f, to, from]); },
    async readJSON() { calls.reads++; return { ...recipe }; },
    async stream(id, s, e) { calls.streams.push([id, s, e]); return new Response("x".repeat(e - s + 1)); },
  };
}

const envOf = (o = {}) => (k) => ({ ADMIN_KEY: ADMIN, EDITS_DRIVE_FOLDER_ID: "ROOTFOLDER0001", GOOGLE_SA_KEY: SA, EDITS_WORKER_TOKEN: WORKER, ...o })[k];
async function call(path, { method = "GET", body, cookie = true, origin = ORIGIN, headers = {}, env, drv, store, fetchImpl, stats } = {}) {
  const h = { ...headers };
  if (cookie) h.cookie = "__Host-bs_admin=" + (await makeSession(ADMIN, NOW));
  if (origin && method === "POST") h.origin = origin;
  const req = new Request(ORIGIN + path, { method, headers: h, body: body == null ? undefined : JSON.stringify(body) });
  const res = await handleEdits(req, { env: env || envOf(), prod: false, store: () => store, drive: drv, now: () => NOW, fetch: fetchImpl || (() => { throw new Error("no network in tests"); }), stats: () => stats || memoryDesk() });
  const text = res.status === 206 || (res.headers.get("content-type") || "").startsWith("video") ? await res.text() : await res.text();
  let j = null; try { j = JSON.parse(text); } catch {}
  return { s: res.status, j, text, res };
}

/* ---------- making a job ---------- */
test("a job is checked: a song with timings, known styles, 1-50, en/pt/es, 15 or 31 s", () => {
  const ok = E.validateJob({ song: "touchme", styles: ["vibe-wall", "movie-card", "vibe-wall"], n: 12, lang: "pt", seconds: 31 }, ["touchme"]);
  assert.deepEqual(ok.job, { song: "touchme", styles: ["vibe-wall", "movie-card"], n: 12, lang: "pt", seconds: 31 });
  assert.deepEqual(E.validateJob({ song: "touchme", styles: "vibe-bigword", n: 1 }, ["touchme"]).job, { song: "touchme", styles: ["vibe-bigword"], n: 1, lang: "en", seconds: 15 });
  const no = (b, re) => assert.throws(() => E.validateJob(b, ["touchme"]), (e) => e instanceof E.EditsError && re.test(e.message));
  no({ song: "medaseubody", styles: ["vibe-wall"], n: 2 }, /no timings yet/);
  no({ song: "", styles: ["vibe-wall"], n: 2 }, /Pick a song/);
  no({ song: "touchme", styles: [], n: 2 }, /at least one style/);
  no({ song: "touchme", styles: ["tiktok-dance"], n: 2 }, /Unknown style: tiktok-dance/);
  for (const n of [0, 51, 1.5, "ten", null]) no({ song: "touchme", styles: ["vibe-wall"], n }, /from 1 to 50/);
  no({ song: "touchme", styles: ["vibe-wall"], n: 2, lang: "fr" }, /Language/);
  no({ song: "touchme", styles: ["vibe-wall"], n: 2, seconds: 20 }, /15 or 31/);
  assert.equal(E.estimateMinutes(10, 15), 9);
  assert.equal(E.estimateMinutes(10, 31), 14);
});

test("POST jobs stores the job and, with no cloud set up, it waits for the cloud worker", async () => {
  const store = memoryDesk(), drv = fakeDrive();
  const r = await call("/api/edits/jobs", { method: "POST", body: { song: "touchme", styles: ["movie-card"], n: 3 }, store, drv });
  assert.equal(r.s, 200, r.text);
  assert.equal(r.j.job.state, "waiting");
  assert.equal(r.j.job.words, "Waiting for the cloud worker");
  const kept = await store.get("jobs/" + r.j.job.id + ".json", { type: "json" });
  assert.equal(kept.total, 3);
  const bad = await call("/api/edits/jobs", { method: "POST", body: { song: "medaseubody", styles: ["movie-card"], n: 3 }, store, drv });
  assert.equal(bad.s, 400);
  assert.match(bad.j.error, /no timings yet/);
  const list = await call("/api/edits/jobs", { store, drv });
  assert.equal(list.j.jobs.length, 1);
});

test("with the cloud set up, a job starts the Cloud Run job with its id as the argument", async () => {
  forgetTokens();
  const store = memoryDesk(), drv = fakeDrive(), asked = [];
  const fetchImpl = async (url, init) => {
    asked.push({ url: String(url), body: init && init.body ? String(init.body) : "" });
    if (String(url).includes("oauth2")) return Response.json({ access_token: "made-up-access", expires_in: 3600 });
    return Response.json({ name: "operation" });
  };
  const env = envOf({ EDITS_GCP_PROJECT: "made-up-project", EDITS_REGION: "europe-west1", EDITS_JOB_NAME: "edits-worker" });
  const r = await call("/api/edits/jobs", { method: "POST", body: { song: "touchme", styles: ["vibe-wall"], n: 2 }, store, drv, env, fetchImpl });
  assert.equal(r.j.job.state, "queued");
  const run = asked.find((a) => a.url.includes("run.googleapis.com"));
  assert.equal(run.url, "https://run.googleapis.com/v2/projects/made-up-project/locations/europe-west1/jobs/edits-worker:run");
  assert.deepEqual(JSON.parse(run.body).overrides.containerOverrides[0].args, ["work", "render", r.j.job.id]);
});

/* ---------- the login ---------- */
test("401 without the login, on every one of Luke's routes", async () => {
  for (const [path, method] of [["/api/edits/overview", "GET"], ["/api/edits/review", "GET"], ["/api/edits/jobs", "POST"], ["/api/edits/decide", "POST"], ["/api/edits/undo", "POST"], [`/api/edits/preview/${F.prev}`, "GET"], ["/api/edits/stock", "GET"], ["/api/edits/scores", "GET"], ["/api/edits/overview?sample=1", "GET"]]) {
    const drv = fakeDrive();
    const r = await call(path, { method, cookie: false, body: method === "POST" ? {} : undefined, store: memoryDesk(), drv });
    assert.equal(r.s, 401, path);
    assert.equal(drv.calls.moves.length + drv.calls.streams.length, 0);
  }
  const wrongSite = await call("/api/edits/decide", { method: "POST", origin: "https://example.com", body: { id: "x", choice: "approve" }, store: memoryDesk(), drv: fakeDrive() });
  assert.equal(wrongSite.s, 403);
  const noOrigin = await call("/api/edits/decide", { method: "POST", origin: "", body: { id: "x", choice: "approve" }, store: memoryDesk(), drv: fakeDrive() });
  assert.equal(noOrigin.s, 403);
});

/* ---------- the worker's token ---------- */
test("the worker token: 404 when unset, 401 when wrong, constant-time check, then the job and its results", async () => {
  const store = memoryDesk();
  const unset = await call("/api/edits/status?job=jabc1234", { cookie: false, env: envOf({ EDITS_WORKER_TOKEN: "" }), store, headers: { authorization: "Bearer " + WORKER } });
  assert.equal(unset.s, 404);
  const wrong = await call("/api/edits/status?job=jabc1234", { cookie: false, store, headers: { authorization: "Bearer nope" } });
  assert.equal(wrong.s, 401);
  const cookieOnly = await call("/api/edits/status?job=jabc1234", { cookie: true, store });
  assert.equal(cookieOnly.s, 401, "Luke's login is not the worker");
  assert.equal(E.workerOk("Bearer " + WORKER, WORKER), true);
  assert.equal(E.workerOk(WORKER, WORKER), true);
  assert.equal(E.workerOk("Bearer " + WORKER + "x", WORKER), false);
  assert.equal(E.workerOk("", WORKER), false);
  assert.equal(E.workerOk("Bearer x", ""), false);
  assert.match(readFileSync(new URL("../netlify/lib/edits.mjs", import.meta.url), "utf8"), /sameString\(h\(given\), h\(token\)\)/);

  const job = await E.createJob(store, { song: "touchme", styles: ["vibe-wall"], n: 2, lang: "en", seconds: 15 }, NOW);
  const auth = { authorization: "Bearer " + WORKER };
  const got = await call("/api/edits/status?job=" + job.id, { cookie: false, store, headers: auth });
  assert.equal(got.s, 200);
  assert.equal(got.j.job.song, "touchme");
  const post = await call("/api/edits/status", { method: "POST", cookie: false, origin: "", store, headers: auth, body: {
    job: job.id, state: "rendering", done: 1,
    edits: [{ name: "touchme__vibe-wall__b2", file: F.main2, preview: F.prev2, recipe: RECIPE }, { name: "../evil", file: "x" }],
    stock: { songs: { touchme: { vibe: 40, "movie-card": 12 } }, filmsWaiting: 1 },
  } });
  assert.equal(post.s, 200, post.text);
  assert.equal(post.j.saved, 1);
  assert.equal(post.j.job.words, "Rendering 1 of 2");
  const rec = await store.get("edit/touchme__vibe-wall__b2.json", { type: "json" });
  assert.equal(rec.recipe.style, "movie-card");
  assert.equal(rec.recipe.path, undefined, "only known recipe fields are kept");
  assert.equal(rec.recipe.shots, undefined);
  const unknown = await call("/api/edits/status", { method: "POST", cookie: false, store, headers: auth, body: { job: "jnothere99", state: "done" } });
  assert.equal(unknown.s, 404);
});

/* ---------- review, approve, reject, undo ---------- */
test("the review list groups the three files, reads a recipe once, and is newest first", async () => {
  const store = memoryDesk(), drv = fakeDrive();
  const r = await call("/api/edits/review", { store, drv });
  assert.equal(r.s, 200);
  assert.deepEqual(r.j.items.map((i) => i.id), ["touchme__vibe-wall__b2", "touchme__movie-card__a1"]);
  const a = r.j.items[1];
  assert.equal(a.preview.id, F.prev);
  assert.equal(a.line, "touchme · Movie card (serif) · hook let-go · warm-film · 2 clips");
  assert.equal(a.recipe.path, undefined);
  assert.equal(r.j.items[0].line, "Recipe not read yet", "no .json and the worker hasn't said");
  await call("/api/edits/review", { store, drv });
  assert.equal(drv.calls.reads, 1, "the recipe is kept after the first read");
});

test("approve moves all three files to 2 Approved/<song>/, once; undo within 10 minutes puts them back", async () => {
  const store = memoryDesk(), drv = fakeDrive();
  const r = await call("/api/edits/decide", { method: "POST", body: { id: "touchme__movie-card__a1", choice: "approve" }, store, drv });
  assert.equal(r.s, 200, r.text);
  assert.deepEqual(drv.calls.made, ["2 Approved/touchme"]);
  const to = "MADE1FOLDER0";
  assert.deepEqual(drv.calls.moves, [[F.main, to, "REVIEWFOLDER01"], [F.prev, to, "REVIEWFOLDER01"], [F.json, to, "REVIEWFOLDER01"]]);
  const again = await call("/api/edits/decide", { method: "POST", body: { id: "touchme__movie-card__a1", choice: "reject", reason: "clip" }, store, drv });
  assert.equal(again.s, 409);
  assert.match(again.j.error, /Already approved/);
  const log = await store.get("log/2026-11.json", { type: "json" });
  assert.equal(log.length, 1);
  assert.equal(log[0].style, "movie-card");

  const u = await call("/api/edits/undo", { method: "POST", body: { id: "touchme__movie-card__a1" }, store, drv });
  assert.equal(u.s, 200, u.text);
  assert.deepEqual(drv.calls.moves.slice(3), [[F.main, "REVIEWFOLDER01", to], [F.prev, "REVIEWFOLDER01", to], [F.json, "REVIEWFOLDER01", to]]);
  assert.deepEqual(await store.get("log/2026-11.json", { type: "json" }), []);
  assert.equal(await store.get("decision/touchme__movie-card__a1.json"), null);
});

test("reject needs a reason and moves to 9 Rejected/; undo after 10 minutes is refused", async () => {
  const store = memoryDesk(), drv = fakeDrive();
  const no = await call("/api/edits/decide", { method: "POST", body: { id: "touchme__movie-card__a1", choice: "reject" }, store, drv });
  assert.equal(no.s, 400);
  assert.match(no.j.error, /Pick why: wrong timing, weak clip, text hard to read, off-vibe, repeat/);
  assert.equal(drv.calls.moves.length, 0);
  const r = await call("/api/edits/decide", { method: "POST", body: { id: "touchme__movie-card__a1", choice: "reject", reason: "text" }, store, drv });
  assert.equal(r.s, 200, r.text);
  assert.deepEqual(drv.calls.made, ["9 Rejected"]);
  assert.ok(drv.calls.moves.every((m) => m[1] === "MADE1FOLDER0" && m[2] === "REVIEWFOLDER01"));
  const late = await handleEdits(new Request(ORIGIN + "/api/edits/undo", { method: "POST", headers: { origin: ORIGIN, cookie: "__Host-bs_admin=" + (await makeSession(ADMIN, NOW)) }, body: JSON.stringify({ id: "touchme__movie-card__a1" }) }),
    { env: envOf(), prod: false, store: () => store, drive: drv, now: () => NOW + E.UNDO_MS + 1000 });
  assert.equal(late.status, 409);
  const gone = await call("/api/edits/decide", { method: "POST", body: { id: "touchme__nothere__z9", choice: "approve" }, store, drv });
  assert.equal(gone.s, 404);
});

test("a Drive failure part way puts the moved files back and frees the decision", async () => {
  const store = memoryDesk(), drv = fakeDrive();
  let n = 0;
  const move = drv.move;
  drv.move = async (f, to, from) => { if (++n === 2) throw new DriveError("Google Drive didn't answer in time"); return move(f, to, from); };
  const r = await call("/api/edits/decide", { method: "POST", body: { id: "touchme__movie-card__a1", choice: "approve" }, store, drv });
  assert.equal(r.s, 502);
  assert.equal(r.j.error, "Google Drive didn't answer in time");
  assert.deepEqual(drv.calls.moves.at(-1), [F.main, "REVIEWFOLDER01", "MADE1FOLDER0"]);
  assert.equal(await store.get("decision/touchme__movie-card__a1.json"), null);
});

/* ---------- previews ---------- */
test("Range: one range, open ends capped, suffix ranges, impossible ranges refused", () => {
  assert.deepEqual(parseRange("bytes=0-1", 1000), { start: 0, end: 1, partial: true });
  assert.deepEqual(parseRange("bytes=100-", 1000), { start: 100, end: 999, partial: true });
  assert.deepEqual(parseRange("bytes=-100", 1000), { start: 900, end: 999, partial: true });
  assert.deepEqual(parseRange("bytes=0-5000", 1000), { start: 0, end: 999, partial: true });
  assert.deepEqual(parseRange(null, 1000), { start: 0, end: 999, partial: false });
  assert.deepEqual(parseRange(null, 10, 4), { start: 0, end: 3, partial: true });
  assert.deepEqual(parseRange("bytes=0-", 10, 4), { start: 0, end: 3, partial: true });
  for (const bad of ["bytes=1000-", "bytes=5-2", "bytes=-0", "bytes=-", "bytes=0-1,5-6", "items=0-1", "bytes=a-b"]) assert.equal(parseRange(bad, 1000), null, bad);
  assert.equal(parseRange("bytes=0-1", 0), null);
});

test("the preview route streams only previews in the review list, with Range and a private cache", async () => {
  const store = memoryDesk(), drv = fakeDrive();
  const r = await call(`/api/edits/preview/${F.prev}`, { headers: { range: "bytes=0-9" }, store, drv });
  assert.equal(r.s, 206);
  assert.equal(r.res.headers.get("content-range"), "bytes 0-9/1500000");
  assert.equal(r.res.headers.get("accept-ranges"), "bytes");
  assert.equal(r.res.headers.get("cache-control"), "private, max-age=300");
  assert.equal(r.res.headers.get("content-type"), "video/mp4");
  assert.equal(r.text.length, 10);
  for (const id of [F.main, F.json, "someoneElsesFile01", "../../etc"]) {
    const no = await call("/api/edits/preview/" + id, { store, drv });
    assert.equal(no.s, 404, id);
  }
  assert.deepEqual(drv.calls.streams, [[F.prev, 0, 9]]);
  const bad = await call(`/api/edits/preview/${F.prev}`, { headers: { range: "bytes=9999999-" }, store, drv });
  assert.equal(bad.s, 416);
});

/* ---------- sample, setup, stock, scores ---------- */
test("sample mode never calls Google, never opens the store and never saves", async () => {
  let fetched = 0, opened = 0;
  const fetchImpl = async () => { fetched++; throw new Error("no"); };
  const trap = new Proxy({}, { get() { opened++; return () => { throw new Error("store opened"); }; } });
  const drv = new Proxy({}, { get() { opened++; return () => { throw new Error("drive used"); }; } });
  for (const p of ["overview", "jobs", "review", "stock", "scores"]) {
    const r = await call("/api/edits/" + p + "?sample=1", { store: trap, drv, fetchImpl });
    assert.equal(r.s, 200, p);
    assert.equal(r.j.sample || r.j.jobs ? true : false, true, p);
  }
  const post = await call("/api/edits/decide?sample=1", { method: "POST", body: { id: "x", choice: "approve" }, store: trap, drv, fetchImpl });
  assert.equal(post.j.ok, false);
  assert.match(post.j.error, /nothing is saved/);
  assert.equal(fetched, 0);
  assert.equal(opened, 0);
});

test("without the Drive folder set, HQ says so instead of failing", async () => {
  const r = await call("/api/edits/overview", { env: envOf({ EDITS_DRIVE_FOLDER_ID: "" }), store: memoryDesk() });
  assert.equal(r.s, 200);
  assert.equal(r.j.drive.ok, false);
  assert.match(r.j.drive.why, /EDITS_DRIVE_FOLDER_ID/);
  const rev = await call("/api/edits/review", { env: envOf({ EDITS_DRIVE_FOLDER_ID: "" }), store: memoryDesk() });
  assert.equal(rev.s, 503);
  const ov = await call("/api/edits/overview", { store: memoryDesk(), drv: fakeDrive() });
  assert.deepEqual(ov.j.songs, [{ slug: "touchme", title: "Touch Me" }]);
  assert.equal(ov.j.styles.length, 5);
});

test("stock warns under 30 unused clips; scores count approvals and taps per farm page", async () => {
  const v = E.stockView({ at: NOW, songs: { touchme: { vibe: 80, "movie-card": 12 } } }, [{ slug: "touchme", title: "Touch Me" }, { slug: "loveyou", title: "Love you" }], 2);
  assert.equal(v.songs[0].warn, "Touch Me has 12 unused for movie-card: add footage");
  assert.equal(v.songs[1].per, null);
  assert.equal(v.filmsWaiting, 2);
  const s = E.scoresView(
    [{ choice: "approve", style: "vibe-wall", variant: "plain", hook: "our-song", grade: "red" }, { choice: "reject", reason: "timing", style: "vibe-wall", hook: "our-song", grade: "red" }],
    [{ src: "edits", type: "view", content: "pagea", page: "touchme" }, { src: "edits", type: "click", target: "spotify", content: "pagea", page: "touchme" }, { src: "meta", type: "click", target: "spotify", content: "ad", page: "touchme" }],
  );
  assert.deepEqual(s.styles, [{ key: "vibe-wall", approved: 1, rejected: 1, rate: 50 }]);
  assert.deepEqual(s.reasons, [{ key: "timing", label: "Wrong timing", n: 1 }]);
  assert.deepEqual(s.pages, [{ page: "pagea", visits: 1, taps: 1, songs: ["touchme"] }]);

  const stats = memoryDesk();
  await stats.set("ev/2026-11-25/click/touchme/edits/spotify/br/v1/1764082800000-abc123/pv1/-/lovecore/sao-paulo/phone/ios/safari/instagram/-/900/0/0/-/-", "");
  await stats.set("ev/2026-11-25/click/touchme/edits/spotify/br/v2/1764082800000-abc124/pv2/-/lovecore/ashburn/phone/ios/safari/-/-/900/0/0/dc-aws/-", "");
  const r = await call("/api/edits/scores", { store: memoryDesk(), drv: fakeDrive(), stats });
  assert.equal(r.s, 200, r.text);
  assert.deepEqual(r.j.pages, [{ page: "lovecore", visits: 0, taps: 1, songs: ["touchme"] }], "the data-centre tap is not counted");
});

/* ---------- Drive itself, and the key ---------- */
test("gdrive: one token reused, shared-drive flags on, a 403 names the service account, never the key", async () => {
  forgetTokens();
  const asked = [];
  const fetchImpl = async (url, init) => {
    asked.push({ url: String(url), init });
    if (String(url).includes("oauth2")) return Response.json({ access_token: "made-up-access", expires_in: 3600 });
    if (String(url).includes("REFUSED")) return new Response("{}", { status: 403 });
    return Response.json({ files: [{ id: "a", name: "1 Review", mimeType: "application/vnd.google-apps.folder" }] });
  };
  const d = drive(SA, fetchImpl);
  const files = await d.list("ROOT'S");
  assert.equal(files.length, 1);
  await d.list("ROOT2");
  assert.equal(asked.filter((a) => a.url.includes("oauth2")).length, 1, "the token is reused");
  const listUrl = decodeURIComponent(asked[1].url);
  assert.match(listUrl, /supportsAllDrives=true/);
  assert.match(listUrl, /includeItemsFromAllDrives=true/);
  assert.match(listUrl, /'ROOT\\'S' in parents and trashed = false/);
  assert.equal(asked[1].init.headers.Authorization, "Bearer made-up-access");
  await assert.rejects(d.list("REFUSED"), (e) => e instanceof DriveError && /isn't shared with edits@example-project/.test(e.message) && !e.message.includes("PRIVATE KEY"));
  await d.move("fileX", "TO", "FROM");
  const mv = asked.at(-1);
  assert.equal(mv.init.method, "PATCH");
  assert.match(mv.url, /addParents=TO&removeParents=FROM/);
  await assert.rejects(accessToken("not json", undefined, fetchImpl), /isn't a service-account JSON key/);
});

test("no secret reaches a log line", async () => {
  forgetTokens();
  const lines = [];
  const keep = { error: console.error, log: console.log, warn: console.warn };
  console.error = console.log = console.warn = (...a) => lines.push(a.map(String).join(" "));
  try {
    const boom = async () => { const e = new Error("boom " + SA + " " + WORKER); throw e; };
    await call("/api/edits/review", { store: memoryDesk(), drv: { path: boom } });
    await call("/api/edits/overview", { store: memoryDesk(), fetchImpl: async () => { throw new Error(SA); } });
    await call("/api/edits/status", { method: "POST", cookie: false, store: memoryDesk(), headers: { authorization: "Bearer " + WORKER }, body: { job: "jabc12345" } });
  } finally { Object.assign(console, keep); }
  const all = lines.join("\n");
  for (const secret of [PEM.split("\n")[1], WORKER, ADMIN, "made-up-access"]) assert.ok(!all.includes(secret), "a secret was logged");
  for (const f of ["../netlify/lib/edits.mjs", "../netlify/lib/gdrive.mjs", "../netlify/functions/edits.mjs"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    for (const m of src.matchAll(/console\.(log|error|warn)\(([^)]*)\)/g)) assert.doesNotMatch(m[2], /key|token|SA|secret|e\.message|\be\b\)/i, f + ": " + m[0]);
  }
});

test("robots keeps /api/edits/ out of search; the page never sees the key", () => {
  assert.match(readFileSync(new URL("../robots.txt", import.meta.url), "utf8"), /Disallow: \/api\/edits\//);
  const ui = readFileSync(new URL("../js/hq-edits.js", import.meta.url), "utf8");
  assert.doesNotMatch(ui, /GOOGLE_SA_KEY|EDITS_WORKER_TOKEN|private_key/);
});
