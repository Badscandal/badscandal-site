/* Push alerts for the HQ apps (12 Nov 2026): who gets one, when, and only once.

   Devices register through POST /api/hq/push/register (the page inside the iPhone or Mac app hands over
   its token). What counts as "waiting on Luke" is ONE rule, S.waitingOnLuke (netlify/lib/staff.mjs).
   Sending is netlify/lib/apns.mjs. Everything here takes the store, the clock and the sender as
   arguments, so it is tested without Netlify or Apple (tests/push.test.mjs).

   Kept on the staff desk store (never in the repo):
     push/devices.json  [{ token, platform: ios|mac, env: sandbox|production, app, tz, addedAt, seenAt }]
                        at most 10, the newest seen kept; the same token is one device
     push/alerted.json  { keys: { <waiting key>: <first alerted iso> }, lastBuzz: iso|null,
                          overnight: { <token>: [the waiting keys that went silently in its quiet hours] } }

   The rules (the HQ-App spec, §8.4):
   - Each waiting item alerts ONCE (its key is recorded the moment it is first seen, before sending,
     so two sweeps at the same moment can't both send it). If NO device accepted the alert and none was
     dead (Apple refused the key, a timeout, no network), this sweep's keys are taken back, so the next
     sweep tries again: a refused setup must not burn every alert silently.
   - At most one buzz every 10 minutes: anything new inside that window goes as a SILENT badge update.
     A bot asking 8 questions in a minute = one buzz and a badge of 8. The 08:00 summary keeps to it too.
   - Quiet hours 23:00-08:00 on the DEVICE's own clock (the zone it last registered with): silent badge
     only, each item kept by key; at that device's 08:00 one summary ("3 things are waiting on you")
     counting the overnight items still waiting.
   - No key, a broken key or no device: nothing is sent and nothing is recorded, and nothing throws
     (the bots' tool calls run a sweep afterwards; they must never fail because of it).
   - Apple's answers are logged as counts ("403 InvalidProviderToken x2"), never a token or the key. */
import { apnsJwt, APPS, clearJwtCache, payloadOf, PROVIDER_REFUSED, pushKey, sendApns } from "./apns.mjs";
import { mutate, readDoc, spDay, StaffError, TZ, waitingOnLuke } from "./staff.mjs";

export const DEVICES = "push/devices.json";
export const ALERTED = "push/alerted.json";
export const MAX_DEVICES = 10;
const MIN = 60000, DAY = 86400000;
const nothing = (skipped) => ({ ...(skipped ? { skipped } : {}), buzzed: 0, silent: 0, newKeys: [] });
const fail = (m) => { throw new StaffError(m); };
const list = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

export function validZone(tz) {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try { new Intl.DateTimeFormat("en-GB", { timeZone: tz }); return true; } catch { return false; }
}
export function localHour(tz, now) {
  const h = new Intl.DateTimeFormat("en-GB", { timeZone: validZone(tz) ? tz : TZ, hour: "2-digit", hourCycle: "h23" }).format(now);
  return Number(h);
}
/* 23:00-08:00 on that clock */
export const isQuiet = (tz, now) => { const h = localHour(tz, now); return h >= 23 || h < 8; };

export async function listDevices(store) {
  const { data } = await readDoc(store, DEVICES, []);
  return list(data).filter((d) => d && d.token);
}
/* Every write REPLACES the list (a stored value that isn't a list is never written back) */
export async function registerDevice(store, now, a = {}) {
  const token = String(a.token == null ? "" : a.token).trim().toLowerCase();
  if (!/^[0-9a-f]{64,200}$/.test(token)) fail("token must be the device's push token: 64 to 200 hex characters.");
  if (a.platform !== "ios" && a.platform !== "mac") fail("platform must be ios or mac.");
  if (a.env !== "sandbox" && a.env !== "production") fail("env must be sandbox or production.");
  if (!APPS.includes(a.app)) fail(`app must be one of: ${APPS.join(", ")}.`);
  const tz = validZone(a.tz) ? a.tz : TZ;
  const at = new Date(now).toISOString();
  return mutate(store, DEVICES, [], (cur) => {
    const old = list(cur).find((d) => d && d.token === token);
    const device = { token, platform: a.platform, env: a.env, app: a.app, tz, addedAt: old ? old.addedAt : at, seenAt: at };
    const next = list(cur).filter((d) => d && d.token && d.token !== token).concat(device).sort((x, y) => (x.seenAt < y.seenAt ? 1 : x.seenAt > y.seenAt ? -1 : 0));
    return { replace: next.slice(0, MAX_DEVICES), value: device };
  });
}
export async function unregisterDevice(store, token) {
  const t = String(token == null ? "" : token).trim().toLowerCase();
  if (!t) return false;
  return mutate(store, DEVICES, [], (cur) => {
    if (!Array.isArray(cur)) return { replace: [], value: false };
    if (!cur.some((d) => d && d.token === t)) return { skip: true, value: false };
    return { replace: cur.filter((d) => d && d.token !== t), value: true };
  });
}
async function dropDead(store, tokens) {
  if (!tokens.length) return;
  try {
    await mutate(store, DEVICES, [], (cur) => {
      if (!Array.isArray(cur)) return { replace: [] };
      const keep = cur.filter((d) => d && !tokens.includes(d.token));
      return keep.length === cur.length ? { skip: true } : { replace: keep };
    });
  } catch {}
}

