/* /api/hq/push/* and /api/staff/fields (12 Nov 2026, the HQ apps), through the real handlers with the
   in-memory Blob store. No test here ever has a key AND a device at the same time, so nothing can try
   to reach Apple. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import * as S from "../netlify/lib/staff.mjs";
import * as P from "../netlify/lib/push.mjs";
import { makeSession, sessionCookie } from "../netlify/lib/session.mjs";

const FAKE = new URL("./fixtures/fake-blobs.mjs", import.meta.url).href;
registerHooks({ resolve(spec, ctx, next) { return spec === "@netlify/blobs" ? { url: FAKE, shortCircuit: true } : next(spec, ctx); } });
const ENV = { ADMIN_KEY: "correct horse", STAFF_BOT_KEY: "bot-key-for-tests-0123456789", STAFF_CLAUDE_KEY: "claude-key-for-tests-0123456789" };
globalThis.Netlify = { env: { get: (k) => ENV[k] } };
globalThis.fetch = async () => new Response("{}", { status: 500 }); /* nothing here reaches the network */
const { default: hq } = await import("../netlify/functions/hq.mjs");
const { default: staff } = await import("../netlify/functions/staff.mjs");
const ctx = { ip: "203.0.113.5", deploy: { context: "production" } };
const cookie = sessionCookie(await makeSession("correct horse")).split(";")[0];
const ORIGIN = "https://badscandal.com";
const desk = () => globalThis.__stores.get("staff");

const call = (path, { method = "GET", body, headers = {} } = {}) =>
  hq(new Request(ORIGIN + "/api/hq/push/" + path, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) }), ctx);
const luke = { cookie, origin: ORIGIN };
const TOKEN = "ab".repeat(32);
const DEVICE = { token: TOKEN, platform: "ios", env: "sandbox", app: "com.badscandal.hq", tz: "Europe/Dublin" };
const PATHS = [["register", "POST"], ["unregister", "POST"], ["waiting", "GET"], ["test", "POST"], ["key", "POST"]];

test("push api: no login = 401 on every path; a foreign Origin = 403 on every POST", async () => {
  for (const [p, method] of PATHS) {
    const r = await call(p, { method, body: method === "POST" ? DEVICE : undefined });
    assert.equal(r.status, 401, p);
    assert.equal(r.headers.get("cache-control"), "no-store");
  }
  for (const [p, method] of PATHS.filter(([, m]) => m === "POST")) {
    const r = await call(p, { method, body: DEVICE, headers: { cookie, origin: "https://evil.example" } });
    assert.equal(r.status, 403, p);
  }
  assert.deepEqual(await P.listDevices(desk() || { getWithMetadata: async () => null }), [], "nothing was registered");
  assert.equal((await call("nope", { headers: luke })).status, 404);
  assert.equal((await call("register", { headers: luke })).status, 404, "register is a POST");
  /* the bots' and Claude's keys don't open these: they are the app's, with Luke's login */
  assert.equal((await call("waiting", { headers: { authorization: "Bearer " + ENV.STAFF_CLAUDE_KEY } })).status, 401);
});

test("push api: register -> waiting -> unregister", async () => {
  const bad = await call("register", { method: "POST", body: { ...DEVICE, platform: "android" }, headers: luke });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /platform must be ios or mac/);
  const reg = await call("register", { method: "POST", body: DEVICE, headers: luke });
  assert.equal(reg.status, 200);
  assert.deepEqual(await reg.json(), { ok: true });
  assert.deepEqual((await P.listDevices(desk())).map((d) => [d.token, d.tz]), [[TOKEN, "Europe/Dublin"]]);
  /* no Origin header at all is accepted (some WebViews leave it off a same-origin POST) */
  assert.equal((await call("register", { method: "POST", body: DEVICE, headers: { cookie } })).status, 200);

  const empty = await (await call("waiting", { headers: { cookie } })).json();
  assert.deepEqual(empty, { count: 0, items: [] });
  const m = (await S.sendMessage(desk(), Date.now(), S.DEFAULT_ROSTER, { from: "Ledger", to: "Luke", text: "Is USD 1,234.56 from the label right?", needs: "decision" })).message;
  const w = await (await call("waiting", { headers: { cookie } })).json();
  assert.deepEqual(w, { count: 1, items: [{ key: "m:" + m.id, kind: "message", id: m.id, text: "Ledger asked you to decide something", href: "#messages/" + m.id }] });
  const sample = await (await call("waiting?sample=1", { headers: { cookie } })).json();
  assert.equal(sample.sample, true);
  assert.ok(sample.count >= 2 && sample.items.every((x) => x.key && x.href.startsWith("#")), "the made-up desk has things waiting");

  const un = await call("unregister", { method: "POST", body: { token: TOKEN }, headers: luke });
  assert.deepEqual(await un.json(), { ok: true });
  assert.deepEqual(await P.listDevices(desk()), []);
  assert.deepEqual(await (await call("unregister", { method: "POST", body: { token: TOKEN }, headers: luke })).json(), { ok: true }, "twice is fine");
  /* the sample never writes */
  assert.deepEqual(await (await call("register?sample=1", { method: "POST", body: DEVICE, headers: luke })).json(), { ok: true, sample: true });
  assert.deepEqual(await P.listDevices(desk()), []);
});

