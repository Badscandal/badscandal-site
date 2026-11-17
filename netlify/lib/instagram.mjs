/* The Instagram reader (B4, 17 Nov 2026, Steve: the browser reads locked the account in October). READ-ONLY:
   Meta's "Instagram API with Instagram Login" (graph.instagram.com) for ONE professional account, Luke's. It can
   never post, comment, follow or change anything: every call is a GET.

   The key: a long-lived Instagram user token (60 days) that Luke makes in the Meta app's Instagram API setup and
   pastes into HQ once (POST /api/hq/instagram/key, write-only: nothing ever answers with it, it is never logged).
   It lives in the Blob store "instagram" (key.json) and NOT in the Netlify env, because the site renews it itself:
   once it is a week old (and at least a day, Meta's rule) the reader calls refresh_access_token and keeps the new
   one, so it never runs out while the reader runs at least once in 60 days.

   What one read does (the hourly job, and "Read now" on /hq):
     the profile (username, followers, posts) -> today's Instagram row on the desk (log_growth by HQ);
     the newest 25 posts; for each post up to 8 days old, its numbers at 6 hours, a day and a week after it went
     out (views, reach, likes, comments, saves, shares, interactions: the first read after each mark), and the
     newest numbers; every 3 hours the comments on the posts of the last 8 days (newest 300 kept);
     once a day the followers' top countries.
   Store "instagram": key.json {token, at, refreshedAt, expiresAt, userId, username, auth: header|query} ·
   state.json {lastRunAt, lastOkAt, lastError, errorKind, commentsAt, countriesAt} · posts.json [..] ·
   comments.json [..] · countries.json {at, list}. Store, clock and fetch are passed in (tests use fakes). */
export const IG_HOST = "https://graph.instagram.com";
export const IG_VERSION = "v25.0"; /* Instagram Login examples, 2026 */
/* The Facebook-login route (17 Nov 2026: Meta blocked linking the Instagram-login app to the business portfolio, a
   hidden limit with no appeal; Luke's profile, Page and portfolio are all clean). The same account is read through
   the BADSCANDAL Facebook Page on graph.facebook.com. Luke pastes a long-lived USER key (Graph API Explorer, then
   "Extend Access Token" in the Access Token Debugger); HQ swaps it at once for the Page's own key (/me/accounts),
   which does not run out, and keeps only that (route "fb", igId = the Page's linked Instagram account). */
export const FB_HOST = "https://graph.facebook.com";
export { GRAPH_VERSION as FB_VERSION } from "./capi.mjs";
import { GRAPH_VERSION as FB_VERSION } from "./capi.mjs";
import { rankPosts } from "./postrank.mjs";
/* The BADSCANDAL Facebook Page (public id). Luke reaches it through the business portfolio, not a direct Page role,
   so /me/accounts lists nothing; HQ then reads this Page directly. Netlify env FB_PAGE_ID overrides it. */
export const DEFAULT_PAGE_ID = "101630812698451";
export function pageIdFrom(env) { const v = String((env && env("FB_PAGE_ID")) || "").trim(); return /^\d{5,30}$/.test(v) ? v : DEFAULT_PAGE_ID; }
const USER_KEY_DAYS = 60; /* an extended Facebook user key lasts about 60 days */
export const MARKS = [["h6", 6 * 3600000], ["d1", 24 * 3600000], ["d7", 7 * 86400000]];
/* a mark is only taken close to its age (Nova, 17 Nov 2026: compare posts at the SAME age): a post first seen
   later than this gets no such snapshot, so "1 day" always means about one day */
export const MARK_GRACE = { h6: 3 * 3600000, d1: 12 * 3600000, d7: 24 * 3600000 };
/* older posts (seen after their week) get their numbers read ONCE, a few per hour, so the ranking has history */
const BACKFILL_PER_RUN = 4;
export const EXTRA_METRICS = ["follows", "profile_visits"];
const DAY = 86400000;
const KEEP_DAYS = 8;
export const MEDIA_METRICS = ["views", "reach", "likes", "comments", "saved", "shares", "total_interactions"];
const FALLBACK_METRICS = ["reach", "saved", "shares"];

