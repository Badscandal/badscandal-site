/* A small sender for Apple's push service (APNs), 12 Nov 2026, for the HQ apps (iPhone + Mac).
   No dependencies: node:http2 and WebCrypto only.

     apnsJwt      the ES256 provider token ({alg, kid} . {iss: team, iat}), iat on a 30-minute boundary
                  (Apple refuses one older than an hour, and one renewed more often than every 20 min)
     apnsRequest  what one push looks like on the wire (pure)
     sendApns     sends it; { status, reason, dead }. dead = Apple says this token will never work again
                  (410, BadDeviceToken, Unregistered, DeviceTokenNotForTopic): the device is removed
     payloadOf    the payload shapes the apps expect (the "bridge" in the HQ-App plan)
     pushKey      where the key comes from: Netlify env APNS_KEY (base64 of the .p8's PKCS#8 body),
                  APNS_KEY_ID, APNS_TEAM_ID; else the Blob push/key.json on the staff desk store

   The key is never logged, never returned by any endpoint and never in this repo. Sandbox devices
   (cable / development installs) go to api.sandbox.push.apple.com, production ones to api.push.apple.com. */
import http2 from "node:http2";

export const TEAM_ID = "6YA63R2878";
export const APPS = ["com.badscandal.hq", "com.badscandal.hq.mac"];
export const KEY_BLOB = "push/key.json";
const DEAD = new Set(["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"]);
const enc = new TextEncoder();
const b64url = (bytes) => Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/* the base64 body of a .p8, from the file's text as pasted (armour lines, line breaks, spaces) */
export function pushKeyFromText(text) {
  return String(text == null ? "" : text).replace(/-----(BEGIN|END)[A-Z ]*-----/g, "").replace(/\\n/g, "").replace(/\s+/g, "");
}
export async function importPushKey(keyB64) {
  const der = Buffer.from(pushKeyFromText(keyB64), "base64");
  if (!der.length) throw new Error("empty key");
  return crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

/* The provider token. iat is rounded DOWN to a 30-minute boundary, so every running copy of the
   functions (Netlify starts several) signs with the same iat: Apple refuses a token older than an hour
   (TooOld / ExpiredProviderToken) and one that changes more often than every 20 minutes
   (TooManyProviderTokenUpdates). Each copy keeps its token until the next boundary; Apple refusing it
   (403 ExpiredProviderToken / InvalidProviderToken) clears it (clearJwtCache, called by push.mjs). */
export const PROVIDER_REFUSED = new Set(["ExpiredProviderToken", "InvalidProviderToken"]);
let cache = null; /* { id, iat, jwt } */
export function clearJwtCache() { cache = null; }
export async function apnsJwt({ keyB64, keyId, teamId, nowSec }) {
  const id = keyId + "|" + teamId + "|" + keyB64;
  const iat = Math.floor(nowSec / 1800) * 1800;
  if (cache && cache.id === id && cache.iat === iat) return cache.jwt;
  const key = await importPushKey(keyB64);
  const head = b64url(enc.encode(JSON.stringify({ alg: "ES256", kid: keyId })));
  const claims = b64url(enc.encode(JSON.stringify({ iss: teamId, iat })));
  /* WebCrypto's ECDSA signature is already r||s (64 bytes), which is what a JWS wants */
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(head + "." + claims));
  const jwt = head + "." + claims + "." + b64url(new Uint8Array(sig));
  cache = { id, iat, jwt };
  return jwt;
}

export function apnsRequest(device, payload, { jwt, silent = false } = {}) {
  return {
    host: device.env === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com",
    path: "/3/device/" + device.token,
    headers: { authorization: "bearer " + jwt, "apns-topic": device.app, "apns-push-type": "alert", "apns-priority": silent ? "5" : "10" },
    body: JSON.stringify(payload),
  };
}

export function sendApns(device, payload, { jwt, silent = false, connect = http2.connect, timeoutMs = 10000 } = {}) {
  const r = apnsRequest(device, payload, { jwt, silent });
  return new Promise((resolve) => {
    let client = null, done = false, timer = null;
    const finish = (out) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { client && (client.close ? client.close() : client.destroy()); } catch {}
      resolve(out);
    };
    timer = setTimeout(() => { try { client && client.destroy && client.destroy(); } catch {} finish({ status: 0, reason: "timeout", dead: false }); }, timeoutMs);
    try {
      client = connect("https://" + r.host);
      client.on("error", () => finish({ status: 0, reason: "error", dead: false }));
      const req = client.request({ ":method": "POST", ":path": r.path, "content-type": "application/json", ...r.headers });
      let status = 0, text = "";
      if (req.setEncoding) req.setEncoding("utf8");
      req.on("response", (h) => { status = Number(h[":status"]) || 0; });
      req.on("data", (c) => { text += c; });
      req.on("end", () => {
        let reason = "";
        try { reason = text ? String(JSON.parse(text).reason || "") : ""; } catch {}
        finish({ status, reason, dead: status === 410 || DEAD.has(reason) });
      });
      req.on("error", () => finish({ status: 0, reason: "error", dead: false }));
      req.end(r.body);
    } catch {
      finish({ status: 0, reason: "error", dead: false });
    }
  });
}

/* { aps: { alert: { title: "HQ", body }, badge, sound: "default", "thread-id": "hq-waiting" }, href }
   silent: { aps: { badge } } (sent with apns-priority 5) */
export function payloadOf({ body, badge, href, silent = false } = {}) {
  const hasBadge = Number.isInteger(badge) && badge >= 0;
  if (silent) return { aps: { badge: hasBadge ? badge : 0 } };
  return { aps: { alert: { title: "HQ", body: String(body || "") }, ...(hasBadge ? { badge } : {}), sound: "default", "thread-id": "hq-waiting" }, ...(href ? { href } : {}) };
}

/* env: (name) => value. The env first, then the Blob store; null if the key or its id is missing.
   A store that can't be read is "no key" here: the sender then does nothing, and nothing throws. */
export async function pushKey(env, store) {
  const get = (k) => { try { return (env && env(k)) || ""; } catch { return ""; } };
  const keyB64 = get("APNS_KEY"), keyId = get("APNS_KEY_ID");
  if (keyB64 && keyId) return { keyB64, keyId, teamId: get("APNS_TEAM_ID") || TEAM_ID };
  try {
    const got = store ? await store.getWithMetadata(KEY_BLOB, { type: "json", consistency: "strong" }) : null;
    const d = got && got.data;
    if (d && d.keyB64 && d.keyId) return { keyB64: d.keyB64, keyId: d.keyId, teamId: d.teamId || TEAM_ID };
  } catch {}
  return null;
}
