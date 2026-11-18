/* Scheduled HQ jobs (automation, phase 1). Each one writes to the desk only when
   something changed or a check failed, and the same result is not written twice.
   No ad is changed. No Instagram or Meta call is made. No message leaves the desk
   except a bot's own webhook, and only when Luke has pasted that address. */
import * as S from "./staff.mjs";
import * as C from "./action-cards.mjs";
import { pingNames } from "./desk-push.mjs";
import { rankPosts } from "./postrank.mjs";
import { SONGS } from "./songs.mjs";

export const ARTIST_ID = "29kaubgb6Esvwu0idVndGy";
export const STATE_KEY = "auto-state.json";
const BAD_LINK = /pre-?save|ffm\.to|feature\.fm|music\.badscandal\.com/i;
const ORIGIN = "https://badscandal.com";

const wdFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" });
export const spWeekday = (ts) => wdFmt.format(ts);
const prevMonth = (m) => { const y = Number(m.slice(0, 4)), n = Number(m.slice(5, 7)); return n === 1 ? `${y - 1}-12` : `${y}-${String(n - 1).padStart(2, "0")}`; };
const untilNoon = (day) => { const [y, m, d] = day.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + 1, 15, 0, 0)).toISOString(); };

export function artistOpen() { return `https://open.spotify.com/artist/${ARTIST_ID}`; }
export function artistEmbed() { return `https://open.spotify.com/embed/artist/${ARTIST_ID}`; }
export function trackOpen(id) { return `https://open.spotify.com/track/${id}`; }
export function oembedUrl(open) { return "https://open.spotify.com/oembed?url=" + encodeURIComponent(open); }

