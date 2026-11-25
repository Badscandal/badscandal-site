/* Google Drive for the edit machine (25 Nov 2026). No dependencies: signs a service-account JWT with
   node:crypto (same key as the sheet reader, netlify/lib/gsheets.mjs), swaps it for a 1-hour token and
   talks to Drive v3 with fetch.

   Netlify env (Luke adds it; never in the repo, never logged, never sent to the browser):
     GOOGLE_SA_KEY   the service account's JSON key (already there for the HQ sheet)
   The scope is the whole of Drive, but a service account only sees what was SHARED with it: the one
   folder "BADSCANDAL Edits" (Luke shares it with the service account's email as Editor).

   What it does: list a folder, find or make a sub-folder, move a file (change its parents), read a
   small JSON file, and stream a file with a byte range (the 540 px previews on HQ).
   Every function takes `fetchImpl` so the tests never reach Google. */
import { createSign } from "node:crypto";
import { parseKey } from "./gsheets.mjs";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
export const RUN_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const API = "https://www.googleapis.com/drive/v3/files";
const ALL = "supportsAllDrives=true";
const FOLDER = "application/vnd.google-apps.folder";
const b64 = (s) => Buffer.from(s).toString("base64url");

export function signJwt(sa, scope, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const head = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64(JSON.stringify({ iss: sa.email, scope, aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3000 }));
  const sig = createSign("RSA-SHA256").update(head + "." + body).sign(sa.key).toString("base64url");
  return head + "." + body + "." + sig;
}

/* A plain-words error that is safe to show (never the key, never Google's raw answer). */
export class DriveError extends Error {
  constructor(message, status = 502) { super(message); this.name = "DriveError"; this.status = status; }
}

/* One token per warm function per scope; a token is reused until 5 minutes before it runs out. */
const tokens = new Map();
export function forgetTokens() { tokens.clear(); }

export async function accessToken(rawKey, scope = DRIVE_SCOPE, fetchImpl = fetch, now = Date.now()) {
  const sa = parseKey(rawKey || "");
  if (!sa) throw new DriveError("The Google key on Netlify isn't a service-account JSON key", 503);
  const kept = tokens.get(scope + "|" + sa.email);
  if (kept && kept.until > now) return { token: kept.token, email: sa.email };
  let res;
  try {
    res = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(8000),
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signJwt(sa, scope, now) }),
    });
  } catch { throw new DriveError("Couldn't reach Google"); }
  const j = await res.json().catch(() => null);
  if (!res.ok || !j || !j.access_token) throw new DriveError("Google refused the key (HTTP " + res.status + ")");
  tokens.set(scope + "|" + sa.email, { token: j.access_token, until: now + Math.max(60, (j.expires_in || 3600) - 300) * 1000 });
  return { token: j.access_token, email: sa.email };
}

