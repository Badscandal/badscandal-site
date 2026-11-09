/* Is this IP a data centre? (9 Nov 2026) Instagram/Facebook link scanners, Amazon/Google/
   Microsoft cloud machines and Apple's link previews open /touchme with a normal phone user
   agent seconds after a link is shared, so the user-agent filter (ua.mjs) can't see them. Their
   IPs give them away. Ranges: dc-ranges.json, rebuilt by `node tools/refresh-ip-ranges.mjs`
   (see the header there for when to re-run it). Binary search, a few microseconds per call.

   datacenter(ip) -> "meta" | "aws" | "google" | "azure" | "apple" | "" (a real network). */
import RANGES from "./dc-ranges.json" with { type: "json" };

export const DC_UPDATED = RANGES.updated;

export function ipv4Number(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  if (p.some((x) => x > 255)) return null;
  return p[0] * 16777216 + p[1] * 65536 + p[2] * 256 + p[3];
}

/* The first 64 bits of an IPv6 address as 16 lowercase hex digits (comparable as strings). */
export function ipv6Prefix(ip) {
  if (!ip.includes(":")) return null;
  ip = ip.replace(/%.*$/, "");
  const [head, tail] = ip.split("::");
  if (ip.split("::").length > 2) return null;
  const h = head ? head.split(":") : [];
  const t = tail !== undefined ? (tail ? tail.split(":") : []) : null;
  /* an embedded IPv4 tail (…:1.2.3.4) is two groups; only the first 4 groups matter here */
  const fill = t ? 8 - h.length - t.length - (t.some((g) => g.includes(".")) ? 1 : 0) : 0;
  const groups = t ? [...h, ...Array(Math.max(0, fill)).fill("0"), ...t] : h;
  if (groups.length < 4) return null;
  const four = groups.slice(0, 4);
  if (four.some((g) => !/^[0-9a-fA-F]{1,4}$/.test(g))) return null;
  return four.map((g) => g.padStart(4, "0")).join("").toLowerCase();
}

function search(list, x) {
  let lo = 0, hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = list[mid];
    if (x < r[0]) hi = mid - 1;
    else if (x > r[1]) lo = mid + 1;
    else return RANGES.sources[r[2]] || "dc";
  }
  return "";
}

export function datacenter(ip) {
  ip = String(ip || "").trim();
  if (!ip) return "";
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) ip = mapped[1];
  const n = ipv4Number(ip);
  if (n != null) return search(RANGES.v4, n);
  const p = ipv6Prefix(ip);
  return p ? search(RANGES.v6, p) : "";
}
