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
  /* 26 Nov 2026: every job now also carries tone ("" = Mix) and footage ("all" = everything) for the dialogue scenes */
  const ok = E.validateJob({ song: "touchme", styles: ["vibe-wall", "movie-card", "vibe-wall"], n: 12, lang: "pt", seconds: 31 }, ["touchme"]);
  assert.deepEqual(ok.job, { song: "touchme", styles: ["vibe-wall", "movie-card"], n: 12, lang: "pt", seconds: 31, tone: "", footage: "all" });
  assert.deepEqual(E.validateJob({ song: "touchme", styles: "vibe-bigword", n: 1 }, ["touchme"]).job, { song: "touchme", styles: ["vibe-bigword"], n: 1, lang: "en", seconds: 15, tone: "", footage: "all" });
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

/* ---------- the dialogue scene style (26 Nov 2026): tone, footage, its own length ---------- */
test("tone is Mix, Heartbreak or Sensual and footage is Romance films, TV shows or Everything; anything else is a plain sentence", () => {
  const job = (o) => E.validateJob({ song: "touchme", styles: ["movie-dialogue"], n: 4, ...o }, ["touchme"]).job;
  assert.equal(job({ tone: "heartbreak" }).tone, "heartbreak");
  assert.equal(job({ tone: "sensual" }).tone, "sensual");
  for (const mix of ["", null, undefined]) assert.equal(job({ tone: mix }).tone, "", "no tone = Mix, which alternates");
  assert.equal(job({ footage: "romance" }).footage, "romance");
  assert.equal(job({ footage: "tv" }).footage, "tv");
  assert.equal(job({ footage: "all" }).footage, "all");
  for (const any of ["", null, undefined]) assert.equal(job({ footage: any }).footage, "all", "no footage = everything");
  const no = (b, re) => assert.throws(() => E.validateJob({ song: "touchme", styles: ["movie-dialogue"], n: 4, ...b }, ["touchme"]), (e) => e instanceof E.EditsError && re.test(e.message));
  for (const tone of ["happy", "Heartbreak", "mix", 3, ["sensual"]]) no({ tone }, /^Tone: Mix, Heartbreak or Sensual\.$/);
  for (const footage of ["movies", "Romance Movies", "TV SHOWS", 1, {}]) no({ footage }, /^Footage: Romance films, TV shows or Everything\.$/);
  /* a wrong value is refused even where it wouldn't be used */
  no({ styles: ["vibe-wall"], tone: "angry" }, /^Tone:/);
  /* tone only means something for dialogue scenes, footage for dialogue scenes and movie cards */
  const vibe = E.validateJob({ song: "touchme", styles: ["vibe-wall"], n: 2, tone: "sensual", footage: "tv" }, ["touchme"]).job;
  assert.equal(vibe.tone, "");
  assert.equal(vibe.footage, "all");
  const card = E.validateJob({ song: "touchme", styles: ["movie-card"], n: 2, tone: "sensual", footage: "tv" }, ["touchme"]).job;
  assert.equal(card.tone, "");
  assert.equal(card.footage, "tv");
  assert.deepEqual(job({ tone: "sensual", footage: "tv", lang: "pt" }), { song: "touchme", styles: ["movie-dialogue"], n: 4, lang: "pt", seconds: 31, tone: "sensual", footage: "tv" });
  assert.deepEqual(E.STYLES.find((s) => s.key === "movie-dialogue"), { key: "movie-dialogue", label: "Dialogue scene", hint: "one film scene, then the song comes in under it" });
  assert.deepEqual(E.TONES.map((t) => [t.key, t.label]), [["", "Mix"], ["heartbreak", "Heartbreak"], ["sensual", "Sensual"]]);
  assert.deepEqual(E.FOOTAGE.map((f) => [f.key, f.label]), [["romance", "Romance films"], ["tv", "TV shows"], ["all", "Everything"]]);
});

test("the scene sets the length: a dialogue-only job is 31 s whatever was picked, and the estimate counts it as 31 s", () => {
  const job = (o) => E.validateJob({ song: "touchme", n: 10, ...o }, ["touchme"]).job;
  assert.equal(job({ styles: ["movie-dialogue"] }).seconds, 31);
  assert.equal(job({ styles: ["movie-dialogue"], seconds: 15 }).seconds, 31);
  assert.equal(job({ styles: ["movie-dialogue"], seconds: 31 }).seconds, 31);
  /* with other styles too, the length picked is for those; the dialogue scenes stay about 30 s */
  assert.equal(job({ styles: ["movie-dialogue", "vibe-wall"], seconds: 15 }).seconds, 15);
  assert.equal(job({ styles: ["vibe-wall"] }).seconds, 15);
  assert.throws(() => job({ styles: ["movie-dialogue"], seconds: 20 }), /15 or 31/);
  assert.equal(E.estimateMinutes(10, 15, ["movie-dialogue"]), E.estimateMinutes(10, 31), "a dialogue scene costs what a 31 s edit costs");
  assert.equal(E.estimateMinutes(10, 15, ["movie-dialogue"]), 14);
  assert.equal(E.estimateMinutes(10, 15, ["movie-dialogue", "vibe-wall"]), 12, "half the edits at 31 s, half at 15 s");
  assert.equal(E.estimateMinutes(10, 15, ["vibe-wall"]), 9);
  assert.equal(E.estimateMinutes(10, 15), 9, "the old two-argument call is unchanged");
});

