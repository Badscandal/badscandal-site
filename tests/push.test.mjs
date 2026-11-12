/* Who gets an alert, when, and only once (12 Nov 2026, the HQ apps). netlify/lib/push.mjs with the
   in-memory desk and a fake sender (Apple is never called). The key is made in memory. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import * as P from "../netlify/lib/push.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";

const MIN = 60000, HOUR = 3600000;
const R = S.DEFAULT_ROSTER;
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const KEY = Buffer.from(await crypto.subtle.exportKey("pkcs8", pair.privateKey)).toString("base64");
const ENV = (o = { APNS_KEY: KEY, APNS_KEY_ID: "TESTKEY123", APNS_TEAM_ID: "TEAMTEST12" }) => (k) => o[k];
const tok = (c) => c.repeat(64);
const dev = (token, tz = "America/Sao_Paulo", o = {}) => ({ token, platform: "ios", env: "sandbox", app: "com.badscandal.hq", tz, ...o });
/* the fake sender: records every call; dead = the tokens Apple would call dead */
function fakeSend(dead = [], refuse = null) {
  const calls = [];
  const send = async (device, payload, o) => { calls.push({ token: device.token, payload, silent: !!o.silent, jwt: o.jwt });
    if (refuse) return { status: refuse[0], reason: refuse[1], dead: false };
    return dead.includes(device.token) ? { status: 410, reason: "Unregistered", dead: true } : { status: 200, reason: "", dead: false }; };
  return { calls, send };
}
/* console.log while fn runs */
async function logsOf(fn) {
  const lines = [], real = console.log;
  console.log = (...a) => lines.push(a.join(" "));
  try { await fn(); } finally { console.log = real; }
  return lines;
}
const ask = (d, now, from = "Nova", needs = "decision") => S.sendMessage(d, now, R, { from, to: "Luke", text: "Something for Luke, from " + from, needs });
const sweep = (d, now, send, env = ENV()) => P.sweep(d, now, { desk: () => S.loadDesk(d, now), env, send });
const morning = (d, now, send, env = ENV()) => P.morning(d, now, { desk: () => S.loadDesk(d, now), env, send });

/* 12 Nov 2026, 15:00 UTC = 12:00 in São Paulo, 15:00 in Dublin: nobody's quiet hours */
const DAY0 = Date.parse("2026-11-12T15:00:00Z");

test("first item buzzes with its text and badge = total", async () => {
  const d = memoryDesk(), f = fakeSend();
  await P.registerDevice(d, DAY0, dev(tok("a")));
  const m1 = (await ask(d, DAY0)).message;
  const r1 = await sweep(d, DAY0 + MIN, f.send);
  assert.deepEqual(r1, { buzzed: 1, silent: 0, newKeys: ["m:" + m1.id] });
  assert.deepEqual(f.calls[0].payload, { aps: { alert: { title: "HQ", body: "Nova asked you to decide something" }, badge: 1, sound: "default", "thread-id": "hq-waiting" }, href: "#messages/" + m1.id });
  assert.equal(f.calls[0].silent, false);
  assert.equal(f.calls[0].jwt.split(".").length, 3);
  /* 20 minutes later a second one: it buzzes too, and the badge counts both */
  const m2 = (await ask(d, DAY0 + 20 * MIN, "Kevin", "action")).message;
  await sweep(d, DAY0 + 21 * MIN, f.send);
  assert.equal(f.calls[1].payload.aps.alert.body, "Kevin needs you to do something");
  assert.equal(f.calls[1].payload.aps.badge, 2);
  assert.equal(f.calls[1].payload.href, "#messages/" + m2.id);
});

test("flood: eight new items inside 10 minutes = 1 alert + 7 silent", async () => {
  const d = memoryDesk(), f = fakeSend();
  await P.registerDevice(d, DAY0, dev(tok("a")));
  let buzzed = 0, silent = 0;
  for (let i = 0; i < 8; i++) {
    await ask(d, DAY0 + i * MIN, R[i].name);
    const r = await sweep(d, DAY0 + i * MIN + 1000, f.send);
    buzzed += r.buzzed; silent += r.silent;
  }
  assert.deepEqual([buzzed, silent], [1, 7]);
  assert.deepEqual(f.calls.map((c) => c.silent), [false, true, true, true, true, true, true, true]);
  assert.deepEqual(f.calls.slice(1).map((c) => c.payload), [2, 3, 4, 5, 6, 7, 8].map((n) => ({ aps: { badge: n } })), "silent = only the badge, and it shows the full count");
  /* several new at once: one buzz that counts them, opening Messages */
  const g = fakeSend(), e = memoryDesk();
  await P.registerDevice(e, DAY0, dev(tok("b")));
  for (let i = 0; i < 3; i++) await ask(e, DAY0 + i * 1000, R[i].name);
  await sweep(e, DAY0 + MIN, g.send);
  assert.deepEqual(g.calls.map((c) => [c.silent, c.payload.aps.alert.body, c.payload.href]), [[false, "3 new things are waiting on you", "#messages"]]);
  /* after 10 quiet minutes the next new one buzzes again */
  await ask(d, DAY0 + 30 * MIN, "Atlas");
  assert.equal((await sweep(d, DAY0 + 30 * MIN + 1000, f.send)).buzzed, 1);
});

