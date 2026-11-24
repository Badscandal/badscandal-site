/* HQ workspaces (18 Nov 2026): Social Farm and Label, kept off the BADSCANDAL numbers.
   Farm pages and posts, and Label covers, spend and streams, live under ws/ only.
   (24 Nov 2026, Luke: money is no longer on HQ. Label payouts and the ROI went; old ws/label/payouts.json
   rows stay in the store, unread.)
   Nothing here writes grow/, spend/, inc/ or releases.json, and nothing here pays anyone.
   Official releases never gain a licence step. Label covers do: pack, then licence, then upload, then pitch. */
import * as C from "./action-cards.mjs";
import * as S from "./staff.mjs";

export const FARM_NOTE = "Farm accounts are kept separate from the official BADSCANDAL accounts and ad accounts.";
export const WORKSPACES = ["badscandal", "farm", "label"];
export const FARM_PLATFORMS = ["TikTok", "Instagram", "YouTube"];
export const FARM_STATUS = ["active", "paused", "restricted", "banned"];
export const LICENCE_STATUS = ["todo", "ordered_waiting_luke", "paid", "licensed", "flagged"];
export const LICENCE_FIELDS = ["esl_order_number", "licence_pdf_url", "drive_folder_url", "original_title", "original_writers", "original_publisher", "status", "flag_reason"];
/* pack, then licence, then Drop's upload, then Atlas's pitch. Official RELEASE_STEPS is not this list. */
export const LABEL_STEPS = [
  { key: "pack", label: "Release pack ready", owner: "Nova", owner_bot: "Nova", days: 35 },
  { key: "licence", label: "Mechanical licence (Easy Song Licensing)", owner: "Licence", owner_bot: "Licence", days: 28 },
  { key: "upload", label: "Upload to RouteNote with the assets and the licence", owner: "Drop", owner_bot: "Drop", days: 21 },
  { key: "pitch", label: "Spotify pitch, once Spotify for Artists access exists for the alias", owner: "Atlas", owner_bot: "Atlas", days: 14 },
];
export const SEED_GENRE = { id: "ukgarage", name: "UK garage", status: "active" };
export const SEED_ALIAS = { id: "ukgmain", genreId: "ukgarage", name: "", main: true, photo: "", bio: "", links: { spotify: "", apple: "", youtube: "", deezer: "", other: "" }, s4a: false };

const KEY = {
  accounts: "ws/farm/accounts.json", posts: "ws/farm/posts.json",
  genres: "ws/label/genres.json", aliases: "ws/label/aliases.json",
  releases: "ws/label/releases.json", spend: "ws/label/spend.json", stats: "ws/label/stats.json",
  research: "ws/label/research.json", trends: "ws/label/trends.json",
};
const FARM_WHO = ["Steve", "Kevin", "Laura", "Nova", "Claude", "Luke"];
const SPEND_WHO = ["Forge", "Nova", "Claude", "Luke"];
const STREAM_WHO = ["Atlas", "Nova", "Claude", "Luke"];
const UPLOAD_WHO = ["Drop", "Nova", "Claude", "Luke"];
const PACK_WHO = ["Nova", "Claude", "Luke"];
const YES_WHO = ["Luke", "Claude", "Nova"];
const PITCH_WHO = ["Atlas", "Nova", "Claude", "Luke"];
const GENRE_WHO = ["Luke", "Claude", "Nova"];
const PAY_ARGS = ["amount", "price", "pay", "card", "iban", "cvv", "payment"];
const fail = (m, code) => { throw new S.StaffError(m, code); };
const clone = (o) => JSON.parse(JSON.stringify(o));
const low = (s) => String(s == null ? "" : s).trim().toLowerCase();
const blank = (v) => v == null || String(v).trim() === "";
const addDays = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const slug = (s) => S.songKey(s).slice(0, 40);

function text(v, max, label) {
  const s = S.clean(v, max);
  const bad = s && S.secretIn(s);
  if (bad) fail(`${label} looks like ${bad}. Nothing was saved.`);
  return s;
}
function linkOf(v, label) {
  const raw = S.clean(v, 400);
  if (!raw) return "";
  const out = S.httpsLink(raw);
  if (!out) fail(`${label} must be a link that starts with https://. Nothing was saved.`);
  return out;
}
function dayOf(v, label) {
  const s = S.clean(v, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) fail(`${label} has to be a day, YYYY-MM-DD.`);
  return s;
}
function numOf(v, label) {
  if (blank(v)) return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < 0) fail(`${label} has to be a number, 0 or more. Leave it out if you could not read it.`);
  return n;
}
function allow(by, names, what) {
  if (!names.includes(by)) fail(`Only ${names.join(", ")} can ${what}.`, "not_allowed");
}
function noPayment(a) {
  for (const k of PAY_ARGS) if (a && a[k] != null && String(a[k]).trim() !== "") fail("HQ does not take or send payment. Record the status after it is paid outside HQ. Nothing was saved.");
}
async function readList(store, key) {
  const { data } = await S.readDoc(store, key, []);
  return Array.isArray(data) ? data : [];
}
function byCurrency(rows) {
  const m = new Map();
  for (const r of rows) if (r && r.amount != null && r.currency) m.set(r.currency, Math.round(((m.get(r.currency) || 0) + Number(r.amount)) * 100) / 100);
  return [...m.entries()].map(([currency, amount]) => ({ currency, amount }));
}
function playlistPlaceholder(genreId) {
  return { genreId, name: "", url: "", owner_bot: "", status: "not set up" };
}
function emptyLicence() {
  return { esl_order_number: "", licence_pdf_url: "", drive_folder_url: "", original_title: "", original_writers: "", original_publisher: "", status: "todo", flag_reason: "", proof_link: "", luke_yes: null };
}
function licenceShown(lic) {
  const licensed = lic && lic.status === "licensed";
  return { shown: licensed ? "licensed" : "waiting on licence", proof_link: licensed ? (lic.proof_link || lic.licence_pdf_url || "") : "" };
}

