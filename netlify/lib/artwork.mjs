/* The release cover on Upcoming (26 Nov 2026, Luke: "two songs have the cover art on them, but one song doesn't
   ... make sure that every song in future takes the artwork from the Google Drive link or Dropbox link that's
   posted into the song upload thing in the artwork section").

   Until now a card showed a cover only when the song had its page (songs.json) or the sheet had one. Now every
   release with an Artwork link in its pack shows that picture:

   - the board gives each release an address, /api/staff/artwork/<token>, where token = a hash of the release
     id, its Artwork link and a server secret (ADMIN_KEY). A new link = a new address, so a changed cover shows
     at once and an old copy is never served for it. Nobody can guess an address without the board.
   - the first time an address is asked for, the site opens the link (a Dropbox link downloads the file with
     dl=1; a Google Drive file through its download address, or through the service account when the file or
     its folder is shared with it; a Drive folder: the picture in it named like "cover" or "art", else the
     first one), checks it is a real JPG, PNG or WebP, and keeps a copy on the desk (artwork/<token>.bin + .json).
     Every later view is that copy: Drive and Dropbox are asked once per link.
   - a link that can't be opened keeps its reason for 30 minutes (artwork/<token>.json { why }), and the card
     says it in plain words ("share it as Anyone with the link"), so it can be fixed.
   - the copy is public on purpose (like the desk covers, staff.mjs coverResponse): the picture only, the
     address can't be guessed, and HQ's picture service (/.netlify/images) can then make the small one.

   Pure apart from the store and fetch it is handed; tests pass their own. */
import { createHash } from "node:crypto";

export const ART_MAX = 25 * 1024 * 1024;
export const ART_RETRY_MS = 30 * 60 * 1000;
const TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const TOKEN_RE = /^[a-f0-9]{32}$/;

export function artworkToken(id, link, secret) {
  return createHash("sha256").update(String(id) + "\n" + String(link).trim() + "\n" + String(secret || "")).digest("hex").slice(0, 32);
}
export const artworkPath = (token) => "/api/staff/artwork/" + token;

/* what kind of link it is -> { kind: "drive-file"|"drive-folder"|"dropbox"|"dropbox-folder"|"url"|"bad", id?, url? } */
export function artworkLink(raw) {
  let u;
  try { u = new URL(String(raw || "").trim()); } catch { return { kind: "bad" }; }
  if (u.protocol !== "https:") return { kind: "bad" };
  const host = u.hostname.toLowerCase();
  if (host === "drive.google.com" || host === "docs.google.com" || host === "drive.usercontent.google.com") {
    const folder = /\/folders\/([\w-]{10,})/.exec(u.pathname);
    if (folder) return { kind: "drive-folder", id: folder[1] };
    const id = (/\/(?:file\/)?d\/([\w-]{10,})/.exec(u.pathname) || [])[1] || u.searchParams.get("id");
    return id && /^[\w-]{10,}$/.test(id) ? { kind: "drive-file", id } : { kind: "bad" };
  }
  if (host === "dropbox.com" || host.endsWith(".dropbox.com")) {
    if (/^\/(?:scl\/fo|sh)\//.test(u.pathname)) return { kind: "dropbox-folder" };
    if (host === "dl.dropboxusercontent.com") return { kind: "url", url: u.toString() };
    u.searchParams.delete("raw");
    u.searchParams.set("dl", "1");
    return { kind: "dropbox", url: u.toString() };
  }
  return { kind: "url", url: u.toString() };
}

/* JPG / PNG / WebP from the first bytes; anything else (a share page, a sign-in page, a zip) is null */
export function pictureType(buf) {
  const b = Buffer.from(buf.buffer ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + Math.min(buf.byteLength, 16)) : buf);
  if (b.length > 8 && b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length > 12 && b.slice(0, 4).toString("latin1") === "RIFF" && b.slice(8, 12).toString("latin1") === "WEBP") return "webp";
  return null;
}

export class ArtworkError extends Error {
  constructor(why) { super(why); this.name = "ArtworkError"; this.why = why; }
}
const no = (why) => { throw new ArtworkError(why); };

async function download(url, fetchImpl, headers = {}) {
  let res;
  try { res = await fetchImpl(url, { redirect: "follow", headers, signal: AbortSignal.timeout(8000) }); }
  catch (e) { no(e && e.name === "TimeoutError" ? "The Artwork link took too long to answer. It is tried again in a while." : "The site couldn't open the Artwork link."); }
  if (res.status === 401 || res.status === 403) no("The Artwork link asks to sign in. Share it as \"Anyone with the link\".");
  if (res.status === 404) no("The Artwork link wasn't found (deleted or moved?). Paste the new link in the release form.");
  if (!res.ok) no("The Artwork link answered " + res.status + ".");
  if (Number(res.headers.get("content-length") || 0) > ART_MAX) no("The cover is over 25 MB. Upload a JPG (3000 x 3000 at about 85% quality is fine).");
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > ART_MAX) no("The cover is over 25 MB. Upload a JPG (3000 x 3000 at about 85% quality is fine).");
  const type = pictureType(buf);
  if (!type) {
    const text = Buffer.from(buf.slice(0, 4000)).toString("latin1");
    if (/accounts\.google\.com|ServiceLogin|Sign in/i.test(text)) no("Google Drive asks to sign in for the Artwork link. Share the file as \"Anyone with the link\".");
    if (buf[0] === 0x50 && buf[1] === 0x4b) no("The Artwork link is a folder or a zip. Paste the link to the cover picture itself.");
    no("The Artwork link isn't a JPG, PNG or WebP picture. Paste the link to the picture itself.");
  }
  return { buf, type };
}