/* Drive's query language: a name in single quotes, with \ and ' escaped. */
export function q(s) { return "'" + String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'"; }

/* The client. rawKey = GOOGLE_SA_KEY. */
export function drive(rawKey, fetchImpl = fetch) {
  async function call(url, init = {}, what = "Drive") {
    const { token, email } = await accessToken(rawKey, DRIVE_SCOPE, fetchImpl);
    let res;
    try {
      res = await fetchImpl(url, { ...init, headers: { ...(init.headers || {}), Authorization: "Bearer " + token }, signal: init.signal || AbortSignal.timeout(9000) });
    } catch (e) {
      throw new DriveError(e?.name === "TimeoutError" ? "Google Drive didn't answer in time" : "Couldn't reach Google Drive");
    }
    if (res.status === 404) throw new DriveError(what + " wasn't found, or isn't shared with " + email, 404);
    if (res.status === 403) throw new DriveError("The folder isn't shared with " + email + " as Editor", 403);
    if (!res.ok && res.status !== 206) throw new DriveError(what + " failed (HTTP " + res.status + ")");
    return res;
  }

  /* Everything directly inside a folder (not in the bin), newest first. */
  async function list(folderId, { extra = "", fields = "id,name,mimeType,size,createdTime,parents" } = {}) {
    const out = [];
    let page = "";
    for (let i = 0; i < 20; i++) {
      const query = q(folderId) + " in parents and trashed = false" + (extra ? " and " + extra : "");
      const url = API + "?" + ALL + "&includeItemsFromAllDrives=true&pageSize=1000&orderBy=createdTime desc" +
        "&q=" + encodeURIComponent(query) + "&fields=" + encodeURIComponent("nextPageToken,files(" + fields + ")") + (page ? "&pageToken=" + encodeURIComponent(page) : "");
      const j = await (await call(url, {}, "The folder")).json();
      out.push(...(j.files || []));
      if (!j.nextPageToken) break;
      page = j.nextPageToken;
    }
    return out;
  }

  /* Files named `name` inside any of `parentIds` (one call, for up to 40 parents). */
  async function named(parentIds, name) {
    if (!parentIds.length) return [];
    const ids = parentIds.slice(0, 40).map((id) => q(id) + " in parents").join(" or ");
    const url = API + "?" + ALL + "&includeItemsFromAllDrives=true&pageSize=1000" +
      "&q=" + encodeURIComponent("(" + ids + ") and name = " + q(name) + " and trashed = false") + "&fields=" + encodeURIComponent("files(id,name,parents,modifiedTime)");
    return ((await (await call(url, {}, "The folder")).json()).files || []);
  }

  async function folders(parentId) { return list(parentId, { extra: "mimeType = " + q(FOLDER) }); }

  /* A sub-folder by name; made when `make` is true and it isn't there. */
  async function child(parentId, name, make = false) {
    const hit = (await folders(parentId)).find((f) => f.name === name);
    if (hit) return hit.id;
    if (!make) return null;
    const res = await call(API + "?" + ALL + "&fields=id", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId] }),
    }, "Making the folder " + name);
    return (await res.json()).id;
  }

  /* A path like "2 Approved/touch-me" under the root folder. */
  async function path(rootId, p, make = false) {
    let id = rootId;
    for (const part of String(p).split("/").filter(Boolean)) {
      id = await child(id, part, make);
      if (!id) return null;
    }
    return id;
  }

  /* Move = change the parents (the file keeps its id, so a move can be undone). */
  async function move(fileId, toFolderId, fromFolderId) {
    const url = API + "/" + encodeURIComponent(fileId) + "?" + ALL + "&fields=id,parents&addParents=" + encodeURIComponent(toFolderId) +
      (fromFolderId ? "&removeParents=" + encodeURIComponent(fromFolderId) : "");
    return (await call(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" }, "The file")).json();
  }

  async function readJSON(fileId, max = 256 * 1024) {
    const res = await call(API + "/" + encodeURIComponent(fileId) + "?alt=media&" + ALL, {}, "The file");
    const text = await res.text();
    if (text.length > max) throw new DriveError("That file is too big to read here");
    try { return JSON.parse(text); } catch { throw new DriveError("That file isn't JSON"); }
  }

  /* The raw Drive answer for bytes start..end (inclusive): the caller passes its body straight on. */
  async function stream(fileId, start, end) {
    return call(API + "/" + encodeURIComponent(fileId) + "?alt=media&" + ALL, {
      headers: { Range: "bytes=" + start + "-" + end }, signal: AbortSignal.timeout(20000),
    }, "The preview");
  }

  return { list, named, folders, child, path, move, readJSON, stream };
}

/* A Range header against a file of `size` bytes -> { start, end, partial } or null (can't satisfy).
   Only one range; an open or missing range is capped at `cap` bytes (the browser asks for the rest). */
export function parseRange(header, size, cap = 4 * 1024 * 1024) {
  size = Number(size);
  if (!Number.isFinite(size) || size <= 0) return null;
  if (!header) return { start: 0, end: Math.min(size, cap) - 1, partial: size > cap };
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start, end;
  if (m[1] === "") {                     /* the last N bytes */
    const n = Number(m[2]);
    if (!n) return null;
    start = Math.max(0, size - n); end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || end < start) return null;
  end = Math.min(end, start + cap - 1);
  return { start, end, partial: true };
}