/* ---------- farm (tracking only: no logins, no posting, no fake engagement) ---------- */
export async function addAccount(store, now, a) {
  allow(a.by, FARM_WHO, "record a farm account");
  const platform = FARM_PLATFORMS.find((p) => low(p) === low(a.platform));
  if (!platform) fail(`Platform must be one of: ${FARM_PLATFORMS.join(", ")}.`);
  const handle = text(a.handle, 40, "Handle").replace(/^@/, "");
  if (!/^[A-Za-z0-9._]{2,40}$/.test(handle)) fail("Handle is the page's name, letters and digits only. Nothing was saved.");
  const status = FARM_STATUS.find((s) => low(s) === low(a.status || "active"));
  if (!status) fail(`Status must be one of: ${FARM_STATUS.join(", ")}.`);
  const songs = (Array.isArray(a.songs) ? a.songs : String(a.songs || "").split(",")).map((s) => text(s, 80, "Song")).filter(Boolean).slice(0, 8);
  const row = { id: S.newId("fa", now), platform, handle, niche: text(a.niche, 80, "Niche"), songs, owner: text(a.owner, 40, "Owner"), status, created: a.created ? dayOf(a.created, "Created") : S.spDay(now), by: a.by, at: new Date(now).toISOString() };
  await S.mutate(store, KEY.accounts, [], (list) => {
    if (list.some((x) => x.platform === platform && low(x.handle) === low(handle))) fail(`@${handle} on ${platform} is already on the farm. Nothing was added.`);
    list.unshift(row); list.splice(80);
    return { value: row };
  });
  return row;
}
export async function addPost(store, now, a) {
  allow(a.by, FARM_WHO, "record a farm post");
  const accounts = await readList(store, KEY.accounts);
  const account = accounts.find((x) => x.id === a.account || (low(x.handle) === low(String(a.handle || a.account || "").replace(/^@/, "")) && (!a.platform || low(x.platform) === low(a.platform))));
  if (!account) fail("That farm account is not on the list. Record the account first.");
  const row = {
    id: S.newId("fp", now), accountId: account.id, handle: account.handle, platform: account.platform,
    date: dayOf(a.date, "Date"), song: text(a.song, 80, "Song"), contentType: text(a.contentType || a.content_type, 80, "Content type"),
    views: numOf(a.views, "Views"), likes: numOf(a.likes, "Likes"), shares: numOf(a.shares, "Shares"), saves: numOf(a.saves, "Saves"), follows: numOf(a.follows, "Follows"),
    link: linkOf(a.link, "Link"), by: a.by, at: new Date(now).toISOString(),
  };
  if (!row.song) fail("Which of our songs or sounds did the post use? Nothing was saved.");
  await S.mutate(store, KEY.posts, [], (list) => { list.unshift(row); list.splice(400); return { value: row }; });
  return row;
}
function rollups(accounts, posts) {
  const views = new Map(), types = new Map(), acc = new Map(), use = new Map();
  for (const p of posts) {
    const v = p.views || 0;
    if (p.song) { views.set(p.song, (views.get(p.song) || 0) + v); use.set(p.song, (use.get(p.song) || 0) + 1); }
    if (p.contentType) types.set(p.contentType, (types.get(p.contentType) || 0) + v);
    acc.set(p.accountId, (acc.get(p.accountId) || 0) + v);
  }
  const sort = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  return {
    viewsPerSong: sort(views).map(([song, n]) => ({ song, views: n })),
    bestTypes: sort(types).map(([type, n]) => ({ type, views: n })),
    bestAccounts: sort(acc).map(([id, n]) => { const a = accounts.find((x) => x.id === id); return { handle: a ? a.handle : id, platform: a ? a.platform : "", views: n }; }),
    soundUse: sort(use).map(([song, posts]) => ({ song, posts })),
  };
}

