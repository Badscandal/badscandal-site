/* The edit machine on HQ (25 Nov 2026): Social Farm › Edits.

   A cloud worker (private repo Badscandal/badscandal-edits, Cloud Run job "edits-worker") turns songs and
   film clips into short lyric edits and puts each one in the Drive folder "BADSCANDAL Edits":

     0 Songs/<slug>/   master.wav, lyrics.txt, timings.json (a song can be made once timings.json is there)
     0 Clips/Movies/   films waiting to be chopped        0 Clips/Vibes/  stock + Luke's own footage
     1 Review/         <name>.mp4 + <name>.preview.mp4 (540 px) + <name>.json (the recipe)
     2 Approved/<slug>/   the bots post from here         3 Posted/<slug>/<page>/   9 Rejected/

   Luke asks for edits here, watches the 540 px previews and approves or rejects each one; approving
   moves the three files to 2 Approved/<slug>/, rejecting to 9 Rejected/ with a reason. One decision per
   edit, undo within 10 minutes. Everything is pure: the Blob store, Drive, the clock and the cloud
   starter are passed in (tests: tests/edits.test.mjs).

   Blob store "edits":  jobs/<id>.json · edit/<name>.json (what the worker reported) · recipe/<name>.json
   (a recipe read from Drive once) · decision/<name>.json · log/<YYYY-MM>.json (decisions, for the
   scores) · review.json (the last review list: which previews may be streamed) · stock.json (the worker's
   count of unused clips). Nothing here spends money except the cloud minutes Luke switches on. */
import { createHash } from "node:crypto";
import { DriveError, RUN_SCOPE, accessToken } from "./gdrive.mjs";
import { sameString } from "./session.mjs";
import { mutate } from "./staff.mjs";

export const STYLES = [
  { key: "vibe-bigword", label: "Big word", hint: "big capitals on the vocal" },
  { key: "vibe-wall", label: "Wall", hint: "two columns filling in" },
  { key: "vibe-small", label: "Small line", hint: "one small line, club footage" },
  { key: "vibe-mixed", label: "Mixed", hint: "mixed case with a soft glow" },
  { key: "movie-card", label: "Movie card", hint: "film moments, words beside the face" },
  { key: "movie-dialogue", label: "Dialogue scene", hint: "one film scene, then the song comes in under it" },
];
export const STYLE_KEYS = STYLES.map((s) => s.key);
/* Dialogue scenes (26 Nov 2026, renderer Badscandal/badscandal-edits `--style movie-dialogue`): one film
   scene with its subtitles, then the song comes in under it. The scene sets the length (about 25-31 s), so a
   job of only dialogue scenes is stored as 31 s. Tone: "" = Mix (the renderer alternates heartbreak and
   sensual). Footage: which collection the film comes from; the worker maps it to the renderer's
   `--collection` (the Drive folder names live in the renderer, not here). Footage counts for dialogue
   scenes and movie cards, tone for dialogue scenes only; elsewhere they are stored as Mix / all. */
export const DIALOGUE = "movie-dialogue";
export const SCENE_SECONDS = 31;
export const TONES = [{ key: "", label: "Mix" }, { key: "heartbreak", label: "Heartbreak" }, { key: "sensual", label: "Sensual" }];
export const FOOTAGE = [{ key: "romance", label: "Romance films" }, { key: "tv", label: "TV shows" }, { key: "all", label: "Everything" }];
const FOOTAGE_STYLES = ["movie-dialogue", "movie-card"];
export const LANGS = [{ key: "en", label: "English" }, { key: "pt", label: "Português" }, { key: "es", label: "Español" }];
export const SECONDS = [15, 31];
export const REASONS = [
  { key: "timing", label: "Wrong timing" },
  { key: "clip", label: "Weak clip" },
  { key: "dark", label: "Too dark" },
  { key: "text", label: "Text hard to read" },
  { key: "vibe", label: "Off-vibe" },
  { key: "repeat", label: "Repeat" },
  { key: "other", label: "Something else" }, // Luke types why (a note, at most NOTE_MAX characters)
];
export const NOTE_MAX = 200;

