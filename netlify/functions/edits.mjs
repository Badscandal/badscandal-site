/* /api/edits/* — Social Farm › Edits on /hq (25 Nov 2026). Rules: netlify/lib/edits.mjs; Drive:
   netlify/lib/gdrive.mjs; made-up data for ?sample=1: netlify/lib/edits-sample.mjs.

   Luke (the /hq login cookie; POSTs only from our own page):
     GET  /api/edits/overview          songs with timings, the jobs, whether Drive and the cloud are set up
     POST /api/edits/jobs              { song, styles[], n 1-50, lang, seconds 15|31 } -> the job
     GET  /api/edits/jobs              the newest 20 jobs
     GET  /api/edits/review            the edits in 1 Review, newest first, with their recipes
     GET  /api/edits/preview/<fileId>  the 540 px preview, streamed with Range (only ids in the review list)
     POST /api/edits/decide            { id, choice: approve|reject, reason? } (one decision per edit)
     POST /api/edits/undo              { id } (within 10 minutes)
     GET  /api/edits/stock             unused clips per song (the worker's count) + films waiting
     GET  /api/edits/scores            approve rate per style / hook / grade + taps per farm page
   The cloud worker (Authorization: Bearer EDITS_WORKER_TOKEN; 404 when the token isn't set):
     GET  /api/edits/status?job=<id>   the job to render
     POST /api/edits/status            { job, state, done, error, edits: [{name, file, preview, recipe}], stock }

   Netlify env (Luke adds them): GOOGLE_SA_KEY (already there), EDITS_DRIVE_FOLDER_ID, EDITS_WORKER_TOKEN,
   and for starting the worker EDITS_GCP_PROJECT, EDITS_REGION, EDITS_JOB_NAME. No key is ever logged or
   answered. Deploy previews use their own throwaway "edits" store (Drive is the real folder). */
import { getDeployStore, getStore } from "@netlify/blobs";
import * as E from "../lib/edits.mjs";
import * as Sample from "../lib/edits-sample.mjs";
import { DriveError, drive, parseRange } from "../lib/gdrive.mjs";
import { COOKIE, readCookie, verifySession } from "../lib/session.mjs";
import { SONGS } from "../lib/songs.mjs";
import { PREFIX, parseKey } from "../lib/stats.mjs";
import { hardBot, spDay, addDays, utcDaysFor } from "../lib/admin.mjs";

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...NO_STORE } });
const TITLES = Object.fromEntries(SONGS.map((s) => [s.slug, s.title]));

async function readBody(req) {
  const t = await req.text();
  if (t.length > 64 * 1024) throw new E.EditsError("Too large.", 413);
  try { return JSON.parse(t || "{}"); } catch { throw new E.EditsError("That wasn't JSON."); }
}

/* the whole answer, errors included, so the tests see what Luke would see */
export async function handleEdits(req, ctx) {
  try {
    return await route(req, ctx);
  } catch (e) {
    if (e instanceof E.EditsError || e instanceof DriveError) return json(e.status || 400, { error: e.message });
    if (e && e.name === "StaffError") return json(503, { error: e.message });
    console.error("edits failed", e?.name || "Error");
    return json(500, { error: "Something went wrong" });
  }
}

