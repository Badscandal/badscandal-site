/* Our own visit counter (11 Oct 2026, extended 9 Nov 2026 for /touchme + the admin portal).
   Shared by netlify/functions/hit.mjs, admin.mjs and rollup.mjs.

   Every event is ONE Netlify Blob whose KEY carries the whole event, so the portal is built
   from list() calls alone (no per-event get, no read-modify-write races):

     ev/<day>/<type>/<page>/<src>/<target>/<country>/<visitor>/<ts>-<rand>          (11 Oct, 9 parts)
       /<pv>/<campaign>/<content>/<city>/<device>/<os>/<browser>/<app>/<ref>/<ms>/<meta>/<ret>
                                                                                 (9 Nov, +12 = 21 parts)
       /<bot>/<fb>                                                               (9 Nov later, 23 parts)

   type      view | click | consent | act (the first real touch / pointer / scroll / key press
             while the page was on screen: what makes a page load count as a person, see
             netlify/lib/admin.mjs)
   page      touchme, listen, … (path without slashes)
   src       where the visit came from: utm_source (meta), else ig/facebook/tiktok from the
             in-app browser, else the referrer's site, else direct
   target    click: the store tapped (spotify, apple, youtube, deezer, amazon);
             consent: yes | no; act: touch | pointer | scroll | key | tap; view: "-"
   visitor   random per-device id from the browser (hashed IP+UA+salt if storage is blocked)
   pv        random id of ONE page load: joins a visit to the taps made from it
   campaign  utm_campaign;  content  utm_content (= the Meta ad name)
   city      from Netlify's geo lookup, accents stripped (sao-paulo)
   device/os/browser/app   labels from the user agent (netlify/lib/ua.mjs); the UA itself is
             never stored
   ref       referrer's host
   ms        view: page start -> Spotify button tappable; click: page start -> the tap;
             act: page start -> the first interaction. Capped at 10 min (600000)
   meta      click: 1 = also sent to Meta (Pixel + Conversions API), 0 = not (no consent)
   ret       1 = this browser had been to the site before
   bot       "-" = a person. Anything else is kept for checking but left out of every number in
             /admin (the "Show bots" switch brings it back): dc-meta / dc-aws / dc-google /
             dc-azure / dc-apple (data-centre IP, netlify/lib/dc.mjs), ua (bot user agent),
             webdriver, headless, notouch (phone UA without a touch screen), hidden (page never
             on screen), fasttap (tap faster than a human), synthetic (script click), me (Luke's
             own excluded device, ?nostat=1 or /admin "Don't count this device")
   fb        1 = the link carried Meta's click id (fbclid). With no utm_content it's shown as
             "Meta ad (untagged)" (see adOf in netlify/lib/admin.mjs)

   Days in the key are UTC (the portal regroups by São Paulo day). Nothing personal is stored:
   no IP, no user agent, no names. Keys older than 90 days are folded into daily totals and
   deleted by netlify/functions/rollup.mjs. */

export const PREFIX = "ev/";
export const TYPES = new Set(["view", "click", "consent", "act"]);

/* What the browser may report about itself (js/touchme.js); the server adds dc-* and ua. */
export const CLIENT_BOT = new Set(["webdriver", "headless", "notouch", "hidden", "fasttap", "synthetic"]);

const SLUG = /[^a-z0-9_.-]/g;
export function slug(v, max = 32, fallback = "-") {
  const s = String(v == null ? "" : v)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim().replace(/\s+/g, "-")
    .replace(SLUG, "").replace(/-{2,}/g, "-").replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, max);
  return s && s !== "." && s !== ".." ? s : fallback;
}

function num(v, max = 600000) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? String(Math.min(n, max)) : "-";
}

function flag(v) {
  return v === 1 || v === "1" || v === true ? "1" : v === 0 || v === "0" || v === false ? "0" : "-";
}

export function dayOf(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

export function eventKey(e, ts, rand) {
  const type = TYPES.has(e.type) ? e.type : "view";
  return [
    "ev",
    dayOf(ts),
    type,
    slug(e.page, 32, "home"),
    slug(e.src, 24, "direct"),
    type === "view" ? "-" : slug(e.target, 24),
    slug(e.country, 2, "xx"),
    slug(e.visitor, 40),
    ts + "-" + slug(rand, 8, "0"),
    slug(e.pv, 16),
    slug(e.campaign, 32),
    slug(e.content, 48),
    slug(e.city, 32),
    slug(e.device, 8),
    slug(e.os, 10),
    slug(e.browser, 10),
    slug(e.app, 10),
    slug(e.ref, 40),
    num(e.ms),
    flag(e.meta),
    flag(e.ret),
    slug(e.bot, 16),
    flag(e.fb),
  ].join("/");
}

const EXTRA = ["pv", "campaign", "content", "city", "device", "os", "browser", "app", "ref", "ms", "meta", "ret", "bot", "fb"];

export function parseKey(key) {
  const p = String(key).split("/");
  if ((p.length !== 9 && p.length !== 21 && p.length !== 23) || p[0] !== "ev") return null;
  const e = {
    day: p[1], type: p[2], page: p[3], src: p[4], target: p[5], country: p[6], visitor: p[7],
    ts: parseInt(p[8], 10) || 0,
  };
  EXTRA.forEach((name, i) => { e[name] = p.length > 9 && p[9 + i] !== undefined ? p[9 + i] : "-"; });
  e.ms = e.ms === "-" ? null : Number(e.ms);
  e.parts = p.length; /* 9 / 21 = written before the bot filter existed (see hardBot in admin.mjs) */
  return e;
}

/* Days from `days` ago up to today (UTC), oldest first. */
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

/* The original 11 Oct summary for the /listen bio link (kept for that page; the admin portal
   uses netlify/lib/admin.mjs). `page` filters to one page. */
export function aggregate(events, days, page = "listen") {
  const all = { views: 0, visitors: new Set() };
  const ig = { views: 0, visitors: new Set() };
  const bySrc = new Map(), byCountry = new Map(), clicks = new Map();
  const byDay = new Map(days.map((d) => [d, { views: 0, visitors: new Set(), ig: 0, igVisitors: new Set() }]));
  const igClickers = new Set();

  for (const e of events) {
    if (!e || (page && e.page !== page)) continue;
    if (e.bot && e.bot !== "-") continue;
    const day = byDay.get(e.day);
    if (!day) continue;
    if (e.type === "click") {
      bump(clicks, e.target, e.visitor);
      if (e.src === "ig") igClickers.add(e.visitor);
      continue;
    }
    if (e.type !== "view") continue;
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