/* Luke's own words for a reject: one line, no control characters, at most NOTE_MAX characters. */
export function cleanNote(v) {
  return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, NOTE_MAX);
}
export const UNDO_MS = 10 * 60 * 1000;
export const LOW_STOCK = 30;
export const MAX_EDITS = 50;
export const FOLDERS = { songs: "0 Songs", movies: "0 Clips/Movies", review: "1 Review", approved: "2 Approved", rejected: "9 Rejected" };

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FILE_ID_RE = /^[A-Za-z0-9_-]{10,100}$/;

export class EditsError extends Error {
  constructor(message, status = 400) { super(message); this.name = "EditsError"; this.status = status; }
}
const fail = (m, s) => { throw new EditsError(m, s); };

/* ---------- making edits ---------- */

/* About how long the cloud works: a few minutes to start (song, clips, models), then per edit. With the
   styles given, the edits are taken as shared evenly between them, and a dialogue scene counts as 31 s
   whatever length was picked. Worked in tenths of a minute, so no rounding error tips a ceiling. */
export function estimateMinutes(n, seconds, styles) {
  const list = Array.isArray(styles) && styles.length ? styles : [""];
  const tenths = list.reduce((sum, st) => sum + (st === DIALOGUE || Number(seconds) === 31 ? 11 : 6), 0);
  return Math.ceil((30 * list.length + Math.max(0, Number(n) || 0) * tenths) / (10 * list.length));
}

/* -> { job } or throws EditsError with a plain sentence. `songs` = the slugs that have timings. */
export function validateJob(body, songs) {
  const b = body && typeof body === "object" ? body : {};
  const song = String(b.song || "").trim();
  if (!song) fail("Pick a song.");
  if (!songs.includes(song)) fail("That song has no timings yet, so it can't be made (it needs 0 Songs/" + song.slice(0, 40) + "/timings.json).");
  const raw = Array.isArray(b.styles) ? b.styles : typeof b.styles === "string" ? b.styles.split(",") : [];
  const styles = [...new Set(raw.map((s) => String(s).trim()))];
  if (!styles.length) fail("Pick at least one style.");
  const bad = styles.filter((s) => !STYLE_KEYS.includes(s));
  if (bad.length) fail("Unknown style: " + bad.join(", ").slice(0, 80) + ".");
  const n = Number(b.n);
  if (!Number.isInteger(n) || n < 1 || n > MAX_EDITS) fail("How many: a whole number from 1 to " + MAX_EDITS + ".");
  const lang = b.lang == null || b.lang === "" ? "en" : String(b.lang);
  if (!LANGS.some((l) => l.key === lang)) fail("Language: English, Português or Español.");
  let seconds = b.seconds == null || b.seconds === "" ? 15 : Number(b.seconds);
  if (!SECONDS.includes(seconds)) fail("Length: 15 or 31 seconds.");
  if (styles.length === 1 && styles[0] === DIALOGUE) seconds = SCENE_SECONDS;
  let tone = b.tone == null ? "" : b.tone;
  if (typeof tone !== "string" || !TONES.some((t) => t.key === tone)) fail("Tone: Mix, Heartbreak or Sensual.");
  let footage = b.footage == null || b.footage === "" ? "all" : b.footage;
  if (typeof footage !== "string" || !FOOTAGE.some((f) => f.key === footage)) fail("Footage: Romance films, TV shows or Everything.");
  if (!styles.includes(DIALOGUE)) tone = "";
  if (!styles.some((s) => FOOTAGE_STYLES.includes(s))) footage = "all";
  return { job: { song, styles, n, lang, seconds, tone, footage } };
}

export function newJobId(now = Date.now(), rand = Math.random) {
  return "j" + now.toString(36) + Math.floor(rand() * 36 ** 4).toString(36).padStart(4, "0");
}

export async function createJob(store, input, now, start) {
  const job = {
    id: newJobId(now), ...input, state: "waiting", done: 0, total: input.n, edits: [], error: "",
    minutes: estimateMinutes(input.n, input.seconds, input.styles), createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(),
  };
  await store.setJSON("jobs/" + job.id + ".json", job);
  if (start) {
    const r = await start(job).catch(() => ({ started: false, error: "Couldn't reach Google Cloud" }));
    if (r && r.started) job.state = "queued";
    else if (r && r.error) { job.state = "failed"; job.error = "The cloud worker didn't start: " + r.error; }
    job.updatedAt = new Date(now).toISOString();
    await store.setJSON("jobs/" + job.id + ".json", job);
  }
  return job;
}