/* a token for Apple from the key already read, or why not */
async function signer(key, now) {
  if (!key) return { skipped: "no key" };
  try { return { jwt: await apnsJwt({ ...key, nowSec: Math.floor(now / 1000) }) }; } catch { return { skipped: "bad key" }; }
}
/* send to every device; dead ones removed; what Apple accepted, how many were dead, and every other
   answer counted by "<status> <reason>" (logged, never with a token or the key) */
async function sendAll(store, items, jwt, send, what) {
  const res = await Promise.all(items.map(async (x) => {
    try { return { x, r: (await send(x.dev, x.payload, { jwt, silent: x.silent })) || {} }; } catch { return { x, r: { status: 0, reason: "error", dead: false } }; }
  }));
  const dead = res.filter(({ r }) => r.dead).map(({ x }) => x.dev.token);
  await dropDead(store, dead);
  const reasons = {};
  for (const { r } of res) if (r.status !== 200) { const k = `${Number(r.status) || 0} ${String(r.reason || "").replace(/[^A-Za-z]/g, "").slice(0, 40)}`.trim(); reasons[k] = (reasons[k] || 0) + 1; }
  /* Apple refused the provider token itself: drop the cached one, the next send signs a new one */
  if (res.some(({ r }) => r.status === 403 && PROVIDER_REFUSED.has(r.reason))) clearJwtCache();
  if (Object.keys(reasons).length) console.log(`push ${what}: ` + Object.entries(reasons).map(([k, n]) => `${k} x${n}`).join(", ") + `; ${res.length - Object.values(reasons).reduce((a, b) => a + b, 0)} accepted`);
  return { ok: res.filter(({ r }) => r.status === 200).map(({ x }) => x), dead: dead.length, reasons };
}
const withReasons = (out, reasons) => (Object.keys(reasons).length ? { ...out, reasons } : out);
const deskOf = async (desk) => (typeof desk === "function" ? desk() : desk);

/* After something may have started waiting on Luke (a bot's question, a Spotify for Artists report)
   and every hour. desk: the loadDesk() result, or a function returning it (only read when needed). */
export async function sweep(store, now, { desk, env, send = sendApns, today } = {}) {
  const key = await pushKey(env, store);
  if (!key) return nothing("no key");
  const devices = await listDevices(store);
  if (!devices.length) return nothing("no devices");
  const sig = await signer(key, now);
  if (!sig.jwt) return nothing(sig.skipped);
  const d = await deskOf(desk);
  const waiting = waitingOnLuke(d, today || spDay(now), now);
  const live = new Set(waiting.map((w) => w.key));
  const iso = new Date(now).toISOString();
  const plan = await mutate(store, ALERTED, {}, (st) => {
    st.keys = obj(st.keys);
    st.overnight = obj(st.overnight);
    if (st.lastBuzz === undefined) st.lastBuzz = null;
    const prevBuzz = st.lastBuzz;
    let changed = false;
    /* what stopped waiting is forgotten after 30 days (so the record stays small) */
    for (const [k, at] of Object.entries(st.keys)) if (!live.has(k) && !(now - Date.parse(at) < 30 * DAY)) { delete st.keys[k]; changed = true; }
    for (const t of Object.keys(st.overnight)) if (!devices.some((x) => x.token === t) || !Array.isArray(st.overnight[t])) { delete st.overnight[t]; changed = true; }
    const fresh = waiting.filter((w) => !st.keys[w.key]);
    const value = { fresh, sends: [], prevBuzz };
    if (!fresh.length) return changed ? { value } : { skip: true, value };
    for (const w of fresh) st.keys[w.key] = iso;
    const recent = !!st.lastBuzz && now - Date.parse(st.lastBuzz) < 10 * MIN;
    value.sends = devices.map((dev) => {
      if (isQuiet(dev.tz, now)) {
        const had = list(st.overnight[dev.token]);
        st.overnight[dev.token] = had.concat(fresh.map((w) => w.key).filter((k) => !had.includes(k)));
        return { dev, silent: true };
      }
      return { dev, silent: recent };
    });
    if (value.sends.some((s) => !s.silent)) st.lastBuzz = iso;
    return { value };
  });
  if (!plan.fresh.length) return nothing();
  const one = plan.fresh.length === 1;
  const body = one ? plan.fresh[0].text : `${plan.fresh.length} new things are waiting on you`;
  const href = one ? plan.fresh[0].href : "#messages";
  const items = plan.sends.map((s) => ({ ...s, payload: payloadOf({ body, badge: waiting.length, href, silent: s.silent }) }));
  const res = await sendAll(store, items, sig.jwt, send, "sweep");
  const keys = plan.fresh.map((w) => w.key);
  if (!res.ok.length && !res.dead) {
    /* nobody got it (Apple refused the key, a timeout, no network): take this sweep's marks back, so
       the next sweep tries again, and don't let a buzz nobody heard hold the next one back */
    try {
      await mutate(store, ALERTED, {}, (st) => {
        st.keys = obj(st.keys); st.overnight = obj(st.overnight);
        let changed = false;
        for (const k of keys) if (st.keys[k] === iso) { delete st.keys[k]; changed = true; }
        for (const t of Object.keys(st.overnight)) {
          const left = list(st.overnight[t]).filter((k) => !keys.includes(k) || st.keys[k]);
          if (left.length !== list(st.overnight[t]).length) { changed = true; if (left.length) st.overnight[t] = left; else delete st.overnight[t]; }
        }
        if (st.lastBuzz === iso) { st.lastBuzz = plan.prevBuzz; changed = true; }
        return changed ? { value: true } : { skip: true };
      });
    } catch {}
    return withReasons(nothing(), res.reasons);
  }
  return withReasons({ buzzed: res.ok.filter((x) => !x.silent).length, silent: res.ok.filter((x) => x.silent).length, newKeys: keys }, res.reasons);
}

