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
export const MARKS = [["h6", 6 * 3600000], ["d1", 24 * 3600000], ["d7", 7 * 86400000]];
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
  bad: "That does not look like an Instagram key: it is the long text from the Meta app's Instagram API setup, \"Generate token\".",
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
    const url = `${IG_HOST}/${o.noVersion ? "" : IG_VERSION + "/"}${path}${q.toString() ? "?" + q : ""}`;
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
    if (r.code === 190 || r.status === 401 || r.type === "OAuthException" && /token/i.test(r.msg)) throw new IgError("refused", SAY.refused, r.code);
    if (r.status >= 500) throw new IgError("down", SAY.down, r.code);
    throw new IgError("other", `Instagram said no (${r.status}${r.code ? ", code " + r.code : ""}).`, r.code);
  }
  return r;
}

async function readDoc(store, k, fallback) { try { const v = await store.get(k, { type: "json" }); return v == null ? fallback : v; } catch { return fallback; } }

/* Luke pastes the key: checked against Instagram (the profile) before it is kept. -> {username, followers} */
export async function saveKey(store, raw, now, fetchImpl = fetch) {
  const token = String(raw || "").trim();
  if (!isToken(token)) throw new IgError("bad", SAY.bad);
  const key = { token, auth: "header" };
  const me = await igGet("me", { fields: "user_id,username,account_type,followers_count,media_count" }, key, fetchImpl);
  if (me.account_type && !/business|creator|media_creator/i.test(me.account_type)) throw new IgError("notPro", SAY.notPro);
  const doc = { token, auth: key.auth, at: now, refreshedAt: now, expiresAt: now + 60 * DAY, userId: String(me.user_id || me.id || ""), username: String(me.username || "") };
  await store.setJSON("key.json", doc);
  return { username: doc.username, followers: me.followers_count ?? null };
}
export async function forgetKey(store) { try { await store.delete("key.json"); } catch {} }

/* renew once the key is a week old (Meta: at least 24 hours old, not yet expired) */
export async function renewIfDue(store, key, now, fetchImpl = fetch) {
  if (now - (key.refreshedAt || key.at || 0) < 7 * DAY) return false;
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
async function mediaNumbers(id, key, fetchImpl) {
  try { return metricsOf(await igGet(`${id}/insights`, { metric: MEDIA_METRICS.join(",") }, key, fetchImpl)); } catch (e) {
    if (e.kind !== "other") throw e;
    return metricsOf(await igGet(`${id}/insights`, { metric: FALLBACK_METRICS.join(",") }, key, fetchImpl)); /* a metric this kind of post doesn't have */
  }
}

/* One read. deps: {store, now, fetchImpl, logGrowth(row) (optional: the desk's Instagram row)} -> summary */
export async function syncInstagram({ store, now, fetchImpl = fetch, logGrowth = null }) {
  const key = await readDoc(store, "key.json", null);
  const state = await readDoc(store, "state.json", {});
  state.lastRunAt = now;
  if (!key || !key.token) { state.lastError = SAY.missing; state.errorKind = "missing"; await store.setJSON("state.json", state); return { ok: false, error: SAY.missing, kind: "missing" }; }
  const out = { ok: true, snapshots: 0, newComments: 0 };
  try {
    try { if (await renewIfDue(store, key, now, fetchImpl)) out.renewed = true; } catch (e) { if (e.kind === "refused") throw e; }
    const me = await igGet("me", { fields: "user_id,username,followers_count,media_count" }, key, fetchImpl);
    out.username = me.username || key.username; out.followers = num(me.followers_count);
    const media = await igGet("me/media", { fields: "id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count", limit: "25" }, key, fetchImpl);
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
        const due = MARKS.filter(([k, ms]) => age >= ms && !p.snaps[k]);
        const wantLatest = !p.latestAt || now - p.latestAt >= 3 * 3600000;
        if (due.length || wantLatest) {
          const n = await mediaNumbers(m.id, key, fetchImpl);
          for (const [k] of due) { p.snaps[k] = { ...n, at: now }; out.snapshots++; }
          p.latest = n; p.latestAt = now;
        }
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
        const c = await igGet(`${p.id}/comments`, { fields: "id,text,username,timestamp", limit: "50" }, key, fetchImpl);
        for (const x of (c && c.data) || []) {
          if (!x.id || seen.has(x.id)) continue;
          seen.add(x.id);
          list.push({ id: String(x.id), at: String(x.timestamp || ""), user: String(x.username || "").slice(0, 60), text: String(x.text || "").replace(/\s+/g, " ").slice(0, 300), post: p.id, postCaption: p.caption.slice(0, 60), link: p.link });
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
        const d = await igGet("me/insights", { metric: "follower_demographics", period: "lifetime", metric_type: "total_value", breakdown: "country" }, key, fetchImpl);
        const res = (((((d.data || [])[0] || {}).total_value || {}).breakdowns || [])[0] || {}).results || [];
        const list = res.map((r) => ({ country: String((r.dimension_values || [])[0] || ""), count: num(r.value) })).filter((x) => x.country && x.count != null).sort((a, b) => b.count - a.count).slice(0, 10);
        if (list.length) await store.setJSON("countries.json", { at: now, list });
      } catch (e) { if (e.kind === "refused") throw e; }
      state.countriesAt = now;
    }
    if (key.auth && key.auth !== "none") await store.setJSON("key.json", key);
    if (logGrowth && out.followers != null) { try { await logGrowth({ platform: "Instagram", account: "@" + (out.username || ""), followers: String(out.followers) }); } catch {} }
    Object.assign(state, { lastOkAt: now, lastError: "", errorKind: "", username: out.username, followers: out.followers });
  } catch (e) {
    Object.assign(state, { lastError: e.message || SAY.down, errorKind: e.kind || "other" });
    out.ok = false; out.error = state.lastError; out.kind = state.errorKind;
  }
  await store.setJSON("state.json", state);
  return out;
}