export function jobWords(j) {
  if (!j) return "";
  if (j.state === "waiting") return "Waiting for the cloud worker";
  if (j.state === "queued") return "Queued";
  if (j.state === "rendering") return "Rendering " + (j.done || 0) + " of " + (j.total || j.n);
  if (j.state === "done") return "Done: " + (j.done || 0) + (j.done === 1 ? " edit" : " edits");
  if (j.state === "failed") return "Failed: " + (j.error || "no reason given");
  return String(j.state || "");
}

/* What the job card says it asked for: "Dialogue scene · Heartbreak · Romance films". The defaults (Mix,
   Everything) aren't said; a job from before 26 Nov has neither. */
export function jobLine(j) {
  if (!j) return "";
  const bits = [(j.styles || []).map(styleLabel).join(", ")];
  const tone = TONES.find((t) => t.key && t.key === j.tone);
  if (tone) bits.push(tone.label);
  const foot = FOOTAGE.find((f) => f.key !== "all" && f.key === j.footage);
  if (foot) bits.push(foot.label);
  return bits.filter(Boolean).join(" · ");
}

/* The words go on when a job is listed or answered, never stored. */
export const jobView = (j) => ({ ...j, words: jobWords(j), line: jobLine(j) });

/* The newest jobs first (ids carry the time, so the keys sort by it). */
export async function listJobs(store, limit = 20) {
  const keys = ((await store.list({ prefix: "jobs/" })).blobs || []).map((b) => b.key).sort().reverse().slice(0, limit);
  const jobs = await Promise.all(keys.map((k) => store.get(k, { type: "json" }).catch(() => null)));
  return jobs.filter(Boolean).map(jobView);
}

/* ---------- the worker (bearer EDITS_WORKER_TOKEN) ---------- */

/* Constant time on equal-length digests, so neither the token nor its length leaks. */
export function workerOk(header, token) {
  if (!token) return false;
  const given = String(header || "").replace(/^Bearer\s+/i, "");
  if (!given || given.length > 512) return false;
  const h = (s) => createHash("sha256").update(String(s)).digest("hex");
  return sameString(h(given), h(token));
}

/* 26 Nov 2026: + tone, film (the renderer's film slug, e.g. "the-notebook-2004-1") and scene for dialogue
   scenes. A dialogue recipe's land_line (a lyric) and dialogue (the film's lines) are never kept here. */
const RECIPE_KEYS = ["id", "song", "style", "variant", "layout", "grade", "lang", "seconds", "created", "opener_text", "accent_word", "tone", "film", "scene"];
export function cleanRecipe(r) {
  if (!r || typeof r !== "object") return {};
  const out = {};
  for (const k of RECIPE_KEYS) if (r[k] != null && (typeof r[k] === "string" || typeof r[k] === "number")) out[k] = typeof r[k] === "string" ? r[k].slice(0, 120) : r[k];
  if (r.hook && typeof r.hook === "object") out.hook = { id: String(r.hook.id || "").slice(0, 40), text: String(r.hook.text || "").slice(0, 160) };
  if (Array.isArray(r.clips)) out.clips = r.clips.slice(0, 30).map((c) => String(c).slice(0, 80));
  return out;
}

