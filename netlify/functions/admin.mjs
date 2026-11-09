/* /api/admin/* — the private admin portal's server (9 Nov 2026). Page: admin.html + js/admin.js.

   POST /api/admin/login    {password} -> session cookie (netlify/lib/session.mjs)
   POST /api/admin/logout   clears it
   GET  /api/admin/data     ?link=touchme&range=today|7d|30d|custom[&from=&to=]  -> dashboard JSON
   GET  /api/admin/csv      same query -> every visit in the range as a CSV download

   The password is the Netlify env var ADMIN_KEY (secret; STATS_KEY still works as a fallback).
   Wrong passwords: 5 per 10 minutes per IP (hashed), counted in the "admin-auth" Blob store. */
import { getDeployStore, getStore } from "@netlify/blobs";
import { dashboard, LINKS, mergeSummary, resolveRange, summarize, toCSV, utcDaysFor, visitLog, addDays } from "../lib/admin.mjs";
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
async function load(store, spDays, page) {
  const utc = utcDaysFor(spDays);
  const lists = await Promise.all(utc.map((d) => listDay(store, d)));
  const events = lists.flat();
  const s = summarize(events, spDays, page);

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
  if (req.method !== "GET" || (route !== "data" && route !== "csv")) return json(404, { error: "Not found" });

  const link = LINKS.find((l) => l.id === url.searchParams.get("link")) || LINKS[0];
  const r = resolveRange({
    range: url.searchParams.get("range") || "7d",
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });
  const store = context.deploy?.context === "production" ? getStore("stats") : getDeployStore("stats");

  try {
    if (route === "csv") {
      const s = await load(store, r.days, link.id);
      const name = `${link.id}-visits-${r.days[0]}-to-${r.days[r.days.length - 1]}.csv`;
      return new Response(toCSV(visitLog(s)), {
        status: 200,
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, ...NO_STORE },
      });
    }
    const [cur, prev] = await Promise.all([load(store, r.days, link.id), load(store, r.prev, link.id)]);
    return json(200, { ...dashboard(cur, prev, r.days, link.id), range: r.range, generated: new Date().toISOString() });
  } catch (e) {
    console.error("admin data failed", e);
    return json(500, { error: "Could not read the numbers" });
  }
};

export const config = { path: "/api/admin/*" };