test("an item alerts once, even across sweeps", async () => {
  const d = memoryDesk(), f = fakeSend();
  await P.registerDevice(d, DAY0, dev(tok("a")));
  await ask(d, DAY0);
  await sweep(d, DAY0 + MIN, f.send);
  assert.deepEqual(await sweep(d, DAY0 + 2 * MIN, f.send), { buzzed: 0, silent: 0, newKeys: [] });
  assert.deepEqual(await sweep(d, DAY0 + 5 * HOUR, f.send), { buzzed: 0, silent: 0, newKeys: [] });
  assert.equal(f.calls.length, 1);
  /* two sweeps at the same moment (a bot's call and the hourly job) still buzz once */
  const e = memoryDesk(), g = fakeSend();
  await P.registerDevice(e, DAY0, dev(tok("b")));
  await ask(e, DAY0);
  await Promise.all([sweep(e, DAY0 + MIN, g.send), sweep(e, DAY0 + MIN, g.send)]);
  assert.equal(g.calls.length, 1);
});

test("quiet hours use the device zone (Europe/Dublin 01:00 = quiet while São Paulo is 22:00)", async () => {
  const night = Date.parse("2026-11-13T01:00:00Z"); /* Dublin 01:00, São Paulo 22:00 */
  assert.equal(P.isQuiet("Europe/Dublin", night), true);
  assert.equal(P.isQuiet("America/Sao_Paulo", night), false);
  assert.equal(P.isQuiet("Europe/Dublin", Date.parse("2026-11-13T08:00:00Z")), false, "08:00 is awake");
  assert.equal(P.isQuiet("Europe/Dublin", Date.parse("2026-11-12T23:00:00Z")), true, "23:00 is quiet");
  assert.equal(P.isQuiet("Not/AZone", night), false, "an unknown zone reads as São Paulo");
  const d = memoryDesk(), f = fakeSend();
  await P.registerDevice(d, night - HOUR, dev(tok("a"), "America/Sao_Paulo"));
  /* Luke flew to Dublin: the app registers again with the new zone */
  await P.registerDevice(d, night - 30 * MIN, dev(tok("a"), "Europe/Dublin"));
  await P.registerDevice(d, night - 30 * MIN, dev(tok("b"), "America/Sao_Paulo", { platform: "mac", app: "com.badscandal.hq.mac" }));
  await ask(d, night);
  const r = await sweep(d, night + MIN, f.send);
  assert.deepEqual([r.buzzed, r.silent], [1, 1]);
  assert.deepEqual(f.calls.map((c) => [c.token, c.silent]), [[tok("a"), true], [tok("b"), false]]);
  assert.deepEqual(f.calls[0].payload, { aps: { badge: 1 } });
});

