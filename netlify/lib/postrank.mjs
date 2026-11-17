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

/* posts: instagram.mjs posts.json; adDoc: adposts.json. -> { ranked (best first), tooFew, adsAt } */
export function rankPosts(posts, adDoc, o = {}) {
  const minViews = o.minViews || 300;
  const ads = (adDoc && adDoc.ads) || [];
  const out = [], tooFew = [];
  for (const p of posts || []) {
    const l = p.latest || {};
    const views = n(l.views) || n(l.reach);
    const nums = { likes: l.likes != null ? l.likes : p.likes, comments: l.comments != null ? l.comments : p.comments, saves: l.saves, shares: l.shares };
    const engaged = engagedOf(nums);
    const mine = ads.filter((a) => a.media === p.id);
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
    const row = { id: p.id, at: p.at, caption: p.caption || "", type: p.type || "post", link: p.link || "", views, engaged, rate: views ? engaged / views : null,
      likes: n(nums.likes), comments: n(nums.comments), saves: n(nums.saves), shares: n(nums.shares), boosted: !!paid, paid, before };
    (views >= minViews ? out : tooFew).push(row);
  }
  out.sort((a, b) => b.rate - a.rate || b.views - a.views);
  return { ranked: out, tooFew, adsAt: (adDoc && adDoc.at) || null, minViews };
}

/* one post in plain words */
export function rankLine(r) {
  let s = `“${r.caption || "(no caption)"}” · ${r.type} · ${String(r.at).slice(0, 10)} · ${pct(r.rate)} engaged (${fmt(r.engaged)} of ${fmt(r.views)} views)`;
  if (r.paid) {
    const c = r.paid.currency || "";
    s += ` · boosted ${c} ${r.paid.spend.toFixed(2)}${r.paid.status ? ` (${r.paid.status})` : ""}: ${fmt(r.paid.engaged)} engagements from the ad` +
      (r.paid.costPerEng != null ? `, ${c} ${r.paid.costPerEng.toFixed(3)} each` : "");
  } else s += " · not boosted";
  if (r.before) s += ` · before the ad (${r.before.mark}): ${pct(r.before.rate)} of ${fmt(r.before.views)} views`;
  return s;
}
