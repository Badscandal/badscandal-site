/* /api/admin/* — the dashboard's page-visit server (9 Nov 2026). Page since 11 Nov: /hq (hq.html + js/hq.js + js/hq-pages.js); /admin 301s there.

   POST /api/admin/login    {password} -> session cookie (netlify/lib/session.mjs)
   POST /api/admin/logout   clears it
   GET  /api/admin/data     ?link=<song slug|home>&range=today|7d|30d|custom[&from=&to=][&bots=1]  -> dashboard JSON
                            (+ Meta spend / cost per tap when META_ADS_TOKEN is set; read-only)
   GET  /api/admin/csv      same query -> every visit in the range as a CSV download
   GET  /api/admin/overview ?range=…  -> every song at once for /hq's Today, Songs and Ads (11 Nov 2026):
                            visits, people and real Spotify taps per song, yesterday across all songs,
                            Meta spend + cost per tap per ad / day / song, the Meta-only cap, Meta
                            events health and the Meta key line. Same login, read-only.
   ?sample=1 on data / csv / overview -> MADE-UP numbers from netlify/lib/admin-sample.mjs (in memory,
                            never Meta, never the real stores), for /hq?sample=1.
   POST /api/admin/exclude  {on:true|false} -> sets/clears the bs_nostat cookie on THIS browser:
                            hit.mjs files its visits under "me", out of the numbers (9 Nov)

   The password is the Netlify env var ADMIN_KEY (secret; STATS_KEY still works as a fallback).
   Wrong passwords: 5 per 10 minutes per IP (hashed), counted in the "admin-auth" Blob store. */
import { getDeployStore, getStore } from "@netlify/blobs";
import { adTaps, dashboard, defaultLink, healthSummary, LINKS, mergeSummary, resolveRange, spDay, spTime, summarize, toCSV, utcDaysFor, visitLog, addDays } from "../lib/admin.mjs";
import { HEALTH_PREFIX, LAST_ERROR_KEY, LAST_KEY, parseHealthKey } from "../lib/capi.mjs";
import { DEFAULT_ACCOUNT, capReport, spendReport } from "../lib/metaspend.mjs";
import { keyHealth, readKeyHealth, readMeta } from "../lib/metaread.mjs";
import { sampleEnv } from "../lib/admin-sample.mjs";
import { convert, fetchMonthAverage, FX_TTL_MS } from "../lib/fx.mjs";
import { checkPassword, clearCookie, COOKIE, makeSession, readCookie, sessionCookie, verifySession } from "../lib/session.mjs";
import { parseKey, PREFIX } from "../lib/stats.mjs";

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (status, data, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...NO_STORE, ...extra } });

const MAX_TRIES = 5;
const WINDOW_MS = 10 * 60 * 1000;

async function ipKey(ip, secret) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode((ip || "") + "|" + secret));
  return "rl/" + [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function login(req, context, secret) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return json(403, { error: "Wrong origin" });

  const auth = getStore({ name: "admin-auth", consistency: "strong" });
  const key = await ipKey(context.ip, secret);
  const now = Date.now();
  let rl = null;
  try { rl = await auth.get(key, { type: "json" }); } catch {}
  if (rl && now - rl.t < WINDOW_MS && rl.n >= MAX_TRIES) {
    const mins = Math.ceil((WINDOW_MS - (now - rl.t)) / 60000);
    return json(429, { error: `Too many tries. Wait ${mins} min.` });
  }

  let password = "";
  try { password = String((await req.json()).password || ""); } catch {}
  if (!(await checkPassword(password, secret))) {
    const next = rl && now - rl.t < WINDOW_MS ? { n: rl.n + 1, t: rl.t } : { n: 1, t: now };
    try { await auth.setJSON(key, next); } catch (e) { console.error("admin rate-limit write failed", e); }
    return json(401, { error: "Wrong password", left: Math.max(0, MAX_TRIES - next.n) });
  }
  try { await auth.delete(key); } catch {}
  return json(200, { ok: true }, { "Set-Cookie": sessionCookie(await makeSession(secret)) });
}