export const SAY = {
  missing: "Instagram is not connected yet: paste the key in HQ (Growth & Fans › Connect Instagram).",
  refused: "Instagram refused the key (it may have expired or been taken back): make a new one in the Meta app and paste it again.",
  notPro: "That key belongs to an account that is not a professional (Business or Creator) Instagram account.",
  down: "Instagram did not answer properly just now. The next read tries again.",
  unreachable: "The site could not reach Instagram just now. The next read tries again.",
  bad: "That does not look like a key: it is the long text Meta gives you (Generate token, or the Graph API Explorer).",
  noPage: "That key reached Facebook, but none of your Pages has an Instagram professional account linked to it: link @badscandal to the BADSCANDAL Page (Page settings › Linked accounts), then make the key again.",
  limit: "Meta asked HQ to slow down, so Instagram reads are paused for a day (nothing is retried before then). Nothing else is affected.",
  blocked: "Meta said an action is blocked or the account is restricted, so HQ has stopped reading Instagram completely. Check Account Quality in Meta; once it is clear, paste a new key to start again.",
  noPageAccess: "That key can't open the BADSCANDAL Facebook Page (id {id}): make the key again while logged in as someone who can manage the Page, with pages_show_list, pages_read_engagement, instagram_basic, instagram_manage_insights and instagram_manage_comments ticked.",
  noPerms: "That key can't see your Pages: make it again with pages_show_list, pages_read_engagement, instagram_basic, instagram_manage_insights and instagram_manage_comments ticked.",
};

class IgError extends Error { constructor(kind, text, code) { super(text); this.kind = kind; this.code = code || null; } }
const isToken = (t) => typeof t === "string" && /^[A-Za-z0-9_\-|.]{40,600}$/.test(t);

/* one GET. The key goes in the Authorization header; if Instagram can't read it there (an OAuth "cannot parse"
   answer), once in the address instead, and the key remembers which works. Nothing logged carries the key. */
export async function igGet(path, params, key, fetchImpl = fetch, o = {}) {
  const qs = new URLSearchParams(params || {});
  const go = async (mode) => {
    const q = new URLSearchParams(qs);
    if (mode === "query") q.set("access_token", key.token);
    const host = key.route === "fb" ? `${FB_HOST}/${FB_VERSION}/` : `${IG_HOST}/${o.noVersion ? "" : IG_VERSION + "/"}`;
    const url = `${host}${path}${q.toString() ? "?" + q : ""}`;
    let res, json;
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), o.timeout || 8000);
    try {
      res = await fetchImpl(url, { method: "GET", headers: mode === "header" ? { Authorization: "Bearer " + key.token } : {}, signal: ac.signal });
      json = await res.json().catch(() => null);
    } catch { throw new IgError("unreachable", SAY.unreachable); } finally { clearTimeout(t); }
    if (res.ok && json && !json.error) return json;
    const err = (json && json.error) || {};
    return { __error: true, status: res.status, code: Number(err.code) || null, type: err.type || "", msg: String(err.message || "") };
  };
  let mode = key.auth === "query" ? "query" : "header";
  let r = await go(mode);
  if (r && r.__error && mode === "header" && (r.code === 190 || r.status === 401) && /parse|malformed|no access token|must be used|active access token/i.test(r.msg)) { mode = "query"; r = await go(mode); if (r && !r.__error) key.auth = "query"; }
  if (r && r.__error) {
    /* the safety brake (17 Nov 2026): Meta's rate limits and any block or restriction are their own kinds, so the
       reader stops instead of knocking again (syncInstagram) */
    if (r.status === 429 || [4, 17, 32, 613].includes(r.code) || (r.code >= 80001 && r.code <= 80014) || /request limit|too many calls/i.test(r.msg)) throw new IgError("limit", SAY.limit, r.code);
    if (r.code === 368 || /temporarily blocked|restricted|checkpoint|disabled|suspended/i.test(r.msg)) throw new IgError("blocked", SAY.blocked, r.code);
    if (r.code === 190 || r.status === 401 || r.type === "OAuthException" && /token/i.test(r.msg)) throw new IgError("refused", SAY.refused, r.code);
    if (r.status >= 500) throw new IgError("down", SAY.down, r.code);
    throw new IgError("other", `Instagram said no (${r.status}${r.code ? ", code " + r.code : ""}).`, r.code);
  }
  return r;
}

async function readDoc(store, k, fallback) { try { const v = await store.get(k, { type: "json" }); return v == null ? fallback : v; } catch { return fallback; } }

