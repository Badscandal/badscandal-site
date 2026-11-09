/* Admin login (9 Nov 2026). The password lives ONLY in the Netlify env var ADMIN_KEY (or the
   older STATS_KEY). A correct password gets a signed cookie:

     __Host-bs_admin = <expiry ms>.<HMAC-SHA256(ADMIN_KEY, "bs-admin|" + expiry)>

   HttpOnly + Secure + SameSite=Strict, 30 days. Nothing is stored server-side, so changing the
   password in Netlify logs every device out at once. */

export const COOKIE = "__Host-bs_admin";
export const SESSION_DAYS = 30;

const enc = new TextEncoder();

function b64url(buf) {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

/* Constant-time for equal-length strings; different lengths return false straight away (the
   inputs compared here are always HMACs of a fixed length, so that leaks nothing). */
export function sameString(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* Compares HMACs of both sides, so the time taken says nothing about the password. */
export async function checkPassword(given, secret) {
  if (!secret || typeof given !== "string" || !given || given.length > 256) return false;
  const [a, b] = await Promise.all([hmac(secret, "pw|" + given), hmac(secret, "pw|" + secret)]);
  return sameString(a, b);
}

export async function makeSession(secret, now = Date.now()) {
  const exp = now + SESSION_DAYS * 86400000;
  return exp + "." + (await hmac(secret, "bs-admin|" + exp));
}

export async function verifySession(value, secret, now = Date.now()) {
  if (!secret || typeof value !== "string") return false;
  const m = /^(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (!m || Number(m[1]) <= now) return false;
  return sameString(m[2], await hmac(secret, "bs-admin|" + m[1]));
}

export function readCookie(header, name) {
  for (const part of String(header || "").split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return "";
}

export function sessionCookie(value) {
  return `${COOKIE}=${value}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}