test("the job card says the style, the tone and the footage in words", async () => {
  const base = { song: "touchme", n: 4, lang: "en", seconds: 31, state: "waiting" };
  assert.equal(E.jobLine({ ...base, styles: ["movie-dialogue"], tone: "heartbreak", footage: "romance" }), "Dialogue scene · Heartbreak · Romance films");
  assert.equal(E.jobLine({ ...base, styles: ["movie-dialogue"], tone: "sensual", footage: "tv" }), "Dialogue scene · Sensual · TV shows");
  assert.equal(E.jobLine({ ...base, styles: ["movie-dialogue"], tone: "", footage: "all" }), "Dialogue scene", "Mix and Everything are the defaults: not said");
  assert.equal(E.jobLine({ ...base, styles: ["vibe-wall", "movie-card"], tone: "", footage: "tv" }), "Wall, Movie card · TV shows");
  assert.equal(E.jobLine({ ...base, styles: ["vibe-bigword"] }), "Big word", "a job from before 26 Nov has no tone or footage");
  /* the stored job, the list and the answer to POST all carry the line */
  const store = memoryDesk(), drv = fakeDrive();
  const r = await call("/api/edits/jobs", { method: "POST", body: { song: "touchme", styles: ["movie-dialogue"], n: 3, seconds: 15, tone: "heartbreak", footage: "romance" }, store, drv });
  assert.equal(r.s, 200, r.text);
  assert.equal(r.j.job.seconds, 31);
  assert.equal(r.j.job.tone, "heartbreak");
  assert.equal(r.j.job.footage, "romance");
  assert.equal(r.j.job.minutes, E.estimateMinutes(3, 31));
  assert.equal(r.j.job.line, "Dialogue scene · Heartbreak · Romance films");
  const kept = await store.get("jobs/" + r.j.job.id + ".json", { type: "json" });
  assert.equal(kept.tone, "heartbreak");
  assert.equal(kept.footage, "romance");
  assert.equal(kept.line, undefined, "the words are made when listed, not stored");
  const list = await call("/api/edits/jobs", { store, drv });
  assert.equal(list.j.jobs[0].line, "Dialogue scene · Heartbreak · Romance films");
  const bad = await call("/api/edits/jobs", { method: "POST", body: { song: "touchme", styles: ["movie-dialogue"], n: 3, tone: "angry" }, store, drv });
  assert.equal(bad.s, 400);
  assert.equal(bad.j.error, "Tone: Mix, Heartbreak or Sensual.");
});

