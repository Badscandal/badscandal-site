/* Push alerts for the HQ apps (12 Nov 2026): who gets one, when, and only once.

   Devices register through POST /api/hq/push/register (the page inside the iPhone or Mac app hands over
   its token). What counts as "waiting on Luke" is ONE rule, S.waitingOnLuke (netlify/lib/staff.mjs).
   Sending is netlify/lib/apns.mjs. Everything here takes the store, the clock and the sender as
   arguments, so it is tested without Netlify or Apple (tests/push.test.mjs).

   Kept on the staff desk store (never in the repo):
     push/devices.json  [{ token, platform: ios|mac, env: sandbox|production, app, tz, addedAt, seenAt }]
                        at most 10, the newest seen kept; the same token is one device
     push/alerted.json  { keys: { <waiting key>: <first alerted iso> }, lastBuzz: iso|null,
                          overnight: { <token>: how many went silently in its quiet hours } }

   The rules (the HQ-App spec, §8.4):
   - Each waiting item alerts ONCE (its key is recorded the moment it is first seen, before sending,
     so two sweeps at the same moment can't both send it).
   - At most one buzz every 10 minutes: anything new inside that window goes as a SILENT badge update.
     A bot asking 8 questions in a minute = one buzz and a badge of 8.
   - Quiet hours 23:00-08:00 on the DEVICE's own clock (the zone it last registered with): silent badge
     only, counted; at that device's 08:00 one summary ("3 things are waiting on you") if anything is
     still waiting.
   - No key, a broken key or no device: nothing is sent and nothing is recorded, and nothing throws
     (the bots' tool calls run a sweep afterwards; they must never fail because of it). */
import { apnsJwt, APPS, payloadOf, pushKey, sendApns } from "./apns.mjs";
import { mutate, readDoc, spDay, StaffError, TZ, waitingOnLuke } from "./staff.mjs";

export const DEVICES = "push/devices.json";
export const ALERTED = "push/alerted.json";
export const MAX_DEVICES = 10;
const MIN = 60000, DAY = 86400000;
const nothing = (skipped) => ({ ...(skipped ? { skipped } : {}), buzzed: 0, silent: 0, newKeys: [] });
const fail = (m) => { throw new StaffError(m); };

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
  return Array.isArray(data) ? data.filter((d) => d && d.token) : [];
}
export async function registerDevice(store, now, a = {}) {
  const token = String(a.token == null ? "" : a.token).trim().toLowerCase();
  if (!/^[0-9a-f]{64,200}$/.test(token)) fail("token must be the device's push token: 64 to 200 hex characters.");
  if (a.platform !== "ios" && a.platform !== "mac") fail("platform must be ios or mac.");
  if (a.env !== "sandbox" && a.env !== "production") fail("env must be sandbox or production.");
  if (!APPS.includes(a.app)) fail(`app must be one of: ${APPS.join(", ")}.`);
  const tz = validZone(a.tz) ? a.tz : TZ;
  const at = new Date(now).toISOString();
  return mutate(store, DEVICES, [], (list) => {
    if (!Array.isArray(list)) list = [];
    const old = list.find((d) => d.token === token);
    const device = { token, platform: a.platform, env: a.env, app: a.app, tz, addedAt: old ? old.addedAt : at, seenAt: at };
    const rest = list.filter((d) => d && d.token && d.token !== token).concat(device).sort((x, y) => (x.seenAt < y.seenAt ? 1 : x.seenAt > y.seenAt ? -1 : 0));
    list.length = 0;
    list.push(...rest.slice(0, MAX_DEVICES));
    return { value: device };
  });
}
export async function unregisterDevice(store, token) {
  const t = String(token == null ? "" : token).trim().toLowerCase();
  if (!t) return false;
  return mutate(store, DEVICES, [], (list) => {
    const i = Array.isArray(list) ? list.findIndex((d) => d && d.token === t) : -1;
    if (i < 0) return { skip: true, value: false };
    list.splice(i, 1);
    return { value: true };
  });
}
async function dropDead(store, tokens) {
  if (!tokens.length) return;
  try {
    await mutate(store, DEVICES, [], (list) => {
      const keep = (Array.isArray(list) ? list : []).filter((d) => !tokens.includes(d.token));
      if (keep.length === list.length) return { skip: true };
      list.length = 0;
      list.push(...keep);
      return { value: true };
    });
  } catch {}
}

/* the key and a token for Apple, or why not */
async function signer(store, now, env) {
  const key = await pushKey(env, store);
  if (!key) return { skipped: "no key" };
  try { return { jwt: await apnsJwt({ ...key, nowSec: Math.floor(now / 1000) }) }; } catch { return { skipped: "bad key" }; }
}
/* send to every device; dead ones removed; how many Apple accepted */
async function sendAll(store, list, jwt, send) {
  const res = await Promise.all(list.map(async (x) => {
    try { return { x, r: await send(x.dev, x.payload, { jwt, silent: x.silent }) }; } catch { return { x, r: { status: 0, reason: "error", dead: false } }; }
  }));
  await dropDead(store, res.filter(({ r }) => r && r.dead).map(({ x }) => x.dev.token));
  return res.filter(({ r }) => r && r.status === 200).map(({ x }) => x);
}
const deskOf = async (desk) => (typeof desk === "function" ? desk() : desk);

