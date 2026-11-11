/* Meta ad spend for /admin's cost per tap (10 Nov 2026). READ-ONLY: one kind of request, a GET
   to the Ads Insights API. Nothing here can create, change or pause anything in Meta.

   Netlify env (Luke adds them; never in the repo):
     META_ADS_TOKEN       a token that can READ the ad account's insights (ads_read)
     META_AD_ACCOUNT_ID   230002830106369 (the default below if unset)
   No token -> /admin shows a quiet "Meta spend not connected" line. The token goes in the
   Authorization header (never in a URL), is never logged and never stored. Answers are cached in
   the Blob store "meta-cache" for an hour (netlify/functions/admin.mjs).

   Matching: the ads link to our pages with utm_content={{ad.name}}, so an ad's spend belongs to
   the visits whose utm_content is that ad's name. Both sides go through adKey() (accents off,
   letters and digits only) because the page stores a cleaned-up utm_content. An ad nobody has
   visited from yet is matched to a song by its campaign / ad set / ad name containing the song's
   title or slug; anything still unmatched is shown as "not matched to a song". Spend is shown in
   the ad account's own currency (account_currency), never converted. Meta's days are the ad
   account's days; ours are São Paulo days. */
import { GRAPH_VERSION, scrub } from "./capi.mjs";

export const DEFAULT_ACCOUNT = "230002830106369";
export const CACHE_MS = 60 * 60 * 1000;

export function adKey(s) {
  let v = String(s || "");
  try { v = v.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch {}
  return v.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40);
}

/* level "ad" for cost per tap; level "account" for the monthly cap (the WHOLE ad account, so
   boosts made in the Instagram app count too). */
export function insightsRequest(account, since, until, level = "ad") {
  const q = new URLSearchParams({
    level,
    time_increment: "1",
    fields: level === "account" ? "spend,account_currency" : "ad_name,adset_name,campaign_name,spend,account_currency",
    time_range: JSON.stringify({ since, until }),
    limit: "500",
  });
  return `https://graph.facebook.com/${GRAPH_VERSION}/act_${String(account).replace(/\D/g, "")}/insights?${q}`;
}

/* GET every page of the answer. fetchImpl is injectable for tests. Returns { rows } or { error }. */
export async function fetchInsights(token, account, since, until, fetchImpl = fetch, level = "ad") {
  let url = insightsRequest(account, since, until, level);
  const rows = [];
  for (let page = 0; url && page < 20; page++) {
    let res, json;
    try {
      res = await fetchImpl(url, { method: "GET", headers: { Authorization: "Bearer " + token }, signal: AbortSignal.timeout(8000) });
      json = await res.json().catch(() => null);
    } catch (e) {
      return { error: e?.name === "TimeoutError" ? "Meta didn't answer in time" : "Couldn't reach Meta" };
    }
    if (!res.ok || !json || !Array.isArray(json.data)) {
      const err = (json && json.error) || {};
      return { error: scrub(`${err.message || "Meta said no"} (HTTP ${res.status}${err.code ? ", code " + err.code : ""})`) };
    }
    for (const r of json.data) {
      rows.push({
        day: r.date_start, ad: r.ad_name || "", adset: r.adset_name || "", campaign: r.campaign_name || "",
        spend: Number(r.spend) || 0, currency: r.account_currency || "",
      });
    }
    url = json.paging && json.paging.next ? json.paging.next.replace(/([?&])access_token=[^&]*&?/, "$1") : "";
  }
  return { rows };
}

/* rows: from fetchInsights. songs: [{id, title, taps, tapsByAd: {adKey: taps}, tapsByDay: {day: taps}}]
   (one per page in the link picker; the home page has no ads). current: the id shown in /admin. */