async function route(req, ctx) {
  const { env, prod } = ctx;
  const url = new URL(req.url);
  const sub = url.pathname.replace(/^\/api\/edits\/?/, "").replace(/\/$/, "");
  const store = ctx.store || (() => (prod ? getStore({ name: "edits", consistency: "strong" }) : getDeployStore({ name: "edits", consistency: "strong" })));
  const now = ctx.now ? ctx.now() : Date.now();

  /* the cloud worker */
  if (sub === "status") {
    const token = env("EDITS_WORKER_TOKEN");
    if (!token) return json(404, { error: "Not found" });
    if (!E.workerOk(req.headers.get("authorization"), token)) return json(401, { error: "Wrong token" });
    if (req.method === "GET") {
      const id = url.searchParams.get("job") || "";
      if (!/^j[a-z0-9]{6,20}$/.test(id)) return json(404, { error: "Unknown job" });
      const job = await store().get("jobs/" + id + ".json", { type: "json" });
      return job ? json(200, { job }) : json(404, { error: "Unknown job" });
    }
    if (req.method !== "POST") return json(405, { error: "Use GET or POST" });
    return json(200, await E.workerUpdate(store(), await readBody(req), now));
  }

  /* everything else is Luke's */
  const secret = env("ADMIN_KEY") || env("STATS_KEY");
  if (!secret) return json(503, { error: "ADMIN_KEY is not set on Netlify" });
  if (!(await verifySession(readCookie(req.headers.get("cookie"), COOKIE), secret, now))) return json(401, { error: "Not logged in" });
  if (req.method === "POST") {
    const origin = req.headers.get("origin");
    if (!origin || origin !== url.origin) return json(403, { error: "Forbidden" });
  } else if (req.method !== "GET") return json(405, { error: "Use GET or POST" });
  const sample = url.searchParams.get("sample") === "1";

  if (sample) {
    if (req.method === "POST") return json(200, { ok: false, sample: true, error: "This is the sample: nothing is saved." });
    if (sub === "overview") return json(200, { ...Sample.sampleOverview(now), ...options() });
    if (sub === "jobs") return json(200, { jobs: Sample.sampleJobs(now) });
    if (sub === "review") return json(200, { sample: true, items: Sample.sampleReview(now) });
    if (sub === "stock") return json(200, { sample: true, ...Sample.sampleStock(now) });
    if (sub === "scores") return json(200, { sample: true, ...Sample.sampleScores() });
    return json(404, { error: "Not found" });
  }

  const root = env("EDITS_DRIVE_FOLDER_ID");
  const rawKey = env("GOOGLE_SA_KEY");
  const ready = !!(root && rawKey);
  const drv = ready ? (ctx.drive || drive(rawKey, ctx.fetch || fetch)) : null;
  const notReady = { drive: { ok: false, why: !rawKey ? "The Google key isn't on Netlify yet." : "The Drive folder isn't connected yet (EDITS_DRIVE_FOLDER_ID on Netlify)." } };

  if (sub === "overview" && req.method === "GET") {
    const jobs = await E.listJobs(store());
    const cloud = !!E.cloudStarter(env, rawKey);
    if (!ready) return json(200, { ...notReady, cloud, songs: [], jobs, ...options() });
    const songs = await E.songsWithTimings(drv, root, TITLES);
    return json(200, { drive: { ok: true }, cloud, songs, jobs, ...options() });
  }
  if (sub === "jobs" && req.method === "GET") return json(200, { jobs: await E.listJobs(store()) });
  if (!ready) return json(503, { error: notReady.drive.why, ...notReady });

  if (sub === "jobs" && req.method === "POST") {
    const body = await readBody(req);
    const songs = (await E.songsWithTimings(drv, root, TITLES)).map((s) => s.slug);
    const { job } = E.validateJob(body, songs);
    const made = await E.createJob(store(), job, now, E.cloudStarter(env, rawKey, ctx.fetch || fetch));
    return json(200, { ok: true, job: { ...made, words: E.jobWords(made) } });
  }
  if (sub === "review" && req.method === "GET") {
    const { items } = await E.reviewList(store(), drv, root, now);
    return json(200, { items });
  }
  if (sub.startsWith("preview/") && req.method === "GET") {
    const fileId = sub.slice("preview/".length);
    const size = await E.previewSize(store(), fileId, () => E.reviewList(store(), drv, root, now, { maxReads: 0 }));
    if (!size) return json(404, { error: "Not found" });
    const r = parseRange(req.headers.get("range"), size);
    if (!r) return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + size, ...NO_STORE } });
    const up = await drv.stream(fileId, r.start, r.end);
    const headers = {
      "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Content-Length": String(r.end - r.start + 1),
      "Cache-Control": "private, max-age=300", "X-Robots-Tag": "noindex, nofollow",
    };
    if (r.partial) headers["Content-Range"] = "bytes " + r.start + "-" + r.end + "/" + size;
    return new Response(up.body, { status: r.partial ? 206 : 200, headers });
  }
  if (sub === "decide" && req.method === "POST") return json(200, await E.decide(store(), drv, root, await readBody(req), now));
  if (sub === "undo" && req.method === "POST") return json(200, await E.undo(store(), drv, await readBody(req), now));
  if (sub === "stock" && req.method === "GET") {
    const [songs, report, movies] = await Promise.all([
      E.songsWithTimings(drv, root, TITLES),
      store().get("stock.json", { type: "json" }).catch(() => null),
      drv.path(root, E.FOLDERS.movies),
    ]);
    const films = movies ? (await drv.list(movies, { extra: "mimeType != 'application/vnd.google-apps.folder'" })).length : 0;
    return json(200, E.stockView(report, songs, films));
  }
  if (sub === "scores" && req.method === "GET") {
    const decisions = await E.decisionLog(store(), now);
    const stats = ctx.stats ? ctx.stats() : prod ? getStore("stats") : getDeployStore("stats");
    const today = spDay(now), days = [];
    for (let i = 29; i >= 0; i--) days.push(addDays(today, -i));
    const lists = await Promise.all(utcDaysFor(days).map(async (d) => ((await stats.list({ prefix: PREFIX + d + "/" })).blobs || []).map((b) => parseKey(b.key)).filter(Boolean)));
    const events = lists.flat().filter((e) => e.src === "edits" && !hardBot(e));
    return json(200, E.scoresView(decisions, events));
  }
  return json(404, { error: "Not found" });
}

function options() {
  return { styles: E.STYLES, langs: E.LANGS, seconds: E.SECONDS, reasons: E.REASONS, maxEdits: E.MAX_EDITS, lowStock: E.LOW_STOCK, undoMinutes: E.UNDO_MS / 60000 };
}

export default async (req, context) => handleEdits(req, { env: (k) => Netlify.env.get(k), prod: context.deploy?.context === "production" });

export const config = { path: "/api/edits/*" };