export async function workerUpdate(store, body, now) {
  const b = body && typeof body === "object" ? body : {};
  const at = new Date(now).toISOString();
  const saved = [];
  for (const e of (Array.isArray(b.edits) ? b.edits : []).slice(0, 60)) {
    if (!e || !NAME_RE.test(String(e.name || "")) || !FILE_ID_RE.test(String(e.file || ""))) continue;
    const rec = { name: e.name, file: e.file, preview: FILE_ID_RE.test(String(e.preview || "")) ? e.preview : "", job: String(b.job || "").slice(0, 40), recipe: cleanRecipe(e.recipe), at };
    await store.setJSON("edit/" + e.name + ".json", rec);
    saved.push(e.name);
  }
  if (b.stock && typeof b.stock === "object") await store.setJSON("stock.json", { at, ...cleanStock(b.stock) });
  let job = null;
  if (b.job) {
    if (!/^j[a-z0-9]{6,20}$/.test(String(b.job))) fail("Unknown job.", 404);
    const key = "jobs/" + b.job + ".json";
    if (!(await store.get(key, { type: "json" }))) fail("Unknown job.", 404);
    job = await mutate(store, key, null, (j) => {
      if (!j) return { skip: true, value: null };
      if (["rendering", "done", "failed", "queued"].includes(b.state)) j.state = b.state;
      if (Number.isInteger(b.done) && b.done >= 0) j.done = Math.min(b.done, j.total || MAX_EDITS);
      if (b.error) j.error = String(b.error).slice(0, 200);
      j.edits = [...new Set([...(j.edits || []), ...saved])].slice(-MAX_EDITS);
      j.updatedAt = at;
      return { value: j };
    });
  }
  return { ok: true, saved: saved.length, job: job ? jobView(job) : null };
}

function cleanStock(s) {
  const out = { songs: {}, filmsWaiting: null, moments: null, vibes: null };
  for (const k of ["filmsWaiting", "moments", "vibes"]) if (Number.isFinite(Number(s[k])) && s[k] !== null) out[k] = Math.max(0, Math.round(Number(s[k])));
  for (const [slug, per] of Object.entries(s.songs || {}).slice(0, 40)) {
    if (!SLUG_RE.test(slug) || !per || typeof per !== "object") continue;
    out.songs[slug] = {};
    for (const [style, n] of Object.entries(per).slice(0, 10)) if (/^[a-z-]{2,20}$/.test(style) && Number.isFinite(Number(n))) out.songs[slug][style] = Math.max(0, Math.round(Number(n)));
  }
  return out;
}

/* Starts one run of the Cloud Run job with the job id as its argument (Phase 3). The same service
   account needs "Cloud Run Invoker" on the job. Not set up -> { started: false } (the job waits). */
export function cloudStarter(env, rawKey, fetchImpl = fetch) {
  const project = env("EDITS_GCP_PROJECT"), region = env("EDITS_REGION"), name = env("EDITS_JOB_NAME");
  if (!project || !region || !name) return null;
  return async (job) => {
    const { token } = await accessToken(rawKey, RUN_SCOPE, fetchImpl);
    const url = "https://run.googleapis.com/v2/projects/" + encodeURIComponent(project) + "/locations/" + encodeURIComponent(region) + "/jobs/" + encodeURIComponent(name) + ":run";
    const res = await fetchImpl(url, {
      method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, signal: AbortSignal.timeout(9000),
      body: JSON.stringify({ overrides: { containerOverrides: [{ args: ["work", "render", job.id] }] } }),
    });
    if (res.ok) return { started: true };
    return { started: false, error: res.status === 403 ? "the service account needs Cloud Run Invoker on the job" : res.status === 404 ? "the job " + name + " isn't in " + region : "HTTP " + res.status };
  };
}

/* ---------- songs ---------- */

/* Songs with a 0 Songs/<slug>/timings.json, with the title from songs.json when the slug is a page of ours. */
export async function songsWithTimings(drv, rootId, titles = {}) {
  const songsId = await drv.path(rootId, FOLDERS.songs);
  if (!songsId) return [];
  const folders = (await drv.folders(songsId)).filter((f) => SLUG_RE.test(f.name));
  const hits = new Set();
  for (let i = 0; i < folders.length; i += 40) {
    for (const f of await drv.named(folders.slice(i, i + 40).map((x) => x.id), "timings.json")) for (const p of f.parents || []) hits.add(p);
  }
  return folders.filter((f) => hits.has(f.id)).map((f) => ({ slug: f.name, title: titles[f.name] || f.name })).sort((a, b) => a.title.localeCompare(b.title));
}

/* ---------- review ---------- */

export function styleLabel(key) { return (STYLES.find((s) => s.key === key) || { label: key || "?" }).label; }