/* Luke pastes the key: checked against Instagram (the profile) before it is kept. -> {username, followers} */
export async function saveKey(store, raw, now, fetchImpl = fetch, o = {}) {
  const token = String(raw || "").trim();
  if (!isToken(token)) throw new IgError("bad", SAY.bad);
  /* an Instagram-login key starts with IG; anything else is a Facebook key (the Page route) */
  if (!/^IG/.test(token)) return saveFbKey(store, token, now, fetchImpl, o.pageId || DEFAULT_PAGE_ID);
  const key = { token, auth: "header" };
  const me = await igGet("me", { fields: "user_id,username,account_type,followers_count,media_count" }, key, fetchImpl);
  if (me.account_type && !/business|creator|media_creator/i.test(me.account_type)) throw new IgError("notPro", SAY.notPro);
  const doc = { token, auth: key.auth, at: now, refreshedAt: now, expiresAt: now + 60 * DAY, userId: String(me.user_id || me.id || ""), username: String(me.username || "") };
  await store.setJSON("key.json", doc);
  await liftBrake(store);
  return { username: doc.username, followers: me.followers_count ?? null };
}
const BRAKE = ["limit", "blocked"];
async function saveFbKey(store, token, now, fetchImpl, pageId) {
  const user = { token, auth: "header", route: "fb" };
  /* 1. the Pages the key manages directly */
  let pages;
  try { pages = await igGet("me/accounts", { fields: "id,name,access_token,instagram_business_account{id,username}", limit: "50" }, user, fetchImpl); }
  catch (e) { if (e.kind === "other") throw new IgError("noPerms", SAY.noPerms, e.code); throw e; }
  let page = ((pages && pages.data) || []).find((p) => p && p.instagram_business_account && p.instagram_business_account.id);
  let pageKey = page && isToken(String(page.access_token || "")) ? String(page.access_token) : "";
  /* 2. none there (access through the business portfolio): the known Page itself, read with the user key */
  if (!page) {
    try { page = await igGet(pageId, { fields: "id,name,instagram_business_account{id,username}" }, user, fetchImpl); }
    catch (e) { if (e.kind === "other") throw new IgError("noPageAccess", SAY.noPageAccess.replace("{id}", pageId), e.code); throw e; }
    if (!page || !page.instagram_business_account || !page.instagram_business_account.id) throw new IgError("noPage", SAY.noPage);
    /* the Page's own key, if Meta hands it over; if not, the user key stays (about 60 days) */
    try { const t = await igGet(pageId, { fields: "access_token" }, user, fetchImpl); pageKey = isToken(String((t && t.access_token) || "")) ? String(t.access_token) : ""; }
    catch (e) { if (BRAKE.includes(e.kind)) throw e; pageKey = ""; }
  }
  const igId = String(page.instagram_business_account.id);
  const key = { token: pageKey || token, auth: "header", route: "fb" };
  const me = await igGet(igId, { fields: "username,followers_count,media_count" }, key, fetchImpl);
  /* the Page's key does not run out (only a password change or taking the app's access back ends it); the user key
     does, so HQ says when to make a new one */
  const doc = { token: key.token, auth: key.auth, route: "fb", keyType: pageKey ? "page" : "user", at: now, refreshedAt: now,
    expiresAt: pageKey ? null : now + USER_KEY_DAYS * DAY, igId, userId: igId, page: String(page.name || "").slice(0, 80),
    username: String(me.username || page.instagram_business_account.username || "") };
  await store.setJSON("key.json", doc);
  await liftBrake(store);
  return { username: doc.username, followers: me.followers_count ?? null };
}
/* a new key lifts the brake (Luke pastes one only once Meta is clear) */
async function liftBrake(store) {
  const state = await readDoc(store, "state.json", null);
  if (state && (state.stopped || state.pausedUntil)) { delete state.stopped; delete state.pausedUntil; state.lastError = ""; state.errorKind = ""; await store.setJSON("state.json", state); }
}
export async function forgetKey(store) { try { await store.delete("key.json"); } catch {} }

/* renew once the key is a week old (Meta: at least 24 hours old, not yet expired) */
export async function renewIfDue(store, key, now, fetchImpl = fetch) {
  if (key.route === "fb" || now - (key.refreshedAt || key.at || 0) < 7 * DAY) return false; /* a Page key never needs renewing */
  const r = await igGet("refresh_access_token", { grant_type: "ig_refresh_token", access_token: key.token }, { ...key, auth: "none" }, fetchImpl, { noVersion: true });
  if (!isToken(r.access_token)) return false;
  key.token = r.access_token; key.refreshedAt = now; key.expiresAt = now + (Number(r.expires_in) > 0 ? Number(r.expires_in) * 1000 : 60 * DAY);
  await store.setJSON("key.json", key);
  return true;
}

