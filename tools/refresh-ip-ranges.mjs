#!/usr/bin/env node
/* Rebuilds netlify/lib/dc-ranges.json: the IP ranges of the data centres whose machines open our
   links without a person behind them (link-preview scanners, ad reviewers, crawlers, scripts).
   Used by netlify/lib/dc.mjs (hit.mjs, capi.mjs and the /touchme edge function).

   Run from the repo root:   node tools/refresh-ip-ranges.mjs
   Re-run it about once a month, and whenever /admin's "Show bots" view shows a data-centre town
   (Boardman, Prineville, Luleå, Ashburn, The Dalles, …) slipping through as a real visit.
   Then commit the JSON (stage it by name) and push.

   Sources (all public, no keys):
     meta    AS32934, Meta's own network: Instagram/Facebook/WhatsApp link scanners (RIPEstat)
     aws     Amazon Web Services            https://ip-ranges.amazonaws.com/ip-ranges.json
     google  Google Cloud (not Google's consumer ranges) https://www.gstatic.com/ipranges/cloud.json
     azure   Microsoft Azure ("AzureCloud" service tag, weekly file linked from the download page)
     apple   Applebot / iMessage link previews  https://search.developer.apple.com/applebot.json

   Output: v4 = sorted, merged [start, end, source] as 32-bit numbers; v6 = the same on the first
   64 bits as 16-hex-digit strings (a /64 is one customer, so anything finer is not needed). */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../netlify/lib/dc-ranges.json", import.meta.url));
const UA = { "User-Agent": "Mozilla/5.0 (badscandal.com ip-range refresh)" };
const SOURCES = ["meta", "aws", "google", "azure", "apple"];

async function getJSON(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r.json();
}

async function meta() {
  const j = await getJSON("https://stat.ripe.net/data/announced-prefixes/data.json?resource=AS32934");
  return j.data.prefixes.map((p) => p.prefix);
}
async function aws() {
  const j = await getJSON("https://ip-ranges.amazonaws.com/ip-ranges.json");
  return [...j.prefixes.map((p) => p.ip_prefix), ...j.ipv6_prefixes.map((p) => p.ipv6_prefix)];
}
async function google() {
  const j = await getJSON("https://www.gstatic.com/ipranges/cloud.json");
  return j.prefixes.map((p) => p.ipv4Prefix || p.ipv6Prefix).filter(Boolean);
}
async function azure() {
  const page = await (await fetch("https://www.microsoft.com/en-us/download/details.aspx?id=56519", { headers: UA, signal: AbortSignal.timeout(60000) })).text();
  const url = (page.match(/https:\/\/download\.microsoft\.com\/download\/[^"']*?ServiceTags_Public_\d+\.json/) || [])[0];
  if (!url) throw new Error("Azure: couldn't find the ServiceTags_Public_*.json link on the download page");
  const j = await getJSON(url);
  const all = j.values.find((v) => v.name === "AzureCloud");
  if (!all) throw new Error("Azure: no AzureCloud tag in " + url);
  return all.properties.addressPrefixes;
}
async function apple() {
  const j = await getJSON("https://search.developer.apple.com/applebot.json");
  return j.prefixes.map((p) => p.ipv4Prefix || p.ipv6Prefix).filter(Boolean);
}

/* ---- CIDR -> numeric ranges ---- */
function v4(cidr) {
  const [ip, len] = cidr.split("/");
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((x) => !(x >= 0 && x <= 255))) return null;
  const n = ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
  const bits = Number(len);
  const size = 2 ** (32 - bits);
  const start = Math.floor(n / size) * size;
  return [start, start + size - 1];
}
function v6hex(ip) {
  let [head, tail] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined ? (tail ? tail.split(":") : []) : null;
  const groups = t ? [...h, ...Array(8 - h.length - t.length).fill("0"), ...t] : h;
  if (groups.length !== 8) return null;
  return groups.map((g) => g.padStart(4, "0")).join("").toLowerCase();
}
function v6(cidr) {
  const [ip, len] = cidr.split("/");
  const hex = v6hex(ip);
  if (!hex) return null;
  const bits = Math.min(64, Number(len));
  const hi = BigInt("0x" + hex.slice(0, 16));
  const span = (1n << BigInt(64 - bits)) - 1n;
  const start = hi & ~span & 0xffffffffffffffffn;
  return [start, start | span];
}

function merge(list) {
  list.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const out = [];
  for (const r of list) {
    const last = out[out.length - 1];
    /* adjacent or overlapping: extend (the first source keeps the label) */
    if (last && r[0] <= last[1] + (typeof r[0] === "bigint" ? 1n : 1)) {
      if (r[1] > last[1]) last[1] = r[1];
    } else out.push([...r]);
  }
  return out;
}

const got = {};
const four = [], six = [];
for (const [i, name] of SOURCES.entries()) {
  const fn = { meta, aws, google, azure, apple }[name];
  let cidrs;
  try {
    cidrs = await fn();
  } catch (e) {
    console.error(`!! ${name} failed: ${e.message}. Nothing written; fix or retry.`);
    process.exit(1);
  }
  got[name] = cidrs.length;
  for (const c of cidrs) {
    const r = c.includes(":") ? v6(c) : v4(c);
    if (!r) continue;
    (c.includes(":") ? six : four).push([r[0], r[1], i]);
  }
}

const m4 = merge(four);
const m6 = merge(six).map(([s, e, i]) => [s.toString(16).padStart(16, "0"), e.toString(16).padStart(16, "0"), i]);
const out = { updated: new Date().toISOString().slice(0, 10), sources: SOURCES, prefixes: got, v4: m4, v6: m6 };
writeFileSync(OUT, JSON.stringify(out).replace(/\],\[/g, "],\n[") + "\n");
console.log(`wrote ${OUT}\n  prefixes in: ${JSON.stringify(got)}\n  merged ranges: v4 ${m4.length}, v6 ${m6.length}`);