test("morning summary at local 08:00 only, once, then resets", async () => {
  const night = Date.parse("2026-11-13T01:00:00Z");
  const d = memoryDesk(), f = fakeSend();
  await P.registerDevice(d, night - HOUR, dev(tok("a"), "Europe/Dublin"));
  await P.registerDevice(d, night - HOUR, dev(tok("b"), "America/Sao_Paulo", { platform: "mac", app: "com.badscandal.hq.mac" }));
  await ask(d, night, "Nova");
  await sweep(d, night + MIN, f.send);
  await ask(d, night + 2 * HOUR, "Kevin", "action"); /* Dublin 03:00, São Paulo 00:00: both quiet */
  await sweep(d, night + 2 * HOUR + MIN, f.send);
  f.calls.length = 0;
  assert.deepEqual(await morning(d, Date.parse("2026-11-13T07:05:00Z"), f.send), { sent: 0 }, "07:05 in Dublin: not yet");
  const m = await morning(d, Date.parse("2026-11-13T08:05:00Z"), f.send);
  assert.deepEqual(m, { sent: 1 });
  assert.deepEqual(f.calls.map((c) => [c.token, c.silent, c.payload]), [[tok("a"), false, { aps: { alert: { title: "HQ", body: "2 things are waiting on you" }, badge: 2, sound: "default", "thread-id": "hq-waiting" }, href: "#messages" }]]);
  assert.deepEqual(await morning(d, Date.parse("2026-11-13T08:35:00Z"), f.send), { sent: 0 }, "once");
  /* São Paulo's 08:00 comes later: its device had one silent item (Kevin's at its midnight) */
  const sp = await morning(d, Date.parse("2026-11-13T11:05:00Z"), f.send);
  assert.deepEqual(sp, { sent: 1 });
  assert.equal(f.calls[1].payload.aps.alert.body, "1 thing is waiting on you");
  assert.equal(f.calls[1].token, tok("b"));
  /* settled overnight: nothing to say, and the count is reset */
  const e = memoryDesk(), g = fakeSend();
  await P.registerDevice(e, night - HOUR, dev(tok("c"), "Europe/Dublin"));
  const q = (await ask(e, night)).message;
  await sweep(e, night + MIN, g.send);
  await S.resolveMessage(e, night + 3 * HOUR, R, { id: q.id, by: "Luke" });
  assert.deepEqual(await morning(e, Date.parse("2026-11-13T08:05:00Z"), g.send), { sent: 0 });
  assert.equal(g.calls.filter((c) => !c.silent).length, 0);
});

test("410 removes only that device; the other still gets it", async () => {
  const d = memoryDesk(), f = fakeSend([tok("a")]);
  await P.registerDevice(d, DAY0, dev(tok("a")));
  await P.registerDevice(d, DAY0, dev(tok("b"), "America/Sao_Paulo", { platform: "mac", app: "com.badscandal.hq.mac" }));
  await ask(d, DAY0);
  const r = await sweep(d, DAY0 + MIN, f.send);
  assert.deepEqual(f.calls.map((c) => [c.token, c.silent]), [[tok("a"), false], [tok("b"), false]]);
  assert.equal(r.buzzed, 1, "only the one Apple accepted counts");
  assert.deepEqual((await P.listDevices(d)).map((x) => x.token), [tok("b")]);
  /* the test alert removes a dead one too */
  const g = fakeSend([tok("b")]);
  assert.deepEqual(await P.sendTest(d, DAY0 + HOUR, { env: ENV(), send: g.send }), { sent: 0, reasons: { "410 Unregistered": 1 } });
  assert.equal(g.calls[0].payload.aps.alert.body, "Test from HQ: alerts work.");
  assert.deepEqual(await P.listDevices(d), []);
});

test("no key: sweep records nothing as alerted and returns {skipped:'no key'}", async () => {
  const d = memoryDesk(), f = fakeSend();
  await P.registerDevice(d, DAY0, dev(tok("a")));
  await ask(d, DAY0);
  assert.deepEqual(await sweep(d, DAY0 + MIN, f.send, ENV({})), { skipped: "no key", buzzed: 0, silent: 0, newKeys: [] });
  assert.equal(await d.get("push/alerted.json"), null, "nothing recorded");
  /* a broken key: the same, nothing thrown */
  assert.deepEqual(await sweep(d, DAY0 + MIN, f.send, ENV({ APNS_KEY: "bm90IGEga2V5", APNS_KEY_ID: "BROKEN1234" })), { skipped: "bad key", buzzed: 0, silent: 0, newKeys: [] });
  assert.equal(await d.get("push/alerted.json"), null);
  assert.deepEqual(await P.sendTest(d, DAY0, { env: ENV({}), send: f.send }), { sent: 0, skipped: "no key" });
  assert.deepEqual(await morning(d, DAY0, f.send, ENV({})), { sent: 0 });
  assert.equal(f.calls.length, 0);
  /* once the key is there, the item that waited still alerts */
  assert.equal((await sweep(d, DAY0 + 2 * MIN, f.send)).buzzed, 1);
  /* no devices: nothing recorded either */
  const e = memoryDesk();
  await ask(e, DAY0);
  assert.deepEqual(await sweep(e, DAY0 + MIN, f.send), { skipped: "no devices", buzzed: 0, silent: 0, newKeys: [] });
  assert.equal(await e.get("push/alerted.json"), null);
});

