/* BADSCANDAL HQ (11 Nov 2026): turns the bots' rows in the "BADSCANDAL HQ" Google Sheet into the
   dashboard at /hq. Pure functions only: no network, no secrets, unit tested (tests/hq.test.mjs).
   Spec: badscandal-hq/briefs/2026-11-11-hq-dashboard-spec.md. The sheet is the bots' data bus:

     Growth    date | platform | account | followers | change | views | best_post | best_post_link | logged_by | note
     Songs     date | song | spotify_streams | spotify_listeners | saves | playlist_adds | logged_by | note
     Fans      date | platform | handle | signal | quote | post_link | logged_by | profile_link | about | how_to_engage
     Releases  song | slug | release_date | status | isrc | upc | T-28 files | T-21 submitted | T-14 pitched | T-10 lyrics | T-7 video + page | ads_ready | notes
     Tasks     id | owner | task | deadline | status | blocker | updated
     Spend     date | platform | campaign | spend | currency            (the Ads Tracker's Daily log)

   (24 Nov 2026, Luke: "lets fully remove the money section". The Royalties and Income tabs are no longer
   read; the sheet itself is not changed. Spend and the ad cap stay.)

   Rules kept here: numbers that are missing stay missing (never guessed, "not read" rows are
   skipped); every amount keeps its own currency; an amount in another currency is an ESTIMATE at
   that month's average ECB rate (netlify/lib/fx.mjs) and is always labelled as one. */
import { convert } from "./fx.mjs";
/* v18 (21 Nov 2026, Luke): the "Salvation" line is gone from Atlas's duty, so the duty list and the reminders
   built from it never say it (the sheet itself is not changed) */
const noSalvation = (v) => (v == null ? v : String(v).replace(/[^.\n]*\bsalvation\b[^.\n]*\.?/gi, "").replace(/\s{2,}/g, " ").trim());

export const HQ_TABS = ["Growth", "Songs", "Fans", "Releases", "Tasks", "Spend"];
export const CAP = { amount: 1000, warn: 750, stop: 900, currency: "USD" };
/* the release timeline, in days before release (Fridays; two songs a month is the goal) */
export const STEPS = [
  { key: "t-28 files", days: 28, label: "Master, cover, details to Drop", owner: "Luke" },
  { key: "t-21 submitted", days: 21, label: "Submitted to RouteNote", owner: "Drop" },
  { key: "t-14 pitched", days: 14, label: "Spotify pitch sent", owner: "Atlas" },
  { key: "t-10 lyrics", days: 10, label: "Lyrics ready", owner: "Verse" },
  { key: "t-7 video + page", days: 7, label: "Video scheduled, song page live", owner: "Laura + Webmaster" },
  { key: "ads_ready", days: 1, label: "Ad drafts ready", owner: "Forge" }, /* 24 Nov 2026: Claude is off the desk */
];

const norm = (s) => String(s == null ? "" : s).trim();
const key = (s) => norm(s).toLowerCase().replace(/\s+/g, " ");
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/* a song's name without accents, case, spaces or signs ("Me Dá Seu Body" = "me da seu body") */
const songKey = (s) => norm(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
/* the same song? (11 Nov 2026, review) A title with no Latin letter or digit ("Ночь") has an EMPTY songKey;
   "" === "" made every such title the same song. Those compare by their own words; empty never matches.
   The same rule as sameSong() in staff.mjs. */
const ownWords = (s) => norm(s).normalize("NFC").toLowerCase().replace(/\s+/g, " ");
const sameSong = (a, b) => { const ka = songKey(a), kb = songKey(b); return ka || kb ? ka === kb : ownWords(a) !== "" && ownWords(a) === ownWords(b); };

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
export function songsReport(rows, releases, today) {
  const by = {};
  for (const r of rows) {
    if (!DAY.test(r.date) || !r.song) continue;
    const streams = num(r.spotify_streams);
    (by[r.song] || (by[r.song] = [])).push({ d: r.date, streams, listeners: num(r.spotify_listeners), saves: num(r.saves), adds: num(r.playlist_adds) });
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
    const rel = releases.find((x) => sameSong(x.song, song) && DAY.test(x.release_date || ""));
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
    };
  }).sort((a, b) => (b.week || 0) - (a.week || 0));
}

