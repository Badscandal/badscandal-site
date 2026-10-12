/* Our own visit counter (11 Oct 2026). Shared by netlify/functions/hit.mjs and stats.mjs.

   Every event is ONE Netlify Blob whose KEY carries the whole event, so the stats page can be
   built from list() calls alone (no per-event get, no read-modify-write races):

     ev/<day>/<type>/<page>/<src>/<target>/<country>/<visitor>/<ts>-<rand>

   type    view | click
   page    listen (path without slashes)
   src     ig, tiktok, direct, google, … (see js/track.js for how it is picked)
   target  the link tapped on a click (spotify, apple, release, …); "-" on views
   visitor random per-device id from the browser (hashed IP+UA if storage is blocked)
   Days are UTC. Nothing personal is stored: no IP, no user agent. */

export const PREFIX = "ev/";

const SLUG = /[^a-z0-9_.-]/g;
export function slug(v, max = 32, fallback = "-") {
  const s = String(v == null ? "" : v).toLowerCase().replace(SLUG, "").slice(0, max);
  return s || fallback;
}

export function dayOf(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

export function eventKey(e, ts, rand) {
  return [
    "ev",
    dayOf(ts),
    e.type === "click" ? "click" : "view",
    slug(e.page, 32, "home"),
    slug(e.src, 24, "direct"),
    e.type === "click" ? slug(e.target, 24) : "-",
    slug(e.country, 2, "xx"),
    slug(e.visitor, 40),
    ts + "-" + slug(rand, 8, "0"),
  ].join("/");
}

export function parseKey(key) {
  const p = key.split("/");
  if (p.length !== 9 || p[0] !== "ev") return null;
  return { day: p[1], type: p[2], page: p[3], src: p[4], target: p[5], country: p[6], visitor: p[7] };
}

/* Days from `days` ago up to today, oldest first. */
export function dayRange(days, now = Date.now()) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) out.push(dayOf(now - i * 86400000));
  return out;
}

function bump(map, k, visitor, n = 1) {
  let row = map.get(k);
  if (!row) map.set(k, (row = { views: 0, visitors: new Set() }));
  row.views += n;
  row.visitors.add(visitor);
}

function rows(map, name) {
  return [...map.entries()]
    .map(([k, r]) => ({ [name]: k, count: r.views, unique: r.visitors.size }))
    .sort((a, b) => b.count - a.count || b.unique - a.unique);
}

/* Turns parsed events into what stats.html shows. `page` filters to one page ("listen"). */
export function aggregate(events, days, page = "listen") {
  const all = { views: 0, visitors: new Set() };
  const ig = { views: 0, visitors: new Set() };
  const bySrc = new Map(), byCountry = new Map(), clicks = new Map();
  const byDay = new Map(days.map((d) => [d, { views: 0, visitors: new Set(), ig: 0, igVisitors: new Set() }]));
  const igClickers = new Set();

  for (const e of events) {
    if (!e || (page && e.page !== page)) continue;
    const day = byDay.get(e.day);
    if (!day) continue;
    if (e.type === "click") {
      bump(clicks, e.target, e.visitor);
      if (e.src === "ig") igClickers.add(e.visitor);
      continue;
    }
    all.views++; all.visitors.add(e.visitor);
    day.views++; day.visitors.add(e.visitor);
    if (e.src === "ig") {
      ig.views++; ig.visitors.add(e.visitor);
      day.ig++; day.igVisitors.add(e.visitor);
    }
    bump(bySrc, e.src, e.visitor);
    bump(byCountry, e.country, e.visitor);
  }

  return {
    from: days[0],
    to: days[days.length - 1],
    totals: {
      views: all.views,
      unique: all.visitors.size,
      igViews: ig.views,
      igUnique: ig.visitors.size,
      /* share of IG visitors who went on to tap any link */
      igTapped: [...igClickers].filter((v) => ig.visitors.has(v)).length,
    },
    days: days.map((d) => {
      const r = byDay.get(d);
      return { day: d, views: r.views, unique: r.visitors.size, igViews: r.ig, igUnique: r.igVisitors.size };
    }),
    sources: rows(bySrc, "src"),
    countries: rows(byCountry, "country"),
    clicks: rows(clicks, "target"),
  };
}
