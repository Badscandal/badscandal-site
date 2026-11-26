/* Read-only Google Sheets reader for /hq (11 Nov 2026). No dependencies: signs a service-account
   JWT with node:crypto, swaps it for a 1-hour access token, and GETs the tabs.

   Netlify env (Luke adds both; never in the repo, never logged):
     GOOGLE_SA_KEY   the service account's JSON key (the whole file, pasted as one value)
     HQ_SHEET_ID     the id of the "BADSCANDAL HQ" sheet (the long part of its link)
   The sheet must be shared with the service account's email as VIEWER. The only scope asked for
   is spreadsheets.readonly: nothing here can change a sheet. */
import { createSign } from "node:crypto";

const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const b64 = (s) => Buffer.from(s).toString("base64url");

export function parseKey(raw) {
  try {
    const k = JSON.parse(raw);
    if (!k.client_email || !k.private_key) return null;
    return { email: k.client_email, key: String(k.private_key).replace(/\\n/g, "\n") };
  } catch { return null; }
}

export function signJwt(sa, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const head = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64(JSON.stringify({ iss: sa.email, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3000 }));
  const sig = createSign("RSA-SHA256").update(head + "." + body).sign(sa.key).toString("base64url");
  return head + "." + body + "." + sig;
}

export function batchUrl(sheetId, tabs) {
  const q = tabs.map((t) => "ranges=" + encodeURIComponent(`'${t}'!A1:Z5000`)).join("&");
  return `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values:batchGet?${q}&majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
}

/* 26 Nov 2026 (speed): one token per warm function, reused until 5 minutes before it runs out. It used to be
   asked for on every read (a signature and a round trip to Google each time). Kept per fetchImpl, so a test's
   own fetch never sees another test's token. Never logged, never sent anywhere but Google. */
const tokens = new WeakMap();
async function sheetToken(sa, fetchImpl) {
  let m = tokens.get(fetchImpl);
  if (!m) tokens.set(fetchImpl, (m = new Map()));
  const hit = m.get(sa.email);
  if (hit && hit.until > Date.now()) return { token: hit.token };
  const p = (async () => {
    const tok = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(8000),
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signJwt(sa) }),
    });
    const tj = await tok.json().catch(() => null);
    if (!tok.ok || !tj || !tj.access_token) return { error: "Google refused the key (HTTP " + tok.status + ")" };
    const life = Number(tj.expires_in) > 0 ? Number(tj.expires_in) * 1000 : 3600 * 1000;
    m.set(sa.email, { token: tj.access_token, until: Date.now() + life - 5 * 60 * 1000 });
    return { token: tj.access_token };
  })();
  /* three reads at once share one token request */
  m.set(sa.email, { pending: p, until: 0 });
  try { return await p; } finally { const cur = m.get(sa.email); if (cur && cur.pending === p) m.delete(sa.email); }
}
async function tokenFor(sa, fetchImpl) {
  const m = tokens.get(fetchImpl), cur = m && m.get(sa.email);
  if (cur && cur.pending) return cur.pending;
  return sheetToken(sa, fetchImpl);
}

/* -> { sheets: {Tab: [[cells]]} } or { error }. fetchImpl is injectable for tests. */
export async function readTabs(rawKey, sheetId, tabs, fetchImpl = fetch) {
  const sa = parseKey(rawKey);
  if (!sa) return { error: "The Google key on Netlify isn't a service-account JSON key" };
  try {
    const t = await tokenFor(sa, fetchImpl);
    if (t.error) return { error: t.error };
    const res = await fetchImpl(batchUrl(sheetId, tabs), { method: "GET", headers: { Authorization: "Bearer " + t.token }, signal: AbortSignal.timeout(9000) });
    const j = await res.json().catch(() => null);
    if (res.status === 403) return { error: "The sheet isn't shared with " + sa.email + " (add it as Viewer)" };
    if (res.status === 400) return { error: "A tab is missing in the sheet (need: " + tabs.join(", ") + ")" };
    if (!res.ok || !j || !Array.isArray(j.valueRanges)) return { error: "Couldn't read the sheet (HTTP " + res.status + ")" };
    const sheets = {};
    j.valueRanges.forEach((v, i) => { sheets[tabs[i]] = v.values || []; });
    return { sheets, email: sa.email };
  } catch (e) {
    return { error: e?.name === "TimeoutError" ? "Google didn't answer in time" : "Couldn't reach Google" };
  }
}