/* After something may have started waiting on Luke (a bot's question, a Spotify for Artists report)
   and every hour. desk: the loadDesk() result, or a function returning it (only read when needed). */
export async function sweep(store, now, { desk, env, send = sendApns, today } = {}) {
  const key = await pushKey(env, store);
  if (!key) return nothing("no key");
  const devices = await listDevices(store);
  if (!devices.length) return nothing("no devices");
  const sig = await signer(store, now, env);
  if (!sig.jwt) return nothing(sig.skipped);
  const d = await deskOf(desk);
  const waiting = waitingOnLuke(d, today || spDay(now), now);
  const live = new Set(waiting.map((w) => w.key));
  const iso = new Date(now).toISOString();
  const plan = await mutate(store, ALERTED, {}, (st) => {
    st.keys = st.keys && typeof st.keys === "object" ? st.keys : {};
    st.overnight = st.overnight && typeof st.overnight === "object" ? st.overnight : {};
    if (st.lastBuzz === undefined) st.lastBuzz = null;
    let changed = false;
    /* what stopped waiting is forgotten after 30 days (so the record stays small) */
    for (const [k, at] of Object.entries(st.keys)) if (!live.has(k) && !(now - Date.parse(at) < 30 * DAY)) { delete st.keys[k]; changed = true; }
    for (const t of Object.keys(st.overnight)) if (!devices.some((x) => x.token === t)) { delete st.overnight[t]; changed = true; }
    const fresh = waiting.filter((w) => !st.keys[w.key]);
    if (!fresh.length) return changed ? { value: { fresh, sends: [] } } : { skip: true, value: { fresh, sends: [] } };
    for (const w of fresh) st.keys[w.key] = iso;
    const recent = !!st.lastBuzz && now - Date.parse(st.lastBuzz) < 10 * MIN;
    const sends = devices.map((dev) => {
      if (isQuiet(dev.tz, now)) { st.overnight[dev.token] = (Number(st.overnight[dev.token]) || 0) + fresh.length; return { dev, silent: true }; }
      return { dev, silent: recent };
    });
    if (sends.some((s) => !s.silent)) st.lastBuzz = iso;
    return { value: { fresh, sends } };
  });
  if (!plan.fresh.length) return nothing();
  const one = plan.fresh.length === 1;
  const body = one ? plan.fresh[0].text : `${plan.fresh.length} new things are waiting on you`;
  const href = one ? plan.fresh[0].href : "#messages";
  const list = plan.sends.map((s) => ({ ...s, payload: payloadOf({ body, badge: waiting.length, href, silent: s.silent }) }));
  const ok = await sendAll(store, list, sig.jwt, send);
  return { buzzed: ok.filter((x) => !x.silent).length, silent: ok.filter((x) => x.silent).length, newKeys: plan.fresh.map((w) => w.key) };
}

/* The 08:00 summary, from the hourly job: each device whose own clock says 08:xx and that had alerts
   go silently overnight gets ONE "<n> things are waiting on you" (only what is still waiting). */
export async function morning(store, now, { desk, env, send = sendApns } = {}) {
  const devices = (await listDevices(store)).filter((x) => localHour(x.tz, now) === 8);
  if (!devices.length) return { sent: 0 };
  const { data } = await readDoc(store, ALERTED, {});
  const owed = devices.filter((x) => data && data.overnight && Number(data.overnight[x.token]) > 0);
  if (!owed.length) return { sent: 0 };
  const sig = await signer(store, now, env);
  if (!sig.jwt) return { sent: 0 };
  const count = waitingOnLuke(await deskOf(desk), spDay(now), now).length;
  const due = await mutate(store, ALERTED, {}, (st) => {
    const out = [];
    for (const x of owed) {
      const n = Number(st.overnight && st.overnight[x.token]) || 0;
      if (!n) continue;
      delete st.overnight[x.token];
      out.push({ dev: x, n: Math.min(n, count) });
    }
    return out.length ? { value: out } : { skip: true, value: [] };
  });
  const list = due.filter((x) => x.n > 0).map((x) => ({ dev: x.dev, silent: false,
    payload: payloadOf({ body: x.n === 1 ? "1 thing is waiting on you" : `${x.n} things are waiting on you`, badge: count, href: "#messages" }) }));
  return { sent: (await sendAll(store, list, sig.jwt, send)).length };
}

/* "Send a test alert" (Luke, from HQ): one plain alert to every device */
export async function sendTest(store, now, { env, send = sendApns } = {}) {
  const sig = await signer(store, now, env);
  if (!sig.jwt) return { sent: 0, skipped: sig.skipped };
  const devices = await listDevices(store);
  if (!devices.length) return { sent: 0, skipped: "no devices" };
  const list = devices.map((dev) => ({ dev, silent: false, payload: payloadOf({ body: "Test from HQ: alerts work." }) }));
  return { sent: (await sendAll(store, list, sig.jwt, send)).length };
}