const num = (v) => (v == null || v === "" || !isFinite(Number(v)) ? null : Number(v));
const capOf = (c) => String(c || "").split("\n")[0].replace(/\s+/g, " ").trim().slice(0, 120);
/* the insights answer -> {views: 120, reach: 90, ...} */
export function metricsOf(json) {
  const out = {};
  for (const m of (json && json.data) || []) {
    const v = m.total_value && m.total_value.value != null ? m.total_value.value : m.values && m.values[0] ? m.values[0].value : null;
    if (num(v) != null) out[m.name === "saved" ? "saves" : m.name === "total_interactions" ? "interactions" : m.name] = num(v);
  }
  return out;
}
/* follows and profile visits a post brought (Nova: "followers are our weekly goal"); not every kind of post has
   them, so a refusal (other) just means none */
async function extraNumbers(id, key, fetchImpl) {
  try { return metricsOf(await igGet(`${id}/insights`, { metric: EXTRA_METRICS.join(",") }, key, fetchImpl)); } catch (e) { if (e.kind !== "other") throw e; return {}; }
}
const keepExtras = (prev) => { const o = {}; for (const k of EXTRA_METRICS) if (prev && prev[k] != null) o[k] = prev[k]; return o; };
async function mediaNumbers(id, key, fetchImpl) {
  try { return metricsOf(await igGet(`${id}/insights`, { metric: MEDIA_METRICS.join(",") }, key, fetchImpl)); } catch (e) {
    if (e.kind !== "other") throw e;
    return metricsOf(await igGet(`${id}/insights`, { metric: FALLBACK_METRICS.join(",") }, key, fetchImpl)); /* a metric this kind of post doesn't have */
  }
}

