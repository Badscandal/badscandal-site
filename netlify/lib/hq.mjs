/* BADSCANDAL HQ (11 Nov 2026): turns the bots' rows in the "BADSCANDAL HQ" Google Sheet into the
   dashboard at /hq. Pure functions only: no network, no secrets, unit tested (tests/hq.test.mjs).
   Spec: badscandal-hq/briefs/2026-11-11-hq-dashboard-spec.md. The sheet is the bots' data bus:

     Growth    date | platform | account | followers | change | views | best_post | best_post_link | logged_by | note
     Songs     date | song | spotify_streams | spotify_listeners | saves | playlist_adds | logged_by | note
     Fans      date | platform | handle | signal | quote | post_link | logged_by | profile_link | about | how_to_engage
     Releases  song | slug | release_date | status | isrc | upc | T-28 files | T-21 submitted | T-14 pitched | T-10 lyrics | T-7 video + page | ads_ready | notes
     Tasks     id | owner | task | deadline | status | blocker | updated
     Royalties month | song | store | streams | amount | currency | logged_by
     Spend     date | platform | campaign | spend | currency            (the Ads Tracker's Daily log)
     Income    month | source | category | amount | currency | status   (from the Luke Income Sheet)

   Rules kept here: numbers that are missing stay missing (never guessed, "not read" rows are
   skipped); every amount keeps its own currency; an amount in another currency is an ESTIMATE at
   that month's average ECB rate (netlify/lib/fx.mjs) and is always labelled as one. */
import { convert } from "./fx.mjs";

export const HQ_TABS = ["Growth", "Songs", "Fans", "Releases", "Tasks", "Royalties", "Spend", "Income"];
export const CAP = { amount: 1000, warn: 750, stop: 900, currency: "USD" };
/* the release timeline, in days before release (Fridays; two songs a month is the goal) */
export const STEPS = [
  { key: "t-28 files", days: 28, label: "Master, cover, details to Drop", owner: "Luke" },
  { key: "t-21 submitted", days: 21, label: "Submitted to RouteNote", owner: "Drop" },
  { key: "t-14 pitched", days: 14, label: "Spotify pitch sent", owner: "Atlas" },
  { key: "t-10 lyrics", days: 10, label: "Lyrics ready", owner: "Verse" },
  { key: "t-7 video + page", days: 7, label: "Video scheduled, song page live", owner: "Laura + Webmaster" },
  { key: "ads_ready", days: 1, label: "Ad drafts ready", owner: "Claude + Forge" },
];

const norm = (s) => String(s == null ? "" : s).trim();
const key = (s) => norm(s).toLowerCase().replace(/\s+/g, " ");
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/* values: a tab as rows of cells (first row = headers) -> [{header: cell}] with lowercase headers */
export function rowsToObjects(values) {
  if (!Array.isArray(values) || values.length < 2) return [];
  const head = values[0].map(key);
  return values.slice(1)
    .filter((r) => Array.isArray(r) && r.some((c) => norm(c)))
    .map((r) => Object.fromEntries(head.map((h, i) => [h, norm(r[i])]).filter(([h]) => h)));
}

/* "1,234" / "1.234,50" / "USD 12.30" -> number; "", "not read", "#REF!" -> null (never 0) */
export function num(v) {
  let s = norm(v);
  if (!s || /not read|n\/a|#|missing/i.test(s)) return null;
  s = s.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(s)) return null;
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (s.includes(",")) s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const addDays = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);
const round = (n) => Math.round(n * 100) / 100;
const sum = (a) => a.reduce((x, y) => x + y, 0);
const done = (cell) => /done|yes|sent|live|ready|✓|✔|scheduled|approved/i.test(norm(cell)) && !/not |no\b|late|waiting/i.test(norm(cell));