/* ---------- label: genres Luke can add, one playlist placeholder each ---------- */
function genresShown(raw) {
  const open = raw.filter((g) => g && g.status !== "archived");
  return raw.length ? open : [clone(SEED_GENRE)];
}
function aliasesShown(genres, raw) {
  if (!raw.length && genres.some((g) => g.id === SEED_GENRE.id)) return [clone(SEED_ALIAS)];
  return raw.filter((a) => genres.some((g) => g.id === a.genreId));
}
export async function addGenre(store, now, a) {
  allow(a.by, GENRE_WHO, "add a genre");
  const name = text(a.name, 60, "Genre");
  if (name.length < 2) fail("Give the genre a name. Nothing was saved.");
  const id = slug(name);
  if (!id) fail("The genre name needs a letter or a digit. Nothing was saved.");
  const row = { id, name, status: "active", by: a.by, at: new Date(now).toISOString() };
  await S.mutate(store, KEY.genres, [], (list) => {
    if (!list.some((g) => g.id === SEED_GENRE.id)) list.unshift(clone(SEED_GENRE));
    if (list.some((g) => g.id === id && g.status !== "archived")) fail(`${name} is already on the list. Nothing was added.`);
    if (list.filter((g) => g.status !== "archived").length >= 40) fail("Forty genres is the limit. Archive one first.");
    list.push(row);
    return { value: row };
  });
  return row;
}
export async function addAlias(store, now, a) {
  allow(a.by, GENRE_WHO, "add an alias");
  const genres = genresShown(await readList(store, KEY.genres));
  const genre = genres.find((g) => g.id === slug(a.genre) || low(g.name) === low(a.genre)) || genres.find((g) => g.id === SEED_GENRE.id);
  if (!genre) fail("Which genre is this alias for? Nothing was saved.");
  const name = text(a.name, 80, "Alias");
  if (name.length < 2) fail("Give the alias a name. Nothing was saved.");
  const id = slug(name);
  if (!id) fail("The alias name needs a letter or a digit. Nothing was saved.");
  const row = { id, genreId: genre.id, name, main: false, photo: linkOf(a.photo, "Photo"), bio: text(a.bio, 400, "Bio"), links: linkSet(a.links), s4a: false, by: a.by, at: new Date(now).toISOString() };
  await S.mutate(store, KEY.aliases, [], (list) => {
    if (!list.some((x) => x.genreId === SEED_GENRE.id)) list.push(clone(SEED_ALIAS));
    if (list.some((x) => x.genreId === genre.id && x.id === id)) fail(`${name} is already an alias in ${genre.name}. Nothing was added.`);
    list.push(row);
    return { value: row };
  });
  if (!(await readList(store, KEY.genres)).length) await S.mutate(store, KEY.genres, [], (list) => { if (!list.length) list.push(clone(SEED_GENRE)); return { value: true }; });
  return row;
}
export async function renameAlias(store, now, a) {
  allow(a.by, GENRE_WHO, "rename an alias");
  const name = text(a.name, 80, "Alias");
  if (name.length < 2) fail("Give the alias a name. Nothing was saved.");
  return S.mutate(store, KEY.aliases, [], (list) => {
    if (!list.length) list.push(clone(SEED_ALIAS));
    const row = list.find((x) => x.id === a.id || low(x.name) === low(a.alias) || (x.main && low(a.alias || "") === "main"));
    if (!row) fail("That alias is not on the list. Nothing was saved.");
    row.name = name;
    return { value: row };
  });
}
function linkSet(links) {
  const src = links && typeof links === "object" ? links : {};
  const out = {};
  for (const k of ["spotify", "apple", "youtube", "deezer", "other"]) out[k] = src[k] ? linkOf(src[k], k) : "";
  return out;
}

