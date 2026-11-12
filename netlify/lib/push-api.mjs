/* /api/hq/push/* (12 Nov 2026, the HQ apps). Routed here by netlify/functions/hq.mjs AFTER its login
   check (the /hq cookie): the apps load /hq, Luke logs in there, and the page calls these same-origin.

     POST /api/hq/push/register   {token, platform, env, app, tz} -> {ok:true}   a device for alerts
     POST /api/hq/push/unregister {token}                         -> {ok:true}   (logging out in the app)
     GET  /api/hq/push/waiting                                     -> {count, items:[{key, kind, id, text, href}]}
     POST /api/hq/push/test                                        -> {ok, sent}  one test alert to every device
     POST /api/hq/push/key        {key, keyId}                     -> {ok:true}   WRITE-ONLY: the Apple push key
                                  when it can't go in the Netlify env; checked by importing it, kept at
                                  push/key.json, never answered by any address (there is no GET)

   Every POST must come from our own page (the Origin rule the /api/staff/* POSTs use). ?sample=1 never
   writes and answers /waiting from the made-up desk. Logic: netlify/lib/push.mjs, netlify/lib/apns.mjs. */
import { importPushKey, KEY_BLOB, pushKeyFromText, TEAM_ID } from "./apns.mjs";
import { registerDevice, sendTest, unregisterDevice } from "./push.mjs";
import { loadDesk, spDay, waitingOnLuke } from "./staff.mjs";
import { sampleDesk } from "./staff-sample.mjs";

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...NO_STORE } });
const MAX_BODY = 8 * 1024;

async function bodyOf(req) {
  const text = await req.text();
  if (text.length > MAX_BODY) return null;
  try { const v = JSON.parse(text || "{}"); return v && typeof v === "object" && !Array.isArray(v) ? v : null; } catch { return null; }
}
const waitingOut = (desk, now) => {
  const items = waitingOnLuke(desk, spDay(now), now).map(({ key, kind, id, text, href }) => ({ key, kind, id, text, href }));
  return { count: items.length, items };
};

/* o: { store: () => the staff desk store, env: (name) => value, now, send? } */
export async function pushApi(req, o) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/$/, "").slice("/api/hq/push/".length);
  const sample = url.searchParams.get("sample") === "1";
  const now = o.now || Date.now();
  if (req.method === "GET") {
    if (path !== "waiting") return json(404, { error: "Not found" });
    if (sample) return json(200, { sample: true, ...waitingOut(sampleDesk(now), now) });
    return json(200, waitingOut(await loadDesk(o.store(), now), now));
  }
  if (req.method !== "POST" || !["register", "unregister", "test", "key"].includes(path)) return json(404, { error: "Not found" });
  const origin = req.headers.get("origin");
  if (origin && origin !== url.origin) return json(403, { error: "Forbidden" });
  const a = await bodyOf(req);
  if (!a) return json(400, { error: "Bad request" });
  if (sample) return json(200, { ok: true, sample: true });
  const store = o.store();
  try {
    if (path === "register") { await registerDevice(store, now, a); return json(200, { ok: true }); }
    if (path === "unregister") { await unregisterDevice(store, a.token); return json(200, { ok: true }); }
    if (path === "test") return json(200, { ok: true, ...(await sendTest(store, now, { env: o.env, ...(o.send ? { send: o.send } : {}) })) });
    /* key: the .p8's text or its base64 body; the Key ID Apple shows next to it (10 letters/digits) */
    const keyId = String(a.keyId == null ? "" : a.keyId).trim();
    if (!/^[A-Z0-9]{10}$/.test(keyId)) return json(400, { error: "keyId must be the Key ID Apple shows for the key: 10 capital letters and digits." });
    const keyB64 = pushKeyFromText(typeof a.key === "string" ? a.key.slice(0, 4000) : "");
    try { await importPushKey(keyB64); } catch { return json(400, { error: "That is not an Apple push key (.p8). Nothing was saved." }); }
    await store.setJSON(KEY_BLOB, { keyB64, keyId, teamId: TEAM_ID });
    return json(200, { ok: true });
  } catch (e) {
    if (e && e.name === "StaffError") return json(e.code === "busy" ? 503 : 400, { error: e.message });
    console.error("push api failed", e?.name || "Error");
    return json(500, { error: "Something went wrong" });
  }
}