/* A film slug in words: "the-notebook-2004-1" -> "The Notebook (2004)", "gossip-girl-s01e01-pilot" ->
   "Gossip Girl S01E01". The year or the episode ends the name; what follows it is dropped. */
const SMALL_WORDS = new Set(["a", "an", "and", "at", "by", "for", "in", "of", "on", "or", "the", "to"]);
export function filmWords(slug) {
  const parts = String(slug || "").toLowerCase().split("-").filter(Boolean);
  if (!parts.length) return "";
  let tail = "";
  const cut = parts.findIndex((p, i) => i > 0 && (/^(19|20)\d\d$/.test(p) || /^s\d{1,2}e\d{1,3}$/.test(p)));
  if (cut > 0) { tail = /^s/.test(parts[cut]) ? " " + parts[cut].toUpperCase() : " (" + parts[cut] + ")"; parts.length = cut; }
  const name = parts.map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
  return (name + tail).slice(0, 60);
}
const toneLabel = (key) => (TONES.find((t) => t.key && t.key === key) || { label: "" }).label;

export function recipeLine(r) {
  if (!r || !r.style) return "Recipe not read yet";
  if (r.style === DIALOGUE) {
    const bits = [r.song, styleLabel(r.style), toneLabel(r.tone), filmWords(r.film)];
    if (r.hook && r.hook.id === "quote") bits.push("caption from the film");
    else if (r.hook && r.hook.id && r.hook.id !== "none") bits.push("hook " + r.hook.id);
    if (r.grade) bits.push(r.grade);
    return bits.filter(Boolean).join(" · ");
  }
  const bits = [r.song, styleLabel(r.style) + (r.variant && r.variant !== "plain" ? " (" + r.variant + ")" : "")];
  if (r.hook && r.hook.id && r.hook.id !== "none") bits.push("hook " + r.hook.id);
  if (r.grade) bits.push(r.grade);
  if (r.clips && r.clips.length) bits.push(r.clips.length + (r.clips.length === 1 ? " clip" : " clips"));
  if (r.opener_text) bits.push("opens on a film line");
  return bits.filter(Boolean).join(" · ");
}

/* Groups a folder listing into edits: <name>.mp4 + <name>.preview.mp4 + <name>.json. */
export function groupReview(files) {
  const by = new Map();
  for (const f of files || []) {
    const m = /^(.*?)(\.preview\.mp4|\.mp4|\.json)$/i.exec(f.name || "");
    if (!m || !NAME_RE.test(m[1])) continue;
    const it = by.get(m[1]) || { id: m[1] };
    const kind = m[2].toLowerCase() === ".mp4" ? "file" : m[2].toLowerCase() === ".json" ? "json" : "preview";
    it[kind] = { id: f.id, size: Number(f.size) || 0 };
    if (kind === "file") it.createdTime = f.createdTime || "";
    by.set(m[1], it);
  }
  return [...by.values()].filter((it) => it.file).sort((a, b) => String(b.createdTime).localeCompare(String(a.createdTime)) || b.id.localeCompare(a.id));
}

export async function reviewList(store, drv, rootId, now, { maxReads = 12 } = {}) {
  const folder = await drv.path(rootId, FOLDERS.review);
  if (!folder) return { items: [], folder: null };
  const items = groupReview(await drv.list(folder));
  let reads = 0;
  for (const it of items) {
    const told = await store.get("edit/" + it.id + ".json", { type: "json" }).catch(() => null);
    let recipe = told && told.recipe && told.recipe.style ? told.recipe : null;
    if (!recipe) {
      const kept = await store.get("recipe/" + it.id + ".json", { type: "json" }).catch(() => null);
      if (kept) recipe = kept;
      else if (it.json && reads < maxReads) {
        reads++;
        try { recipe = cleanRecipe(await drv.readJSON(it.json.id)); await store.setJSON("recipe/" + it.id + ".json", recipe); } catch { recipe = null; }
      }
    }
    it.recipe = recipe || {};
    it.line = recipeLine(recipe);
  }
  const previews = {};
  for (const it of items) if (it.preview) previews[it.preview.id] = it.preview.size;
  await store.setJSON("review.json", { at: now, folder, previews });
  return { items, folder };
}