async function listDay(store, utcDay) {
  const { blobs } = await store.list({ prefix: PREFIX + utcDay + "/" });
  return blobs.map((b) => parseKey(b.key)).filter(Boolean);
}

async function listEvents(store, spDays) {
  const lists = await Promise.all(utcDaysFor(spDays).map((d) => listDay(store, d)));
  return lists.flat();
}

/* Raw events for these São Paulo days, plus any rolled-up (90+ days old) summaries. */
async function load(store, spDays, page, opts, preloaded) {
  const utc = utcDaysFor(spDays);
  const events = preloaded || (await listEvents(store, spDays));
  const s = summarize(events, spDays, page, opts);

  const cutoff = addDays(new Date().toISOString().slice(0, 10), -88);
  const old = utc.filter((d) => d < cutoff);
  if (old.length) {
    const keep = new Set(spDays);
    const rolled = await Promise.all(old.map((d) => store.get("daily/" + d + ".json", { type: "json" }).catch(() => null)));
    for (const r of rolled) {
      const day = r && r.pages && r.pages[page];
      if (!day) continue;
      for (const d of Object.keys(day.days || {})) if (!keep.has(d)) delete day.days[d];
      mergeSummary(s, day);
    }
  }
  return s;
}

async function loadHealth(store, spDays) {
  const utc = utcDaysFor([...new Set([...spDays, spDay(Date.now())])]);
  const lists = await Promise.all(utc.map((d) =>
    store.list({ prefix: HEALTH_PREFIX + d + "/" }).then((r) => r.blobs.map((b) => parseHealthKey(b.key))).catch(() => [])));
  const h = healthSummary(lists.flat(), spDays);
  const [last, lastErr] = await Promise.all([LAST_KEY, LAST_ERROR_KEY].map((k) => store.get(k, { type: "json" }).catch(() => null)));
  const show = (r) => r && { ok: r.ok, time: spTime(r.ts), agoMs: Date.now() - r.ts, events: r.events, message: r.message, detail: r.detail, test: r.test };
  h.last = show(last);
  h.lastErrorFull = show(lastErr);
  return h;
}

/* Cost per tap: Meta spend for these days (READ-ONLY, see netlify/lib/metaspend.mjs), cached an
   hour, matched to real (people-only) Spotify taps of every song. */
/* Where the numbers come from: the real Blob stores and Meta settings, or (sample) the made-up ones. */
function envFor(context, sample) {
  if (sample) return sampleEnv();
  const prod = context.deploy?.context === "production";
  return {
    sample: false,
    stats: prod ? getStore("stats") : getDeployStore("stats"),
    cache: prod ? getStore("meta-cache") : getDeployStore("meta-cache"),
    token: Netlify.env.get("META_ADS_TOKEN") || "",
    account: (Netlify.env.get("META_AD_ACCOUNT_ID") || DEFAULT_ACCOUNT).replace(/\D/g, ""),
    testMode: !!Netlify.env.get("META_TEST_EVENT_CODE"),
  };
}

/* Ad-level Meta rows for since..until (read-only, cached an hour). -> { rows, at } | { error } */
async function adRows(env, since, until) {
  const r = await readMeta({ cache: env.cache, token: env.token, account: env.account, since, until, level: "ad", key: `insights/${env.account}/${since}_${until}.json` });
  if (r.error) console.error("meta spend: " + r.error); /* scrubbed: never the token */
  return r.error ? (r.stale || { error: r.error }) : r;
}

async function loadSpend(env, spDays, events, current) {
  if (!env.token) return { connected: false };
  const since = spDays[0], until = spDays[spDays.length - 1];
  const r = await adRows(env, since, until);
  if (r.error) return { connected: true, error: r.error };
  const got = r;
  const songs = LINKS.filter((l) => l.date).map((l) => ({ id: l.id, title: l.title, ...adTaps(summarize(events, spDays, l.id)) }));
  return { ...spendReport(got.rows, songs, current), fetched: spTime(got.at) };
}

/* The monthly ad cap: the whole Meta ad account, 1st of this month .. today (São Paulo), cached an
   hour. READ-ONLY, display only. */