/* ---------- label releases: covers only, licence before upload ---------- */
function stepsFor(date, today) {
  return LABEL_STEPS.map((s) => {
    const want = addDays(date, -s.days);
    return { key: s.key, label: s.label, owner: s.owner, owner_bot: s.owner_bot, due: want < today ? today : want, status: "todo", note: "", link: "", at: null, by: null };
  });
}
export async function createRelease(store, now, a) {
  allow(a.by, GENRE_WHO, "start a Label cover");
  if (a.kind != null && low(a.kind) !== "cover") fail("Label releases are covers only. Nothing was saved.");
  if (a.original === true) fail("Label releases are covers only. Nothing was saved.");
  const title = text(a.title, 120, "Title");
  if (title.length < 2) fail("Give the cover a title. Nothing was saved.");
  const date = dayOf(a.date, "Release day");
  const today = S.spDay(now);
  const genres = genresShown(await readList(store, KEY.genres));
  const genre = genres.find((g) => g.id === slug(a.genre) || low(g.name) === low(a.genre)) || genres[0];
  if (!genre) fail("Add a genre first. Nothing was saved.");
  const aliases = aliasesShown([genre], await readList(store, KEY.aliases));
  const alias = aliases.find((x) => x.genreId === genre.id && (x.id === a.alias || low(x.name) === low(a.alias))) || aliases.find((x) => x.genreId === genre.id && x.main) || aliases.find((x) => x.genreId === genre.id);
  if (!alias) fail(`${genre.name} has no alias yet. Add one, then start the cover.`);
  const id = `${genre.id}-${slug(title) || S.newId("r", now)}`.slice(0, 60);
  const row = {
    id, title, date, genreId: genre.id, aliasId: alias.id, kind: "cover", workspace: "label", status: "scheduled",
    assets: { audio: "", artwork: "", canvas: "" }, licence: emptyLicence(), steps: stepsFor(date, today),
    by: a.by, at: new Date(now).toISOString(),
  };
  await S.mutate(store, KEY.releases, [], (list) => {
    if (list.some((r) => r.id === id && r.status !== "cancelled")) fail(`A cover called ${title} is already in ${genre.name}. Nothing was added.`);
    list.unshift(row); list.splice(60);
    return { value: row };
  });
  return row;
}
function licenceDone(lic) { return !!lic && lic.status === "licensed"; }
function applyLicence(lic, a) {
  noPayment(a);
  const next = { ...lic };
  if (!blank(a.esl_order_number)) next.esl_order_number = text(a.esl_order_number, 80, "ESL order number");
  if (!blank(a.licence_pdf_url)) next.licence_pdf_url = linkOf(a.licence_pdf_url, "Licence PDF");
  if (!blank(a.drive_folder_url)) next.drive_folder_url = linkOf(a.drive_folder_url, "Drive folder");
  if (!blank(a.original_title)) next.original_title = text(a.original_title, 160, "Original title");
  if (a.original_writers != null) next.original_writers = text(a.original_writers, 240, "Original writers");
  if (a.original_publisher != null) next.original_publisher = text(a.original_publisher, 160, "Original publisher");
  if (!blank(a.flag_reason)) next.flag_reason = text(a.flag_reason, 240, "Flag reason");
  if (!blank(a.status)) {
    const status = LICENCE_STATUS.find((s) => s === low(a.status));
    if (!status) fail(`Licence status must be one of: ${LICENCE_STATUS.join(", ")}.`);
    if (status === "flagged" && next.flag_reason.length < 3) fail("A flagged licence needs a flag_reason: say what is wrong. Nothing was saved.");
    if (status === "licensed") {
      const missing = [];
      if (!next.esl_order_number) missing.push("esl_order_number");
      if (!next.licence_pdf_url) missing.push("licence_pdf_url");
      if (!next.drive_folder_url) missing.push("drive_folder_url");
      if (!next.original_title) missing.push("original_title");
      if (!next.proof_link && next.licence_pdf_url) next.proof_link = next.licence_pdf_url;
      if (!next.proof_link) missing.push("a proof link");
      if (missing.length) fail(`The licence is not licensed yet. Still missing: ${missing.join(", ")}. Nothing was saved.`);
      if (!next.luke_yes || !next.luke_yes.words) fail("Luke has not said yes to this cover. Nothing was saved. HQ does not take payment.");
    }
    next.status = status;
  }
  return next;
}
async function findLabel(store, song) {
  const official = await S.listReleases(store);
  const hit = official.find((r) => r && (r.id === song || S.sameSong(r.title, song)));
  const labelRows = await readList(store, KEY.releases);
  const known = labelRows.find((r) => r.status !== "cancelled" && (r.id === song || S.sameSong(r.title, song)));
  if (!known && hit) fail("Badscandal releases have no licence step. Label covers use workspace \"label\".");
  if (!known) fail(`No Label cover called "${S.clean(song, 80)}". Start it on the Label workspace first.`);
  return known;
}
export async function markLabelStep(store, now, a) {
  noPayment(a);
  const step = low(a.step);
  if (step === "licence" && a.by !== "Licence" && a.by !== "Nova") fail("Only the Licence bot or Nova can mark the licence step. HQ does not take payment.", "not_allowed");
  if (step === "pack") allow(a.by, PACK_WHO, "mark the release pack");
  if (step === "upload") allow(a.by, UPLOAD_WHO, "mark the upload");
  if (step === "pitch") allow(a.by, PITCH_WHO, "mark the pitch");
  if (!LABEL_STEPS.some((s) => s.key === step)) fail(`"${S.clean(a.step, 40)}" is not a Label step. The steps are: ${LABEL_STEPS.map((s) => s.key).join(", ")}.`);
  const today = S.spDay(now);
  const known = await findLabel(store, a.song);
  if (a.s4a === true) {
    allow(a.by, PITCH_WHO, "record Spotify for Artists access");
    await S.mutate(store, KEY.aliases, [], (list) => {
      if (!list.length) list.push(clone(SEED_ALIAS));
      const al = list.find((x) => x.id === known.aliasId);
      if (al) al.s4a = true;
      return { value: true };
    });
  }
  if (step === "pitch" && low(a.status) === "done") {
    const aliases = await readList(store, KEY.aliases);
    const al = aliases.find((x) => x.id === known.aliasId);
    if (!al || !al.s4a) fail("no S4A access yet. Nothing was saved.");
  }
  const saved = await S.mutate(store, KEY.releases, [], (list) => {
    const r = list.find((x) => x.id === known.id);
    if (!r || r.status === "cancelled") fail("That cover was cancelled. Nothing was saved.");
    const st = (r.steps || []).find((s) => s.key === step);
    if (!st) fail("That step is not on this cover. Nothing was saved.");
    if (step === "licence") {
      r.licence = applyLicence(r.licence || emptyLicence(), a);
      if (r.licence.status === "licensed") {
        const pack = (r.steps || []).find((s) => s.key === "pack");
        if (pack && pack.status !== "done") fail("The release pack is not ready yet. Nothing was saved.");
      }
      st.status = r.licence.status;
      st.by = a.by; st.at = new Date(now).toISOString();
      const proof = r.licence.proof_link || r.licence.licence_pdf_url;
      if (proof) st.link = proof;
    } else {
      const status = low(a.status);
      if (!["todo", "working", "done", "blocked"].includes(status)) fail("status must be one of: todo, working, done, blocked.");
      if (step === "upload" && !licenceDone(r.licence) && (status === "done" || status === "working")) fail("Drop's upload is blocked until the licence is licensed. HQ does not take payment. Nothing was saved.");
      if (!blank(a.audio)) r.assets.audio = linkOf(a.audio, "Audio");
      if (!blank(a.artwork)) r.assets.artwork = linkOf(a.artwork, "Artwork");
      if (!blank(a.canvas)) r.assets.canvas = linkOf(a.canvas, "Canvas");
      st.status = status; st.note = text(a.note, 240, "Note"); st.by = a.by; st.at = new Date(now).toISOString();
      if (!blank(a.link)) st.link = linkOf(a.link, "Link");
    }
    return { value: r };
  });
  return releaseCard(await findRelease(store, saved.id), await readList(store, KEY.aliases), today);
}
/* Luke's per-song yes. The Licence bot cannot record it. Nova may, with Luke's exact words. */
export async function recordLicenceYes(store, now, a) {
  noPayment(a);
  if (!YES_WHO.includes(a.by)) fail("Only Luke says yes to a licence. Nova can record his exact words. The Licence bot cannot. Nothing was saved.", "not_allowed");
  const words = text(a.words || a.luke_said, 400, "Luke's words");
  if (words.length < 2) fail("Luke's exact words are required. Nothing was saved.");
  const known = await findLabel(store, a.song);
  const today = S.spDay(now);
  await S.mutate(store, KEY.releases, [], (list) => {
    const r = list.find((x) => x.id === known.id);
    if (!r || r.status === "cancelled") fail("That cover was cancelled. Nothing was saved.");
    r.licence = { ...emptyLicence(), ...(r.licence || {}), luke_yes: { by: a.by, at: new Date(now).toISOString(), words } };
    return { value: r };
  });
  return releaseCard(await findRelease(store, known.id), await readList(store, KEY.aliases), today);
}
/* Read: covers whose pack is ready and whose licence is not done. Mark: proof link, after Luke's yes. */
export async function licenceQueue(store, now) {
  const today = S.spDay(now);
  const [rows, aliases] = await Promise.all([readList(store, KEY.releases), readList(store, KEY.aliases)]);
  const queue = [];
  const licensed = [];
  for (const r of rows) {
    if (!r || r.status === "cancelled") continue;
    const card = presentRelease(r, aliases, today);
    const lic = card.licence || emptyLicence();
    if (lic.status === "licensed") {
      licensed.push({ song: card.title, id: card.id, status: "licensed", proof_link: lic.proof_link || lic.licence_pdf_url || "" });
      continue;
    }
    const pack = (card.steps || []).find((s) => s.key === "pack");
    if (!pack || pack.status !== "done") continue;
    queue.push({ song: card.title, id: card.id, status: "waiting on licence", luke_yes: !!(lic.luke_yes && lic.luke_yes.words), proof_link: "" });
  }
  return { queue, licensed, note: "Covers whose release pack is ready and whose licence is not done. You report to Nova only. Do not pay. Do not mark one licensed until Luke has said yes for that song. Then call this again with song and proof_link." };
}
export async function markLicenceDone(store, now, a) {
  noPayment(a);
  if (a.by !== "Licence" && a.by !== "Nova") fail("Only the Licence bot or Nova can mark the licence step. HQ does not take payment.", "not_allowed");
  const proof = linkOf(a.proof_link || a.link, "Proof link");
  if (!proof) fail("A proof link that starts with https:// is required. Nothing was saved.");
  const known = await findLabel(store, a.song);
  const today = S.spDay(now);
  await S.mutate(store, KEY.releases, [], (list) => {
    const r = list.find((x) => x.id === known.id);
    if (!r || r.status === "cancelled") fail("That cover was cancelled. Nothing was saved.");
    const pack = (r.steps || []).find((s) => s.key === "pack");
    if (pack && pack.status !== "done") fail("The release pack is not ready yet. Nothing was saved.");
    const lic = { ...emptyLicence(), ...(r.licence || {}) };
    if (!lic.luke_yes || !lic.luke_yes.words) fail("Luke has not said yes to this cover. Nothing was saved. HQ does not take payment.");
    lic.status = "licensed";
    lic.proof_link = proof;
    if (!lic.licence_pdf_url) lic.licence_pdf_url = proof;
    r.licence = lic;
    const st = (r.steps || []).find((s) => s.key === "licence");
    if (st) { st.status = "licensed"; st.link = proof; st.by = a.by; st.at = new Date(now).toISOString(); }
    return { value: r };
  });
  const card = releaseCard(await findRelease(store, known.id), await readList(store, KEY.aliases), today);
  return { saved: true, workspace: "label", song: card.title, step: "licence", status: "licensed", shown: "licensed", proof_link: proof, upload: card.uploadBlocked ? "blocked" : "open", payment: "HQ did not take or send any payment.", owner_bot: "Licence" };
}
async function findRelease(store, id) {
  return (await readList(store, KEY.releases)).find((r) => r.id === id);
}
export function presentRelease(r, aliases, today) {
  const alias = (aliases || []).find((x) => x.id === r.aliasId) || null;
  const lic = { ...emptyLicence(), ...(r.licence || {}) };
  const done = licenceDone(lic);
  const steps = (r.steps || []).map((s) => {
    if (s.key === "licence") {
      const face = licenceShown(lic);
      return { ...s, ...lic, owner_bot: "Licence", status: lic.status, shown: face.shown, proof_link: face.proof_link, note: lic.status === "flagged" ? lic.flag_reason : (s.note || "") };
    }
    if (s.key === "upload" && !done) return { ...s, status: "blocked", blocked: true, note: "Blocked until the licence is licensed. The Licence bot marks it. HQ does not take payment." };
    if (s.key === "pitch" && !(alias && alias.s4a) && s.status !== "done") return { ...s, waiting: true, late: false, note: "no S4A access yet" };
    return { ...s };
  });
  return {
    id: r.id, title: r.title, date: r.date, genreId: r.genreId, aliasId: r.aliasId, alias: alias ? alias.name : "",
    kind: "cover", workspace: "label",
    steps, licence: lic, assets: r.assets || { audio: "", artwork: "", canvas: "" },
    uploadBlocked: !done,
  };
}
function releaseCard(r, aliases, today) { return presentRelease(r, aliases, today); }