/* ---------- growth per platform, tied to the day's best post ---------- */
function growthCanon(name) {
  const k = key(name).replace(/[^a-z]/g, "");
  if (k === "ig" || k === "instagram") return "instagram";
  if (k === "tt" || k === "tiktok") return "tiktok";
  if (k === "yt" || k === "youtube") return "youtube";
  if (k === "spotify") return "spotify";
  return key(name);
}
const GROWTH_LABEL = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", spotify: "Spotify" };
/* a gap whose number is on the day is answered (v18, 21 Nov 2026) */
function openGaps(day) {
  if (!day || !day.gaps) return null;
  const out = {};
  for (const [k, w] of Object.entries(day.gaps)) if (day[k] == null || day[k] === "") out[k] = w;
  return out;
}
export function growthReport(rows, today) {
  const by = {};
  for (const r of rows) {
    if (!DAY.test(r.date) || !r.platform) continue;
    const id = growthCanon(r.platform);
    const bucket = by[id] || (by[id] = { platform: GROWTH_LABEL[id] || r.platform, account: r.account || "", days: [] });
    let day = bucket.days.find((d) => d.d === r.date);
    const next = {
      d: r.date, followers: num(r.followers), change: num(r.change), views: num(r.views), post: r.best_post || "", link: /^https:\/\//.test(r.best_post_link || "") ? r.best_post_link : "",
      viewsDate: r.views_date || "", gaps: r.gaps && typeof r.gaps === "object" && !Array.isArray(r.gaps) ? r.gaps : null,
      channelViews: num(r.channel_views), officialViews: num(r.official_views), otherViews: num(r.other_views), shortsViews: num(r.shorts_views), watchHours: num(r.watch_hours),
    };
    if (!day) bucket.days.push(next);
    else for (const [k, v] of Object.entries(next)) if ((day[k] == null || day[k] === "") && v != null && v !== "") day[k] = v;
  }
  return Object.values(by).map((p) => {
    p.days.sort((a, b) => (a.d < b.d ? -1 : 1));
    const read = p.days.filter((x) => x.followers != null);
    const last = read[read.length - 1] || null;
    const at = (n) => { const lim = last ? addDays(last.d, -n) : ""; const c = read.filter((x) => x.d <= lim); return c.length ? c[c.length - 1] : null; };
    /* fewer than 7 days of readings: compare with the oldest one and say how many days it covers (A1,
       17 Nov 2026: the card said "– in 7 days" for a new platform) */
    const w = at(7) || (read.length > 1 ? read[0] : null), m = at(30), d28 = at(28);
    const have = new Set(p.days.map((x) => x.d));
    let gapDays = null;
    if (p.days.length) {
      gapDays = [];
      const end = p.days[p.days.length - 1].d;
      for (let d = p.days[0].d; d < end; d = addDays(d, 1)) if (!have.has(d) && d > addDays(end, -28)) gapDays.push(d);
    }
    /* the days that grew the most, with the post that went out that day */
    const best = p.days.filter((x) => x.change != null && x.post).sort((a, b) => b.change - a.change).slice(0, 3)
      .map((x) => ({ d: x.d, change: x.change, post: x.post, link: x.link }));
    const lastDay = p.days[p.days.length - 1] || null;
    return {
      platform: p.platform, account: p.account, unit: growthCanon(p.platform) === "youtube" ? "subscribers" : "followers",
      lastDay: last ? last.d : null, stale: last ? daysBetween(last.d, today) : null,
      followers: last ? last.followers : null,
      day: last ? last.change : null,
      week: last && w ? last.followers - w.followers : null,
      d7: last && w ? last.followers - w.followers : null,
      weekDays: last && w ? Math.min(7, daysBetween(w.d, last.d)) : null,
      month: last && m ? last.followers - m.followers : null,
      d28: last && d28 ? last.followers - d28.followers : null,
      views7: sum(p.days.filter((x) => last && x.d > addDays(last.d, -7) && x.views != null).map((x) => x.views)),
      views: lastDay ? lastDay.views : null, viewsDate: lastDay ? lastDay.viewsDate || "" : "",
      gaps: lastDay ? openGaps(lastDay) : null, gapDays,
      channelViews: lastDay ? lastDay.channelViews : null, officialViews: lastDay ? lastDay.officialViews : null, otherViews: lastDay ? lastDay.otherViews : null,
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
   on Me Dá Seu Body: the pitch could not be sent, the song wasn't there yet). Only while the report is
   less than 48 hours old (now: ms, optional) and the song is not out yet; else late is late. */
const PITCH = STEPS.find((s) => s.key === "t-14 pitched").label;
const reportList = (s) => (s && Array.isArray(s.list || s.items) ? s.list || s.items : null);
const reportHas = (sightings, r) => reportList(sightings).some((x) => sameSong(x.title, r.song) && (!r.date || !DAY.test(x.date || "") || Math.abs(daysBetween(x.date, r.date)) <= 1));
/* A report counts only while it is CURRENT (fixed 11 Nov 2026, review): none at all (null), or one older than
   48 hours, says nothing about today, and a late pitch is late. now = ms (optional; else by São Paulo day). */
const reportCurrent = (s, today, now) => !!reportList(s) && !!s.at && (now != null ? now - Date.parse(s.at) < 48 * 3600000 : daysBetween(String(s.sp || s.at).slice(0, 10), today) <= 1);
export function mergeReleases(sheetReleases, deskReleases, today, sightings, now) {
  /* the sheet's own rows: a late pitch waits while a CURRENT report does not show the song, and only
     before its release day (a song that is out never shows under Upcoming there, so it would wait forever) */
  const sheetRow = (r) => {
    if (!reportCurrent(sightings, today, now) || !(r.date && r.date > today) || reportHas(sightings, r) || !(r.steps || []).some((s) => s.label === PITCH && s.late)) return r;
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
        note: s.status === "blocked" ? "blocked: " + (s.note || "") : s.note || "", ...(skipped ? { skipped: true } : {}), ...(s.link ? { link: s.link } : {}), ...(s.doneOn ? { doneOn: s.doneOn } : {}), ...(s.waiting ? { waiting: true, waitingText: s.waitingText || "waiting" } : {}) };
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
    const d = desk.find((x) => !used.has(x.id) && sameSong(x.song, r.song));
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
/* "Kevin (TikTok)" or "Laura (YouTube)" on the sheet is the bot Kevin / Laura (17 Nov 2026: T-50 never reached Kevin) */
export const ownerName = (o) => norm(o).replace(/\s*\([^)]*\)\s*$/, "").trim();
/* nowHM: São Paulo "HH:MM" now. A duty's deadline may carry its time ("2026-11-12 09:15"): once that
   time has passed and the duty isn't done, it is late (live updates brief, 11 Nov 2026). */
/* overlay (the staff desk, netlify/lib/staff.mjs dutyOverlay()): what each bot said TODAY through the
   connector, by duty id or (when the bot has one duty) by bot. The sheet's "done" always wins; a
   connector "done" finishes a duty the sheet still shows as to do; "blocked" brings its reason. */
export function dutiesReport(tasks, today, nowHM = "", overlay = null) {
  const mine = tasks.filter((t) => isDuty(t) && t.task && (!DAY.test(norm(t.deadline).slice(0, 10)) || norm(t.deadline).slice(0, 10) === today));
  const perOwner = {};
  for (const t of mine) perOwner[key(ownerName(t.owner))] = (perOwner[key(ownerName(t.owner))] || 0) + 1;
  const list = mine
    .map((t) => {
      const m = /(\d{1,2}):(\d{2})/.exec(norm(t.deadline).slice(10)), due = m ? m[1].padStart(2, "0") + ":" + m[2] : "";
      let status = /^(done|yes|ok|✓|✔)$/i.test(norm(t.status)) ? "done" : /block/i.test(norm(t.status)) ? "blocked" : "todo";
      let blocker = norm(t.blocker), via = "", working = false, gaps = "";
      /* "done with gaps" (batch 4): done, with what could not be read (in the blocker column) */
      if (/^done with gaps\b/i.test(norm(t.status))) { status = "done"; gaps = blocker; blocker = ""; }
      /* by duty id from the duty's OWN bot. A close id (D-spark and D-spark-1) still matches.
         A bot with one duty may leave the id out. Naming the duty works when the bot has several. The newer word wins. */
      const idKey = key(t.id), botKey = key(ownerName(t.owner));
      const dutyMap = overlay && overlay.byDuty || {};
      let byId = dutyMap[idKey] || null;
      if (!byId && overlay) {
        const hits = Object.keys(dutyMap).filter((k) => k && (idKey === k || idKey.startsWith(k) || k.startsWith(idKey)));
        if (hits.length === 1) byId = dutyMap[hits[0]];
      }
      const botWord = overlay && (overlay.byBot || {})[botKey];
      const named = !!(botWord && botWord.duty && (key(botWord.duty) === idKey || idKey.startsWith(key(botWord.duty)) || key(botWord.duty).startsWith(idKey)));
      const byBot = botWord && (perOwner[botKey] === 1 || named) ? botWord : null;
      const mine = byId && (!byId.bot || byId.bot === key(ownerName(t.owner))) ? byId : null;
      const said = mine && byBot ? ((byBot.iso || "") > (mine.iso || "") ? byBot : mine) : mine || byBot;
      if (said && status !== "done") {
        if (said.status === "done") { status = "done"; via = "connector"; gaps = said.gaps || ""; }
        else if (said.status === "blocked") { status = "blocked"; blocker = blocker || said.message; via = "connector"; }
        else if (said.status === "working") working = true;
      }
      return { id: norm(t.id), owner: ownerName(t.owner) || "?", task: noSalvation(t.task), blocker: noSalvation(blocker), status, due,
        late: status === "todo" && !!due && !!nowHM && nowHM > due, updated: norm(t.updated), ...(via ? { via } : {}), ...(working ? { working } : {}), ...(gaps ? { gaps } : {}) };
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
function clipLive(v) {
  const t = norm(v);
  if (t.length <= 400) return t;
  const cut = t.slice(0, 400);
  const sp = cut.lastIndexOf(" ");
  return (sp > 240 ? cut.slice(0, sp) : cut).trimEnd() + "…";
}
export function liveReport(rows) {
  if (rows == null) return { ready: false, feed: [], bots: [] };
  const feed = rows.map((r) => {
    const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/.exec(norm(r.time));
    const st = key(r.status);
    return m && norm(r.bot) ? { at: m[1] + " " + m[2].padStart(2, "0") + ":" + m[3], bot: norm(r.bot), status: UPDATE_STATUS.includes(st) ? st : "info",
      message: clipLive(r.message), link: /^https:\/\//.test(norm(r.link)) ? norm(r.link) : "" } : null;
  }).filter(Boolean).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const by = {};
  for (const u of feed) if (!by[u.bot]) by[u.bot] = { bot: u.bot, lastAt: u.at, status: u.status, message: u.message, link: u.link };
  return { ready: true, feed: feed.slice(0, 40), bots: Object.values(by).sort((a, b) => (a.bot < b.bot ? -1 : 1)), lastAt: feed.length ? feed[0].at : null };
}

/* overlay (14 Nov 2026): the bots' own word on their T- tasks (staff.mjs setTaskStatus, tool task_update),
   shown over the sheet's row: done takes it off the open list, blocked sets the blocker to the bot's note,
   todo/working clear an old blocker. The sheet's own "done" always wins. */
export function teamReport(tasks, sheets, today, overlay = null) {
  const said = (t) => (overlay && t.id ? overlay[String(t.id).toUpperCase()] || null : null);
  const open = tasks.filter((t) => t.task && !isDuty(t) && !/^done$/i.test(t.status) && !(said(t) && ["done", "cancelled"].includes(said(t).status)));
  const row = (t) => {
    const o = said(t);
    const r = { id: t.id || "", owner: ownerName(t.owner) || "?", task: t.task, deadline: t.deadline || "", status: key(t.status) || "todo", blocker: t.blocker || "",
      late: DAY.test((t.deadline || "").slice(0, 10)) && (t.deadline || "").slice(0, 10) < today && !/^done$/i.test(t.status) };
    return o ? { ...r, ...(o.title ? { task: o.title } : {}), status: o.status, blocker: o.status === "blocked" ? o.note : "", note: o.note || "", by: o.by || "", updated: o.sp || "" } : r;
  };
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

/* ---------- the team's fixed rate (15 Nov 2026, the bots' feedback, batch 4) ----------
   The cap's EUR (Google, TikTok) used to be converted at the ECB average of the month SO FAR, which moves
   every working day: one day's total read 473.40, 473.47 and 473.83. The sheet's tab "Rates" holds the
   month's FIXED rate in B1 (USD per 1 EUR; A1 = its label). A number that can't be that is not used. */
export function fixedRate(values) {
  if (!Array.isArray(values) || !values.length) return { error: "no Rates tab in the sheet" };
  const row = Array.isArray(values[0]) ? values[0] : [];
  const raw = norm(row[1]), n = num(raw);
  if (n == null) return { error: `Rates!B1 can't be read (${raw ? raw.slice(0, 20) : "empty"})` };
  if (n < 0.9 || n > 1.6) return { error: `Rates!B1 (${n}) doesn't look like USD per 1 EUR` };
  return { rate: n, label: norm(row[0]).slice(0, 80), from: "Rates!B1" };
}
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayWords = (d) => (DAY.test(d || "") ? `${WD[new Date(d + "T12:00:00Z").getUTCDay()]} ${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}` : d);
/* Forge's record_spend rows (the desk) replace the sheet's rows for that platform and day (never added to
   them); a "not read" from the desk is a missing read until a number for that platform and day exists. */
export function mergeDeskSpend(rows, desk) {
  const list = Array.isArray(desk) ? desk : [];
  const got = list.filter((x) => x && x.amount != null && DAY.test(x.date || ""));
  const k = (p, d) => key(p) + "|" + d;
  const replaced = new Set(got.map((x) => k(x.platform, x.date)));
  const out = rows.filter((r) => !replaced.has(k(r.platform, (r.date || "").slice(0, 10))))
    .concat(got.map((x) => ({ date: x.date, platform: x.platform, campaign: "desk: " + (x.account || x.platform), spend: String(x.amount), currency: x.currency || "USD", song: x.song || "" })));
  const notRead = list.filter((x) => x && x.amount == null && x.notRead && DAY.test(x.date || "")).map((x) => ({ platform: x.platform, date: x.date, why: x.notRead }));
  return { rows: out, notRead };
}

/* ---------- money: ad spend per month and the combined cap (income left HQ on 24 Nov 2026) ---------- */
/* fx: { "2026-11": {USD, GBP, ...} } monthly averages (units per 1 EUR). */
export function moneyReport(spend, today, fx = {}, o = {}) {
  const months = {};
  const M = (m) => months[m] || (months[m] = { month: m, spend: {} });
  const add = (o, k, cur, a) => { const x = o[k] || (o[k] = {}); x[cur] = round((x[cur] || 0) + a); };
  const days = {};
  for (const r of spend) {
    const a = num(r.spend), d = (r.date || "").slice(0, 10);
    if (a == null || !DAY.test(d)) continue;
    const cur = (r.currency || "USD").toUpperCase(), p = r.platform || "?";
    add(M(d.slice(0, 7)).spend, p, cur, a);
    if (d.slice(0, 7) === today.slice(0, 7)) { const x = days[d] || (days[d] = {}); x[cur] = round((x[cur] || 0) + a); }
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
    const s = est(m.spend, m.month, "EUR");
    return { ...m, rate: (fx[m.month] || {}).USD || null, spendEur: s };
  });
  /* the cap: Meta + Google + TikTok this month, all counted in USD. EUR at the sheet's FIXED rate (batch 4,
     15 Nov 2026), else at the month's ECB average so far (then the figure is an estimate, and says why) */
  const cm = today.slice(0, 7), fixed = o.fixed && o.fixed.rate ? o.fixed : null;
  const now = months[cm] || { spend: {} };
  const native = {};
  for (const cur of Object.values(now.spend)) for (const [c, a] of Object.entries(cur)) native[c] = round((native[c] || 0) + a);
  const why = [], toUsd = (a, c) => (c === CAP.currency ? a : c === "EUR" && fixed ? a * fixed.rate : convert(a, c, CAP.currency, fx[cm]));
  let capMissing = false, spentRaw = 0;
  for (const [c, a] of Object.entries(native)) { const v = toUsd(a, c); if (v == null) capMissing = true; else spentRaw += v; }
  const capUsd = { amount: round(spentRaw), missing: capMissing };
  const foreign = Object.keys(native).filter((c) => c !== CAP.currency);
  if (foreign.includes("EUR") && !fixed) why.push(`no fixed rate in the sheet's Rates tab${o.fixed && o.fixed.error ? ` (${o.fixed.error})` : ""}: EUR at the ECB average so far`);
  const others = foreign.filter((c) => c !== "EUR");
  if (others.length) why.push(`${others.join(", ")} at the ECB average so far`);
  if (capMissing) why.push("no rate for " + foreign.filter((c) => toUsd(1, c) == null).join(", "));
  const notRead = (o.notRead || []).filter((x) => (x.date || "").slice(0, 7) === cm).map((x) => `${x.platform} ${dayWords(x.date)}` + (x.why ? `: ${x.why}` : ""));
  if (notRead.length) why.push(`${notRead.length} read${notRead.length === 1 ? "" : "s"} missing`);
  const rateUsed = !foreign.includes("EUR") ? null : fixed ? { value: fixed.rate, from: fixed.from, label: fixed.label, month: cm } : { value: (fx[cm] || {}).USD || null, from: "ECB average", month: cm };
  const spent = capUsd.amount;
  const dd = Number(today.slice(8, 10)), dim = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();
  const last3 = [1, 2, 3].map((k) => addDays(today, -k)).filter((d) => d.slice(0, 7) === today.slice(0, 7));
  const perDay = last3.length ? sum(last3.map((d) => { const x = days[d] || {}; return sum(Object.entries(x).map(([c, a]) => toUsd(a, c) || 0)); })) / last3.length : 0;
  const stopDay = perDay > 0 && spent < CAP.stop ? dd + Math.ceil((CAP.stop - spent) / perDay) : null;
  return {
    months: list,
    cap: {
      month: today.slice(0, 7), ...CAP, spent, native, estimated: why.length > 0, estimatedWhy: why, rateUsed, notRead, missingRate: capUsd.missing,
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
/* log_growth's rows (the desk, batch 4) in the sheet's own shape: a sheet row of the same day (and platform
   or song) keeps its numbers and only gains the ones it lacks; a day the sheet doesn't have is added */
const GROWTH_COLS = { followers: "followers", change: "change", views: "views", best_post: "best_post", best_post_link: "best_post_link", channel_views: "channel_views", shorts_views: "shorts_views", official_views: "official_views", other_views: "other_views", watch_hours: "watch_hours", views_6h: "views_6h", follows_6h: "follows_6h", follows_48h: "follows_48h", paid_views: "paid_views", organic_views: "organic_views", ad_spend: "ad_spend" };
const GROWTH_KEEP = ["views_date", "gaps", "video_id", "top_videos", "posts", "fan_signals", "avg_watch", "avg_watch_6h", "gate_6h", "ads_read_at", "ad_currency", "pattern", "subscribers"];
const SONG_COLS = { streams: "spotify_streams", listeners: "spotify_listeners", saves: "saves", playlist_adds: "playlist_adds" };
function mergeDeskGrowth(t, rows) {
  for (const x of rows) {
    if (!x || !DAY.test(x.date || "")) continue;
    const song = x.kind === "song", tab = song ? t.Songs : t.Growth, cols = song ? SONG_COLS : GROWTH_COLS;
    const hasGrowth = !song && (Object.keys(cols).some((k) => x[k] != null && x[k] !== "") || GROWTH_KEEP.some((k) => x[k] != null && x[k] !== "" && !(typeof x[k] === "object" && !Array.isArray(x[k]) && !Object.keys(x[k]).length)));
    if (song ? !Object.keys(cols).some((k) => x[k] != null && x[k] !== "") : !hasGrowth) continue; /* only artist numbers (A8): they go to artistReport */
    const same = tab.find((r) => r.date === x.date && (song ? sameSong(r.song, x.song) : growthCanon(r.platform) === growthCanon(x.platform)));
    const row = same || (song ? { date: x.date, song: x.song } : { date: x.date, platform: GROWTH_LABEL[growthCanon(x.platform)] || x.platform, account: x.account || "" });
    for (const [k, col] of Object.entries(cols)) if (x[k] != null && x[k] !== "" && (row[col] == null || row[col] === "")) row[col] = typeof x[k] === "number" ? x[k] : String(x[k]);
    if (!song) for (const k of GROWTH_KEEP) if (x[k] != null && x[k] !== "" && (row[k] == null || row[k] === "")) row[k] = x[k];
    row.logged_by = row.logged_by || x.by || "";
    if (!same) tab.push(row);
  }
}
/* A8 (17 Nov 2026, Atlas): the artist's Spotify monthly listeners and Brazil listeners, from log_growth (platform
   Spotify). The change is over 7 days, or since the oldest reading when there are fewer (changeDays says which). */
export function artistReport(rows) {
  const read = (rows || []).filter((x) => x && x.kind !== "song" && key(x.platform) === "spotify" && DAY.test(x.date || "") && num(x.monthly_listeners) != null)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!read.length) return null;
  const last = read[read.length - 1], lim = addDays(last.date, -7);
  const older = read.filter((x) => x.date <= lim), base = older.length ? older[older.length - 1] : read.length > 1 ? read[0] : null;
  const monthly = num(last.monthly_listeners), brazil = num(last.brazil_listeners);
  return { monthly, lastDay: last.date, change: base ? monthly - num(base.monthly_listeners) : null, changeDays: base ? Math.min(7, daysBetween(base.date, last.date)) : null,
    brazil, brazilShare: brazil != null && monthly ? Math.round((brazil / monthly) * 100) : null,
    series: read.slice(-60).map((x) => ({ d: x.date, v: num(x.monthly_listeners) })), brazilSeries: read.filter((x) => num(x.brazil_listeners) != null).slice(-60).map((x) => ({ d: x.date, v: num(x.brazil_listeners) })) };
}
/* Per-song profit (songProfit, L4) is gone: 24 Nov 2026, Luke: "lets fully remove the money section". */
export function hqModel(sheets, today, fx = {}, meta, nowHM = "", staff = null) {
  const t = Object.fromEntries(HQ_TABS.map((n) => [n, rowsToObjects(sheets[n])]));
  /* batch 4: Forge's desk rows over the sheet's; Meta's own read over both (metaSpend) */
  const dk = mergeDeskSpend(t.Spend, staff && staff.spend);
  const ms = metaSpend(dk.rows, meta);
  t.Spend = ms.rows;
  /* the reads still missing: a sheet row that says "not read", and a desk "not read" with no number since */
  const has = new Set(t.Spend.filter((r) => num(r.spend) != null).map((r) => key(r.platform) + "|" + (r.date || "").slice(0, 10)));
  const notRead = t.Spend.filter((r) => num(r.spend) == null && /not read/i.test(norm(r.spend)) && DAY.test((r.date || "").slice(0, 10))).map((r) => ({ platform: r.platform || "?", date: r.date.slice(0, 10), why: "" }))
    .concat(dk.notRead).filter((x, i, a) => !has.has(key(x.platform) + "|" + x.date) && a.findIndex((y) => key(y.platform) === key(x.platform) && y.date === x.date) === i);
  /* batch 4: log_growth's rows join the Growth and Songs tabs */
  if (staff && Array.isArray(staff.growth)) mergeDeskGrowth(t, staff.growth);
  const deskReleases = staff && Array.isArray(staff.releases) ? staff.releases : [];
  /* a song's release date: the desk's first (it is the one the team works to), then the sheet's */
  const relDates = deskReleases.filter((v) => v.status === "scheduled" && v.date).map((v) => ({ song: v.title, release_date: v.date }));
  const songs = songsReport(t.Songs, relDates.concat(t.Releases), today);
  /* whose song it is (V3, 11 Nov 2026): the desk release with the same name (a sent one before a draft),
     null when the desk has no record of it */
  for (const s of songs) {
    const same = deskReleases.filter((v) => v && v.status !== "cancelled" && v.deal && sameSong(v.title, s.song));
    const v = same.find((x) => x.status === "scheduled") || same[0];
    s.deal = v ? v.deal : null;
  }
  const growth = growthReport(t.Growth, today);
  const fans = fansReport(t.Fans);
  const releases = mergeReleases(releasesReport(t.Releases, today), deskReleases, today, staff && "sightings" in staff ? staff.sightings : undefined, staff && staff.now != null ? staff.now : undefined);
  const team = teamReport(t.Tasks, [t.Growth, t.Songs, t.Fans], today, staff ? staff.taskOverlay || null : null);
  const money = { ...moneyReport(t.Spend, today, fx, { fixed: fixedRate(sheets.Rates), notRead }), metaSource: ms.source };
  const empty = HQ_TABS.filter((n) => !t[n].length);
  team.duties = dutiesReport(t.Tasks, today, nowHM, staff ? staff.overlay : null);
  const sheetUpdates = sheets.Updates == null ? null : rowsToObjects(sheets.Updates);
  team.live = liveReport(sheetUpdates == null && !staff ? null : mergeUpdates(sheetUpdates, staff ? staff.updates : []));
  return { today, songs, growth, fans, releases, team, money, empty, sheetErrors: sheetErrors(sheets), artist: artistReport(staff && staff.growth),
    growthDetail: staff && Array.isArray(staff.growth) ? staff.growth.filter((r) => r && r.kind !== "song") : [],
    next: releases.find((r) => r.date && r.date >= today) || null };
}
