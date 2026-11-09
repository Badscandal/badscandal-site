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

/* ---------- proof that Meta got them (9 Nov 2026) ----------
   Every call to Meta (and every one we refuse because it came from a bot) leaves ONE key-only
   blob in the stats store, so /admin can show a "Meta health" card. Nothing personal: no IP,
   no user agent, no ids, only what was sent and what Meta said.

     mh/<utc day>/<ts>-<rand>/<events>/<sent>/<received>/<result>/<detail>/<test>

   events    pv.vc (PageView + ViewContent) or sc (SpotifyClick)
   sent      how many events we sent;  received  Meta's events_received ("-" if no answer)
   result    ok | error | blocked (a bot or data centre: nothing sent)
   detail    error: http-<status>[-code-<n>] or timeout/network; blocked: the bot reason
   test      1 = went to Events Manager -> Test events (META_TEST_EVENT_CODE was set) */
export const HEALTH_PREFIX = "mh/";
const CODES = { PageView: "pv", ViewContent: "vc", SpotifyClick: "sc" };

export function eventCodes(names) {
  return names.map((n) => CODES[n] || "x").join(".") || "x";
}

function hslug(v, max = 40) {
  return String(v == null ? "-" : v).toLowerCase().replace(/[^a-z0-9_.-]/g, "-").replace(/-{2,}/g, "-").slice(0, max) || "-";
}

export function healthKey(h, ts, rand) {
  return [
    "mh",
    new Date(ts).toISOString().slice(0, 10),
    ts + "-" + hslug(rand, 8),
    hslug(h.events, 16),
    Number.isFinite(h.sent) ? String(h.sent) : "0",
    Number.isFinite(h.received) ? String(h.received) : "-",
    ["ok", "error", "blocked"].includes(h.result) ? h.result : "error",
    hslug(h.detail || "-", 40),
    h.test ? "1" : "0",
  ].join("/");
}

export function parseHealthKey(key) {
  const p = String(key).split("/");
  if (p.length !== 9 || p[0] !== "mh") return null;
  return {
    day: p[1], ts: parseInt(p[2], 10) || 0, events: p[3].split("."), sent: Number(p[4]) || 0,
    received: p[5] === "-" ? null : Number(p[5]), result: p[6], detail: p[7], test: p[8] === "1",
  };
}

/* Meta's answer -> what we log and store. Error text is trimmed and anything shaped like an IP
   address is masked, so a log line can never carry a visitor's data. */
export function readMetaAnswer(status, json) {
  const ok = status >= 200 && status < 300 && json && Number.isFinite(json.events_received);
  if (ok) return { result: "ok", received: json.events_received, detail: "-", note: "" };
  const err = (json && json.error) || {};
  const code = Number.isFinite(err.code) ? "-code-" + err.code + (Number.isFinite(err.error_subcode) ? "-" + err.error_subcode : "") : "";
  const note = scrub(err.error_user_msg || err.message || (json ? "" : "no answer body"));
  return { result: "error", received: null, detail: "http-" + status + code, note };
}

/* Meta's error text, safe to log and show: no access token (they start "EAA"), no IP, short. */
export function scrub(msg) {
  return String(msg || "")
    .replace(/access_token=[^&\s]+/gi, "access_token=<hidden>")
    .replace(/\bEAA[A-Za-z0-9]{10,}/g, "<token>")
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "<ip>")
    .replace(/\b[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7}\b/gi, "<ip>")
    .slice(0, 200);
}

/* The "last call" record behind /admin's status line ("Meta: sending OK, last event 2 min ago").
   One small JSON blob, overwritten on every real send (bots never touch it). */
export const LAST_KEY = "health/last.json";
export const LAST_ERROR_KEY = "health/last-error.json";
export function lastRecord(h, names, ts) {
  return { ok: h.result === "ok", ts, events: names, received: h.received ?? null, detail: h.detail || "-", message: h.result === "ok" ? "" : scrub(h.note || ""), test: !!h.test };
}
