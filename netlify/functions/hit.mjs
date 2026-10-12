/* POST /api/hit: js/track.js reports one view or one link tap. Stored as a key-only Blob
   (see netlify/lib/stats.mjs). Always answers 204 so a failure never shows on the page. */
import { getDeployStore, getStore } from "@netlify/blobs";
import { eventKey } from "../lib/stats.mjs";

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|meta-externalagent|headless|lighthouse|pingdom|curl|wget|python|node-fetch|axios/i;
const PAGES = new Set(["listen"]);

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

  /* Browser id first (one per phone); hashed IP + UA only when the browser blocks storage. */
  let visitor = typeof body.v === "string" && /^[a-z0-9]{8,40}$/.test(body.v) ? body.v : "";
  if (!visitor) visitor = "h" + (await hashId((context.ip || "") + "|" + ua + "|" + (Netlify.env.get("STATS_SALT") || "bs")));

  const ts = Date.now();
  const key = eventKey(
    {
      type: body.t,
      page: body.p,
      src: body.s,
      target: body.k,
      country: context.geo?.country?.code,
      visitor,
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
