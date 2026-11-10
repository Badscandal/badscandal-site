/* Runs at Netlify's edge in front of /touchme (9 Nov 2026). Writes the visitor's country into
   the page's <html data-geo="" data-eu=""> so js/touchme.js knows, from the first frame, whether
   the Meta Pixel needs the consent bar (EU/EEA/UK, netlify/lib/geo.mjs) — no extra request.
   Every visitor gets the same page; only the consent bar differs, as the law requires.
   Any failure passes the page through untouched: touchme.js then falls back to the phone's
   time zone (Europe/* -> ask first).

   Also stamps data-dc="1" when the visitor's IP is a data centre (Meta/Amazon/Google/Microsoft/
   Apple link scanners, netlify/lib/dc.mjs), so touchme.js never loads the Meta Pixel for them.
   The page itself is identical for everyone. */
import { datacenter } from "../lib/dc.mjs";
import { needsConsent } from "../lib/geo.mjs";

export default async (req, context) => {
  const res = await context.next();
  if (res.status !== 200 || !(res.headers.get("content-type") || "").includes("text/html")) return res;
  let html;
  try {
    html = await res.text();
  } catch {
    return res;
  }
  const cc = String(context.geo?.country?.code || "").toUpperCase();
  const geo = /^[A-Z]{2}$/.test(cc) ? cc : "";
  /* Netlify's post-processing may rewrite data-geo="" as data-geo='' or a bare data-geo. */
  let dc = "";
  try { dc = datacenter(context.ip) ? "1" : "0"; } catch {}
  const out = html.replace(/\sdata-geo(?:=(?:""|''))?(?=[\s>])/, ` data-geo="${geo}" data-eu="${geo ? (needsConsent(geo) ? 1 : 0) : ""}" data-dc="${dc}"`);
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  headers.delete("etag");
  return new Response(out, { status: 200, headers });
};

export const config = { path: ["/touchme", "/touchme.html", "/touchme/"] };