test("push api: /test with no key says sent 0, no error", async () => {
  const r = await call("test", { method: "POST", body: {}, headers: luke });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true); assert.equal(j.sent, 0); assert.equal(j.skipped, "no key");
});

test("push api: /key stores the key write-only; no path ever answers with it", async () => {
  assert.deepEqual(await P.listDevices(desk()), [], "no device: nothing below can try to reach Apple");
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const body = Buffer.from(await crypto.subtle.exportKey("pkcs8", pair.privateKey)).toString("base64");
  const pem = "-----BEGIN PRIVATE KEY-----\n" + body.match(/.{1,64}/g).join("\n") + "\n-----END PRIVATE KEY-----";
  const notKey = await call("key", { method: "POST", body: { key: "bm90IGEga2V5", keyId: "ABCDE12345" }, headers: luke });
  assert.equal(notKey.status, 400);
  assert.match((await notKey.json()).error, /not an Apple push key/);
  assert.equal((await call("key", { method: "POST", body: { key: pem, keyId: "nope" }, headers: luke })).status, 400);
  assert.equal(await desk().get("push/key.json"), null, "nothing stored by a refusal");

  const answers = [];
  const keep = async (r) => { const t = await r.text(); answers.push(t); return { status: r.status, text: t }; };
  const put = await keep(await call("key", { method: "POST", body: { key: pem, keyId: "ABCDE12345" }, headers: luke }));
  assert.equal(put.status, 200);
  assert.deepEqual(JSON.parse(put.text), { ok: true });
  assert.deepEqual(await desk().get("push/key.json", { type: "json" }), { keyB64: body, keyId: "ABCDE12345", teamId: "6YA63R2878" });
  assert.equal((await keep(await call("key", { headers: luke }))).status, 404, "there is no GET for it");
  await keep(await call("waiting", { headers: luke }));
  const t = await keep(await call("test", { method: "POST", body: {}, headers: luke }));
  assert.deepEqual(JSON.parse(t.text), { ok: true, sent: 0, skipped: "no devices" });
  await keep(await staff(new Request(ORIGIN + "/api/staff/board", { headers: { cookie } }), ctx));
  await keep(await staff(new Request(ORIGIN + "/api/staff/fields", { headers: { cookie } }), ctx));
  for (const a of answers) {
    assert.ok(!a.includes(body.slice(10, 50)), "the key never comes back");
    assert.ok(!a.includes("PRIVATE KEY"));
  }
  await desk().delete("push/key.json");
});

test("/api/staff/fields: the form's fields and steps without the desk (Luke or Claude)", async () => {
  const get = (headers) => staff(new Request(ORIGIN + "/api/staff/fields", { headers }), ctx);
  const r = await get({ cookie });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.packFields.length, S.PACK_FIELDS.length);
  assert.equal(j.releaseSteps.length, S.RELEASE_STEPS.length);
  assert.deepEqual(j.packFields, S.packFieldsOut());
  assert.equal(j.today, S.spDay(Date.now()));
  assert.equal((await get({ authorization: "Bearer " + ENV.STAFF_CLAUDE_KEY })).status, 200);
  assert.equal((await get({ authorization: "Bearer " + ENV.STAFF_BOT_KEY })).status, 403);
  assert.equal((await get({})).status, 401);
});