/* what HQ and the bots see: never the key */
export async function igStatus(store, now) {
  const key = await readDoc(store, "key.json", null), state = await readDoc(store, "state.json", {});
  const daysLeft = key && key.expiresAt ? Math.max(0, Math.floor((key.expiresAt - now) / DAY)) : null;
  return { connected: !!(key && key.token), username: (key && key.username) || state.username || "", followers: state.followers ?? null, lastRunAt: state.lastRunAt || null, lastOkAt: state.lastOkAt || null,
    lastError: state.lastError || "", errorKind: state.errorKind || "", daysLeft, renews: true };
}
export async function igView(store, now) {
  const [status, posts, comments, countries] = await Promise.all([igStatus(store, now), readDoc(store, "posts.json", []), readDoc(store, "comments.json", []), readDoc(store, "countries.json", null)]);
  return { status, posts: posts.slice(0, 12), comments: comments.slice(0, 40), countries: countries ? countries.list : [] };
}
/* one post in plain words, for the bots: "Fri 14 Nov · Reel · “caption” · a day: 1,240 views, 880 reach, …" */
const n0 = (v) => (v == null ? "?" : Number(v).toLocaleString("en-US"));
export function postLine(p) {
  const s = p.snaps || {}, show = s.d7 ? ["a week", s.d7] : s.d1 ? ["a day", s.d1] : s.h6 ? ["6 hours", s.h6] : p.latest ? ["so far", p.latest] : null;
  return `${p.at.slice(0, 10)} · ${p.type || "post"} · “${p.caption || "(no caption)"}”` + (show ? ` · ${show[0]}: ${n0(show[1].views)} views, ${n0(show[1].reach)} reach, ${n0(show[1].likes ?? p.likes)} likes, ${n0(show[1].saves)} saves, ${n0(show[1].shares)} shares` : "") + (p.link ? ` · ${p.link}` : "");
}

/* /hq?sample=1: made-up numbers, never a real account */
export function sampleView(now) {
  const iso = (ms) => new Date(now - ms).toISOString();
  return { status: { connected: true, username: "sampleaccount", followers: 4210, lastRunAt: now - 600000, lastOkAt: now - 600000, lastError: "", errorKind: "", daysLeft: 53, renews: true },
    posts: [
      { id: "s1", at: iso(9 * 3600000), type: "reels", caption: "Made-up reel: the drop at 0:12", link: "https://www.instagram.com/", likes: 88, comments: 6, snaps: { h6: { views: 2100, reach: 1500, likes: 70, saves: 31, shares: 12, at: now - 3 * 3600000 } } },
      { id: "s2", at: iso(2.5 * DAY), type: "reels", caption: "Made-up studio clip", link: "https://www.instagram.com/", likes: 140, comments: 11, snaps: { h6: { views: 1800, reach: 1200, likes: 90, saves: 20, shares: 8 }, d1: { views: 3900, reach: 2700, likes: 130, saves: 44, shares: 19 } } },
      { id: "s3", at: iso(9 * DAY), type: "feed", caption: "Made-up cover reveal", link: "https://www.instagram.com/", likes: 210, comments: 15, snaps: { h6: { views: 1400, reach: 1000, likes: 120, saves: 25, shares: 6 }, d1: { views: 2600, reach: 1900, likes: 180, saves: 40, shares: 10 }, d7: { views: 4800, reach: 3300, likes: 205, saves: 61, shares: 17 } } }],
    comments: [{ id: "k1", at: iso(2 * 3600000), user: "made_up_fan", text: "what song is this??", post: "s1", postCaption: "Made-up reel: the drop at 0:12", link: "https://www.instagram.com/" },
      { id: "k2", at: iso(20 * 3600000), user: "another_made_up_fan", text: "need this on spotify 🔥", post: "s2", postCaption: "Made-up studio clip", link: "https://www.instagram.com/" }],
    countries: [{ country: "BR", count: 2380 }, { country: "IE", count: 610 }, { country: "PT", count: 290 }] };
}
