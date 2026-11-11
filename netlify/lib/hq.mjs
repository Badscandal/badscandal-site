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
/* a song's name without accents, case, spaces or signs ("Me Dá Seu Body" = "me da seu body") */
const songKey = (s) => norm(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/* values: a tab as rows of cells (first row = headers) -> [{header: cell}] with lowercase headers */
export function rowsToObjects(values) {
  if (!Array.isArray(values) || values.length < 2) return [];
  const head = values[0].map(key);
  return values.slice(1)
    .filter((r) => Array.isArray(r) && r.some((c) => norm(c)))
    .map((r) => Object.fromEntries(head.map((h, i) => [h, norm(r[i])]).filter(([h]) => h)));
}

/* ---------- spreadsheet errors (11 Nov 2026) ----------
   A tab whose cells are spreadsheet errors (#REF!, #N/A, #ERROR!, …) must not look empty: the page
   says "can't be read: the sheet shows an error". -> { Tab: { cells, first, readable } } for every
   tab with at least one error cell (readable = rows that still have no error in them). */
export const SHEET_ERROR = /^#(REF!|N\/A|ERROR!|VALUE!|DIV\/0!|NAME\?|NUM!|NULL!|SPILL!|CALC!)/i;
export function sheetErrors(sheets) {
  const out = {};
  for (const tab of HQ_TABS) {
    const values = Array.isArray(sheets[tab]) ? sheets[tab] : [];
    let cells = 0, first = "", readable = 0;
    values.forEach((row, i) => {
      const bad = (Array.isArray(row) ? row : []).filter((c) => SHEET_ERROR.test(norm(c)));
      cells += bad.length;
      if (bad.length && !first) first = norm(bad[0]);
      if (i > 0 && !bad.length && Array.isArray(row) && row.some((c) => norm(c))) readable++;
    });
    if (cells) out[tab] = { cells, first, readable };
  }
  return out;
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
    const rel = releases.find((x) => songKey(x.song) === songKey(song) && DAY.test(x.release_date || ""));
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
      listenersSeries: read.filter((x) => x.listeners != null).slice(-30).map((x) => ({ d: x.d, v: x.listeners })),
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

/* ---------- one list of releases: the sheet's and the staff desk's (11 Nov 2026) ----------
   The desk's release pipeline (netlify/lib/staff.mjs releaseView) is mapped to the sheet's shape, so
   everything that reads `releases` / `next` (Today, the release panel, attention, the briefing) works
   for a desk release unchanged. A song in both (titles compared without accents, case and spaces) is
   ONE entry: the desk's steps and dates, the sheet's status text kept. deskReleases: releaseView()s
   (only the scheduled ones join). A desk step that is skipped (the label delivers it) counts as done;
   one that is waiting (the pitch before the song shows in Spotify for Artists) is never late.
   sightings (11 Nov 2026, V5): Atlas's last Spotify for Artists report (null = none yet; undefined =
   the desk was not read). A sheet-only release whose "Spotify pitch sent" is late while that report
   does not show the song reads "waiting: not in Spotify for Artists yet" instead of late (Luke saw it
   on Me Dá Seu Body: the pitch could not be sent, the song wasn't there yet). */
const PITCH = STEPS.find((s) => s.key === "t-14 pitched").label;
const reportHas = (sightings, song) => !!sightings && Array.isArray(sightings.list || sightings.items) && (sightings.list || sightings.items).some((x) => songKey(x.title) === songKey(song));
export function mergeReleases(sheetReleases, deskReleases, today, sightings) {
  /* the sheet's own rows: a late pitch waits while the song is not in Spotify for Artists */
  const sheetRow = (r) => {
    if (sightings === undefined || reportHas(sightings, r.song) || !(r.steps || []).some((s) => s.label === PITCH && s.late)) return r;
    const steps = r.steps.map((s) => (s.label === PITCH && s.late ? { ...s, late: false, waiting: true, waitingText: "waiting: not in Spotify for Artists yet" } : s));
    return { ...r, steps, late: steps.filter((s) => s.late).length };
  };
  if (!deskReleases || !deskReleases.length) return sheetReleases.map(sheetRow);
  const fromDesk = (v) => {
    const date = DAY.test(v.date || "") ? v.date : null;
    const steps = (v.steps || []).map((s) => {
      const skipped = s.status === "skipped";
      const late = typeof s.late === "boolean" ? s.late : !skipped && s.status !== "done" && !!s.due && s.due < today;
      return { label: s.label, owner: s.owner, due: s.due || null, done: s.status === "done" || skipped, late,
        note: s.status === "blocked" ? "blocked: " + (s.note || "") : s.note || "", ...(skipped ? { skipped: true } : {}), ...(s.waiting ? { waiting: true, waitingText: s.waitingText || "waiting" } : {}) };
    });
    return { song: v.title, slug: v.id, date, status: (v.pack && v.pack.storeStatus) || "",
      daysToGo: date ? daysBetween(today, date) : null,
      weekday: date ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(date + "T12:00:00Z").getUTCDay()] : null,
      steps, late: steps.filter((s) => s.late).length, notes: (v.pack && v.pack.notes) || "",
      desk: true, id: v.id, missing: v.missing || [], tight: !!v.tight, deal: v.deal || null, warnings: v.warnings || [], where: v.where || "" };
  };
  const desk = deskReleases.filter((v) => v && v.title && v.status === "scheduled").map(fromDesk);
  /* every desk release keeps its own slot (by id): two with the same name are never folded into one
     (11 Nov 2026); a sheet row takes the first desk release of its name that no other row took */
  const used = new Set();
  const out = sheetReleases.map((r) => {
    const d = desk.find((x) => !used.has(x.id) && songKey(x.song) === songKey(r.song));
    if (!d) return sheetRow(r);
    used.add(d.id);
    return { ...d, status: r.status || d.status, slug: r.slug || d.slug };
  });
  return out.concat(desk.filter((d) => !used.has(d.id))).sort((a, b) => ((a.date || "9") < (b.date || "9") ? -1 : (a.date || "9") > (b.date || "9") ? 1 : 0));
}

/* ---------- team: tasks per owner and who last logged ---------- */
/* Today's duties (11 Nov 2026): Tasks rows whose id starts with "D-" are the bots' daily duties.
   Today's = deadline today, or no date at all (a standing duty). done / todo / blocked + blocker.
   They are NOT counted as ordinary tasks (no "late", no open count). */
export const isDuty = (t) => /^d-/i.test(norm(t.id));
/* nowHM: São Paulo "HH:MM" now. A duty's deadline may carry its time ("2026-11-12 09:15"): once that
   time has passed and the duty isn't done, it is late (live updates brief, 11 Nov 2026). */
/* overlay (the staff desk, netlify/lib/staff.mjs dutyOverlay()): what each bot said TODAY through the
   connector, by duty id or (when the bot has one duty) by bot. The sheet's "done" always wins; a
   connector "done" finishes a duty the sheet still shows as to do; "blocked" brings its reason. */
export function dutiesReport(tasks, today, nowHM = "", overlay = null) {
  const mine = tasks.filter((t) => isDuty(t) && t.task && (!DAY.test(norm(t.deadline).slice(0, 10)) || norm(t.deadline).slice(0, 10) === today));
  const perOwner = {};
  for (const t of mine) perOwner[key(t.owner)] = (perOwner[key(t.owner)] || 0) + 1;
  const list = mine
    .map((t) => {
      const m = /(\d{1,2}):(\d{2})/.exec(norm(t.deadline).slice(10)), due = m ? m[1].padStart(2, "0") + ":" + m[2] : "";
      let status = /^(done|yes|ok|✓|✔)$/i.test(norm(t.status)) ? "done" : /block/i.test(norm(t.status)) ? "blocked" : "todo";
      let blocker = norm(t.blocker), via = "", working = false;
      /* by duty id only from the duty's OWN bot; a bot with one duty may leave the id out; the newer word wins */
      const byId = overlay ? (overlay.byDuty || {})[key(t.id)] : null, byBot = overlay && perOwner[key(t.owner)] === 1 ? (overlay.byBot || {})[key(t.owner)] : null;
      const mine = byId && (!byId.bot || byId.bot === key(t.owner)) ? byId : null;
      const said = mine && byBot ? ((byBot.iso || "") > (mine.iso || "") ? byBot : mine) : mine || byBot;
      if (said && status !== "done") {
        if (said.status === "done") { status = "done"; via = "connector"; }
        else if (said.status === "blocked") { status = "blocked"; blocker = blocker || said.message; via = "connector"; }
        else if (said.status === "working") working = true;
      }
      return { id: norm(t.id), owner: norm(t.owner) || "?", task: t.task, blocker, status, due,
        late: status === "todo" && !!due && !!nowHM && nowHM > due, updated: norm(t.updated), ...(via ? { via } : {}), ...(working ? { working } : {}) };
    });
  const owners = {};
  for (const d of list) { const o = owners[d.owner] || (owners[d.owner] = { owner: d.owner, done: 0, todo: 0, blocked: 0, late: 0, items: [] }); o.items.push(d); o[d.status]++; if (d.late) o.late++; }
  return { today, total: list.length, done: list.filter((d) => d.status === "done").length, blocked: list.filter((d) => d.status === "blocked").length, late: list.filter((d) => d.late).length,
    byOwner: Object.values(owners).sort((a, b) => b.blocked - a.blocked || b.todo - a.todo || (a.owner < b.owner ? -1 : 1)) };
}

/* ---------- live updates (11 Nov 2026): the bots' running log, the sheet tab "Updates" ----------
     Updates   time | bot | status | message | link
   time = "YYYY-MM-DD HH:MM" São Paulo; status = done | working | blocked | error | info. Bots append one
   row whenever they start or finish a duty or hit a blocker (brief 2026-11-11-live-updates.md in
   badscandal-hq). rows === null means the tab doesn't exist yet: the page says so, nothing breaks. */
export const UPDATE_STATUS = ["done", "working", "blocked", "error", "info"];
export function liveReport(rows) {
  if (rows == null) return { ready: false, feed: [], bots: [] };
  const feed = rows.map((r) => {
    const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/.exec(norm(r.time));
    const st = key(r.status);
    return m && norm(r.bot) ? { at: m[1] + " " + m[2].padStart(2, "0") + ":" + m[3], bot: norm(r.bot), status: UPDATE_STATUS.includes(st) ? st : "info",
      message: norm(r.message).slice(0, 240), link: /^https:\/\//.test(norm(r.link)) ? norm(r.link) : "" } : null;
  }).filter(Boolean).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const by = {};
  for (const u of feed) if (!by[u.bot]) by[u.bot] = { bot: u.bot, lastAt: u.at, status: u.status, message: u.message, link: u.link };
  return { ready: true, feed: feed.slice(0, 40), bots: Object.values(by).sort((a, b) => (a.bot < b.bot ? -1 : 1)), lastAt: feed.length ? feed[0].at : null };
}

export function teamReport(tasks, sheets, today) {
  const open = tasks.filter((t) => t.task && !isDuty(t) && !/^done$/i.test(t.status));
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

/* ---------- Meta from Meta (11 Nov 2026) ----------
   When the read-only Meta read works, the Meta part of the cap and of Money comes from Meta itself
   (the whole ad account, level=account), not from the sheet's Meta rows; Google and TikTok still come
   from the sheet. Only days inside the read range are replaced. A day where the sheet's Meta total
   differs from Meta's by more than 1.00 is listed as "sheet says X". If the read failed, the sheet's
   rows stay and the reason is passed on so the page can say so in plain words.
   meta: undefined (sample: nothing to say) | { ok:false, reason } | { ok:true, rows:[{day, spend,
   currency}], since, until }. Returns { rows, source }. */
export const isMetaPlatform = (p) => /^(meta|facebook|instagram|fb|ig)\b/i.test(norm(p));
export function metaSpend(spendRows, meta) {
  if (!meta) return { rows: spendRows, source: null };
  if (!meta.ok) return { rows: spendRows, source: { from: "sheet", reason: meta.reason || "unknown", expired: !!meta.expired } };
  const inRange = (d) => d >= meta.since && d <= meta.until;
  const currency = (meta.rows.find((r) => r.currency) || {}).currency || "USD";
  const sheet = {}, api = {}, keep = [];
  for (const r of spendRows) {
    const d = norm(r.date).slice(0, 10);
    if (isMetaPlatform(r.platform) && DAY.test(d) && inRange(d)) {
      const a = num(r.spend);
      if (a != null && (r.currency || "USD").toUpperCase() === currency) sheet[d] = round((sheet[d] || 0) + a);
      continue; /* replaced by Meta's own number */
    }
    keep.push(r);
  }
  for (const r of meta.rows) if (DAY.test(r.day) && inRange(r.day)) api[r.day] = round((api[r.day] || 0) + (Number(r.spend) || 0));
  const mismatch = Object.keys(sheet).sort().filter((d) => Math.abs(sheet[d] - (api[d] || 0)) > 1.0)
    .map((d) => ({ d, meta: api[d] || 0, sheet: sheet[d], currency }));
  const added = Object.keys(api).sort().map((d) => ({ date: d, platform: "Meta", campaign: "ALL (account)", spend: String(api[d]), currency }));
  return { rows: [...keep, ...added], source: { from: "meta", currency, since: meta.since, until: meta.until,
    total: round(Object.values(api).reduce((x, y) => x + y, 0)), mismatch } };
}

/* sheets: { Growth: [[...cells]], ... } straight from the sheet (Updates: optional, null = no tab).
   today: São Paulo "YYYY-MM-DD". meta: see metaSpend() (optional). nowHM: São Paulo "HH:MM" (duty times). */
/* staff (optional, from the staff desk): { updates: [{sp, bot, status, message, link}], overlay, releases } — the
   connector's updates join the sheet's Updates tab in ONE live log, and finish/block today's duties;
   releases (releaseView()s that aren't cancelled: the scheduled ones join the sheet's Releases tab,
   mergeReleases; all of them give songs[].deal); sightings (Atlas's last Spotify for Artists report,
   null = none yet; left out = not read). */
export function mergeUpdates(sheetRows, staffUpdates) {
  /* every sheet row stays as it is; a connector update is dropped only when the sheet already has
     the very same line from the same bot on the same day (a bot that wrote both) */
  const k = (r) => [norm(r.time).slice(0, 10), key(r.bot), key(r.status), key(r.message)].join("|");
  const inSheet = new Set((sheetRows || []).map(k));
  return (sheetRows || []).concat((staffUpdates || []).map((u) => ({ time: u.sp, bot: u.bot, status: u.status, message: u.message, link: u.link || "" })).filter((r) => !inSheet.has(k(r))));
}
export function hqModel(sheets, today, fx = {}, meta, nowHM = "", staff = null) {
  const t = Object.fromEntries(HQ_TABS.map((n) => [n, rowsToObjects(sheets[n])]));
  const ms = metaSpend(t.Spend, meta);
  t.Spend = ms.rows;
  const deskReleases = staff && Array.isArray(staff.releases) ? staff.releases : [];
  /* a song's release date: the desk's first (it is the one the team works to), then the sheet's */
  const relDates = deskReleases.filter((v) => v.status === "scheduled" && v.date).map((v) => ({ song: v.title, release_date: v.date }));
  const songs = songsReport(t.Songs, t.Royalties, relDates.concat(t.Releases), today);
  /* whose song it is (V3, 11 Nov 2026): the desk release with the same name (a sent one before a draft),
     null when the desk has no record of it */
  for (const s of songs) {
    const same = deskReleases.filter((v) => v && v.status !== "cancelled" && v.deal && songKey(v.title) === songKey(s.song));
    const v = same.find((x) => x.status === "scheduled") || same[0];
    s.deal = v ? v.deal : null;
  }
  const growth = growthReport(t.Growth, today);
  const fans = fansReport(t.Fans);
  const releases = mergeReleases(releasesReport(t.Releases, today), deskReleases, today, staff && "sightings" in staff ? staff.sightings : undefined);
  const team = teamReport(t.Tasks, [t.Growth, t.Songs, t.Fans, t.Royalties], today);
  const money = { ...moneyReport(t.Spend, t.Income, t.Royalties, today, fx), metaSource: ms.source };
  const empty = HQ_TABS.filter((n) => !t[n].length);
  team.duties = dutiesReport(t.Tasks, today, nowHM, staff ? staff.overlay : null);
  const sheetUpdates = sheets.Updates == null ? null : rowsToObjects(sheets.Updates);
  team.live = liveReport(sheetUpdates == null && !staff ? null : mergeUpdates(sheetUpdates, staff ? staff.updates : []));
  return { today, songs, growth, fans, releases, team, money, empty, sheetErrors: sheetErrors(sheets),
    next: releases.find((r) => r.date && r.date >= today) || null };
}
