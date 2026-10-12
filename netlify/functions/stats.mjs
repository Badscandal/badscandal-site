/* GET /api/stats?days=30 — the numbers behind /stats. Needs the header x-stats-key to match the
   Netlify env var STATS_KEY (secret; never commit it). Lists one Blob prefix per day and
   aggregates from the keys alone (netlify/lib/stats.mjs). */
import { getDeployStore, getStore } from "@netlify/blobs";
import { aggregate, dayRange, parseKey, PREFIX } from "../lib/stats.mjs";

const json = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

function sameSecret(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default async (req, context) => {
  const secret = Netlify.env.get("STATS_KEY");
  if (!secret) return json(503, { error: "STATS_KEY is not set on Netlify" });
  if (!sameSecret(req.headers.get("x-stats-key") || "", secret)) return json(401, { error: "Wrong code" });

  const url = new URL(req.url);
  const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get("days"), 10) || 30));
  const range = dayRange(days);
  const store = context.deploy?.context === "production" ? getStore("stats") : getDeployStore("stats");

  const events = [];
  await Promise.all(
    range.map(async (day) => {
      const { blobs } = await store.list({ prefix: PREFIX + day + "/" });
      for (const b of blobs) {
        const e = parseKey(b.key);
        if (e) events.push(e);
      }
    })
  );

  return json(200, { ...aggregate(events, range, "listen"), generated: new Date().toISOString() });
};

export const config = { path: "/api/stats" };
