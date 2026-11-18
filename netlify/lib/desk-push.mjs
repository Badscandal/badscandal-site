/* Desk push (HQ automation, phase 1).
   Each bot may have one outgoing https address, stored on the desk. Empty means off.
   When a message, a task update, or a card answer for that bot is saved, HQ POSTs a
   short ping. The ping has no message text, no amounts and no address. HQ does not
   invent an address: until Luke pastes one, nothing is sent. */
import { getAuto } from "./action-cards.mjs";

export function pingBody({ bot, kind, id, at }) {
  return { desk: "badscandal", kind, bot, id, at };
}

export async function pingBot(store, now, bot, item, fetchImpl) {
  const name = String(bot || "").trim();
  if (!name || name === "Luke" || name === "Claude" || name === "HQ") return { bot: name, sent: false, off: true };
  let url = "";
  try {
    const auto = await getAuto(store);
    url = (auto.webhooks && auto.webhooks[name] && auto.webhooks[name].url) || "";
  } catch {
    return { bot: name, sent: false, off: true };
  }
  if (!url) return { bot: name, sent: false, off: true };
  const body = pingBody({ bot: name, kind: item.kind, id: String(item.id || ""), at: new Date(now).toISOString() });
  const fetchFn = fetchImpl || globalThis.fetch;
  if (typeof fetchFn !== "function") return { bot: name, sent: false, error: "no fetch" };
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 4000);
  try {
    const res = await fetchFn(url, {
      method: "POST",
      redirect: "manual",
      signal: ac.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status >= 200 && res.status < 300) return { bot: name, sent: true };
    return { bot: name, sent: false, error: "HTTP " + res.status };
  } catch (e) {
    return { bot: name, sent: false, error: e && e.name === "AbortError" ? "timed out" : "couldn't reach it" };
  } finally {
    clearTimeout(t);
  }
}

/* never throws: a missed ping must not fail the desk write it follows */
export async function pingNames(store, now, names, item, fetchImpl) {
  const out = [];
  const seen = new Set();
  for (const n of names || []) {
    const name = String(n || "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    try { out.push(await pingBot(store, now, name, item, fetchImpl)); }
    catch { out.push({ bot: name, sent: false, error: "couldn't reach it" }); }
  }
  return out;
}