function unescapeName(s) {
  try { return JSON.parse(`"${s}"`); } catch { return s; }
}
export function tracksFromHtml(html) {
  const s = String(html || "");
  const found = new Map();
  const add = (id, title) => {
    if (!/^[A-Za-z0-9]{22}$/.test(id || "")) return;
    const prev = found.get(id) || "";
    if (!found.has(id)) found.set(id, title || "");
    else if (title && !prev) found.set(id, title);
  };
  let m;
  const named = /"name"\s*:\s*"((?:\\.|[^"\\]){0,160})"\s*,\s*"uri"\s*:\s*"spotify:track:([A-Za-z0-9]{22})"/g;
  while ((m = named.exec(s))) add(m[2], unescapeName(m[1]));
  const named2 = /"uri"\s*:\s*"spotify:track:([A-Za-z0-9]{22})"[\s\S]{0,180}?"name"\s*:\s*"((?:\\.|[^"\\]){0,160})"/g;
  while ((m = named2.exec(s))) add(m[1], unescapeName(m[2]));
  const any = /spotify:track:([A-Za-z0-9]{22})|open\.spotify\.com\/track\/([A-Za-z0-9]{22})/g;
  while ((m = any.exec(s))) add(m[1] || m[2], "");
  return [...found].map(([id, title]) => ({ id, title }));
}
export function sameTitle(a, b) {
  const n = (t) => String(t || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const x = n(a), y = n(b);
  return x.length > 1 && x === y;
}
export function readOembed(json) {
  if (!json || typeof json !== "object") return null;
  const authorUrl = String(json.author_url || "");
  const id = /artist\/([A-Za-z0-9]{22})/.exec(authorUrl);
  return { title: String(json.title || ""), author: String(json.author_name || ""), authorUrl, artistId: id ? id[1] : "" };
}
/* ours | other | no. A different artist id is a red flag, never a link we propose. */
export function whoseTrack(song, oem) {
  if (!oem || !sameTitle(song, oem.title)) return "no";
  if (oem.artistId === ARTIST_ID || /^badscandal$/i.test(String(oem.author || "").trim())) return "ours";
  if (oem.artistId || oem.author) return "other";
  return "no";
}

export function pageProblems(page) {
  const name = page.name || "page";
  const out = [];
  if (page.status !== 200) out.push(`${name}: HTTP ${page.status || "no answer"}`);
  const body = String(page.body || "");
  if (BAD_LINK.test(body)) out.push(`${name}: a pre-save or Feature.fm link`);
  if (page.title && !new RegExp(page.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(body)) out.push(`${name}: title not found`);
  if (page.cover && !/og:image|class="cover"|class='cover'|rel="cta"|data-rel="cta"/i.test(body) && !/assets\/.+\.(jpg|jpeg|webp|png)/i.test(body)) out.push(`${name}: no cover`);
  if (page.listen && !/listen on spotify|follow on spotify|id="sp"|data-rel="cta"/i.test(body)) out.push(`${name}: no Listen button`);
  return out;
}
export function listenProblems(status, body) {
  if (status !== 200) return [`listen.json: HTTP ${status || "no answer"}`];
  let j;
  try { j = JSON.parse(String(body || "")); } catch { return ["listen.json: not JSON"]; }
  const out = [];
  if (BAD_LINK.test(JSON.stringify(j))) out.push("listen.json: a pre-save or Feature.fm link");
  const rel = j.release || {};
  if (!rel.title) out.push("listen.json: no title");
  if (!rel.cover) out.push("listen.json: no cover");
  const cta = String(rel.cta || (j.links && j.links.spotify) || "");
  if (!/^https:\/\/open\.spotify\.com\//.test(cta)) out.push("listen.json: no Listen link");
  return out;
}

/* account totals only (a row that names a song is that song's, not the month).
   A non-USD amount is not converted. A gap is not treated as zero. */
export function capFromRows(rows, month) {
  const list = (rows || []).filter((r) => r && String(r.date || "").startsWith(month) && !r.song);
  if (!list.length) return { level: "unread", spent: null, why: "no account totals on the desk for this month" };
  const foreign = list.filter((r) => r.amount != null && r.currency && r.currency !== "USD");
  if (foreign.length) return { level: "unread", spent: null, why: "a recorded amount is not in USD, and HQ does not convert it" };
  const gaps = list.filter((r) => r.amount == null);
  const nums = list.filter((r) => r.amount != null);
  if (!nums.length) return { level: "unread", spent: null, why: "spend was not read" };
  const spent = Math.round(nums.reduce((n, r) => n + Number(r.amount), 0) * 100) / 100;
  if (gaps.length) return { level: "unread", spent, why: "some days were not read, so the total is not used for the 750 or 900 line" };
  const level = spent >= 900 ? "stop" : spent >= 750 ? "warn" : "ok";
  return { level, spent, currency: "USD", why: "" };
}

export function mondayDraft(ranking) {
  const ranked = ((ranking && ranking.ranked) || []).filter((r) => r && Number(r.views) >= 1000 && r.rate != null && !r.under_1000);
  if (!ranked.length) return { ok: false, why: "no post with at least 1,000 views and a 1-day number" };
  const sorted = ranked.slice().sort((a, b) => {
    if (b.rate !== a.rate) return b.rate - a.rate;
    const ba = (a.before && a.before.rate) || 0, bb = (b.before && b.before.rate) || 0;
    if (bb !== ba) return bb - ba;
    const ca = a.paid && a.paid.costPerEng != null ? a.paid.costPerEng : Infinity;
    const cb = b.paid && b.paid.costPerEng != null ? b.paid.costPerEng : Infinity;
    return ca - cb;
  });
  const one = (r) => ({
    caption: String(r.caption || "").split("\n")[0].slice(0, 80) || "a post",
    link: /^https:\/\//.test(r.link || "") ? r.link : "",
    rate: r.rate,
    before: r.before && r.before.rate != null ? "strong before the ad" : "before the ad: not read",
    cost: r.paid && r.paid.costPerEng != null ? "reported" : "not reported",
  });
  const settled = !(ranking && ranking.notSettled) && ranked.length >= 10;
  return { ok: true, settled, pick: one(sorted[0]), runner: sorted[1] ? one(sorted[1]) : null };
}
export function mondayText(draft) {
  if (!draft || !draft.ok) return "Monday pick: the ranking could not be read, so no post was chosen.";
  const p = draft.pick;
  const head = draft.settled ? "Monday draft, for review." : "Monday draft. The order is not settled yet (fewer than 10 ranked posts).";
  return `${head} ${p.caption}. Highest engagement per view, at least 1,000 views. ${p.before}. Cost per engagement: ${p.cost}. No amount is chosen. HQ does not change ads.`;
}

async function getState(store) {
  const { data } = await S.readDoc(store, STATE_KEY, {});
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}
async function putState(store, fn) {
  return S.mutate(store, STATE_KEY, {}, (doc) => {
    const d = doc && typeof doc === "object" && !Array.isArray(doc) ? doc : {};
    const value = fn(d) || d;
    return { replace: d, value };
  });
}
async function say(store, now, roster, fetchImpl, { to, text, needs, key }) {
  const state = await getState(store);
  const notes = state.notes || {};
  if (notes[key] === text) return { wrote: false };
  const message = (await S.sendMessage(store, now, roster, { from: "HQ", to, text, needs: needs || "none" })).message;
  await putState(store, (d) => { d.notes = { ...(d.notes || {}), [key]: text }; return d; });
  await pingNames(store, now, [to], { kind: "message", id: message.id }, fetchImpl);
  return { wrote: true, id: message.id };
}

async function fetchText(fetchImpl, url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  try {
    const res = await fetchImpl(url, { redirect: "follow", signal: ac.signal, headers: { "user-agent": "badscandal-hq-check" } });
    const body = await res.text();
    return { status: res.status, body: body.slice(0, 500000), url: res.url || url };
  } catch (e) {
    return { status: 0, body: "", error: e && e.name === "AbortError" ? "timed out" : "couldn't reach it" };
  } finally { clearTimeout(t); }
}

export async function runSiteCheck(store, now, roster, o) {
  const fetchImpl = o.fetch;
  const origin = o.origin || ORIGIN;
  const songs = o.songs || SONGS;
  const day = S.spDay(now);
  const state = await getState(store);
  if (state.site && state.site.day === day && state.site.sig) return { wrote: false, skipped: "already" };
  if (S.spHM(now) < "09:00") return { wrote: false, skipped: "before 09:00" };
  const problems = [];
  const home = await fetchText(fetchImpl, origin + "/");
  problems.push(...pageProblems({ name: "home", status: home.status, body: home.body, title: "BADSCANDAL", cover: true, listen: true }));
  const listen = await fetchText(fetchImpl, origin + "/listen.json");
  problems.push(...listenProblems(listen.status, listen.body));
  for (const song of songs) {
    const page = await fetchText(fetchImpl, origin + "/" + song.slug);
    problems.push(...pageProblems({ name: "/" + song.slug, status: page.status, body: page.body, title: song.title, cover: true, listen: true }));
  }
  const sig = problems.length ? problems.join(" | ") : "ok";
  if (state.site && state.site.sig === sig) {
    await putState(store, (d) => { d.site = { day, sig, at: new Date(now).toISOString() }; return d; });
    return { wrote: false, skipped: "same" };
  }
  await putState(store, (d) => { d.site = { day, sig, at: new Date(now).toISOString() }; return d; });
  if (!problems.length) {
    if (state.site && state.site.sig && state.site.sig !== "ok") {
      await say(store, now, roster, fetchImpl, { to: "Webmaster", needs: "none", key: "site:" + day + ":ok", text: "Site check is clear again." });
      return { wrote: true, ok: true };
    }
    return { wrote: false, ok: true };
  }
  const text = "Site check failed: " + problems.slice(0, 8).join("; ") + (problems.length > 8 ? ` (+${problems.length - 8} more)` : "");
  await say(store, now, roster, fetchImpl, { to: "Webmaster", needs: "action", key: "site:" + sig, text });
  return { wrote: true, ok: false, problems };
}

export async function runCapCheck(store, now, roster, o) {
  const month = S.spDay(now).slice(0, 7);
  const rows = o.spend || await S.listSpend(store, now);
  const cap = capFromRows(rows, month);
  const state = await getState(store);
  const prev = state.cap && state.cap.month === month ? state.cap : { level: "", cardId: "" };
  if (cap.level === "unread") {
    if (prev.unread === cap.why) return { wrote: false, level: "unread" };
    await putState(store, (d) => { d.cap = { month, level: "unread", unread: cap.why, cardId: prev.cardId || "" }; return d; });
    await say(store, now, roster, o.fetch, { to: "Forge", needs: "none", key: "cap-unread:" + month + ":" + cap.why, text: "Ad-cap check: " + cap.why + " HQ did not raise the 750 or 900 line." });
    return { wrote: true, level: "unread" };
  }
  if (prev.level === cap.level) return { wrote: false, level: cap.level };
  await putState(store, (d) => { d.cap = { month, level: cap.level, cardId: prev.cardId || "", unread: "" }; return d; });
  if (cap.level === "ok") return { wrote: false, level: "ok" };
  if (cap.level === "warn" || cap.level === "stop") {
    const text = cap.level === "stop"
      ? "Ad spend on the desk has reached the 900 line. A card is with Luke: switch all ads off? HQ will not change an ad."
      : "Ad spend on the desk has reached the 750 line. HQ will not change an ad.";
    await say(store, now, roster, o.fetch, { to: "Nova", needs: "none", key: "cap-" + cap.level + ":" + month, text });
    await say(store, now, roster, o.fetch, { to: "Alfred", needs: "none", key: "cap-" + cap.level + "-alfred:" + month, text });
  }
  if (cap.level === "stop" && !prev.cardId) {
    const card = await C.saveCard(store, now, roster, {
      by: "HQ", owner: "Forge", kind: "ads", dedupe_key: "cap-stop-" + month, action: "switch all ads off",
      text: "Switch all ads off?",
      preview: "Switch all ads off? HQ will not change an ad. Yes means you switch them off yourself.",
      deadline: S.spDay(now), expires_at: untilNoon(S.spDay(now)), money_at_risk: false,
    });
    await putState(store, (d) => { d.cap = { ...(d.cap || {}), month, level: "stop", cardId: card.id }; return d; });
    return { wrote: true, level: "stop", cardId: card.id };
  }
  return { wrote: true, level: cap.level };
}

export async function judgeRelease(song, html, oembeds) {
  const tracks = tracksFromHtml(html);
  const named = tracks.filter((t) => t.title);
  const matched = named.filter((t) => sameTitle(song, t.title));
  const pool = matched.length ? matched : named.length ? [] : tracks.slice(0, 6);
  let other = null;
  for (const t of pool) {
    const oem = oembeds[t.id];
    const w = whoseTrack(song, oem);
    if (w === "ours") return { state: "ours", id: t.id, link: trackOpen(t.id) };
    if (w === "other" && !other) other = { state: "other", id: t.id, author: oem.author || "" };
  }
  if (!pool.length) return { state: "missing" };
  return other || { state: "missing" };
}

export async function runReleaseWatch(store, now, roster, o) {
  const day = S.spDay(now);
  const releases = (o.releases || await S.listReleases(store)).filter((r) => r && r.status === "scheduled" && r.date === day && !(r.pack && r.pack.spotifyTrack));
  if (!releases.length) return { wrote: false, skipped: "no release today" };
  const fetchImpl = o.fetch;
  if (typeof fetchImpl !== "function") return { wrote: false, skipped: "no fetch" };
  const state = await getState(store);
  const tracks = { ...(state.tracks || {}) };
  const wrote = [];
  for (const r of releases) {
    const key = r.id || r.title;
    if (tracks[key] && (tracks[key].state === "ours" || tracks[key].state === "other")) continue;
    const page = await fetchText(fetchImpl, artistOpen());
    const embed = await fetchText(fetchImpl, artistEmbed());
    if (page.status !== 200 && embed.status !== 200) {
      if (tracks[key] && tracks[key].failDay === day) continue;
      tracks[key] = { state: "fail", failDay: day };
      await putState(store, (d) => { d.tracks = { ...(d.tracks || {}), [key]: tracks[key] }; return d; });
      await say(store, now, roster, fetchImpl, { to: "Atlas", needs: "none", key: "spot-fail:" + key + ":" + day, text: `${r.title}: the public Spotify page could not be read today. HQ did not guess a link.` });
      wrote.push(key);
      continue;
    }
    const html = (page.body || "") + "\n" + (embed.body || "");
    const parsed = tracksFromHtml(html);
    const named = parsed.filter((t) => t.title);
    const matched = named.filter((t) => sameTitle(r.title, t.title));
    const pool = (matched.length ? matched : named.length ? [] : parsed.slice(0, 6)).slice(0, 6);
    const oembeds = {};
    for (const t of pool) {
      const res = await fetchText(fetchImpl, oembedUrl(trackOpen(t.id)));
      if (res.status !== 200) continue;
      try { oembeds[t.id] = readOembed(JSON.parse(res.body)); } catch { /* not oEmbed */ }
    }
    const found = await judgeRelease(r.title, html, oembeds);
    if (found.state === "missing") continue;
    if (found.state === "other") {
      const card = await C.saveCard(store, now, roster, {
        by: "HQ", owner: "Atlas", kind: "track", dedupe_key: "track-other-" + key, action: "flag another profile",
        text: `${r.title} showed on another Spotify profile. HQ did not save that link.`,
        preview: `${r.title} is on another profile. HQ did not propose a link.`,
        deadline: day, expires_at: untilNoon(day), money_at_risk: false,
      });
      tracks[key] = { state: "other", at: new Date(now).toISOString(), cardId: card.id };
      await putState(store, (d) => { d.tracks = { ...(d.tracks || {}), [key]: tracks[key] }; return d; });
      await say(store, now, roster, fetchImpl, { to: "Atlas", needs: "action", key: "spot-other:" + key, text: `${r.title}: a public Spotify page names a different artist. HQ did not put that link on a song page.` });
      wrote.push(card.id);
      continue;
    }
    const card = await C.saveCard(store, now, roster, {
      by: "HQ", owner: "Webmaster", kind: "track", dedupe_key: "track-ours-" + key, action: "put the spotify link on the song page",
      text: `Put this Spotify link on the song page: ${found.link}`,
      preview: `${r.title} is on our Spotify profile. ${found.link}`,
      link: found.link, deadline: day, expires_at: untilNoon(day), money_at_risk: false,
    });
    tracks[key] = { state: "ours", link: found.link, at: new Date(now).toISOString(), cardId: card.id };
    await putState(store, (d) => { d.tracks = { ...(d.tracks || {}), [key]: tracks[key] }; return d; });
    const note = `${r.title} is on our Spotify profile. Luke has a card for the link. Wait for his yes. HQ did not change the page.`;
    await say(store, now, roster, fetchImpl, { to: "Webmaster", needs: "none", key: "spot-ours-web:" + key, text: note });
    await say(store, now, roster, fetchImpl, { to: "Forge", needs: "none", key: "spot-ours-forge:" + key, text: note });
    wrote.push(card.id);
  }
  return { wrote: wrote.length > 0, ids: wrote };
}

export async function runMonthJob(store, now, roster, o) {
  const day = S.spDay(now);
  if (!day.endsWith("-01")) return { wrote: false, skipped: "not the 1st" };
  const month = prevMonth(day.slice(0, 7));
  const state = await getState(store);
  const prev = state.month && state.month.month === month ? state.month : {};
  if (prev.cardId || prev.closed) return { wrote: false, skipped: "done" };
  const closed = await S.getMonthClose(store, month);
  if (closed) {
    await putState(store, (d) => { d.month = { month, closed: true }; return d; });
    return { wrote: false, skipped: "already closed" };
  }
  const check = o.monthCheck ? await o.monthCheck(month) : await S.monthCheck(store, now, { month });
  if (!check.ready) {
    if (prev.noted) return { wrote: false, skipped: "already noted" };
    await putState(store, (d) => { d.month = { month, noted: true }; return d; });
    const n = (check.toSort || []).length, w = (check.waiting || []).length;
    await say(store, now, roster, o.fetch, { to: "Ledger", needs: "action", key: "month-wait:" + month, text: `${month} is not ready to close: ${n} to sort, ${w} still in Wise or PayPal. HQ did not close it.` });
    return { wrote: true, ready: false };
  }
  const card = await C.saveCard(store, now, roster, {
    by: "HQ", owner: "Ledger", kind: "month", dedupe_key: "close-" + month, action: "close the month",
    text: `Close ${month}?`,
    preview: `Close ${month}? month_check says it is ready. Yes asks Ledger to close it. HQ does not move money.`,
    deadline: day, expires_at: untilNoon(day), money_at_risk: false,
  });
  await putState(store, (d) => { d.month = { month, cardId: card.id }; return d; });
  return { wrote: true, ready: true, cardId: card.id };
}

export async function runMonday(store, now, roster, o) {
  const day = S.spDay(now);
  if (spWeekday(now) !== "Mon" || S.spHM(now) < "09:00") return { wrote: false, skipped: "not Monday morning" };
  const state = await getState(store);
  if (state.monday && state.monday.day === day) return { wrote: false, skipped: "already" };
  let ranking = o.ranking;
  if (!ranking && o.ig && typeof o.ig.get === "function") {
    const posts = await o.ig.get("posts.json", { type: "json" }).catch(() => null);
    const ads = await o.ig.get("adposts.json", { type: "json" }).catch(() => null);
    const comments = await o.ig.get("comments.json", { type: "json" }).catch(() => null);
    if (posts) ranking = rankPosts(posts, ads, { comments: comments || [], now, spend: o.spend || [] });
  }
  const draft = ranking ? mondayDraft(ranking) : { ok: false, why: "Instagram numbers were not on the desk" };
  const text = draft.ok ? mondayText(draft) : "Monday pick: " + draft.why + ". No post was chosen and no amount was set. HQ does not change ads.";
  await say(store, now, roster, o.fetch, { to: "Nova", needs: "none", key: "monday-nova:" + day, text });
  await say(store, now, roster, o.fetch, { to: "Forge", needs: "none", key: "monday-forge:" + day, text });
  if (!draft.ok) {
    await putState(store, (d) => { d.monday = { day, at: new Date(now).toISOString() }; return d; });
    return { wrote: true, card: false };
  }
  const card = await C.saveCard(store, now, roster, {
    by: "HQ", owner: "Forge", kind: "monday", dedupe_key: "monday-" + day, action: "review the monday ad pick", money_at_risk: false, expires_at: untilNoon(day),
    text: draft.settled ? `Use "${draft.pick.caption}" for the next ad money? No amount is chosen.` : `Draft only: "${draft.pick.caption}". The order is not settled yet. No amount is chosen.`,
    preview: text,
    ...(draft.pick.link ? { link: draft.pick.link } : {}),
    deadline: day,
  });
  await putState(store, (d) => { d.monday = { day, at: new Date(now).toISOString(), cardId: card.id }; return d; });
  return { wrote: true, cardId: card.id, settled: draft.settled };
}

export async function runAuto(o) {
  const store = o.store, now = o.now || Date.now();
  const roster = o.roster || await S.getRoster(store);
  const out = {};
  const step = async (name, fn) => {
    try { out[name] = await fn(); }
    catch (e) {
      out[name] = { wrote: false, error: (e && e.name) || "error" };
      try { await say(store, now, roster, o.fetch, { to: "Nova", needs: "none", key: "job-fail:" + name + ":" + S.spDay(now), text: `The ${name} check could not finish. It will try again. HQ changed nothing.` }); } catch { /* the desk note is optional */ }
    }
  };
  if (o.fetch) await step("site", () => runSiteCheck(store, now, roster, o));
  await step("cap", () => runCapCheck(store, now, roster, o));
  if (o.fetch) await step("release", () => runReleaseWatch(store, now, roster, o));
  await step("month", () => runMonthJob(store, now, roster, o));
  await step("monday", () => runMonday(store, now, roster, o));
  return out;
}