/* ---------- songs: daily Spotify numbers and momentum (the number Luke cares about most) ---------- */
export function songsReport(rows, royalties, releases, today) {
  const by = {};
  for (const r of rows) {
    if (!DAY.test(r.date) || !r.song) continue;
    const streams = num(r.spotify_streams);
    (by[r.song] || (by[r.song] = [])).push({ d: r.date, streams, listeners: num(r.spotify_listeners), saves: num(r.saves), adds: num(r.playlist_adds) });
  }
  const earned = {};
  for (const r of royalties) {
    const a = num(r.amount);
    if (a == null || !r.song) continue;
    const e = earned[r.song] || (earned[r.song] = {});
    e[r.currency || "?"] = round((e[r.currency || "?"] || 0) + a);
  }
  return Object.entries(by).map(([song, days]) => {
    days.sort((a, b) => (a.d < b.d ? -1 : 1));
    const read = days.filter((x) => x.streams != null);
    const last = read[read.length - 1] || null;
    const prev = read[read.length - 2] || null;
    const win = (from, to) => read.filter((x) => x.d > from && x.d <= to);
    const end = last ? last.d : today;
    const w1 = win(addDays(end, -7), end), w0 = win(addDays(end, -14), addDays(end, -7));
    const s1 = sum(w1.map((x) => x.streams)), s0 = sum(w0.map((x) => x.streams));
    /* momentum needs two full-ish weeks; fewer days = "new" (no percentage is invented) */
    const pct = w0.length >= 4 && w1.length >= 4 && s0 > 0 ? Math.round(((s1 - s0) / s0) * 1000) / 10 : null;
    const rel = releases.find((x) => key(x.song) === key(song));
    const relDate = rel && DAY.test(rel.release_date) ? rel.release_date : null;
    return {
      song,
      released: relDate,
      daysOut: relDate && relDate <= today ? daysBetween(relDate, today) : null,
      lastDay: last ? last.d : null,
      stale: last ? daysBetween(last.d, today) : null, /* Spotify for Artists runs ~2 days behind */
      streams: last ? last.streams : null,
      dayChange: last && prev ? last.streams - prev.streams : null,
      listeners: last ? last.listeners : null,
      saves: last ? last.saves : null,
      adds: last ? last.adds : null,
      week: s1, prevWeek: w0.length ? s0 : null,
      momentum: pct,
      trend: pct == null ? "new" : pct >= 10 ? "rising" : pct <= -10 ? "cooling" : "steady",
      total: sum(read.map((x) => x.streams)),
      series: read.slice(-30).map((x) => ({ d: x.d, v: x.streams })),
      royalties: earned[song] || {},
    };
  }).sort((a, b) => (b.week || 0) - (a.week || 0));
}

/* ---------- growth per platform, tied to the day's best post ---------- */
export function growthReport(rows, today) {
  const by = {};
  for (const r of rows) {
    if (!DAY.test(r.date) || !r.platform) continue;
    (by[key(r.platform)] || (by[key(r.platform)] = { platform: r.platform, account: r.account || "", days: [] })).days.push({
      d: r.date, followers: num(r.followers), change: num(r.change), views: num(r.views), post: r.best_post || "", link: /^https:\/\//.test(r.best_post_link) ? r.best_post_link : "",
    });
  }
  return Object.values(by).map((p) => {
    p.days.sort((a, b) => (a.d < b.d ? -1 : 1));
    const read = p.days.filter((x) => x.followers != null);
    const last = read[read.length - 1] || null;
    const at = (n) => { const lim = last ? addDays(last.d, -n) : ""; const c = read.filter((x) => x.d <= lim); return c.length ? c[c.length - 1] : null; };
    const w = at(7), m = at(30);
    /* the days that grew the most, with the post that went out that day */
    const best = p.days.filter((x) => x.change != null && x.post).sort((a, b) => b.change - a.change).slice(0, 3)
      .map((x) => ({ d: x.d, change: x.change, post: x.post, link: x.link }));
    return {
      platform: p.platform, account: p.account,
      lastDay: last ? last.d : null, stale: last ? daysBetween(last.d, today) : null,
      followers: last ? last.followers : null,
      day: last ? last.change : null,
      week: last && w ? last.followers - w.followers : null,
      month: last && m ? last.followers - m.followers : null,
      views7: sum(p.days.filter((x) => last && x.d > addDays(last.d, -7) && x.views != null).map((x) => x.views)),
      series: read.slice(-30).map((x) => ({ d: x.d, v: x.followers })),
      best,
    };
  });
}