/* ---------- numbers that never enter the BADSCANDAL cap ---------- */
export async function recordSpend(store, now, a) {
  allow(a.by, SPEND_WHO, "record Label ad spend");
  const genre = await genreOf(store, a.genre);
  const amount = a.not_read ? null : S.amountOf(a.amount);
  if (!a.not_read && (amount == null || amount < 0)) fail("The amount could not be read. Nothing was saved, and it is not in the USD 1,000 cap.");
  const currency = String(a.currency || "").trim().toUpperCase();
  if (!a.not_read && !/^[A-Z]{3}$/.test(currency)) fail("Currency is the three-letter code the account shows, for example USD.");
  const row = { id: S.newId("ls", now), genreId: genre.id, aliasId: a.alias ? slug(a.alias) : "", platform: text(a.platform, 40, "Platform"), date: dayOf(a.date || S.spDay(now), "Date"), amount, currency: currency || "", not_read: text(a.not_read, 120, "Not read"), by: a.by, at: new Date(now).toISOString() };
  await S.mutate(store, KEY.spend, [], (list) => { list.unshift(row); list.splice(400); return { value: row }; });
  return { saved: true, workspace: "label", genre: genre.name, ...(amount == null ? {} : { amount: `${row.currency} ${amount.toFixed(2)}` }), note: "Recorded on the Label workspace. Not counted in the USD 1,000 cap.", shown_on: "badscandal.com/hq, Label" };
}
export async function recordStreams(store, now, a) {
  allow(a.by, STREAM_WHO, "record Label streams");
  const genre = await genreOf(store, a.genre);
  const row = { id: S.newId("lg", now), genreId: genre.id, aliasId: a.alias ? slug(a.alias) : "", date: dayOf(a.date, "Date"), streams: numOf(a.streams, "Streams"), listeners: numOf(a.listeners, "Listeners"), by: a.by, at: new Date(now).toISOString() };
  if (row.streams == null && row.listeners == null) fail("Give the streams or the listeners you could read. Nothing was saved.");
  await S.mutate(store, KEY.stats, [], (list) => { list.unshift(row); list.splice(400); return { value: row }; });
  return { saved: true, workspace: "label", genre: genre.name, streams: row.streams, listeners: row.listeners, note: "Recorded on the Label workspace, not on BADSCANDAL Growth.", shown_on: "badscandal.com/hq, Label" };
}
async function genreOf(store, name) {
  const genres = genresShown(await readList(store, KEY.genres));
  const g = genres.find((x) => x.id === slug(name) || low(x.name) === low(name)) || (!name ? genres[0] : null);
  if (!g) fail("Which genre? Nothing was saved.");
  return g;
}
export async function addResearch(store, now, a) {
  allow(a.by, [...GENRE_WHO, "Atlas", "Forge"], "add a genre candidate");
  const name = text(a.name, 80, "Genre");
  if (name.length < 2) fail("Name the candidate genre. Nothing was saved.");
  const score = blank(a.score) ? null : numOf(a.score, "Score");
  if (score != null && score > 100) fail("Score is from 0 to 100. Nothing was saved.");
  const row = { id: S.newId("gr", now), name, score, notes: text(a.notes, 400, "Notes"), source: linkOf(a.source, "Source"), by: a.by, at: new Date(now).toISOString() };
  await S.mutate(store, KEY.research, [], (list) => { list.unshift(row); list.splice(80); return { value: row }; });
  return row;
}
export async function addTrend(store, now, a) {
  allow(a.by, [...GENRE_WHO, "Atlas"], "add a trend");
  const genre = await genreOf(store, a.genre);
  const direction = ["rising", "falling"].find((d) => d === low(a.direction));
  if (!direction) fail("Direction must be rising or falling. Nothing was saved.");
  const row = { id: S.newId("gt", now), genreId: genre.id, direction, date: dayOf(a.date || S.spDay(now), "Date"), source: linkOf(a.source, "Source"), note: text(a.note, 240, "Note"), by: a.by, at: new Date(now).toISOString() };
  await S.mutate(store, KEY.trends, [], (list) => { list.unshift(row); list.splice(80); return { value: row }; });
  return row;
}

