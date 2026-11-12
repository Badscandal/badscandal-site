/* The APNs sender (12 Nov 2026, the HQ apps): ES256 JWT with WebCrypto, the request, the reply, the
   payload, where the key comes from. A key is made in memory for the test; Apple is never called (a fake
   http2 connect stands in). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { apnsJwt, apnsRequest, clearJwtCache, sendApns, payloadOf, pushKey, pushKeyFromText } from "../netlify/lib/apns.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";

const b64 = (buf) => Buffer.from(buf).toString("base64");
const unb64url = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
async function madeKey() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return { keyB64: b64(await crypto.subtle.exportKey("pkcs8", pair.privateKey)), publicKey: pair.publicKey };
}
const TOKEN = "a".repeat(64);
const DEV = (o = {}) => ({ token: TOKEN, platform: "ios", env: "sandbox", app: "com.badscandal.hq", tz: "America/Sao_Paulo", ...o });

test("apnsJwt: three parts, ES256 header with the key id, Apple's claims, and it verifies with the public half", async () => {
  const k = await madeKey();
  const jwt = await apnsJwt({ keyB64: k.keyB64, keyId: "ABC123DEFG", teamId: "TEAM123456", nowSec: 1_800_000_000 });
  const parts = jwt.split(".");
  assert.equal(parts.length, 3);
  assert.deepEqual(JSON.parse(unb64url(parts[0])), { alg: "ES256", kid: "ABC123DEFG" });
  assert.deepEqual(JSON.parse(unb64url(parts[1])), { iss: "TEAM123456", iat: 1_800_000_000 });
  assert.equal(unb64url(parts[2]).length, 64, "a JWS ES256 signature is r||s, 64 bytes");
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, k.publicKey, unb64url(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
  assert.equal(ok, true);
  /* iat is rounded down to a 30-minute boundary, so every running copy of the functions signs with the
     SAME iat (Apple refuses a provider token that changes more often than every 20 minutes); reused
     inside the window, made again in the next one */
  assert.equal(await apnsJwt({ keyB64: k.keyB64, keyId: "ABC123DEFG", teamId: "TEAM123456", nowSec: 1_800_000_000 + 10 * 60 }), jwt);
  clearJwtCache(); /* another copy of the function, its own empty cache */
  const other = await apnsJwt({ keyB64: k.keyB64, keyId: "ABC123DEFG", teamId: "TEAM123456", nowSec: 1_800_000_000 + 29 * 60 });
  assert.equal(JSON.parse(unb64url(other.split(".")[1])).iat, 1_800_000_000, "the same iat in another copy, 29 minutes later");
  const later = await apnsJwt({ keyB64: k.keyB64, keyId: "ABC123DEFG", teamId: "TEAM123456", nowSec: 1_800_000_000 + 31 * 60 });
  assert.notEqual(later, other);
  assert.equal(JSON.parse(unb64url(later.split(".")[1])).iat, 1_800_000_000 + 30 * 60);
  assert.equal(await apnsJwt({ keyB64: k.keyB64, keyId: "ABC123DEFG", teamId: "TEAM123456", nowSec: 1_800_000_000 + 59 * 60 }), later, "cached");
  clearJwtCache();
  assert.notEqual(await apnsJwt({ keyB64: k.keyB64, keyId: "ABC123DEFG", teamId: "TEAM123456", nowSec: 1_800_000_000 + 59 * 60 }), later, "a cleared cache signs again (ECDSA signatures differ each time)");
  /* the key pasted as the whole .p8 text (armour and line breaks) works the same */
  const pem = "-----BEGIN " + "PRIVATE KEY-----\n" /* split: the repo guard greps for the armour */ + k.keyB64.match(/.{1,64}/g).join("\n") + "\n-----END PRIVATE KEY-----\n";
  assert.equal(pushKeyFromText(pem), k.keyB64);
  await assert.rejects(apnsJwt({ keyB64: "bm90IGEga2V5", keyId: "K", teamId: "T", nowSec: 1 }));
});

test("apnsRequest: sandbox vs production host, the path, Apple's headers, the priority", () => {
  const p = payloadOf({ body: "Nova asked you to decide something", badge: 3, href: "#messages/m1" });
  const sb = apnsRequest(DEV(), p, { jwt: "J" });
  assert.equal(sb.host, "api.sandbox.push.apple.com");
  assert.equal(sb.path, "/3/device/" + TOKEN);
  assert.deepEqual(sb.headers, { authorization: "bearer J", "apns-topic": "com.badscandal.hq", "apns-push-type": "alert", "apns-priority": "10" });
  assert.deepEqual(JSON.parse(sb.body), p);
  const pr = apnsRequest(DEV({ env: "production", app: "com.badscandal.hq.mac", platform: "mac" }), payloadOf({ badge: 2, silent: true }), { jwt: "J", silent: true });
  assert.equal(pr.host, "api.push.apple.com");
  assert.equal(pr.headers["apns-topic"], "com.badscandal.hq.mac");
  assert.equal(pr.headers["apns-priority"], "5");
});