test("a dialogue recipe reads well on the review card and keeps its tone and film, never the lines", () => {
  const raw = {
    id: "c3", song: "touchme", style: "movie-dialogue", layout: "card", lang: "en", tone: "heartbreak", seconds: 31, variant: null, grade: "night-blue",
    scene: "the-notebook-2004-1/s003", film: "the-notebook-2004-1", film_start: 4123.5, hook: { id: "quote", text: "made-up line" }, clips: ["the-notebook-2004-1/s003"],
    land_line: "a made-up lyric", dialogue: ["made-up film line one", "made-up film line two"], shots: [{ t0: 0, t1: 3, src: "x" }],
  };
  const r = E.cleanRecipe(raw);
  assert.equal(r.tone, "heartbreak");
  assert.equal(r.film, "the-notebook-2004-1");
  assert.equal(r.scene, "the-notebook-2004-1/s003");
  for (const k of ["land_line", "dialogue", "shots", "variant"]) assert.equal(r[k], undefined, k + " is not kept (lyrics and film lines stay in Drive)");
  assert.equal(E.recipeLine(r), "touchme · Dialogue scene · Heartbreak · The Notebook (2004) · caption from the film · night-blue");
  assert.equal(E.recipeLine({ ...r, tone: "sensual", film: "one-tree-hill-s08e04-we-all-fall-down", hook: { id: "late-night", text: "x" } }), "touchme · Dialogue scene · Sensual · One Tree Hill S08E04 · hook late-night · night-blue");
  assert.equal(E.filmWords("the-notebook-2004-1"), "The Notebook (2004)");
  assert.equal(E.filmWords("titanic-1997-1080"), "Titanic (1997)");
  assert.equal(E.filmWords("la-la-land"), "La La Land");
  assert.equal(E.filmWords("gossip-girl-s01e01-pilot"), "Gossip Girl S01E01");
  assert.equal(E.filmWords("me-before-you-2016"), "Me Before You (2016)");
  assert.equal(E.filmWords("a-walk-to-remember-2002"), "A Walk to Remember (2002)");
  assert.equal(E.filmWords(""), "");
  /* the movie card's line is unchanged */
  assert.equal(E.recipeLine(E.cleanRecipe(RECIPE)), "touchme · Movie card (serif) · hook let-go · warm-film · 2 clips");
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
  assert.match(no.j.error, /Pick why: wrong timing, weak clip, too dark, text hard to read, off-vibe, repeat, something else/);
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
  assert.equal(ov.j.styles.length, 6); /* 26 Nov 2026: Dialogue scene added (it was 5) */
  assert.deepEqual(ov.j.tones.map((t) => t.label), ["Mix", "Heartbreak", "Sensual"]);
  assert.deepEqual(ov.j.footage.map((f) => f.label), ["Romance films", "TV shows", "Everything"]);
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

/* 26 Nov 2026: Luke wants to say "too dark", and to type his own reason when none of the buttons fit. */
test("reject can say too dark, or something else in Luke's own words (kept short and plain)", async () => {
  assert.deepEqual(E.REASONS.map((r) => r.key), ["timing", "clip", "dark", "text", "vibe", "repeat", "other"]);
  const store = memoryDesk(), drv = fakeDrive();
  const dark = await call("/api/edits/decide", { method: "POST", body: { id: "touchme__movie-card__a1", choice: "reject", reason: "dark" }, store, drv });
  assert.equal(dark.s, 200, dark.text);
  assert.equal(dark.j.reason, "dark");

  const store2 = memoryDesk(), drv2 = fakeDrive();
  const empty = await call("/api/edits/decide", { method: "POST", body: { id: "touchme__movie-card__a1", choice: "reject", reason: "other", note: "   " }, store: store2, drv: drv2 });
  assert.equal(empty.s, 400);
  assert.match(empty.j.error, /Say why in a few words/);
  assert.equal(drv2.calls.moves.length, 0);
  const long = "  not\u0007 sensual   enough,\n the  girl looks sad " + "x".repeat(400);
  const r = await call("/api/edits/decide", { method: "POST", body: { id: "touchme__movie-card__a1", choice: "reject", reason: "other", note: long }, store: store2, drv: drv2 });
  assert.equal(r.s, 200, r.text);
  const saved = await store2.get("decision/touchme__movie-card__a1.json", { type: "json" });
  assert.ok(saved.note.startsWith("not sensual enough, the girl looks sad x"));
  assert.equal(saved.note.length, 200);
  const log = await store2.get("log/2026-11.json", { type: "json" });
  assert.equal(log[0].note, saved.note);
});

test("an approval never keeps a note, and scores list the latest typed reasons", () => {
  const s = E.scoresView([
    { choice: "reject", reason: "other", note: "older note", hook: "quote", grade: "red", at: 1 },
    { choice: "approve", hook: "quote", grade: "red", at: 2 },
    { choice: "reject", reason: "dark", hook: "try-again", grade: "night-blue", at: 3 },
    { choice: "reject", reason: "other", note: "not sensual", hook: "the-pull", grade: "red", at: 4 },
  ], []);
  assert.deepEqual(s.notes, [{ note: "not sensual", hook: "the-pull", grade: "red", at: 4 }, { note: "older note", hook: "quote", grade: "red", at: 1 }]);
  assert.deepEqual(s.reasons.map((r) => r.label).sort(), ["Something else", "Too dark"]);
});

test("Review shows a box for Luke's own reason when he picks Something else", () => {
  const js = readFileSync(new URL("../js/hq-edits.js", import.meta.url), "utf8");
  assert.match(js, /data-enote=/);
  assert.match(js, /maxlength="200"/);
  assert.match(js, /Your notes/);
});

/* 26 Nov 2026: Luke: approvals quicker, and a green border when approved. */
test("Review: a tap marks the card at once (green when approved) and only that card is redrawn", () => {
  const js = readFileSync(new URL("../js/hq-edits.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../hq.html", import.meta.url), "utf8");
  assert.match(html, /\.edcard\.ok\{[^}]*border:2px solid #22c55e/);
  assert.match(js, /function patch\(id\)/);
  const eok = js.slice(js.indexOf('hasAttribute("data-eok")'), js.indexOf('hasAttribute("data-eno")'));
  assert.doesNotMatch(eok, /draw\(\)|redraw\(/, "approving never redraws the whole list");
  assert.match(eok, /patch\(/);
});