const STOP = ["refused", "blocked", "limit"];
/* One read. deps: {store, now, fetchImpl, logGrowth(row) (optional: the desk's Instagram row)} -> summary */
export async function syncInstagram({ store, now, fetchImpl = fetch, logGrowth = null }) {
  const key = await readDoc(store, "key.json", null);
  const state = await readDoc(store, "state.json", {});
  state.lastRunAt = now;
  if (!key || !key.token) { state.lastError = SAY.missing; state.errorKind = "missing"; await store.setJSON("state.json", state); return { ok: false, error: SAY.missing, kind: "missing" }; }
  /* the brake: stopped (a block, a restriction, a refused key) = no call at all until a new key; paused (a rate
     limit) = no call until the day is over. Read now obeys it too. */
  if (state.stopped) return { ok: false, kind: "stopped", error: state.lastError || SAY.blocked };
  if (state.pausedUntil && now < state.pausedUntil) return { ok: false, kind: "paused", error: state.lastError || SAY.limit };
  delete state.pausedUntil;
  const out = { ok: true, snapshots: 0, newComments: 0 };
  try {
    try { if (await renewIfDue(store, key, now, fetchImpl)) out.renewed = true; } catch (e) { if (STOP.includes(e.kind)) throw e; }
    const self = key.route === "fb" ? key.igId : "me";
    const me = await igGet(self, { fields: key.route === "fb" ? "username,followers_count,media_count" : "user_id,username,followers_count,media_count" }, key, fetchImpl);
    out.username = me.username || key.username; out.followers = num(me.followers_count);
    const media = await igGet(`${self}/media`, { fields: "id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count", limit: "25" }, key, fetchImpl);
    const posts = await readDoc(store, "posts.json", []);
    const byId = new Map(posts.map((p) => [p.id, p]));
    const fresh = [];
    for (const m of (media && media.data) || []) {
      const at = Date.parse(m.timestamp || "");
      if (!m.id || !isFinite(at)) continue;
      const p = byId.get(m.id) || { id: String(m.id), at: new Date(at).toISOString(), snaps: {} };
      Object.assign(p, { caption: capOf(m.caption), type: String(m.media_product_type || m.media_type || "").toLowerCase(), link: /^https:\/\//.test(m.permalink || "") ? m.permalink : "",
        likes: num(m.like_count), comments: num(m.comments_count) });
      const age = now - at;
      if (age <= KEEP_DAYS * DAY) {
        const due = MARKS.filter(([k, ms]) => age >= ms && age <= ms + MARK_GRACE[k] && !p.snaps[k]);
        const wantLatest = !p.latestAt || now - p.latestAt >= 3 * 3600000;
        if (due.length || wantLatest) {
          let n = await mediaNumbers(m.id, key, fetchImpl);
          n = due.length || !p.latest ? { ...n, ...(await extraNumbers(m.id, key, fetchImpl)) } : { ...keepExtras(p.latest), ...n };
          for (const [k] of due) { p.snaps[k] = { ...n, at: now }; out.snapshots++; }
          p.latest = n; p.latestAt = now;
        }
      } else if (!p.latest && (out.backfilled || 0) < BACKFILL_PER_RUN) {
        /* an older post HQ has never read: its lifetime numbers, once */
        p.latest = { ...(await mediaNumbers(m.id, key, fetchImpl)), ...(await extraNumbers(m.id, key, fetchImpl)) };
        p.latestAt = now; p.lifetime = true;
        out.backfilled = (out.backfilled || 0) + 1;
      }
      fresh.push(p);
    }
    /* the newest 60 posts are kept */
    const keep = fresh.concat(posts.filter((p) => !fresh.some((f) => f.id === p.id))).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 60);
    await store.setJSON("posts.json", keep);
    /* comments every 3 hours, on the posts of the last 8 days */
    if (!state.commentsAt || now - state.commentsAt >= 3 * 3600000) {
      const list = await readDoc(store, "comments.json", []);
      const seen = new Set(list.map((c) => c.id));
      for (const p of keep.filter((x) => now - Date.parse(x.at) <= KEEP_DAYS * DAY && (x.comments == null || x.comments > 0))) {
        const c = await igGet(`${p.id}/comments`, { fields: "id,text,username,timestamp,replies{username}", limit: "50" }, key, fetchImpl);
        for (const x of (c && c.data) || []) {
          if (!x.id) continue;
          /* who replied (usernames only): a reply from one of our own accounts = answered */
          const repliedBy = (((x.replies && x.replies.data) || []).map((r) => String((r && r.username) || "").toLowerCase()).filter(Boolean)).slice(0, 20);
          if (seen.has(x.id)) { const old = list.find((y) => y.id === String(x.id)); if (old) old.repliedBy = repliedBy; continue; }
          seen.add(x.id);
          list.push({ id: String(x.id), at: String(x.timestamp || ""), user: String(x.username || "").slice(0, 60), text: String(x.text || "").replace(/\s+/g, " ").slice(0, 300), post: p.id, postCaption: p.caption.slice(0, 60), link: p.link, repliedBy });
          out.newComments++;
        }
      }
      list.sort((a, b) => (a.at < b.at ? 1 : -1));
      await store.setJSON("comments.json", list.slice(0, 300));
      state.commentsAt = now;
    }
    /* the followers' top countries, once a day (Instagram gives them from 100 followers) */
    if (!state.countriesAt || now - state.countriesAt >= DAY) {
      try {
        const d = await igGet(`${self}/insights`, { metric: "follower_demographics", period: "lifetime", metric_type: "total_value", breakdown: "country" }, key, fetchImpl);
        const res = (((((d.data || [])[0] || {}).total_value || {}).breakdowns || [])[0] || {}).results || [];
        const list = res.map((r) => ({ country: String((r.dimension_values || [])[0] || ""), count: num(r.value) })).filter((x) => x.country && x.count != null).sort((a, b) => b.count - a.count).slice(0, 10);
        if (list.length) await store.setJSON("countries.json", { at: now, list });
      } catch (e) { if (STOP.includes(e.kind)) throw e; }
      state.countriesAt = now;
    }
    if (key.auth && key.auth !== "none") await store.setJSON("key.json", key);
    if (logGrowth && out.followers != null) { try { await logGrowth({ platform: "Instagram", account: "@" + (out.username || ""), followers: String(out.followers) }); } catch {} }
    Object.assign(state, { lastOkAt: now, lastError: "", errorKind: "", username: out.username, followers: out.followers });
  } catch (e) {
    Object.assign(state, { lastError: e.message || SAY.down, errorKind: e.kind || "other" });
    if (e.kind === "limit") state.pausedUntil = now + DAY;
    if (e.kind === "blocked" || e.kind === "refused") state.stopped = true;
    out.ok = false; out.error = state.lastError; out.kind = state.errorKind;
  }
  await store.setJSON("state.json", state);
  return out;
}

