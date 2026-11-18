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
import { SONGS } from "./songs.mjs";

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
const songName = (caption) => {
  const c = String(caption || "").toLowerCase();
  const hit = (SONGS || []).find((s) => s && s.title && c.includes(String(s.title).toLowerCase()));
  return hit ? hit.title : "";
};
const sameMedia = (a, p) => {
  const m = String((a && a.media) || ""), id = String((p && p.id) || "");
  if (!m || !id) return false;
  if (m === id) return true;
  return /^\d{8,}$/.test(m) && /^\d{8,}$/.test(id) && (m.endsWith(id) || id.endsWith(m));
};
const dayOf = (iso) => String(iso || "").slice(0, 10);
const nextDay = (d) => { const t = Date.parse(d + "T12:00:00Z"); return isFinite(t) ? new Date(t + 86400000).toISOString().slice(0, 10) : ""; };
export function rankPosts(posts, adDoc, o = {}) {
  const minViews = o.minViews || 1000, now = o.now || Date.now();
  const ads = (adDoc && adDoc.ads) || [], comments = o.comments || [], spend = o.spend || [];
  const out = [], older = [], tooFew = [];
  for (const p of posts || []) {
    const d1 = p.snaps && p.snaps.d1;
    const base = d1 || p.latest || {};
    const window = d1 ? "1 day" : p.lifetime ? "lifetime" : "so far";
    const ownC = comments.filter((c) => c && c.own && c.post === p.id && (!d1 || Date.parse(c.at) <= d1.at)).length;
    const views = n(base.views) || n(base.reach);
    const rawComments = base.comments != null ? n(base.comments) : d1 ? 0 : n(p.comments);
    const nums = { likes: base.likes != null ? n(base.likes) : d1 ? 0 : n(p.likes), comments: Math.max(0, rawComments - ownC), saves: n(base.saves), shares: n(base.shares) };
    const engaged = nums.likes + nums.comments + nums.saves + nums.shares;
    const follows = base.follows != null ? n(base.follows) : null, visits = base.profile_visits != null ? n(base.profile_visits) : null;
    const mine = ads.filter((a) => sameMedia(a, p));
    let paid = null, before = null;
    if (mine.length) {
      const s = { spend: 0, impressions: 0, reach: 0, likes: 0, comments: 0, saves: 0, shares: 0 };
      for (const a of mine) for (const k of Object.keys(s)) s[k] += n(a[k]);
      const eng = s.likes + s.comments + s.saves + s.shares;
      paid = { ...s, ads: mine.length, currency: (mine.find((a) => a.currency) || {}).currency || "", status: mine.some((a) => a.status === "ACTIVE") ? "ACTIVE" : mine[0].status || "",
        engaged: eng, rate: s.impressions ? eng / s.impressions : null, costPerEng: eng ? s.spend / eng : null };
      const first = Math.min(...mine.map((a) => Date.parse(a.created)).filter(isFinite));
      if (isFinite(first)) {
        const snaps = Object.entries(p.snaps || {}).filter(([, v]) => v && v.at && v.at < first && (n(v.views) || n(v.reach))).sort((a, b) => b[1].at - a[1].at);
        if (snaps.length) {
          const [k, v] = snaps[0], vw = n(v.views) || n(v.reach), e = engagedOf(v, 0);
          before = { mark: MARK_WORDS[k] || k, views: vw, engaged: e, rate: e / vw };
        }
      }
    }
    const row = { id: p.id, at: p.at, caption: p.caption || "", type: p.type || "post", link: p.link || "", window, views, engaged, rate: views ? engaged / views : null,
      ...nums, ownComments: ownC, deep: views ? (nums.saves + nums.shares) / views : null,
      follows, followRate: follows != null && views ? follows / views : null, profileVisits: visits, song: songName(p.caption),
      under_1000: views < 1000, boosted: !!paid, paid, before };
    const young = now - Date.parse(p.at) < 36 * 3600000;
    const old = isFinite(Date.parse(p.at)) && now - Date.parse(p.at) > 21 * 86400000;
    if (views < minViews || (!d1 && young)) tooFew.push(row);
    else if (d1 && !old) out.push(row);
    else older.push(row);
  }
  /* a Meta spend row the day of the post or the next day, when no ad creative matched (18 Nov 2026) */
  const claimed = new Set();
  for (const row of out.concat(older, tooFew)) {
    if (row.paid) continue;
    const day = dayOf(row.at), nxt = nextDay(day);
    const hits = spend.filter((s) => s && (s.date === day || s.date === nxt) && /meta|facebook|instagram/i.test(s.platform || "Meta") && Number(s.amount) > 0 && !claimed.has(s));
    const postsThatDay = out.concat(older, tooFew).filter((r) => !r.paid && (dayOf(r.at) === day || nextDay(dayOf(r.at)) === (hits[0] && hits[0].date)));
    if (hits.length === 1 && postsThatDay.length === 1 && postsThatDay[0] === row) {
      const s = hits[0];
      claimed.add(s);
      row.boosted = true;
      row.paid = { spend: Number(s.amount), currency: s.currency || "USD", impressions: 0, reach: 0, likes: 0, comments: 0, saves: 0, shares: 0, ads: 1, status: "", engaged: 0, rate: null, costPerEng: null, spendOnly: true };
      row.under_10 = Number(s.amount) < 10;
    }
  }
  for (const row of out.concat(older)) if (row.paid && row.paid.spend < 10) row.under_10 = true;
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
  if (r.paid) {
    const c = r.paid.currency || "";
    s += ` · boosted ${c} ${r.paid.spend.toFixed(2)}${r.paid.status ? ` (${r.paid.status})` : ""}: ` +
      (r.paid.spendOnly ? "engagements not on this spend row" : `${fmt(r.paid.engaged)} engagements from the ad`) +
      (r.paid.costPerEng != null ? `, ${c} ${r.paid.costPerEng.toFixed(3)} each` : "");
  } else s += " · not boosted";
  if (r.before) s += ` · before the ad (${r.before.mark}): ${pct(r.before.rate)} of ${fmt(r.before.views)} views`;
  if (r.song) s += ` · song ${r.song}`;
  if (r.under_1000) s += " · under 1,000 views";
  if (r.under_10) s += " · under USD 10";
  return s;
}