/* May this file be streamed? Only a preview in the review list (refreshed once when it isn't known). */
export async function previewSize(store, fileId, refresh) {
  if (!FILE_ID_RE.test(String(fileId || ""))) return null;
  const doc = await store.get("review.json", { type: "json" }).catch(() => null);
  if (doc && doc.previews && Object.prototype.hasOwnProperty.call(doc.previews, fileId)) return doc.previews[fileId] || null;
  if (!refresh) return null;
  await refresh();
  const again = await store.get("review.json", { type: "json" }).catch(() => null);
  return again && again.previews && Object.prototype.hasOwnProperty.call(again.previews, fileId) ? again.previews[fileId] || null : null;
}

/* ---------- decisions ---------- */

const month = (now) => new Date(now).toISOString().slice(0, 7);

export async function decide(store, drv, rootId, body, now) {
  const b = body && typeof body === "object" ? body : {};
  const id = String(b.id || "");
  if (!NAME_RE.test(id)) fail("Which edit?");
  const choice = b.choice;
  if (choice !== "approve" && choice !== "reject") fail("Approve or reject?");
  const reason = choice === "reject" ? String(b.reason || "") : "";
  if (choice === "reject" && !REASONS.some((r) => r.key === reason)) fail("Pick why: " + REASONS.map((r) => r.label.toLowerCase()).join(", ") + ".");
  const note = choice === "reject" ? cleanNote(b.note) : "";
  if (reason === "other" && !note) fail("Say why in a few words.");
  const before = await store.get("decision/" + id + ".json", { type: "json" }).catch(() => null);
  if (before) fail("Already " + (before.choice === "approve" ? "approved" : "rejected") + ".", 409);
  const { items, folder } = await reviewList(store, drv, rootId, now, { maxReads: 0 });
  const it = items.find((x) => x.id === id);
  if (!it) fail("That edit isn't in 1 Review any more.", 404);
  let recipe = it.recipe && it.recipe.style ? it.recipe : null;
  if (!recipe && it.json) recipe = cleanRecipe(await drv.readJSON(it.json.id));
  recipe = recipe || {};
  const song = SLUG_RE.test(String(recipe.song || "")) ? recipe.song : "";
  if (choice === "approve" && !song) fail("This edit's recipe doesn't name its song, so it can't go to 2 Approved/<song>.");
  const rec = {
    id, choice, reason, note, song, style: recipe.style || "", variant: recipe.variant || "", hook: (recipe.hook && recipe.hook.id) || "", grade: recipe.grade || "",
    at: now, from: folder, to: "", files: [it.file, it.preview, it.json].filter(Boolean).map((f) => f.id),
  };
  const claim = await store.setJSON("decision/" + id + ".json", rec, { onlyIfNew: true });
  if (claim && claim.modified === false) fail("Already decided.", 409);
  const moved = [];
  try {
    rec.to = await drv.path(rootId, choice === "approve" ? FOLDERS.approved + "/" + song : FOLDERS.rejected, true);
    for (const f of rec.files) { await drv.move(f, rec.to, folder); moved.push(f); }
  } catch (e) {
    for (const f of moved) await drv.move(f, folder, rec.to).catch(() => {});
    await store.delete("decision/" + id + ".json").catch(() => {});
    throw e;
  }
  await store.setJSON("decision/" + id + ".json", rec);
  await mutate(store, "log/" + month(now) + ".json", [], (list) => {
    const l = Array.isArray(list) ? list.filter((x) => x && x.id !== id) : [];
    l.push({ id, choice, reason, note, song, style: rec.style, variant: rec.variant, hook: rec.hook, grade: rec.grade, at: now });
    return { replace: l.slice(-5000) };
  });
  return { ok: true, id, choice, reason, note, undoUntil: now + UNDO_MS };
}

