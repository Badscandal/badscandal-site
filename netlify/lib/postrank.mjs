/* Which Instagram posts engage best (L2, adapted, 17 Nov 2026).
   Luke: "i spend 90 on one ad and it got 23k views but 1.6k likes … another i spend 300 dollars it got almost 300k
   views but only 3k likes so obviously the engagement on one was better … these signals help us shift our ads to the
   post performing the best".
   - Posts are ranked by ENGAGEMENT PER VIEW: (likes + comments + saves + shares) / views, from the numbers HQ reads
     on Instagram (instagram.mjs). Paid views bring few engagements, so a boosted post never wins on views alone.
   - Next to it, the ad's OWN numbers from Meta (spend, impressions, its likes/comments/saves/shares) and the cost per
     engagement, for every ad that boosts the post (the ad creative's effective_instagram_media_id).
   - And the post's numbers from BEFORE its first ad (the newest 6 h / 1 day / 1 week snapshot taken before the ad
     started): the post's own wow factor with its followers, unpaid.
   READ-ONLY towards Meta, with the existing ads_read key (META_ADS_TOKEN): one GET of the ad account's ads with
   their creative and lifetime insights, at most once an hour (the hourly job), key in the Authorization header only.
   A rate limit pauses it for a day. Nothing here can create, change, start or pause an ad. */
import { GRAPH_VERSION } from "./capi.mjs";

const DAY = 86400000;
const n = (v) => (v == null || v === "" || !isFinite(Number(v)) ? 0 : Number(v));
const fmt = (v) => Math.round(Number(v) || 0).toLocaleString("en-US");
const pct = (r) => (r == null ? "?" : (Math.round(r * 1000) / 10).toFixed(1) + "%");

/* an ad's actions -> the four engagements that count (a reaction counts as a like when Meta gives no "like") */
export function actionsOf(actions) {
  const a = {};
  for (const x of Array.isArray(actions) ? actions : []) if (x && x.action_type) a[x.action_type] = n(x.value);
  return { likes: a.like != null ? a.like : n(a.post_reaction), comments: n(a.comment), saves: n(a["onsite_conversion.post_save"]), shares: n(a.post) };
}

export function adPostsRequest(account) {
  const q = new URLSearchParams({
    fields: "name,effective_status,created_time,creative{effective_instagram_media_id},insights.date_preset(maximum){spend,impressions,reach,actions,account_currency}",
    limit: "100",
  });
  return `https://graph.facebook.com/${GRAPH_VERSION}/act_${String(account).replace(/\D/g, "")}/ads?${q}`;
}

/* -> { ads: [{id, name, status, created, media, spend, currency, impressions, reach, likes, comments, saves, shares}] }
   | { error, code } ; only ads tied to an Instagram post are kept; at most 5 pages */
export async function fetchAdPosts(token, account, fetchImpl = fetch) {
  let url = adPostsRequest(account);
  const ads = [];
  for (let page = 0; url && page < 5; page++) {
    let res, json;
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), 8000);
    try {
      res = await fetchImpl(url, { method: "GET", headers: { Authorization: "Bearer " + token }, signal: ac.signal });
      json = await res.json().catch(() => null);
    } catch (e) {
      return { error: e && e.name === "AbortError" ? "Meta didn't answer in time" : "Couldn't reach Meta", code: null };
    } finally { clearTimeout(t); }
    if (!res.ok || !json || !Array.isArray(json.data)) {
      const err = (json && json.error) || {};
      return { error: String(err.message || "Meta said no").replace(/\bEAA[A-Za-z0-9]{10,}/g, "<key>").slice(0, 160) + ` (HTTP ${res.status}${err.code ? ", code " + err.code : ""})`, code: Number(err.code) || null };
    }
    for (const x of json.data) {
      const media = x && x.creative && x.creative.effective_instagram_media_id;
      if (!media) continue;
      const i = (x.insights && x.insights.data && x.insights.data[0]) || {};
      ads.push({ id: String(x.id || ""), name: String(x.name || "").slice(0, 120), status: String(x.effective_status || ""), created: String(x.created_time || ""),
        media: String(media), spend: n(i.spend), currency: String(i.account_currency || ""), impressions: n(i.impressions), reach: n(i.reach), ...actionsOf(i.actions) });
    }
    url = json.paging && json.paging.next ? String(json.paging.next).replace(/([?&])access_token=[^&]*&?/, "$1") : "";
  }
  return { ads };
}