test("register validates, dedupes, keeps 10", async () => {
  const d = memoryDesk();
  const bad = (o, re) => assert.rejects(P.registerDevice(d, DAY0, { ...dev(tok("a")), ...o }), (e) => e.name === "StaffError" && re.test(e.message));
  await bad({ token: "abc" }, /token/);
  await bad({ token: "z".repeat(64) }, /token/);
  await bad({ token: "a".repeat(201) }, /token/);
  await bad({ platform: "android" }, /platform/);
  await bad({ env: "staging" }, /env/);
  await bad({ app: "com.example.other" }, /app/);
  assert.deepEqual(await P.listDevices(d), []);
  const one = await P.registerDevice(d, DAY0, { ...dev(tok("A")), tz: "Mars/Olympus" });
  assert.deepEqual([one.token, one.tz, one.platform, one.env, one.app], [tok("a"), "America/Sao_Paulo", "ios", "sandbox", "com.badscandal.hq"], "lower-case hex; an unknown zone becomes São Paulo");
  await P.registerDevice(d, DAY0 + MIN, dev(tok("a"), "Europe/Dublin"));
  const list = await P.listDevices(d);
  assert.equal(list.length, 1, "the same token is one device");
  assert.deepEqual([list[0].tz, list[0].seenAt, list[0].addedAt], ["Europe/Dublin", new Date(DAY0 + MIN).toISOString(), new Date(DAY0).toISOString()]);
  for (let i = 0; i < 12; i++) await P.registerDevice(d, DAY0 + (i + 2) * MIN, dev("0123456789bc"[i].repeat(64)));
  const kept = await P.listDevices(d);
  assert.equal(kept.length, 10);
  assert.ok(!kept.some((x) => x.token === tok("a")), "the oldest seen go first");
  assert.ok(kept.some((x) => x.token === "b".repeat(64)));
  assert.equal(await P.unregisterDevice(d, "b".repeat(64)), true);
  assert.equal(await P.unregisterDevice(d, "b".repeat(64)), false);
  assert.equal((await P.listDevices(d)).length, 9);
});

test("a refused Apple setup burns nothing: no device accepted and none dead = the new items stay new, no lastBuzz, the reasons logged and returned", async () => {
  const d = memoryDesk();
  await P.registerDevice(d, DAY0, dev(tok("a")));
  await P.registerDevice(d, DAY0, dev(tok("b"), "America/Sao_Paulo", { platform: "mac", app: "com.badscandal.hq.mac" }));
  const m = (await ask(d, DAY0)).message;
  const bad = fakeSend([], [403, "InvalidProviderToken"]);
  let r;
  const lines = await logsOf(async () => { r = await sweep(d, DAY0 + MIN, bad.send); });
  assert.deepEqual([r.buzzed, r.silent], [0, 0]);
  assert.deepEqual(r.reasons, { "403 InvalidProviderToken": 2 });
  const st = await d.get("push/alerted.json", { type: "json" });
  assert.equal(st.keys["m:" + m.id], undefined, "not marked as alerted: the next sweep tries again");
  assert.equal(st.lastBuzz, null, "a buzz nobody got doesn't hold the next one back");
  assert.ok(lines.some((l) => /403 InvalidProviderToken/.test(l)), "the reasons are in the log");
  assert.ok(lines.every((l) => !l.includes(tok("a")) && !l.includes(tok("b")) && !l.includes(KEY.slice(10, 40))), "never a token or the key");
  assert.equal((await P.listDevices(d)).length, 2, "a refused key removes no device");
  /* the token was dropped: the next sweep signs a new one */
  const good = fakeSend();
  const r2 = await sweep(d, DAY0 + 2 * MIN, good.send);
  assert.deepEqual([r2.buzzed, r2.newKeys], [2, ["m:" + m.id]]);
  assert.notEqual(good.calls[0].jwt, bad.calls[0].jwt, "403 InvalidProviderToken / ExpiredProviderToken clears the cached provider token");
  /* the test alert says why */
  assert.deepEqual(await P.sendTest(d, DAY0 + HOUR, { env: ENV(), send: fakeSend([], [403, "ExpiredProviderToken"]).send }), { sent: 0, reasons: { "403 ExpiredProviderToken": 2 } });
  /* one accepted is enough: the item counts as alerted */
  const e = memoryDesk();
  await P.registerDevice(e, DAY0, dev(tok("c")));
  await ask(e, DAY0);
  const flaky = { calls: 0, send: async () => (flaky.calls++ ? { status: 200, reason: "", dead: false } : { status: 0, reason: "timeout", dead: false }) };
  await P.registerDevice(e, DAY0, dev(tok("d")));
  const r3 = await sweep(e, DAY0 + MIN, flaky.send);
  assert.equal(r3.buzzed, 1);
  assert.equal(r3.newKeys.length, 1);
  assert.equal(Object.keys((await e.get("push/alerted.json", { type: "json" })).keys).length, 1);
});

