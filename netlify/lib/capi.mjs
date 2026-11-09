/* Meta Conversions API payload builder (9 Nov 2026). Pure, so tests/capi.test.mjs covers it.
   Used by netlify/functions/capi.mjs.

   The browser Pixel and this server send the SAME event_name + event_id, so Meta counts one
   event "received from Browser and Server" (deduplicated). What goes to Meta, and nothing else:
     event_name, event_time (s), event_id, action_source "website", event_source_url
     user_data: client_ip_address, client_user_agent, fbp, fbc, country (SHA-256 of 2 lowercase
                letters). NO names, emails, phones or ids of our own.
     custom_data: content_name, service (SpotifyClick), utm_content
   Docs: developers.facebook.com/docs/marketing-api/conversions-api/parameters/fbp-and-fbc
         developers.facebook.com/documentation/ads-commerce/conversions-api/deduplicate-pixel-and-server-events */

export const PIXEL_ID = "1442285344656582"; /* dataset "Badscandal Touch Me" (public id) */
export const GRAPH_VERSION = "v27.0"; /* checked 9 Nov 2026 (v28 not out). Meta retires old versions ~2 years after release. */
export const EVENTS = new Set(["PageView", "ViewContent", "SpotifyClick"]);

export async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* _fbc cookie wins; else build one from the ad click id: fb.1.<ms when first seen>.<fbclid>. */
export function fbcFrom(cookieFbc, fbclid, firstSeenMs) {
  if (typeof cookieFbc === "string" && /^fb\.\d\.\d{10,13}\.[\w-]{10,500}$/.test(cookieFbc)) return cookieFbc;
  if (typeof fbclid === "string" && /^[\w-]{10,500}$/.test(fbclid)) {
    const ms = Number.isFinite(firstSeenMs) && firstSeenMs > 1.5e12 && firstSeenMs < 1e13 ? Math.round(firstSeenMs) : Date.now();
    return `fb.1.${ms}.${fbclid}`;
  }
  return undefined;
}

export function validFbp(v) {
  return typeof v === "string" && /^fb\.\d\.\d{10,13}\.\d{1,20}$/.test(v) ? v : undefined;
}

const ID = /^[A-Za-z0-9_-]{8,64}$/;

/* body: what js/touchme.js beacons. req: { ip, ua, country, cookieFbp, cookieFbc, origin, now }. */
export async function buildEvents(body, req) {
  if (!body || !Array.isArray(body.ev)) return [];
  const now = req.now || Date.now();
  let url = typeof body.url === "string" ? body.url.slice(0, 500) : "";
  if (!req.origin || !url.startsWith(req.origin + "/")) url = req.origin ? req.origin + "/touchme" : undefined;

  const user = {
    client_ip_address: req.ip || undefined,
    client_user_agent: req.ua || undefined,
    fbp: validFbp(req.cookieFbp) || validFbp(body.fbp),
    fbc: fbcFrom(req.cookieFbc, body.fbclid, Number(body.ft)),
  };
  if (/^[A-Za-z]{2}$/.test(req.country || "")) user.country = [await sha256(req.country.toLowerCase())];
  for (const k of Object.keys(user)) if (user[k] === undefined) delete user[k];

  const utm = typeof body.ux === "string" ? body.ux.slice(0, 100) : undefined;
  const out = [];
  for (const e of body.ev.slice(0, 3)) {
    if (!e || !EVENTS.has(e.n) || !ID.test(e.id || "")) continue;
    const custom = { content_name: "Touch Me" };
    if (e.n === "SpotifyClick") custom.service = "spotify";
    if (utm) custom.utm_content = utm;
    out.push({
      event_name: e.n,
      event_time: Math.floor(now / 1000),
      event_id: e.id,
      action_source: "website",
      event_source_url: url,
      user_data: user,
      custom_data: custom,
    });
  }
  return out;
}

export function graphRequest(events, token, testCode) {
  const form = new URLSearchParams();
  form.set("data", JSON.stringify(events));
  form.set("access_token", token);
  if (testCode) form.set("test_event_code", testCode);
  return {
    url: `https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL_ID}/events`,
    init: { method: "POST", body: form, headers: { "Content-Type": "application/x-www-form-urlencoded" } },
  };
}