async function loadCap(env) {
  if (!env.token) return { connected: false };
  const today = spDay(Date.now()), since = today.slice(0, 8) + "01";
  const r = await readMeta({ cache: env.cache, token: env.token, account: env.account, since, until: today, level: "account", key: `cap/${env.account}/${today}.json` });
  if (r.error) console.error("meta cap: " + r.error); /* scrubbed: never the token */
  const got = r.error ? r.stale : r;
  if (!got) return { connected: true, error: r.error };
  const rep = capReport(got.rows, today);
  const fx = await loadFx(env, rep.month, today).catch(() => null);
  const eur = fx && !fx.error ? convert(rep.spent, rep.currency, "EUR", fx) : null;
  return { connected: true, ...rep, fetched: spTime(got.at), fx: eur == null ? null : { eur, rate: fx[rep.currency], days: fx.days } };
}

/* This month's average exchange rates (ECB), cached 12 h. Estimates for reading only. */
async function loadFx(env, month, today) {
  const cache = env.cache;
  const key = `fx/${month}.json`;
  let got = null;
  try { got = await cache.get(key, { type: "json" }); } catch {}
  if (got && Date.now() - got.at < FX_TTL_MS) return got.fx;
  const fx = await fetchMonthAverage(month, today);
  if (fx.error) return got ? got.fx : fx;
  try { await cache.setJSON(key, { at: Date.now(), fx }); } catch {}
  return fx;
}

/* /hq's Today, Songs and Ads in one go: every song for the range, yesterday across all songs, Meta
   spend + cost per tap per ad / day / song (read-only, cached an hour), the Meta-only cap, events
   health and the key line. People-only, exactly like the per-link numbers. */
async function overview(env, r, now) {
  const today = spDay(now), yday = addDays(today, -1);
  const songs = LINKS.filter((l) => l.date);
  const events = await listEvents(env.stats, [...new Set([...r.days, yday])].sort());
  const per = await Promise.all(songs.map(async (l) => {
    const s = await load(env.stats, r.days, l.id, {}, events);
    const y = summarize(events, [yday], l.id);
    return { id: l.id, title: l.title, date: l.date, cover: l.cover, path: l.path, visits: s.visits, people: s.unique, taps: s.taps, y: { people: y.unique, taps: y.taps }, ...adTaps(s) };
  }));
  const yesterday = { d: yday, people: per.reduce((n, s) => n + s.y.people, 0), taps: per.reduce((n, s) => n + s.y.taps, 0), spend: null, cpt: null, currency: "" };
  let spend = { connected: false };
  if (env.token) {
    const since = r.days[0] < yday ? r.days[0] : yday, until = r.days[r.days.length - 1] > yday ? r.days[r.days.length - 1] : yday;
    const got = await adRows(env, since, until);
    if (got.error) spend = { connected: true, error: got.error };
    else {
      const keep = new Set(r.days);
      const rows = got.rows.filter((x) => keep.has(x.day));
      const forSpend = per.map((s) => ({ id: s.id, title: s.title, taps: s.taps, tapsByAd: s.tapsByAd, tapsByDay: s.tapsByDay }));
      const reps = per.map((s) => spendReport(rows, forSpend, s.id));
      const base = reps[0] || spendReport(rows, forSpend, "");
      spend = { connected: true, currency: base.currency, total: base.total, unmatched: base.unmatched, fetched: spTime(got.at),
        ads: reps.flatMap((x, i) => x.ads.map((a) => ({ song: per[i].title, ...a }))).sort((a, b) => b.spend - a.spend),
        days: base.allDays, songs: base.songs };
      const ys = got.rows.filter((x) => x.day === yday).reduce((n, x) => n + x.spend, 0);
      yesterday.spend = Math.round(ys * 100) / 100;
      yesterday.currency = (got.rows.find((x) => x.currency) || {}).currency || "";
      yesterday.cpt = yesterday.taps && ys ? ys / yesterday.taps : null;
    }
  }
  const [cap, health, keyRec] = await Promise.all([
    loadCap(env).catch((e) => { console.error("meta cap failed", e?.name || e); return { connected: true, error: "Couldn't read Meta spend" }; }),
    loadHealth(env.stats, r.days).catch(() => null),
    readKeyHealth(env.cache),
  ]);
  if (health) health.testMode = env.testMode;
  return {
    range: r.range, days: r.days.length, from: r.days[0], to: r.days[r.days.length - 1],
    songs: per.map(({ y, tapsByAd, tapsByDay, ...s }) => s), yesterday, spend, cap, health,
    metaKey: keyHealth(keyRec, !!env.token, now), sample: env.sample || undefined, generated: new Date(now).toISOString(),
  };
}