test("the 08:00 summary counts the overnight items still waiting, and keeps to the 10-minute rule with a sweep in the same run", async () => {
  const night = Date.parse("2026-11-13T01:00:00Z"); /* Dublin 01:00 */
  const d = memoryDesk(), f = fakeSend();
  await P.registerDevice(d, night - HOUR, dev(tok("a"), "Europe/Dublin"));
  const q1 = (await ask(d, night, "Nova")).message;
  await sweep(d, night + MIN, f.send);
  await sweep(d, night + 2 * MIN, f.send); /* nothing new: the same item is never counted twice overnight */
  await ask(d, night + HOUR, "Kevin", "action");
  await sweep(d, night + HOUR + MIN, f.send);
  const st = await d.get("push/alerted.json", { type: "json" });
  assert.equal(st.overnight[tok("a")].length, 2, "the overnight items are kept by key, per device");
  await S.resolveMessage(d, night + 2 * HOUR, R, { id: q1.id, by: "Luke" });
  /* 08:05 Dublin: the hourly job's sweep buzzes a brand-new item first; the summary then must not buzz again */
  const at8 = Date.parse("2026-11-13T08:05:00Z");
  await ask(d, at8 - MIN, "Atlas");
  f.calls.length = 0;
  const s = await sweep(d, at8, f.send);
  assert.equal(s.buzzed, 1);
  assert.deepEqual(await morning(d, at8, f.send), { sent: 0 }, "a buzz in the last 10 minutes: no second one");
  assert.equal(f.calls.filter((c) => !c.silent).length, 1);
  assert.deepEqual((await d.get("push/alerted.json", { type: "json" })).overnight, {}, "and it is not owed again at 08:35");
  /* without that sweep: one summary, counting only what is still waiting (Kevin's; Nova's was settled), and it sets lastBuzz */
  const e = memoryDesk(), g = fakeSend();
  await P.registerDevice(e, night - HOUR, dev(tok("b"), "Europe/Dublin"));
  const n1 = (await ask(e, night, "Nova")).message;
  await sweep(e, night + MIN, g.send);
  await ask(e, night + HOUR, "Kevin", "action");
  await sweep(e, night + HOUR + MIN, g.send);
  await S.resolveMessage(e, night + 2 * HOUR, R, { id: n1.id, by: "Luke" });
  await ask(e, night + 3 * HOUR, "Drop", "reply");
  await sweep(e, night + 3 * HOUR + MIN, g.send);
  const g8 = fakeSend();
  /* three went silently overnight; Nova's was settled before 08:00: "2 things" */
  assert.deepEqual(await morning(e, at8, g8.send), { sent: 1 });
  assert.equal(g8.calls[0].payload.aps.alert.body, "2 things are waiting on you");
  assert.equal((await e.get("push/alerted.json", { type: "json" })).lastBuzz, new Date(at8).toISOString());
  await ask(e, at8 + MIN, "Atlas");
  const after = fakeSend();
  assert.equal((await sweep(e, at8 + 2 * MIN, after.send)).silent, 1, "the summary counts as the buzz for the next 10 minutes");
});

test("a devices list that is not a list is replaced, never written back", async () => {
  const d = memoryDesk();
  await d.setJSON("push/devices.json", { broken: true });
  assert.deepEqual(await P.listDevices(d), []);
  await P.registerDevice(d, DAY0, dev(tok("a")));
  assert.deepEqual((await d.get("push/devices.json", { type: "json" })).map((x) => x.token), [tok("a")]);
  await d.setJSON("push/devices.json", "nonsense");
  assert.equal(await P.unregisterDevice(d, tok("a")), false);
  await P.registerDevice(d, DAY0, dev(tok("b")));
  assert.deepEqual((await d.get("push/devices.json", { type: "json" })).map((x) => x.token), [tok("b")]);
  /* the list breaks while a dead device is being sent to: it becomes an empty list, not the broken value */
  await ask(d, DAY0);
  const breaks = async (device) => { await d.setJSON("push/devices.json", { broken: true }); return { status: 410, reason: "Unregistered", dead: true }; };
  await sweep(d, DAY0 + MIN, breaks);
  assert.deepEqual(await d.get("push/devices.json", { type: "json" }), []);
});
