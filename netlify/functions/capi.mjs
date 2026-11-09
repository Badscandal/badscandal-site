/* POST /api/capi: js/touchme.js beacons PageView/ViewContent on load and SpotifyClick on the tap,
   with the same event_id the browser Pixel used; this forwards them to Meta's Conversions API
   (payload: netlify/lib/capi.mjs). Always answers 204; errors are logged server-side only.

   Netlify env vars (secret, never in the repo):
     META_CAPI_TOKEN        the dataset's Conversions API token
     META_TEST_EVENT_CODE   optional: the code from Events Manager -> Test events. While set, every
                            event shows under Test events. Deploy previews ONLY send when it is set,
                            so testing never mixes preview traffic into the real numbers.
                            Delete it after testing. */
import { buildEvents, graphRequest } from "../lib/capi.mjs";
import { needsConsent } from "../lib/geo.mjs";
import { readCookie } from "../lib/session.mjs";
import { BOT } from "../lib/ua.mjs";

export default async (req, context) => {
  const done = new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  if (req.method !== "POST") return done;

  const ua = req.headers.get("user-agent") || "";
  if (!ua || BOT.test(ua)) return done;

  let body;
  try {
    const text = await req.text();
    if (text.length > 2048) return done;
    body = JSON.parse(text);
  } catch {
    return done;
  }

  /* Second lock behind the consent bar: EU/EEA/UK events need the visitor's "Allow". */
  const country = context.geo?.country?.code || "";
  if (needsConsent(country) && body?.c !== 1) return done;

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

  const { url, init } = graphRequest(events, token, testCode);
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(5000) });
    if (!res.ok) console.error("capi: Meta answered", res.status, (await res.text()).slice(0, 400));
  } catch (e) {
    console.error("capi: send failed", e?.name || e);
  }
  return done;
};

export const config = { path: "/api/capi" };