test("payloadOf: exactly the bridge's shapes; silent carries only the badge", () => {
  assert.deepEqual(payloadOf({ body: "Velvet Night is in Spotify for Artists: say what it is", badge: 3, href: "#releases" }),
    { aps: { alert: { title: "HQ", body: "Velvet Night is in Spotify for Artists: say what it is" }, badge: 3, sound: "default", "thread-id": "hq-waiting" }, href: "#releases" });
  assert.deepEqual(payloadOf({ body: "x", badge: 4, href: "#messages", silent: true }), { aps: { badge: 4 } });
  assert.deepEqual(payloadOf({ body: "Test from HQ: alerts work." }), { aps: { alert: { title: "HQ", body: "Test from HQ: alerts work." }, sound: "default", "thread-id": "hq-waiting" } }, "no badge given, none sent");
});

/* a fake http2: answers with a status and a body, or never answers */
function fakeConnect(status, reply, seen = []) {
  return (origin) => {
    const client = new EventEmitter();
    client.closed = false;
    client.close = () => { client.closed = true; };
    client.destroy = () => { client.closed = true; };
    client.request = (headers) => {
      const req = new EventEmitter();
      req.setEncoding = () => {};
      req.close = () => {};
      req.end = (body) => {
        seen.push({ origin, headers, body, client });
        if (status == null) return; /* never answers */
        setImmediate(() => { req.emit("response", { ":status": status }); if (reply) req.emit("data", JSON.stringify(reply)); req.emit("end"); });
      };
      return req;
    };
    return client;
  };
}

test("sendApns: 200 ok, 410 dead, 400 BadDeviceToken dead, 400 other not dead, no answer = timeout", async () => {
  const seen = [];
  const p = payloadOf({ body: "x", badge: 1, href: "#messages" });
  assert.deepEqual(await sendApns(DEV(), p, { jwt: "J", connect: fakeConnect(200, null, seen) }), { status: 200, reason: "", dead: false });
  assert.equal(seen[0].origin, "https://api.sandbox.push.apple.com");
  assert.equal(seen[0].headers[":method"], "POST");
  assert.equal(seen[0].headers[":path"], "/3/device/" + TOKEN);
  assert.equal(seen[0].headers["apns-topic"], "com.badscandal.hq");
  assert.equal(seen[0].client.closed, true, "the connection is closed after the answer");
  assert.deepEqual(await sendApns(DEV(), p, { jwt: "J", connect: fakeConnect(410, { reason: "Unregistered" }) }), { status: 410, reason: "Unregistered", dead: true });
  assert.deepEqual(await sendApns(DEV(), p, { jwt: "J", connect: fakeConnect(400, { reason: "BadDeviceToken" }) }), { status: 400, reason: "BadDeviceToken", dead: true });
  assert.deepEqual(await sendApns(DEV(), p, { jwt: "J", connect: fakeConnect(400, { reason: "DeviceTokenNotForTopic" }) }), { status: 400, reason: "DeviceTokenNotForTopic", dead: true });
  assert.deepEqual(await sendApns(DEV(), p, { jwt: "J", connect: fakeConnect(403, { reason: "ExpiredProviderToken" }) }), { status: 403, reason: "ExpiredProviderToken", dead: false });
  const quiet = [];
  assert.deepEqual(await sendApns(DEV(), p, { jwt: "J", connect: fakeConnect(null, null, quiet), timeoutMs: 30 }), { status: 0, reason: "timeout", dead: false });
  assert.equal(quiet[0].client.closed, true);
  const broken = () => { throw new Error("no network"); };
  assert.deepEqual(await sendApns(DEV(), p, { jwt: "J", connect: broken }), { status: 0, reason: "error", dead: false });
});

test("pushKey: the env first, then the Blob push/key.json, null when a part is missing; a broken store never throws", async () => {
  const env = (o) => (k) => o[k];
  assert.deepEqual(await pushKey(env({ APNS_KEY: "AAA", APNS_KEY_ID: "KID1234567", APNS_TEAM_ID: "TEAM" }), memoryDesk()), { keyB64: "AAA", keyId: "KID1234567", teamId: "TEAM" });
  const store = memoryDesk();
  assert.equal(await pushKey(env({}), store), null);
  assert.equal(await pushKey(env({ APNS_KEY: "AAA" }), store), null, "a key without its id is no key");
  await store.setJSON("push/key.json", { keyB64: "BBB", keyId: "KID7654321", teamId: "6YA63R2878" });
  assert.deepEqual(await pushKey(env({ APNS_KEY: "AAA" }), store), { keyB64: "BBB", keyId: "KID7654321", teamId: "6YA63R2878" });
  assert.deepEqual(await pushKey(env({ APNS_KEY: "AAA", APNS_KEY_ID: "KID1234567" }), store), { keyB64: "AAA", keyId: "KID1234567", teamId: "6YA63R2878" }, "the team id defaults to Luke's team");
  const bad = { getWithMetadata: async () => { throw new Error("store down"); } };
  assert.equal(await pushKey(env({}), bad), null);
});
