/* /api/admin/* — the private admin portal's server (9 Nov 2026). Page: admin.html + js/admin.js.

   POST /api/admin/login    {password} -> session cookie (netlify/lib/session.mjs)
   POST /api/admin/logout   clears it
   GET  /api/admin/data     ?link=touchme&range=today|7d|30d|custom[&from=&to=][&bots=1]  -> dashboard JSON
   GET  /api/admin/csv      same query -> every visit in the range as a CSV download
   POST /api/admin/exclude  {on:true|false} -> sets/clears the bs_nostat cookie on THIS browser:
                            hit.mjs files its visits under "me", out of the numbers (9 Nov)

   The password is the Netlify env var ADMIN_KEY (secret; STATS_KEY still works as a fallback).
   Wrong passwords: 5 per 10 minutes per IP (hashed), counted in the "admin-auth" Blob store. */
import { getDeployStore, getStore } from "@netlify/blobs";
import { dashboard, healthSummary, LINKS, mergeSummary, resolveRange, spDay, spTime, summarize, toCSV, utcDaysFor, visitLog, addDays } from "../lib/admin.mjs";
import { HEALTH_PREFIX, LAST_ERROR_KEY, LAST_KEY, parseHealthKey } from "../lib/capi.mjs";
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

/* Raw events for these São Paulo days, plus any rolled-up (90+ days old) summaries. */
async function load(store, spDays, page, opts) {
  const utc = utcDaysFor(spDays);
  const lists = await Promise.all(utc.map((d) => listDay(store, d)));
  const events = lists.flat();
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
  if (req.method !== "GET" || (route !== "data" && route !== "csv")) return json(404, { error: "Not found" });

  const link = LINKS.find((l) => l.id === url.searchParams.get("link")) || LINKS[0];
  const r = resolveRange({
    range: url.searchParams.get("range") || "7d",
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });
  const store = context.deploy?.context === "production" ? getStore("stats") : getDeployStore("stats");
  const bots = url.searchParams.get("bots") === "1";
  /* A range that ends today is only partly over: compare it with the same stretch of the
     previous period, not the whole of it. */
  const now = Date.now();
  const until = r.days[r.days.length - 1] === spDay(now) ? now - r.days.length * 86400000 : undefined;

  try {
    if (route === "csv") {
      const s = await load(store, r.days, link.id, { bots });
      const name = `${link.id}-visits-${r.days[0]}-to-${r.days[r.days.length - 1]}.csv`;
      return new Response(toCSV(visitLog(s)), {
        status: 200,
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, ...NO_STORE },
      });
    }
    const [cur, prev, health] = await Promise.all([
      load(store, r.days, link.id, { bots }),
      load(store, r.prev, link.id, { bots, until }),
      loadHealth(store, r.days).catch(() => null),
    ]);
    if (health) health.testMode = !!Netlify.env.get("META_TEST_EVENT_CODE");
    const extra = { health, bots, excluded: readCookie(req.headers.get("cookie"), NOSTAT) === "1" };
    return json(200, { ...dashboard(cur, prev, r.days, link.id, extra), range: r.range, generated: new Date().toISOString() });
  } catch (e) {
    console.error("admin data failed", e);
    return json(500, { error: "Could not read the numbers" });
  }
};

export const config = { path: "/api/admin/*" };