const LIMIT_CODES = [4, 17, 32, 613];
/* the hourly read: stored as adposts.json in the instagram store {at, ads}; state in adstate.json */
export async function syncAdPosts({ store, token, account, now, fetchImpl = fetch }) {
  if (!token) return { ok: false, skipped: "no key" };
  const state = (await store.get("adstate.json", { type: "json" }).catch(() => null)) || {};
  if (state.pausedUntil && now < state.pausedUntil) return { ok: false, skipped: "paused" };
  const r = await fetchAdPosts(token, account, fetchImpl);
  if (r.error) {
    const limit = LIMIT_CODES.includes(r.code) || (r.code >= 80000 && r.code <= 80014) || /limit|too many/i.test(r.error);
    await store.setJSON("adstate.json", { at: now, error: r.error, ...(limit ? { pausedUntil: now + DAY } : {}) });
    return { ok: false, kind: limit ? "limit" : "error", error: r.error };
  }
  await store.setJSON("adposts.json", { at: now, ads: r.ads });
  await store.setJSON("adstate.json", { at: now, ok: true });
  return { ok: true, ads: r.ads.length };
}

const MARK_WORDS = { h6: "6 hours", d1: "a day", d7: "a week" };
const engagedOf = (x, comments) => n(x.likes) + n(x.comments != null ? x.comments : comments) + n(x.saves) + n(x.shares);

/* posts: instagram.mjs posts.json; adDoc: adposts.json; o.comments: the read comments, each with `own` (one of our
   accounts) so ours are taken off. -> { ranked (same age: their 1-day numbers, best first), older (no 1-day numbers:
   lifetime / so far, best first, not the same age), tooFew, adsAt }.
   Nova, 17 Nov 2026: "rank every post at the same age … use the 1-day window", "our own comments count as
   engagement: leave them out", "add follows per view and profile visits", "saves and shares their own column". */
