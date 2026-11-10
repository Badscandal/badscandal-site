/* POST /api/hit: a page reports one view, one store tap or one consent choice. Stored as a
   key-only Blob (see netlify/lib/stats.mjs). Always answers 204 so a failure never shows on the
   page. Pages: every song in /songs.json (js/song.js), "home" (the homepage, js/count.js) and
   "listen" (the old 11 Oct counter's name, kept so its keys still read).

   Bots are KEPT but flagged (the `bot` part of the key, see stats.mjs) so /admin can leave them
   out of every number yet still show them on request: data-centre IPs (lib/dc.mjs), bot user
   agents (lib/ua.mjs), what the page noticed about itself (body.b), and Luke's own excluded
   devices (body.x from ?nostat=1, or the bs_nostat cookie set by /admin "Don't count this device"). */
import { getDeployStore, getStore } from "@netlify/blobs";
import { datacenter } from "../lib/dc.mjs";
import { readCookie } from "../lib/session.mjs";
import { SONGS } from "../lib/songs.mjs";
import { CLIENT_BOT, eventKey } from "../lib/stats.mjs";
import { BOT, parseUA } from "../lib/ua.mjs";

const PAGES = new Set(["home", "listen", ...SONGS.map((s) => s.slug)]);

async function hashId(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default async (req, context) => {
  const done = new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  if (req.method !== "POST") return done;

  const ua = req.headers.get("user-agent") || "";
  if (!ua) return done;

  let body;
  try {
    const text = await req.text();
    if (text.length > 1024) return done;
    body = JSON.parse(text);
  } catch {
    return done;
  }
  if (!body || !PAGES.has(body.p)) return done;

  /* Browser id first (one per phone); salted hash of IP + UA only when the browser blocks
     storage. The raw IP is never stored. */
  let visitor = typeof body.v === "string" && /^[a-z0-9]{8,40}$/.test(body.v) ? body.v : "";
  if (!visitor) {
    const salt = Netlify.env.get("STATS_SALT") || Netlify.env.get("ADMIN_KEY") || Netlify.env.get("STATS_KEY") || "bs";
    visitor = "h" + (await hashId((context.ip || "") + "|" + ua + "|" + salt));
  }

  const dc = datacenter(context.ip);
  const bot = BOT.test(ua) ? "ua"
    : dc ? "dc-" + dc
    : body.x === 1 || readCookie(req.headers.get("cookie"), "bs_nostat") === "1" ? "me"
    : CLIENT_BOT.has(body.b) ? body.b
    : "-";

  const ts = Date.now();
  const key = eventKey(
    {
      type: body.t,
      page: body.p,
      src: body.s,
      target: body.k,
      country: context.geo?.country?.code,
      visitor,
      pv: body.pv,
      campaign: body.uc,
      content: body.ux,
      city: context.geo?.city,
      ref: body.rf,
      ms: body.ms,
      meta: body.m,
      ret: body.r,
      bot,
      fb: body.fb,
      ...parseUA(ua),
    },
    ts,
    Math.random().toString(36).slice(2, 8)
  );

  try {
    /* Deploy previews get their own throwaway store so testing never touches the real numbers. */
    const store = context.deploy?.context === "production" ? getStore("stats") : getDeployStore("stats");
    await store.set(key, "");
  } catch (e) {
    console.error("stats write failed", e);
  }
  return done;
};

export const config = { path: "/api/hit" };
