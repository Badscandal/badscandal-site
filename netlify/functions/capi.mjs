/* POST /api/capi: js/touchme.js beacons PageView/ViewContent on load and SpotifyClick on the tap,
   with the same event_id the browser Pixel used; this forwards them to Meta's Conversions API
   (payload: netlify/lib/capi.mjs). Always answers 204; errors are logged server-side only.

   Real people only: data-centre IPs (lib/dc.mjs), bot user agents (lib/ua.mjs) and anything the
   page itself flagged as a bot (body.b) are refused here and nothing reaches Meta.

   Every send leaves a log line ("capi: SpotifyClick -> Meta received 1") and a key-only blob
   (mh/…, see healthKey in lib/capi.mjs) that /admin's "Meta health" card counts. No personal
   data in either.

   Netlify env vars (secret, never in the repo):
     META_CAPI_TOKEN        the dataset's Conversions API token
     META_TEST_EVENT_CODE   optional: the code from Events Manager -> Test events. While set, every
                            event shows under Test events. Deploy previews ONLY send when it is set,
                            so testing never mixes preview traffic into the real numbers.
                            Delete it after testing. */
import { getDeployStore, getStore } from "@netlify/blobs";
import { buildEvents, eventCodes, graphRequest, healthKey, LAST_ERROR_KEY, LAST_KEY, lastRecord, readMetaAnswer } from "../lib/capi.mjs";
import { datacenter } from "../lib/dc.mjs";
import { needsConsent } from "../lib/geo.mjs";
import { readCookie } from "../lib/session.mjs";
import { CLIENT_BOT } from "../lib/stats.mjs";
import { BOT } from "../lib/ua.mjs";

async function record(context, h, names) {
  try {
    const store = context.deploy?.context === "production" ? getStore("stats") : getDeployStore("stats");
    const now = Date.now();
    const writes = [store.set(healthKey(h, now, Math.random().toString(36).slice(2, 8)), "")];
    if (h.result !== "blocked") {
      const last = lastRecord(h, names, now);
      writes.push(store.setJSON(LAST_KEY, last));
      if (!last.ok) writes.push(store.setJSON(LAST_ERROR_KEY, last));
    }
    await Promise.all(writes);
  } catch (e) {
    console.error("capi: health write failed", e?.name || e);
  }
}

export default async (req, context) => {
  const done = new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  if (req.method !== "POST") return done;

  const ua = req.headers.get("user-agent") || "";
  if (!ua) return done;

  let body;
  try {
    const text = await req.text();
    if (text.length > 2048) return done;
    body = JSON.parse(text);
  } catch {
    return done;
  }
  if (!body || !Array.isArray(body.ev)) return done;
  const names = body.ev.slice(0, 3).map((e) => e && e.n).filter(Boolean);

  /* Bots and data centres: never to Meta. Counted as "blocked" so /admin shows it working. */
  const dc = datacenter(context.ip);
  const bot = BOT.test(ua) ? "ua" : dc ? "dc-" + dc : CLIENT_BOT.has(body.b) ? body.b : "";
  if (bot) {
    console.log(`capi: blocked ${names.join("+")} (${bot})`);
    await record(context, { events: eventCodes(names), sent: 0, result: "blocked", detail: bot }, names);
    return done;
  }

  /* Second lock behind the consent bar: EU/EEA/UK events need the visitor's "Allow". */
  const country = context.geo?.country?.code || "";
  if (needsConsent(country) && body.c !== 1) return done;

  const token = Netlify.env.get("META_CAPI_TOKEN");
  if (!token) {
    console.error("capi: META_CAPI_TOKEN is not set");
    return done;
  }
  const testCode = Netlify.env.get("META_TEST_EVENT_CODE") || "";
  if (context.deploy?.context !== "production" && !testCode) return done;

  const cookie = req.headers.get("cookie") || "";
  const events = await buildEvents(body, {
    ip: context.ip,
    ua,
    country,
    cookieFbp: readCookie(cookie, "_fbp"),
    cookieFbc: readCookie(cookie, "_fbc"),
    origin: new URL(req.url).origin,
  });
  if (!events.length) return done;

  const sentNames = events.map((e) => e.event_name);
  const label = sentNames.join("+") + (testCode ? " [test]" : "");
  const { url, init } = graphRequest(events, token, testCode);
  let h;
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(5000) });
    const json = await res.json().catch(() => null);
    const a = readMetaAnswer(res.status, json);
    h = { result: a.result, received: a.received, detail: a.detail, note: a.note };
    if (a.result === "ok") console.log(`capi: ${label} -> Meta received ${a.received} of ${events.length}`);
    else console.error(`capi: ${label} -> Meta refused (${a.detail}) ${a.note}`);
  } catch (e) {
    const why = e?.name === "TimeoutError" ? "timeout" : "network";
    h = { result: "error", received: null, detail: why, note: why === "timeout" ? "Meta didn't answer within 5 seconds" : "Couldn't reach Meta" };
    console.error(`capi: ${label} -> no answer from Meta (${why})`);
  }
  await record(context, { events: eventCodes(sentNames), sent: events.length, test: !!testCode, ...h }, sentNames);
  return done;
};

export const config = { path: "/api/capi" };