export function spendReport(rows, songs, current) {
  const currency = (rows.find((r) => r.currency) || {}).currency || "";
  const owner = (r) => {
    const k = adKey(r.ad);
    const seen = songs.find((s) => s.tapsByAd && k in s.tapsByAd);
    if (seen) return seen.id;
    const hay = adKey(r.campaign + " " + r.adset + " " + r.ad);
    const named = songs.find((s) => s.title && (hay.includes(adKey(s.title)) || hay.includes(adKey(s.id))));
    return named ? named.id : "";
  };
  const per = {}, allDays = {}; let total = 0, unmatched = 0;
  for (const r of rows) {
    total += r.spend;
    allDays[r.day] = (allDays[r.day] || 0) + r.spend;
    const id = owner(r);
    if (!id) { unmatched += r.spend; continue; }
    const p = per[id] || (per[id] = { spend: 0, ads: {}, days: {} });
    p.spend += r.spend;
    const k = adKey(r.ad);
    const a = p.ads[k] || (p.ads[k] = { ad: r.ad, spend: 0 });
    a.spend += r.spend;
    p.days[r.day] = (p.days[r.day] || 0) + r.spend;
  }
  const cpt = (spend, taps) => (taps && spend ? spend / taps : null);
  const cur = songs.find((s) => s.id === current) || { tapsByAd: {}, tapsByDay: {}, taps: 0 };
  const mine = per[current] || { spend: 0, ads: {}, days: {} };
  const days = [...new Set([...Object.keys(mine.days), ...Object.keys(cur.tapsByDay || {}).filter((d) => mine.days[d] != null)])].sort();
  return {
    connected: true,
    currency,
    total: round(total),
    unmatched: round(unmatched),
    song: { spend: round(mine.spend), taps: cur.taps || 0, cpt: cpt(mine.spend, cur.taps) },
    ads: Object.entries(mine.ads).map(([k, a]) => {
      const taps = (cur.tapsByAd || {})[k] || 0;
      return { ad: a.ad, spend: round(a.spend), taps, cpt: cpt(a.spend, taps) };
    }).sort((x, y) => y.spend - x.spend),
    days: days.map((d) => {
      const taps = (cur.tapsByDay || {})[d] || 0;
      return { d, spend: round(mine.days[d] || 0), taps, cpt: cpt(mine.days[d] || 0, taps) };
    }),
    /* every song together, per day: all spend (matched or not) against all real Spotify taps */
    allDays: [...new Set([...Object.keys(allDays), ...songs.flatMap((s) => Object.keys(s.tapsByDay || {}))])].sort().map((d) => {
      const taps = songs.reduce((n, s) => n + ((s.tapsByDay || {})[d] || 0), 0);
      return { d, spend: round(allDays[d] || 0), taps, cpt: cpt(allDays[d] || 0, taps) };
    }),
    songs: songs.filter((s) => s.title).map((s) => {
      const sp = (per[s.id] || {}).spend || 0;
      return { id: s.id, title: s.title, spend: round(sp), taps: s.taps || 0, cpt: cpt(sp, s.taps) };
    }),
  };
}

/* ---------- the monthly ad cap (README rule 12 in badscandal-hq, Luke 11 Nov 2026) ----------
   USD 1,000 per calendar month for all ads together; warn at 750, everything switched off at 900.
   This only DISPLAYS where Meta's ad account stands: nothing here pauses or changes anything.
   Google and TikTok bill in EUR and are logged by the bots in the Ads Tracker, not here. Currencies
   are never converted: if the ad account isn't in the cap's currency, the page says so. */
export const MONTHLY_CAP = { amount: 1000, warn: 750, stop: 900, currency: "USD" };

/* rows: fetchInsights(..., "account") for the 1st of the month .. today. today: "YYYY-MM-DD". */
export function capReport(rows, today, cap = MONTHLY_CAP) {
  const currency = (rows.find((r) => r.currency) || {}).currency || cap.currency;
  const byDay = {};
  for (const r of rows) byDay[r.day] = (byDay[r.day] || 0) + r.spend;
  const days = Object.keys(byDay).sort().map((d) => ({ d, spend: round(byDay[d]) }));
  const spent = round(days.reduce((n, r) => n + r.spend, 0));
  const [y, m, dd] = today.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  /* pace = the last 3 FULL calendar days (today is partial; a paused day counts as 0) */
  const back = (k) => new Date(Date.UTC(y, m - 1, dd - k)).toISOString().slice(0, 10);
  const recent = [1, 2, 3].map(back).filter((d) => d.slice(0, 7) === today.slice(0, 7));
  const perDay = recent.length ? recent.reduce((n, d) => n + (byDay[d] || 0), 0) / recent.length : 0;
  const sameCurrency = currency === cap.currency;
  const status = !sameCurrency ? "currency" : spent >= cap.amount ? "over" : spent >= cap.stop ? "stop" : spent >= cap.warn ? "warn" : "ok";
  /* at the recent pace, on which day of the month would the stop line be reached? */
  const stopDay = sameCurrency && perDay > 0 && spent < cap.stop ? Math.min(daysInMonth + 1, dd + Math.ceil((cap.stop - spent) / perDay)) : null;
  return {
    month: today.slice(0, 7), currency, cap: cap.amount, warn: cap.warn, stop: cap.stop, capCurrency: cap.currency,
    spent, left: round(cap.amount - spent), pct: Math.round((spent / cap.amount) * 1000) / 10,
    status, perDay: round(perDay), stopDay: stopDay && stopDay <= daysInMonth ? stopDay : null, days,
  };
}

function round(n) { return Math.round(n * 100) / 100; }
