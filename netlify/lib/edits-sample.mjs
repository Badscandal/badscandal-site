/* MADE-UP edits for /hq?sample=1 (25 Nov 2026): Social Farm › Edits without Drive. Nothing here is real,
   nothing is read from Google and nothing is saved. There is no video in the sample (footage never goes
   in this repo): the review cards show a blank frame with the recipe. */
import { REASONS, estimateMinutes, jobWords, recipeLine, scoresView, stockView } from "./edits.mjs";

const SONGS = [{ slug: "medaseubody", title: "Me Dá Seu Body" }, { slug: "touchme", title: "Touch Me" }];

const RECIPES = [
  { style: "movie-card", variant: "serif", grade: "warm-film", hook: { id: "let-go", text: "Having to let go of the person you love..." }, clips: ["m043", "m072", "m012", "m118"], opener_text: "Thank you." },
  { style: "vibe-bigword", variant: "glow", grade: "cold-film", hook: { id: "pov-her", text: "pov: she's the one" }, clips: ["s011", "s019", "s004"] },
  { style: "vibe-wall", variant: "plain", grade: "night-blue", hook: { id: "our-song", text: "our song" }, clips: ["s022", "s002"] },
  { style: "vibe-bigword", variant: "neon", grade: "lilac", hook: { id: "in-love-again", text: "falling in love again" }, clips: ["s031", "s017", "s008"] },
  { style: "movie-card", variant: "caps", grade: "golden", hook: { id: "before-after", text: "Me before / Me after" }, clips: ["m101", "m055", "m009"] },
  { style: "vibe-mixed", variant: "plain", grade: "red", hook: { id: "send-this", text: "send this to them" }, clips: ["s040", "s013"] },
];

export function sampleReview(now = Date.now()) {
  return RECIPES.map((r, i) => {
    const recipe = { ...r, id: "s" + (900 + i), song: i % 3 === 2 ? "medaseubody" : "touchme", lang: "en", seconds: 15 };
    const id = recipe.song + "__" + recipe.style + "__" + recipe.id;
    return { id, createdTime: new Date(now - i * 7 * 60000).toISOString(), file: { id: "sample-file-" + i, size: 9000000 }, preview: null, recipe, line: recipeLine(recipe) };
  });
}

export function sampleJobs(now = Date.now()) {
  const j = (id, mins, o) => ({ id, song: "touchme", styles: ["vibe-bigword", "movie-card"], lang: "en", seconds: 15, edits: [], error: "", createdAt: new Date(now - mins * 60000).toISOString(), ...o });
  return [
    j("jsample3", 2, { n: 12, total: 12, done: 0, state: "waiting" }),
    j("jsample2", 25, { n: 20, total: 20, done: 7, state: "rendering", song: "medaseubody" }),
    j("jsample1", 300, { n: 10, total: 10, done: 10, state: "done", styles: ["vibe-wall"] }),
    j("jsample0", 1500, { n: 6, total: 6, done: 2, state: "failed", error: "No film moments yet: drop a film in 0 Clips/Movies" }),
  ].map((x) => ({ ...x, minutes: estimateMinutes(x.n, x.seconds), words: jobWords(x) }));
}

export function sampleOverview(now = Date.now()) {
  return { sample: true, drive: { ok: true }, cloud: false, songs: SONGS, jobs: sampleJobs(now), reviewCount: RECIPES.length };
}

export function sampleStock(now = Date.now()) {
  return stockView({ at: now - 5 * 3600000, songs: { touchme: { vibe: 112, "movie-card": 64 }, medaseubody: { vibe: 41, "movie-card": 18 } }, moments: 450, vibes: 160 }, SONGS, 2);
}

export function sampleScores() {
  const d = [];
  const add = (n, choice, o) => { for (let i = 0; i < n; i++) d.push({ choice, song: "touchme", ...o, reason: choice === "reject" ? o.reason || REASONS[i % REASONS.length].key : "" }); };
  add(14, "approve", { style: "movie-card", variant: "serif", hook: "let-go", grade: "warm-film" });
  add(3, "reject", { style: "movie-card", variant: "serif", hook: "let-go", grade: "warm-film", reason: "clip" });
  add(9, "approve", { style: "vibe-bigword", variant: "glow", hook: "pov-her", grade: "cold-film" });
  add(6, "reject", { style: "vibe-bigword", variant: "glow", hook: "pov-her", grade: "cold-film" });
  add(5, "approve", { style: "vibe-wall", variant: "plain", hook: "our-song", grade: "night-blue" });
  add(1, "reject", { style: "vibe-wall", variant: "plain", hook: "our-song", grade: "night-blue", reason: "timing" });
  const ev = [];
  const page = (content, views, taps) => { for (let i = 0; i < views; i++) ev.push({ src: "edits", type: "view", content, page: "touchme" }); for (let i = 0; i < taps; i++) ev.push({ src: "edits", type: "click", target: "spotify", content, page: "touchme" }); };
  page("lovecore.edits", 140, 31);
  page("filmlines", 96, 12);
  return scoresView(d, ev);
}
