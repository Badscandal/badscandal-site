/* POST /api/hit: a page reports one view, one store tap or one consent choice. Stored as a
   key-only Blob (see netlify/lib/stats.mjs). Always answers 204 so a failure never shows on the
   page. Pages: listen (11 Oct, js/track.js) and touchme (9 Nov, js/touchme.js). */
import { getDeployStore, getStore } from "@netlify/blobs";
import { eventKey } from "../lib/stats.mjs";
import { BOT, parseUA } from "../lib/ua.mjs";

const PAGES = new Set(["listen", "touchme"]);

async function hashId(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default async (req, context) => {
  const done = new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  if (req.method !== "POST") return done;

  const ua = req.headers.get("user-agent") || "";
  if (!ua || BOT.test(ua)) return done;

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