/* Luke's "Don't count this device": a long-lived cookie set by the server (Safari keeps those; it
   wipes script-set storage after 7 days without a visit). Sent with every /api/hit beacon. */
const NOSTAT = "bs_nostat";
function nostatCookie(on) {
  return on
    ? `${NOSTAT}=1; Path=/; Max-Age=34560000; Secure; HttpOnly; SameSite=Lax`
    : `${NOSTAT}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`;
}

export default async (req, context) => {
  const secret = Netlify.env.get("ADMIN_KEY") || Netlify.env.get("STATS_KEY");
  if (!secret) return json(503, { error: "ADMIN_KEY is not set on Netlify" });

  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/admin\/?/, "");

  if (route === "login" && req.method === "POST") return login(req, context, secret);
  if (route === "logout" && req.method === "POST") return json(200, { ok: true }, { "Set-Cookie": clearCookie() });

  if (!(await verifySession(readCookie(req.headers.get("cookie"), COOKIE), secret))) {
    return json(401, { error: "Not logged in" });
  }
  if (route === "exclude" && req.method === "POST") {
    const origin = req.headers.get("origin");
    if (origin && origin !== url.origin) return json(403, { error: "Wrong origin" });
    let on = true;
    try { on = (await req.json()).on !== false; } catch {}
    return json(200, { ok: true, excluded: on }, { "Set-Cookie": nostatCookie(on) });
  }
  if (req.method !== "GET" || (route !== "data" && route !== "csv" && route !== "overview")) return json(404, { error: "Not found" });

  const link = LINKS.find((l) => l.id === url.searchParams.get("link")) || defaultLink();
  const r = resolveRange({
    range: url.searchParams.get("range") || "7d",
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });
  const env = envFor(context, url.searchParams.get("sample") === "1");
  const store = env.stats;
  const bots = url.searchParams.get("bots") === "1";
  /* A range that ends today is only partly over: compare it with the same stretch of the
     previous period, not the whole of it. */
  const now = Date.now();
  const until = r.days[r.days.length - 1] === spDay(now) ? now - r.days.length * 86400000 : undefined;

  try {
    if (route === "overview") return json(200, await overview(env, r, now));
    if (route === "csv") {
      const s = await load(store, r.days, link.id, { bots });
      const name = `${link.id}-visits-${r.days[0]}-to-${r.days[r.days.length - 1]}.csv`;
      return new Response(toCSV(visitLog(s)), {
        status: 200,
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, ...NO_STORE },
      });
    }
    const events = await listEvents(store, r.days);
    const [cur, prev, health, spend, cap] = await Promise.all([
      load(store, r.days, link.id, { bots }, events),
      load(store, r.prev, link.id, { bots, until }),
      loadHealth(store, r.days).catch(() => null),
      link.date ? loadSpend(env, r.days, events, link.id).catch((e) => { console.error("meta spend failed", e?.name || e); return { connected: true, error: "Couldn't read Meta spend" }; }) : null,
      loadCap(env).catch((e) => { console.error("meta cap failed", e?.name || e); return { connected: true, error: "Couldn't read Meta spend" }; }),
    ]);
    if (health) health.testMode = env.testMode;
    /* after the reads above, so it reflects them */
    const metaKey = keyHealth(await readKeyHealth(env.cache), !!env.token);
    const extra = { health, spend, cap, bots, metaKey, sample: env.sample || undefined, excluded: readCookie(req.headers.get("cookie"), NOSTAT) === "1" };
    return json(200, { ...dashboard(cur, prev, r.days, link.id, extra), range: r.range, generated: new Date().toISOString() });
  } catch (e) {
    console.error("admin data failed", e);
    return json(500, { error: "Could not read the numbers" });
  }
};

export const config = { path: "/api/admin/*" };