export async function undo(store, drv, body, now) {
  const id = String((body && body.id) || "");
  if (!NAME_RE.test(id)) fail("Which edit?");
  const rec = await store.get("decision/" + id + ".json", { type: "json" }).catch(() => null);
  if (!rec) fail("Nothing to undo.", 404);
  if (now - rec.at > UNDO_MS) fail("Too late to undo: that was more than 10 minutes ago.", 409);
  for (const f of rec.files || []) await drv.move(f, rec.from, rec.to);
  await store.delete("decision/" + id + ".json");
  await mutate(store, "log/" + month(rec.at) + ".json", [], (list) => ({ replace: (Array.isArray(list) ? list : []).filter((x) => x && x.id !== id) }));
  return { ok: true, id };
}

/* ---------- stock and scores ---------- */

export function stockView(report, songs, filmsWaiting) {
  const r = report || null;
  const rows = songs.map((s) => {
    const per = (r && r.songs && r.songs[s.slug]) || null;
    const low = per ? Object.entries(per).filter(([, n]) => n < LOW_STOCK).map(([style, n]) => ({ style, n })) : [];
    return { slug: s.slug, title: s.title, per, low, warn: low.length ? s.title + " has " + low.map((x) => x.n + " unused for " + x.style).join(", ") + ": add footage" : "" };
  });
  return { at: r ? r.at : null, songs: rows, filmsWaiting, moments: r ? r.moments : null, vibes: r ? r.vibes : null, reported: !!r };
}

function rate(map) {
  return [...map.entries()].map(([key, v]) => ({ key, approved: v.a, rejected: v.r, rate: v.a + v.r ? Math.round((100 * v.a) / (v.a + v.r)) : null }))
    .sort((x, y) => y.approved + y.rejected - (x.approved + x.rejected) || x.key.localeCompare(y.key));
}

/* decisions = the log rows; events = parsed visit keys (netlify/lib/stats.mjs) with the bot filter applied by the caller. */
export function scoresView(decisions, events) {
  const by = { style: new Map(), hook: new Map(), grade: new Map(), reason: new Map() };
  const bump = (m, k, ok) => { if (!k) return; const v = m.get(k) || { a: 0, r: 0 }; ok ? v.a++ : v.r++; m.set(k, v); };
  for (const d of decisions || []) {
    const ok = d.choice === "approve";
    bump(by.style, d.style + (d.variant && d.variant !== "plain" ? " · " + d.variant : ""), ok);
    bump(by.hook, d.hook, ok);
    bump(by.grade, d.grade, ok);
    if (!ok) { const v = by.reason.get(d.reason) || { a: 0, r: 0 }; v.r++; by.reason.set(d.reason, v); }
  }
  const pages = new Map();
  for (const e of events || []) {
    if (e.src !== "edits") continue;
    const page = e.content && e.content !== "-" ? e.content : "(no page)";
    const v = pages.get(page) || { page, visits: 0, taps: 0, songs: new Set() };
    if (e.type === "view") v.visits++;
    if (e.type === "click" && e.target === "spotify") v.taps++;
    v.songs.add(e.page);
    pages.set(page, v);
  }
  const total = (decisions || []).length, approved = (decisions || []).filter((d) => d.choice === "approve").length;
  return {
    total, approved, rate: total ? Math.round((100 * approved) / total) : null,
    styles: rate(by.style), hooks: rate(by.hook), grades: rate(by.grade),
    notes: (decisions || []).filter((d) => d.choice === "reject" && d.note).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 20)
      .map((d) => ({ note: d.note, hook: d.hook || "", grade: d.grade || "", at: d.at || null })),
    reasons: [...by.reason.entries()].map(([key, v]) => ({ key, label: (REASONS.find((r) => r.key === key) || { label: key }).label, n: v.r })).sort((a, b) => b.n - a.n),
    pages: [...pages.values()].map((v) => ({ page: v.page, visits: v.visits, taps: v.taps, songs: [...v.songs] })).sort((a, b) => b.taps - a.taps || b.visits - a.visits),
  };
}

export async function decisionLog(store, now, months = 3) {
  const out = [];
  const d = new Date(now);
  for (let i = 0; i < months; i++) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).toISOString().slice(0, 7);
    const l = await store.get("log/" + m + ".json", { type: "json" }).catch(() => null);
    if (Array.isArray(l)) out.push(...l);
  }
  return out;
}

export { DriveError };