/* Our own accounts (Nova, 17 Nov 2026: our comments made posts look better than they are). The connected account
   always counts; Luke adds the others once in HQ (POST /api/hq/instagram/own), kept in own.json. Handles only. */
export const HANDLE_RE = /^[a-z0-9._]{1,30}$/;
export function parseHandles(text) {
  return [...new Set(String(text || "").split(/[\s,;]+/).map((h) => h.trim().replace(/^@/, "").toLowerCase()).filter(Boolean))];
}
export async function saveOwn(store, text, now) {
  const handles = parseHandles(text);
  const bad = handles.filter((h) => !HANDLE_RE.test(h));
  if (bad.length) throw new IgError("bad", `Not an Instagram handle: ${bad.slice(0, 3).join(", ")}. Write them like @name, separated by commas.`);
  if (handles.length > 10) throw new IgError("bad", "At most 10 accounts.");
  await store.setJSON("own.json", { handles, at: now });
  return handles;
}
export function ownHandles(username, ownDoc) {
  return [...new Set([String(username || "").toLowerCase(), ...(((ownDoc && ownDoc.handles) || []).map((h) => String(h).toLowerCase()))].filter(Boolean))];
}
/* comments that need a reply (Nova: a fan asked if they can use the music): a question, not ours, nobody of ours
   answered it, the last 14 days. Replying goes outside the team, so it's Luke's. */
const ASKS = /\?|\b(can i|could i|may i|use your|use this|what song|song name|which song|where can|when (is|does)|link|nome da m[uú]sica|qual ([ée] )?a m[uú]sica|posso usar|onde|quando sai)\b/i;
export function needsReply(comments, now) {
  return (comments || []).filter((c) => !c.own && !c.answered && ASKS.test(c.text || "") && now - Date.parse(c.at || "") <= 14 * DAY).slice(0, 10)
    .map((c) => ({ id: c.id, at: c.at, user: c.user, text: c.text, postCaption: c.postCaption, link: c.link }));
}

/* what HQ and the bots see: never the key */
export async function igStatus(store, now) {
  const key = await readDoc(store, "key.json", null), state = await readDoc(store, "state.json", {});
  const daysLeft = key && key.expiresAt ? Math.max(0, Math.floor((key.expiresAt - now) / DAY)) : null;
  return { connected: !!(key && key.token), username: (key && key.username) || state.username || "", followers: state.followers ?? null, lastRunAt: state.lastRunAt || null, lastOkAt: state.lastOkAt || null,
    lastError: state.lastError || "", errorKind: state.errorKind || "", stopped: !!state.stopped, pausedUntil: state.pausedUntil && state.pausedUntil > now ? state.pausedUntil : null, daysLeft, renews: !(key && key.route === "fb"), route: (key && key.route) || "ig",
    ...(key && key.route === "fb" ? { keyType: key.keyType || "page", expiresAt: key.expiresAt || null } : {}), ...(key && key.page ? { page: key.page } : {}) };
}
export async function igView(store, now) {
  const [status, posts, comments, countries, adDoc, ownDoc] = await Promise.all([igStatus(store, now), readDoc(store, "posts.json", []), readDoc(store, "comments.json", []), readDoc(store, "countries.json", null), readDoc(store, "adposts.json", null), readDoc(store, "own.json", null)]);
  const own = ownHandles(status.username, ownDoc);
  const marked = comments.map((c) => ({ ...c, own: own.includes(String(c.user || "").toLowerCase()), answered: (c.repliedBy || []).some((u) => own.includes(u)) }));
  /* L2: which posts engage best, with the ads that boosted them (postrank.mjs); our own comments don't count */
  const ranking = rankPosts(posts, adDoc, { now, comments: marked });
  return { status, posts: posts.slice(0, 12), comments: marked.filter((c) => !c.own).slice(0, 40), countries: countries ? countries.list : [], own,
    needsReply: needsReply(marked, now),
    ranking: { ranked: ranking.ranked.slice(0, 15), older: ranking.older.slice(0, 15), tooFew: ranking.tooFew.length, adsAt: ranking.adsAt, minViews: ranking.minViews } };
}
/* one post in plain words, for the bots: "Fri 14 Nov · Reel · “caption” · a day: 1,240 views, 880 reach, …" */
const n0 = (v) => (v == null ? "?" : Number(v).toLocaleString("en-US"));
export function postLine(p) {
  const s = p.snaps || {}, show = s.d7 ? ["a week", s.d7] : s.d1 ? ["a day", s.d1] : s.h6 ? ["6 hours", s.h6] : p.latest ? [p.lifetime ? "lifetime" : "so far", p.latest] : null;
  return `${p.at.slice(0, 10)} · ${p.type || "post"} · “${p.caption || "(no caption)"}”` + (show ? ` · ${show[0]}: ${n0(show[1].views)} views, ${n0(show[1].reach)} reach, ${n0(show[1].likes ?? p.likes)} likes, ${n0(show[1].comments ?? p.comments)} comments, ${n0(show[1].saves)} saves, ${n0(show[1].shares)} shares` +
    (show[1].follows != null ? `, ${n0(show[1].follows)} follows` : "") + (show[1].profile_visits != null ? `, ${n0(show[1].profile_visits)} profile visits` : "") : ` · ${n0(p.comments)} comments, no numbers yet`) + (p.link ? ` · ${p.link}` : "");
}