const sameMedia = (a, p) => {
  const m = String((a && a.media) || ""), id = String((p && p.id) || "");
  if (!m || !id) return false;
  if (m === id) return true;
  return /^\d{8,}$/.test(m) && /^\d{8,}$/.test(id) && (m.endsWith(id) || id.endsWith(m));
};
const nextDay = (d) => { const t = Date.parse(d + "T12:00:00Z"); return isFinite(t) ? new Date(t + 86400000).toISOString().slice(0, 10) : ""; };
const shortOf = (link) => { const m = /instagram\.com\/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/i.exec(String(link || "")); return m ? m[1] : ""; };
/* Matching a boost to a post. The title key is for matching only: the stored title is never rewritten. */
export function titleKey(s) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
const normLink = (s) => String(s || "").trim().toLowerCase().replace(/[?#].*$/, "").replace(/\/+$/, "");
const postDay = (p) => { const d = String((p && (p.date || p.at)) || "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ""; };
const spendClock = (s) => { const t = Date.parse(s && s.at || ""); return isFinite(t) ? t : 0; };
export function spStampOf(ts) {
  const d = new Date(ts);
  if (!isFinite(d.getTime())) return "";
  const parts = {};
  new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).forEach((p) => { if (p.type !== "literal") parts[p.type] = p.value; });
  const hh = parts.hour === "24" ? "00" : parts.hour;
  if (!parts.year || !hh) return "";
  return `${parts.year}-${parts.month}-${parts.day} ${hh}:${parts.minute}`;
}
/* A spend row names this post when it carries the post id, the ad id, or the post's link.
   A title or a song is a fallback, and only an exact normalised title, or a song contained in the title. */
export function directSpend(s, post) {
  if (!s || !post) return false;
  const ids = [s.post, s.post_id, s.media, s.ad, s.ad_id].map((x) => String(x || "").trim()).filter(Boolean);
  const pid = String(post.id || "");
  if (pid && ids.some((id) => id === pid || (id.length >= 8 && pid.length >= 8 && (pid.endsWith(id) || id.endsWith(pid))))) return true;
  const link = normLink(s.link || s.url || "");
  const pl = normLink(post.link);
  if (link && pl && link === pl) return true;
  const sc = shortOf(post.link);
  if (sc && sc.length >= 8 && (String(s.shortcode || "") === sc || String(s.link || s.url || "").toLowerCase().includes(sc.toLowerCase()))) return true;
  return false;
}
function textSpend(s, post) {
  const title = titleKey(s.title || s.hook || "");
  const pt = titleKey(post && (post.caption || post.hook || ""));
  if (title.length >= 3 && pt && title === pt) return true;
  const song = titleKey(s.song || "");
  const blob = titleKey(`${(post && post.caption) || ""} ${(post && post.hook) || ""} ${(post && post.song) || ""}`);
  return song.length >= 3 && blob.includes(song);
}
const spendScoped = (s) => !!(s && [s.post, s.post_id, s.media, s.ad, s.ad_id, s.link, s.url, s.shortcode, s.title, s.hook, s.song].some((v) => String(v || "").trim()));
function platformOk(s, post) {
  const sp = String(s.platform || "").toLowerCase();
  if (!sp) return true;
  const pp = String(post.platform || "").toLowerCase();
  if (!pp) return /meta|facebook|instagram/.test(sp);
  if (/instagram|^ig$/.test(pp)) return /meta|facebook|instagram|^ig$/.test(sp);
  if (/tiktok|^tt$/.test(pp)) return /tiktok/.test(sp);
  if (/youtube|^yt$/.test(pp)) return /youtube/.test(sp);
  return sp.includes(pp);
}
function dateNear(s, post) {
  const d = postDay(post);
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(String(s.date || ""))) return false;
  return s.date === d || s.date === nextDay(d);
}
/* A clock on the row is required once the boost's start is known. A date alone is not later than that start. */
function readFresh(s, started) {
  if (!isFinite(started)) return true;
  const t = spendClock(s);
  return t > 0 && t >= started;
}
/* The freshest spend row that names this post. An account-day total (no post, ad, link, title or song) never matches. */
export function scopedSpend(post, spend, o = {}) {
  const pool = o.pool || [post];
  const started = o.started;
  const rows = (spend || []).filter((s) => s && Number(s.amount) > 0 && spendScoped(s) && platformOk(s, post));
  const hits = rows.filter((s) => {
    if (directSpend(s, post)) return readFresh(s, started);
    if (!textSpend(s, post) || !dateNear(s, post)) return false;
    const named = pool.filter((p) => textSpend(s, p) && dateNear(s, p));
    return named.length === 1 && readFresh(s, started);
  });
  hits.sort((a, b) => spendClock(b) - spendClock(a));
  return hits[0] || null;
}
export function postEngagements(p) {
  if (!p) return null;
  for (const k of ["likes", "comments", "saves", "shares"]) if (p[k] == null || p[k] === "" || !isFinite(Number(p[k]))) return null;
  return ["likes", "comments", "saves", "shares"].reduce((sum, k) => sum + Number(p[k]), 0);
}
function startedMs(v) {
  const s = String(v || "").trim();
  if (!s) return NaN;
  /* a stamp with no zone is São Paulo, the clock the desk uses */
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) return Date.parse(s.slice(0, 16).replace(" ", "T") + ":00-03:00");
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Date.parse(s + "T00:00:00-03:00");
  return Date.parse(s);
}
function sameBoostPost(a, b) {
  if (!a || !b) return false;
  const ida = String(a.id || ""), idb = String(b.id || "");
  if (ida && idb) return ida === idb || (ida.length >= 8 && idb.length >= 8 && (ida.endsWith(idb) || idb.endsWith(ida)));
  if (a.link && b.link) return normLink(a.link) === normLink(b.link);
  const ta = titleKey(a.hook || a.caption || a.title || "");
  const tb = titleKey(b.hook || b.caption || b.title || "");
  return !!(ta && tb && ta === tb);
}
/* What read_growth and the Boosted section agree on. ad_spend on a growth row is not used: that figure is the
   platform's day, not this post. */
export function boostReport(rows, spendRows) {
  const posts = [];
  for (const r of rows || []) for (const p of (r && r.posts) || []) if (p && p.boosted === true) posts.push({ ...p, platform: r.platform || p.platform || "" });
  return posts.map((p) => {
    const started = startedMs(p.boost_started || p.started);
    const row = scopedSpend(p, spendRows, { started: isFinite(started) ? started : NaN, pool: posts });
    const mates = posts.filter((x) => sameBoostPost(x, p) && postEngagements(x) != null).sort((a, b) => (String(a.date || "") < String(b.date || "") ? 1 : -1));
    const eng = mates.length ? postEngagements(mates[0]) : null;
    const folM = posts.filter((x) => sameBoostPost(x, p) && x.follows != null && x.follows !== "" && isFinite(Number(x.follows))).sort((a, b) => (String(a.date || "") < String(b.date || "") ? 1 : -1));
    const fol = folM.length ? Number(folM[0].follows) : null;
    const spend = row ? Number(row.amount) : null;
    const at = row ? spendClock(row) : 0;
    return {
      post: p.hook || p.caption || p.id || "", link: p.link || "", platform: p.platform || "",
      spend, currency: row && row.currency || "", as_of: at ? spStampOf(at) : (row && row.date) || "",
      engagements: eng, follows: fol,
      cost_per_engagement: spend != null && eng > 0 ? Math.round((spend / eng) * 1000) / 1000 : null,
      cost_per_follower: spend != null && fol > 0 ? Math.round((spend / fol) * 1000) / 1000 : null,
      note: spend == null ? "spend not read since boost started" : "",
    };
  });
}
const adHits = (a, p) => {
  if (sameMedia(a, p)) return true;
  const sc = shortOf(p && p.link);
  /* a real Instagram code is 11 characters; a 1-letter code matches every ad name that contains that letter */
  if (!sc || sc.length < 8) return false;
  const name = String(a.name || "").toLowerCase();
  return String(a.media || "") === sc || name.includes(sc.toLowerCase());
};
export function rankPosts(posts, adDoc, o = {}) {
  const minViews = o.minViews || 1000, now = o.now || Date.now();
  const ads = (adDoc && adDoc.ads) || [], comments = o.comments || [], spend = o.spend || [];
  const songs = o.songs && typeof o.songs === "object" ? o.songs : {};
  const out = [], older = [], tooFew = [];
  for (const p of posts || []) {
    const d1 = p.snaps && p.snaps.d1;
    const base = d1 || p.latest || {};
    const window = d1 ? "1 day" : p.lifetime ? "lifetime" : "so far";
    const ownC = comments.filter((c) => c && c.own && c.post === p.id && (!d1 || Date.parse(c.at) <= d1.at)).length;
    const views = n(base.views) || n(base.reach);
    if (!(views > 0)) continue; /* 0 views never rank and never wait (18 Nov 2026) */
    const rawComments = base.comments != null ? n(base.comments) : d1 ? 0 : n(p.comments);
    const nums = { likes: base.likes != null ? n(base.likes) : d1 ? 0 : n(p.likes), comments: Math.max(0, rawComments - ownC), saves: n(base.saves), shares: n(base.shares) };
    const engReported = ["likes", "comments", "saves", "shares"].every((k) => base[k] != null && base[k] !== "");
    const engaged = nums.likes + nums.comments + nums.saves + nums.shares;
    const follows = base.follows != null ? n(base.follows) : null, visits = base.profile_visits != null ? n(base.profile_visits) : null;
    const mine = ads.filter((a) => adHits(a, p));
    const readAt = Number(adDoc && adDoc.at) || 0;
    let paid = null, before = null;
    if (mine.length) {
      const s = { spend: 0, impressions: 0, reach: 0, likes: 0, comments: 0, saves: 0, shares: 0 };
      for (const a of mine) for (const k of Object.keys(s)) s[k] += n(a[k]);
      const eng = s.likes + s.comments + s.saves + s.shares;
      const first = Math.min(...mine.map((a) => Date.parse(a.created)).filter(isFinite));
      const stale = isFinite(first) && readAt > 0 && readAt < first;
      paid = { ...s, ads: mine.length, currency: (mine.find((a) => a.currency) || {}).currency || "", status: mine.some((a) => a.status === "ACTIVE") ? "ACTIVE" : mine[0].status || "",
        engaged: stale ? null : eng, rate: !stale && s.impressions ? eng / s.impressions : null, costPerEng: !stale && eng ? s.spend / eng : null,
        asOf: readAt || null, scope: "ad", stale, started: isFinite(first) ? first : null };
      /* The ads were read before this boost started. That spend is not this boost's spend. */
      if (stale) paid.spend = null;
      if (isFinite(first)) {
        const snaps = Object.entries(p.snaps || {}).filter(([, v]) => v && v.at && v.at < first && (n(v.views) || n(v.reach))).sort((a, b) => b[1].at - a[1].at);
        if (snaps.length) {
          const [k, v] = snaps[0], vw = n(v.views) || n(v.reach), e = engagedOf(v, 0);
          before = { mark: MARK_WORDS[k] || k, views: vw, engaged: e, rate: e / vw };
        }
      }
    }
    const row = { id: p.id, at: p.at, caption: p.caption || "", type: p.type || "post", link: p.link || "", ...(p.thumb ? { thumb: p.thumb } : {}), window, views, engaged, engReported, rate: views ? engaged / views : null,
      ...nums, ownComments: ownC, deep: views ? (nums.saves + nums.shares) / views : null,
      follows, followRate: follows != null && views ? follows / views : null, profileVisits: visits,
      song: songs[p.id] || songs[shortOf(p.link)] || "",
      under_1000: views < 1000, boosted: !!paid, paid, before };
    const young = now - Date.parse(p.at) < 36 * 3600000;
    const old = isFinite(Date.parse(p.at)) && now - Date.parse(p.at) > 21 * 86400000;
    /* old posts are a reference, never "waiting" (18 Nov 2026) */
    if (!old && (views < minViews || (!d1 && young))) tooFew.push(row);
    else if (d1 && !old) out.push(row);
    else older.push(row);
  }
  /* A spend row is used only when it names this post or ad. The account's day total does not.
     When the ads were read before the boost started, a later row that names the post can still fill the number. */
  const pool = out.concat(older, tooFew);
  for (const row of pool) {
    const started = row.paid && isFinite(row.paid.started) ? row.paid.started : NaN;
    const chosen = scopedSpend(row, spend, { started, pool });
    if (!chosen) continue;
    const t = spendClock(chosen);
    const freshAd = row.paid && row.paid.spend != null && !row.paid.stale && row.paid.scope === "ad";
    if (freshAd && !(directSpend(chosen, row) && t > (row.paid.asOf || 0))) continue;
    const amount = Number(chosen.amount);
    const eng = row.engReported ? row.engaged : null;
    const follows = row.follows != null ? row.follows : null;
    row.boosted = true;
    row.paid = { spend: amount, currency: chosen.currency || "USD", impressions: 0, reach: 0, likes: 0, comments: 0, saves: 0, shares: 0, ads: 1, status: "",
      engaged: eng, rate: null, costPerEng: eng > 0 ? amount / eng : null, follows, costPerFollow: follows > 0 ? amount / follows : null,
      spendOnly: true, asOf: t || null, scope: directSpend(chosen, row) ? "post" : "title", stale: false, started: isFinite(started) ? started : null };
    if (amount < 10) row.under_10 = true;
  }
  for (const row of out.concat(older)) if (row.paid && row.paid.spend != null && row.paid.spend < 10) row.under_10 = true;
  const adsRead = !!(adDoc && (Array.isArray(adDoc.ads) || adDoc.at));
  const anyJoin = (posts || []).some((p) => ads.some((a) => adHits(a, p)));
  for (const row of pool) {
    if (row.paid) { row.boost = "boosted"; continue; }
    const age = now - Date.parse(row.at);
    const oldPost = isFinite(age) && age > 21 * 86400000;
    row.boost = (!adsRead || !ads.length || !anyJoin || oldPost) ? "unknown" : "not";
    row.boosted = false;
  }
  const best = (a, b) => b.rate - a.rate || b.views - a.views;
  out.sort(best); older.sort(best);
  const gap = out.length >= 2 ? (out[0].rate - out[1].rate) * 100 : null;
  return { ranked: out, older, tooFew, adsAt: (adDoc && adDoc.at) || null, minViews,
    noClearWinner: gap != null && gap < 1, notSettled: out.length < 10, needSix: out.length < 6 };
}

/* one post in plain words */
export function rankLine(r) {
  let s = `“${r.caption || "(no caption)"}” · ${r.type} · ${String(r.at).slice(0, 10)} · ${r.window}: ${pct(r.rate)} engaged (${fmt(r.engaged)} of ${fmt(r.views)} views)` +
    ` · saves + shares ${pct(r.deep)}` + (r.follows != null ? ` · ${fmt(r.follows)} follows (${pct(r.followRate)})` : "") + (r.profileVisits != null ? ` · ${fmt(r.profileVisits)} profile visits` : "") +
    (r.ownComments ? ` · ${r.ownComments} of our own comments left out` : "");
  if (r.boost === "unknown") s += " · boost unknown";
  else if (r.paid && r.paid.stale && r.paid.spend == null) s += " · spend not read since boost started";
  else if (r.paid && r.paid.spend != null) {
    const c = r.paid.currency ? r.paid.currency + " " : "";
    const asOf = r.paid.asOf ? ` as of ${spStampOf(r.paid.asOf)}` : "";
    s += ` · boosted ${c}${r.paid.spend.toFixed(2)}${r.paid.status ? ` (${r.paid.status})` : ""}${asOf}: `;
    if (r.paid.engaged == null) s += "cost per engagement not reported";
    else if (r.paid.spendOnly) s += `${fmt(r.paid.engaged)} engagements, ${c}${r.paid.costPerEng != null ? r.paid.costPerEng.toFixed(3) + " each" : "cost per engagement not reported"}`;
    else s += `${fmt(r.paid.engaged)} engagements from the ad` + (r.paid.costPerEng != null ? `, ${c}${r.paid.costPerEng.toFixed(3)} each` : "");
    if (r.paid.costPerFollow != null) s += `, ${c}${r.paid.costPerFollow.toFixed(3)} per follow`;
  } else s += " · not boosted";
  if (r.before) s += ` · organic before the ad (${r.before.mark}): ${pct(r.before.rate)} of ${fmt(r.before.views)} views`;
  else if (r.paid) s += " · organic before the ad: not stored separately";
  s += r.song ? ` · song ${r.song}` : " · song not linked";
  if (r.under_1000) s += " · under 1,000 views";
  if (r.under_10) s += " · under USD 10";
  return s;
}