/* the picture behind a link. o.drive = gdrive.drive(key) when the service account is set (optional). */
export async function fetchArtwork(raw, { fetchImpl = fetch, drive = null } = {}) {
  const l = artworkLink(raw);
  if (l.kind === "bad") no("The Artwork link isn't an https:// link to a picture.");
  if (l.kind === "dropbox-folder") no("The Artwork link is a Dropbox folder. Paste the link to the cover picture itself.");
  if (l.kind === "drive-folder") {
    if (!drive) no("The Artwork link is a Google Drive folder. Paste the link to the cover picture itself, shared as \"Anyone with the link\".");
    let files;
    try { files = await drive.list(l.id, { extra: "mimeType contains 'image/'", fields: "id,name,mimeType,size" }); }
    catch { no("The Artwork link is a Google Drive folder the site can't open. Paste the link to the cover picture itself, shared as \"Anyone with the link\"."); }
    const pics = (files || []).filter((f) => /image\/(jpeg|png|webp)/.test(f.mimeType || ""));
    if (!pics.length) no("The Drive folder in Artwork has no JPG, PNG or WebP picture in it.");
    const pick = pics.find((f) => /cover|art/i.test(f.name || "")) || pics[0];
    return fromDrive(pick.id, drive, fetchImpl);
  }
  if (l.kind === "drive-file") return fromDrive(l.id, drive, fetchImpl);
  return download(l.url, fetchImpl);
}
async function fromDrive(id, drive, fetchImpl) {
  /* through the service account first (works when the file or its folder is shared with it), else the public download */
  if (drive) {
    try {
      const res = await drive.stream(id, 0, ART_MAX - 1);
      const buf = new Uint8Array(await res.arrayBuffer());
      const type = pictureType(buf);
      if (type && buf.byteLength < ART_MAX) return { buf, type };
    } catch {}
  }
  return download("https://drive.google.com/uc?export=download&id=" + encodeURIComponent(id), fetchImpl);
}

const nf = (why) => new Response(JSON.stringify({ error: "Not found", ...(why ? { why } : {}) }), { status: 404, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const picture = (body, type) => new Response(body, { status: 200, headers: { "content-type": type, "cache-control": "public, max-age=31536000, immutable",
  "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" } });

/* GET /api/staff/artwork/<token>[?why=1]. releases = the desk's releases (staff.mjs listReleases), secret = ADMIN_KEY.
   ?why=1 answers JSON { ok, why } (the card's line when the picture can't be shown), never the picture. */
export async function artworkResponse(store, token, { releases, secret, fetchImpl = fetch, drive = null, now = Date.now(), why = false }) {
  token = String(token || "").replace(/\.(jpg|png|webp|img)$/, "");
  if (!TOKEN_RE.test(token)) return nf();
  let meta = null;
  try { meta = await store.get(`artwork/${token}.json`, { type: "json" }); } catch {}
  if (meta && meta.ok) {
    if (why) return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
    let body = null;
    try { body = await store.get(`artwork/${token}.bin`, { type: "stream" }); } catch {}
    if (body) return picture(body, meta.type);
    meta = null; /* the copy went missing: fetch it again */
  }
  if (meta && meta.why && now - Date.parse(meta.at || 0) < ART_RETRY_MS) return nf(meta.why);
  const r = (releases || []).find((x) => x && x.pack && x.pack.artwork && artworkToken(x.id, x.pack.artwork, secret) === token);
  if (!r) return nf();
  try {
    const { buf, type } = await fetchArtwork(r.pack.artwork, { fetchImpl, drive });
    /* an ArrayBuffer: what the Blobs store takes for binary */
    await store.set(`artwork/${token}.bin`, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    await store.setJSON(`artwork/${token}.json`, { ok: true, type: TYPES[type], bytes: buf.byteLength, release: r.id, at: new Date(now).toISOString() });
    if (why) return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
    return picture(buf, TYPES[type]);
  } catch (e) {
    const w = e && e.name === "ArtworkError" ? e.why : "The site couldn't read the Artwork link.";
    try { await store.setJSON(`artwork/${token}.json`, { ok: false, why: w, release: r.id, at: new Date(now).toISOString() }); } catch {}
    return nf(w);
  }
}