/* /hq?sample=1: made-up numbers, never a real account */
export function sampleView(now) {
  const iso = (ms) => new Date(now - ms).toISOString();
  const v = { status: { connected: true, username: "sampleaccount", followers: 4210, lastRunAt: now - 600000, lastOkAt: now - 600000, lastError: "", errorKind: "", daysLeft: 53, renews: true },
    posts: [
      { id: "s1", at: iso(9 * 3600000), type: "reels", caption: "Made-up reel: the drop at 0:12", link: "https://www.instagram.com/", likes: 88, comments: 6, snaps: { h6: { views: 2100, reach: 1500, likes: 70, saves: 31, shares: 12, at: now - 3 * 3600000 } }, latest: { views: 2600, reach: 1800, likes: 88, saves: 36, shares: 14 } },
      { id: "s2", at: iso(2.5 * DAY), type: "reels", caption: "Made-up studio clip", link: "https://www.instagram.com/", likes: 1400, comments: 11, snaps: { h6: { views: 1800, reach: 1200, likes: 90, saves: 20, shares: 8, at: now - 2.5 * DAY + 6 * 3600000 }, d1: { views: 3900, reach: 2700, likes: 130, comments: 6, saves: 44, shares: 19, follows: 21, profile_visits: 64, at: now - 1.5 * DAY } }, latest: { views: 41000, reach: 30000, likes: 1400, saves: 160, shares: 70 } },
      { id: "s3", at: iso(9 * DAY), type: "feed", caption: "Made-up cover reveal", link: "https://www.instagram.com/", likes: 210, comments: 15, snaps: { h6: { views: 1400, reach: 1000, likes: 120, saves: 25, shares: 6 }, d1: { views: 2600, reach: 1900, likes: 180, comments: 9, saves: 40, shares: 10, follows: 8, profile_visits: 30, at: now - 8 * DAY }, d7: { views: 4800, reach: 3300, likes: 205, saves: 61, shares: 17 } }, latest: { views: 4800, reach: 3300, likes: 205, saves: 61, shares: 17 } }],
    comments: [{ id: "k1", at: iso(2 * 3600000), user: "made_up_fan", text: "what song is this??", post: "s1", postCaption: "Made-up reel: the drop at 0:12", link: "https://www.instagram.com/" },
      { id: "k2", at: iso(20 * 3600000), user: "another_made_up_fan", text: "need this on spotify 🔥", post: "s2", postCaption: "Made-up studio clip", link: "https://www.instagram.com/" }],
    countries: [{ country: "BR", count: 2380 }, { country: "IE", count: 610 }, { country: "PT", count: 290 }] };
  /* a made-up ad boosting the studio clip, started after its 6-hour numbers */
  const ads = { at: now - 600000, ads: [{ id: "sa1", name: "Made-up boost", media: "s2", status: "ACTIVE", created: iso(2 * DAY), spend: 120, currency: "USD", impressions: 36000, reach: 26000, likes: 1200, comments: 4, saves: 110, shares: 40 }] };
  v.own = ["sampleaccount", "made_up_partner"];
  v.comments = v.comments.map((c) => ({ ...c, own: false, answered: false }));
  v.needsReply = needsReply(v.comments, now);
  const r = rankPosts(v.posts, ads, { now, comments: v.comments });
  v.ranking = { ranked: r.ranked, older: r.older, tooFew: r.tooFew.length, adsAt: r.adsAt, minViews: r.minViews };
  return v;
}