/* ---------- what the page draws ---------- */
function genreBlock(g, aliases, releases, spend, stats, trends, today) {
  const mine = releases.filter((r) => r.genreId === g.id && r.status !== "cancelled");
  const sp = spend.filter((r) => r.genreId === g.id && r.amount != null);
  const st = stats.filter((r) => r.genreId === g.id && r.streams != null);
  const als = aliases.filter((a) => a.genreId === g.id);
  return {
    id: g.id, name: g.name, status: g.status,
    aliases: als,
    playlist: playlistPlaceholder(g.id),
    releases: mine.map((r) => presentRelease(r, aliases, today)),
    trends: trends.filter((t) => t.genreId === g.id).slice(0, 8),
    stats: {
      releases: mine.length,
      spend: sp.length ? byCurrency(sp) : "not reported",
      streams: st.length ? st.reduce((n, r) => n + r.streams, 0) : "not reported",
    },
  };
}
export async function view(store, now, which) {
  const ws = low(which);
  if (!WORKSPACES.includes(ws)) fail("Workspace must be badscandal, farm or label.");
  if (ws === "badscandal") return { ok: true, workspace: "badscandal" };
  const today = S.spDay(now);
  if (ws === "farm") {
    const [accounts, posts] = await Promise.all([readList(store, KEY.accounts), readList(store, KEY.posts)]);
    const needs = [];
    for (const a of accounts) if (a.status === "restricted" || a.status === "banned") needs.push({ id: a.id, text: `@${a.handle} on ${a.platform} is ${a.status}.` });
    return { ok: true, workspace: "farm", note: FARM_NOTE, needs, auto: await C.workspaceNeeds(store, now, "farm"), numbers: { accounts: accounts.length, posts: posts.length, views: posts.reduce((n, p) => n + (p.views || 0), 0) },
      team: [{ name: "Steve", role: "Records Instagram pages" }, { name: "Kevin", role: "Records TikTok pages" }, { name: "Laura", role: "Records YouTube pages" }, { name: "Nova", role: "Can record any farm page" }],
      accounts, posts: posts.slice(0, 40), rollups: rollups(accounts, posts),
      recording: "This only records a page that already exists. HQ does not create accounts, log in, post, or invent engagement." };
  }
  const [genresRaw, aliasesRaw, releases, spend, stats, research, trends] = await Promise.all([
    readList(store, KEY.genres), readList(store, KEY.aliases), readList(store, KEY.releases), readList(store, KEY.spend), readList(store, KEY.stats), readList(store, KEY.research), readList(store, KEY.trends)]);
  const genres = genresShown(genresRaw);
  const aliases = aliasesShown(genres, aliasesRaw);
  const blocks = genres.map((g) => genreBlock(g, aliases, releases, spend, stats, trends, today));
  const needs = [];
  for (const g of blocks) {
    if (g.aliases.some((a) => a.main && !a.name)) needs.push({ id: g.id, text: `${g.name}: the main alias has no name yet.` });
    for (const r of g.releases) {
      if (r.licence.status === "ordered_waiting_luke") needs.push({ id: r.id, text: `${r.title}: the Easy Song order is waiting on you. HQ does not take payment.` });
      if (r.licence.status === "flagged") needs.push({ id: r.id, text: `${r.title}: the licence is flagged. ${r.licence.flag_reason}` });
    }
  }
  return { ok: true, workspace: "label", needs, auto: await C.workspaceNeeds(store, now, "label"), numbers: { genres: blocks.length, releases: releases.filter((r) => r.status !== "cancelled").length },
    team: [{ name: "Licence", role: "On the BADSCANDAL roster. Easy Song Licensing after the pack is ready, then the Drive folder. Reports to Nova only." }, { name: "Nova", role: "Release pack, then records Luke's yes for each cover" }, { name: "Drop", role: "RouteNote upload, after the licence is licensed" }, { name: "Atlas", role: "Pitch, once the alias has Spotify for Artists" }, { name: "Forge", role: "Label ad spend, off the BADSCANDAL cap" }],
    genres: blocks, research: research.slice(0, 20),
    payments: "HQ does not take or send payment." };
}
export async function labelList(store, now) {
  const v = await view(store, now, "label");
  return { workspace: "label", note: "Label covers only. Not BADSCANDAL releases. HQ does not take payment.",
    releases: v.genres.flatMap((g) => g.releases.map((r) => ({ genre: g.name, song: r.title, id: r.id, kind: "cover", steps: r.steps.map((s) => ({ key: s.key, label: s.label, owner_bot: s.owner_bot, status: s.key === "licence" ? s.shown : s.status, ...(s.key === "licence" && s.proof_link ? { proof_link: s.proof_link } : {}), ...(s.note ? { note: s.note } : {}) })) }))) };
}
export function sampleWorkspace(which, now) {
  const ws = low(which);
  now = Number.isFinite(now) ? now : Date.now();
  const farmCard = { id: "kfarmsample", version: 1, kind: "other", owner: "Nova", status: "open", waitingOn: "luke", workspace: "farm", moneyAtRisk: false, text: "Confirm the sample farm page is only a record.", preview: "Confirm the sample farm page is only a record.", createdAt: "2026-11-18T12:00:00Z" };
  const labelCard = { id: "klabelsample", version: 1, kind: "other", owner: "Nova", status: "open", waitingOn: "luke", workspace: "label", moneyAtRisk: false, text: "Order the Easy Song licence for Northwind Cover. HQ does not take payment.", preview: "Order the Easy Song licence for Northwind Cover.", createdAt: "2026-11-18T12:00:00Z" };
  if (ws === "farm") return { ok: true, sample: true, workspace: "farm", note: FARM_NOTE, needs: [], auto: C.workspaceNeedsFrom([farmCard, labelCard], false, now, "farm"), numbers: { accounts: 1, posts: 1, views: 1200 },
    team: [{ name: "Steve", role: "Records Instagram pages" }],
    accounts: [{ id: "fa-sample", platform: "TikTok", handle: "northwind.wav", niche: "covers", songs: ["Northwind"], owner: "Nova", status: "active", created: "2026-11-01" }],
    posts: [{ id: "fp-sample", handle: "northwind.wav", platform: "TikTok", date: "2026-11-02", song: "Northwind", contentType: "clip", views: 1200, likes: 40, shares: 3, saves: 5, follows: 2, link: "https://example.com/farm" }],
    rollups: { viewsPerSong: [{ song: "Northwind", views: 1200 }], bestTypes: [{ type: "clip", views: 1200 }], bestAccounts: [{ handle: "northwind.wav", platform: "TikTok", views: 1200 }], soundUse: [{ song: "Northwind", posts: 1 }] },
    recording: "This only records a page that already exists. HQ does not create accounts, log in, post, or invent engagement." };
  const lic = emptyLicence();
  const steps = stepsFor("2026-12-18", "2026-11-18").map((s) => s.key === "upload" ? { ...s, status: "blocked", blocked: true, note: "Blocked until the licence is licensed. The Licence bot marks it. HQ does not take payment." } : s.key === "licence" ? { ...s, ...lic, ...licenceShown(lic) } : s.key === "pitch" ? { ...s, note: "no S4A access yet" } : s);
  return { ok: true, sample: true, workspace: "label", needs: [{ id: "ukgarage", text: "UK garage: the main alias has no name yet." }], auto: C.workspaceNeedsFrom([farmCard, labelCard], false, now, "label"), numbers: { genres: 1, releases: 1 },
    team: [{ name: "Licence", role: "On the BADSCANDAL roster. Easy Song Licensing after the pack is ready, then the Drive folder. Reports to Nova only." }],
    payments: "HQ does not take or send payment.", research: [],
    genres: [{ id: "ukgarage", name: "UK garage", status: "active", aliases: [clone(SEED_ALIAS)], playlist: playlistPlaceholder("ukgarage"),
      releases: [{ id: "ukgarage-northwindcover", title: "Northwind Cover", date: "2026-12-18", kind: "cover", steps, licence: lic, uploadBlocked: true, assets: { audio: "", artwork: "", canvas: "" } }],
      trends: [], stats: { releases: 1, spend: "not reported", streams: "not reported" } }] };
}
export async function workspaceAct(store, now, a) {
  const by = a.by || "Luke";
  const action = low(a.action);
  if (action === "mark_licence" || low(a.step) === "licence") fail("Only the Licence bot or Nova can mark the licence step. HQ does not take payment.", "not_allowed");
  if (action === "add_account") return { account: await addAccount(store, now, { ...a, by }) };
  if (action === "add_post") return { post: await addPost(store, now, { ...a, by }) };
  if (action === "add_genre") return { genre: await addGenre(store, now, { ...a, by }) };
  if (action === "add_alias") return { alias: await addAlias(store, now, { ...a, by }) };
  if (action === "rename_alias") return { alias: await renameAlias(store, now, { ...a, by }) };
  if (action === "create_release") return { release: await createRelease(store, now, { ...a, by }) };
  if (action === "research") return { research: await addResearch(store, now, { ...a, by }) };
  if (action === "trend") return { trend: await addTrend(store, now, { ...a, by }) };
  fail("That action is not on this workspace.");
}

/* tool entry points. A farm or label write returns before the official desk is touched. */
export async function fromGrowth(store, now, a) {
  const ws = low(a.workspace);
  if (ws === "farm") {
    const row = { ...a, status: a.page_status || a.status, saves: a.saves_count != null ? a.saves_count : a.saves, link: a.post_link || a.link };
    if (low(a.farm) === "post" || a.song) return { ...(await addPost(store, now, row)), shown_on: "badscandal.com/hq, Social Farm" };
    return { ...(await addAccount(store, now, row)), shown_on: "badscandal.com/hq, Social Farm" };
  }
  if (ws === "label") {
    if (a.direction) return { ...(await addTrend(store, now, a)), shown_on: "badscandal.com/hq, Label" };
    if (a.research || (a.name && !a.streams && !a.listeners)) return { ...(await addResearch(store, now, { ...a, name: a.research || a.name })), shown_on: "badscandal.com/hq, Label" };
    return recordStreams(store, now, a);
  }
  return null;
}