/* The 08:00 summary, from the hourly job (after its sweep): each device whose own clock says 08:xx
   and that had items go silently overnight gets ONE "<n> things are waiting on you", n = those items
   still waiting. It keeps to the 10-minute rule: when something buzzed in the last 10 minutes (the
   sweep just before it), the summary is dropped; when it buzzes it sets lastBuzz. */
export async function morning(store, now, { desk, env, send = sendApns } = {}) {
  const devices = (await listDevices(store)).filter((x) => localHour(x.tz, now) === 8);
  if (!devices.length) return { sent: 0 };
  const { data } = await readDoc(store, ALERTED, {});
  const owed = devices.filter((x) => list(obj(obj(data).overnight)[x.token]).length);
  if (!owed.length) return { sent: 0 };
  const sig = await signer(await pushKey(env, store), now);
  if (!sig.jwt) return { sent: 0 };
  const waiting = waitingOnLuke(await deskOf(desk), spDay(now), now);
  const live = new Set(waiting.map((w) => w.key));
  const iso = new Date(now).toISOString();
  const plan = await mutate(store, ALERTED, {}, (st) => {
    st.overnight = obj(st.overnight);
    if (st.lastBuzz === undefined) st.lastBuzz = null;
    const prevBuzz = st.lastBuzz;
    const recent = !!st.lastBuzz && now - Date.parse(st.lastBuzz) < 10 * MIN;
    const due = [];
    for (const x of owed) {
      const keys = list(st.overnight[x.token]);
      if (!keys.length) continue;
      delete st.overnight[x.token];
      due.push({ dev: x, keys, n: recent ? 0 : keys.filter((k) => live.has(k)).length });
    }
    if (due.some((x) => x.n > 0)) st.lastBuzz = iso;
    return due.length ? { value: { due, prevBuzz } } : { skip: true, value: { due, prevBuzz } };
  });
  const items = plan.due.filter((x) => x.n > 0).map((x) => ({ dev: x.dev, silent: false,
    payload: payloadOf({ body: x.n === 1 ? "1 thing is waiting on you" : `${x.n} things are waiting on you`, badge: waiting.length, href: "#messages" }) }));
  if (!items.length) return { sent: 0 };
  const res = await sendAll(store, items, sig.jwt, send, "morning");
  if (!res.ok.length && !res.dead) {
    /* nobody got it: the summary isn't tried again (08:xx has passed by the next run), but lastBuzz
       goes back, so a real alert isn't held up by one nobody heard */
    try { await mutate(store, ALERTED, {}, (st) => (st.lastBuzz === iso ? ((st.lastBuzz = plan.prevBuzz), { value: true }) : { skip: true })); } catch {}
  }
  return withReasons({ sent: res.ok.length }, res.reasons);
}

/* "Send a test alert" (Luke, from HQ): one plain alert to every device; Apple's answers come back as
   reasons ("403 InvalidProviderToken": 2) so a wrong key or environment can be seen */
export async function sendTest(store, now, { env, send = sendApns } = {}) {
  const sig = await signer(await pushKey(env, store), now);
  if (!sig.jwt) return { sent: 0, skipped: sig.skipped };
  const devices = await listDevices(store);
  if (!devices.length) return { sent: 0, skipped: "no devices" };
  const items = devices.map((dev) => ({ dev, silent: false, payload: payloadOf({ body: "Test from HQ: alerts work." }) }));
  const res = await sendAll(store, items, sig.jwt, send, "test");
  return withReasons({ sent: res.ok.length }, res.reasons);
}