/* ---------- fans: who is turning into one, and how to reach them ---------- */
export function fansReport(rows) {
  const ok = rows.filter((r) => DAY.test(r.date) && r.handle);
  const seen = {};
  for (const r of ok) {
    const k = key(r.platform) + "|" + key(r.handle).replace(/^@/, "");
    const f = seen[k] || (seen[k] = { handle: r.handle.replace(/^@?/, "@"), platform: r.platform, times: 0, first: r.date, last: r.date, signals: new Set(), profile: "", about: "", engage: "", quote: "", post: "" });
    f.times++;
    if (r.date < f.first) f.first = r.date;
    if (r.date >= f.last) { f.last = r.date; f.quote = r.quote || f.quote; f.post = /^https:\/\//.test(r.post_link) ? r.post_link : f.post; }
    if (r.signal) f.signals.add(key(r.signal));
    if (/^https:\/\//.test(r.profile_link)) f.profile = r.profile_link;
    if (r.about) f.about = r.about;
    if (r.how_to_engage) f.engage = r.how_to_engage;
  }
  const people = Object.values(seen).map((f) => ({ ...f, signals: [...f.signals] }))
    .sort((a, b) => b.times - a.times || (a.last < b.last ? 1 : -1));
  return { total: people.length, repeat: people.filter((p) => p.times >= 2).length, people: people.slice(0, 60) };
}

/* ---------- releases: the 28-day timeline and what is late ---------- */
export function releasesReport(rows, today) {
  return rows.filter((r) => r.song).map((r) => {
    const date = DAY.test(r.release_date) ? r.release_date : null;
    const steps = STEPS.map((s) => {
      const cell = r[s.key] || "";
      const due = date ? addDays(date, -s.days) : null;
      const isDone = done(cell);
      return { label: s.label, owner: s.owner, due, done: isDone, late: !isDone && !!due && due < today, note: cell };
    });
    return {
      song: r.song, slug: r.slug || "", date, status: r.status || "",
      daysToGo: date ? daysBetween(today, date) : null,
      weekday: date ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(date + "T12:00:00Z").getUTCDay()] : null,
      steps, late: steps.filter((s) => s.late).length, notes: r.notes || "",
    };
  }).sort((a, b) => ((a.date || "9") < (b.date || "9") ? -1 : 1));
}

/* ---------- team: tasks per owner and who last logged ---------- */
export function teamReport(tasks, sheets, today) {
  const open = tasks.filter((t) => t.task && !/^done$/i.test(t.status));
  const row = (t) => ({ id: t.id || "", owner: t.owner || "?", task: t.task, deadline: t.deadline || "", status: key(t.status) || "todo", blocker: t.blocker || "",
    late: DAY.test((t.deadline || "").slice(0, 10)) && (t.deadline || "").slice(0, 10) < today && !/^done$/i.test(t.status) });
  const list = open.map(row).sort((a, b) => (b.late - a.late) || ((a.deadline || "9") < (b.deadline || "9") ? -1 : 1));
  const owners = {};
  for (const t of list) {
    const o = owners[t.owner] || (owners[t.owner] = { owner: t.owner, open: 0, late: 0, blocked: 0, lastLogged: null });
    o.open++; if (t.late) o.late++; if (t.status === "blocked") o.blocked++;
  }
  /* a bot's last logged row, from the logged_by column of the tabs it writes */
  for (const rows of sheets) for (const r of rows) {
    const who = norm(r.logged_by); const d = DAY.test(r.date) ? r.date : null;
    if (!who || !d) continue;
    const o = owners[who] || (owners[who] = { owner: who, open: 0, late: 0, blocked: 0, lastLogged: null });
    if (!o.lastLogged || d > o.lastLogged) o.lastLogged = d;
  }
  const team = Object.values(owners).map((o) => ({ ...o, quiet: o.lastLogged ? daysBetween(o.lastLogged, today) : null }))
    .sort((a, b) => b.late - a.late || b.open - a.open);
  return { tasks: list.slice(0, 80), team, late: list.filter((t) => t.late).length, blocked: list.filter((t) => t.status === "blocked").length,
    forLuke: list.filter((t) => /^luke$/i.test(t.owner)) };
}

/* ---------- money: spend and income per month, the combined cap ---------- */
/* fx: { "2026-11": {USD, GBP, ...} } monthly averages (units per 1 EUR). */
export function moneyReport(spend, income, royalties, today, fx = {}) {
  const months = {};
  const M = (m) => months[m] || (months[m] = { month: m, spend: {}, income: {}, pending: {}, royalties: {} });
  const add = (o, k, cur, a) => { const x = o[k] || (o[k] = {}); x[cur] = round((x[cur] || 0) + a); };
  const days = {};
  for (const r of spend) {
    const a = num(r.spend), d = (r.date || "").slice(0, 10);
    if (a == null || !DAY.test(d)) continue;
    const cur = (r.currency || "USD").toUpperCase(), p = r.platform || "?";
    add(M(d.slice(0, 7)).spend, p, cur, a);
    if (d.slice(0, 7) === today.slice(0, 7)) { const x = days[d] || (days[d] = {}); x[cur] = round((x[cur] || 0) + a); }
  }
  for (const r of income) {
    const a = num(r.amount), m = (r.month || "").slice(0, 7);
    if (a == null || !/^\d{4}-\d{2}$/.test(m)) continue;
    const cur = (r.currency || "?").toUpperCase(), cat = r.category || r.source || "Other";
    add(/pending|owed|payable/i.test(r.status) ? M(m).pending : M(m).income, cat, cur, a);
  }
  for (const r of royalties) {
    const a = num(r.amount), m = (r.month || "").slice(0, 7);
    if (a == null || !/^\d{4}-\d{2}$/.test(m)) continue;
    add(M(m).royalties, r.song || "?", (r.currency || "?").toUpperCase(), a);
  }
  /* estimate a {cat: {cur: amount}} block in one currency at that month's average rate */
  const est = (block, m, to) => {
    let t = 0, missing = false;
    for (const cur of Object.values(block)) for (const [c, a] of Object.entries(cur)) {
      const v = convert(a, c, to, fx[m]); if (v == null) missing = true; else t += v;
    }
    return { amount: round(t), missing };
  };
  const list = Object.values(months).sort((a, b) => (a.month < b.month ? 1 : -1)).map((m) => {
    const s = est(m.spend, m.month, "EUR"), i = est(m.income, m.month, "EUR");
    return { ...m, rate: (fx[m.month] || {}).USD || null, spendEur: s, incomeEur: i, netEur: s.missing || i.missing ? null : round(i.amount - s.amount) };
  });
  /* the cap: Meta + Google + TikTok this month, all counted in USD (EUR at the month's average) */
  const now = months[today.slice(0, 7)] || { spend: {} };
  const capUsd = est(now.spend, today.slice(0, 7), CAP.currency);
  const native = {};
  for (const cur of Object.values(now.spend)) for (const [c, a] of Object.entries(cur)) native[c] = round((native[c] || 0) + a);
  const spent = capUsd.amount;
  const dd = Number(today.slice(8, 10)), dim = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();
  const last3 = [1, 2, 3].map((k) => addDays(today, -k)).filter((d) => d.slice(0, 7) === today.slice(0, 7));
  const perDay = last3.length ? sum(last3.map((d) => { const x = days[d] || {}; return sum(Object.entries(x).map(([c, a]) => convert(a, c, CAP.currency, fx[today.slice(0, 7)]) || 0)); })) / last3.length : 0;
  const stopDay = perDay > 0 && spent < CAP.stop ? dd + Math.ceil((CAP.stop - spent) / perDay) : null;
  return {
    months: list,
    cap: {
      month: today.slice(0, 7), ...CAP, spent, native, estimated: Object.keys(native).some((c) => c !== CAP.currency), missingRate: capUsd.missing,
      rate: (fx[today.slice(0, 7)] || {}).USD || null,
      left: round(CAP.amount - spent), pct: Math.round((spent / CAP.amount) * 1000) / 10,
      status: spent >= CAP.amount ? "over" : spent >= CAP.stop ? "stop" : spent >= CAP.warn ? "warn" : "ok",
      perDay: round(perDay), stopDay: stopDay && stopDay <= dim ? stopDay : null,
      byPlatform: Object.fromEntries(Object.entries(now.spend)),
      lastDay: Object.keys(days).sort().pop() || null,
    },
  };
}

/* sheets: { Growth: [[...cells]], ... } straight from the sheet. today: São Paulo "YYYY-MM-DD". */
export function hqModel(sheets, today, fx = {}) {
  const t = Object.fromEntries(HQ_TABS.map((n) => [n, rowsToObjects(sheets[n])]));
  const songs = songsReport(t.Songs, t.Royalties, t.Releases, today);
  const growth = growthReport(t.Growth, today);
  const fans = fansReport(t.Fans);
  const releases = releasesReport(t.Releases, today);
  const team = teamReport(t.Tasks, [t.Growth, t.Songs, t.Fans, t.Royalties], today);
  const money = moneyReport(t.Spend, t.Income, t.Royalties, today, fx);
  const empty = HQ_TABS.filter((n) => !t[n].length);
  return { today, songs, growth, fans, releases, team, money, empty,
    next: releases.find((r) => r.date && r.date >= today) || null };
}

/* ---------- the phone summary (/api/hq/summary, for the LDashboard app's BADSCANDAL tab) ----------
   The same numbers as /hq, trimmed for a phone on a bad connection: no series longer than 14 days,
   no full task list, 10 fans. Built ONLY from hqModel() so the two can never disagree. */
const flatCur = (block) => { /* {cat: {cur: n}} -> {cur: n} */
  const t = {};
  for (const cur of Object.values(block || {})) for (const [c, a] of Object.entries(cur)) t[c] = round((t[c] || 0) + a);
  return t;
};
export function hqSummary(m) {
  const c = m.money.cap;
  const month = m.money.months.find((x) => x.month === m.today.slice(0, 7)) || null;
  const n = m.next;
  return {
    v: 1, today: m.today,
    cap: { month: c.month, amount: c.amount, warn: c.warn, stop: c.stop, currency: c.currency, spent: c.spent, left: c.left, pct: c.pct,
      status: c.status, perDay: c.perDay, stopDay: c.stopDay, native: c.native, estimated: c.estimated, missingRate: c.missingRate, rate: c.rate, lastDay: c.lastDay },
    next: n ? { song: n.song, date: n.date, daysToGo: n.daysToGo, weekday: n.weekday, status: n.status, late: n.late,
      lateSteps: n.steps.filter((s) => s.late).map((s) => ({ label: s.label, owner: s.owner, due: s.due })) } : null,
    songs: m.songs.map((s) => ({ song: s.song, streams: s.streams, lastDay: s.lastDay, stale: s.stale, dayChange: s.dayChange,
      week: s.week, prevWeek: s.prevWeek, momentum: s.momentum, trend: s.trend, daysOut: s.daysOut, spark: s.series.slice(-14).map((p) => p.v) })),
    growth: m.growth.map((g) => ({ platform: g.platform, account: g.account, followers: g.followers, day: g.day, week: g.week, lastDay: g.lastDay, stale: g.stale })),
    fans: [...m.fans.people].sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : b.times - a.times)).slice(0, 10)
      .map((p) => ({ handle: p.handle, platform: p.platform, last: p.last, times: p.times, signals: p.signals, quote: p.quote, engage: p.engage, profile: p.profile })),
    fansTotal: m.fans.total, fansRepeat: m.fans.repeat,
    money: month ? { month: month.month, spend: flatCur(month.spend), income: flatCur(month.income), pending: flatCur(month.pending),
      spendEur: month.spendEur.amount, incomeEur: month.incomeEur.amount, netEur: month.netEur, missingRate: month.spendEur.missing || month.incomeEur.missing, rate: month.rate }
      : { month: m.today.slice(0, 7), spend: {}, income: {}, pending: {}, spendEur: null, incomeEur: null, netEur: null, missingRate: false, rate: null },
    tasks: { open: m.team.tasks.length, late: m.team.late, blocked: m.team.blocked,
      forLuke: m.team.forLuke.slice(0, 8).map((t) => ({ task: t.task, deadline: t.deadline, late: t.late, status: t.status, blocker: t.blocker })),
      lateList: m.team.tasks.filter((t) => t.late || t.status === "blocked").slice(0, 6).map((t) => ({ task: t.task, owner: t.owner, deadline: t.deadline, late: t.late, status: t.status })) },
    empty: m.empty,
  };
}
