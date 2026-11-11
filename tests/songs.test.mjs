/* The song list (/songs.json) and everything that must agree with it (10 Nov 2026). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { edgePaths, problems, SONGS, songFromPath } from "../netlify/lib/songs.mjs";
import { LINKS, defaultLink } from "../netlify/lib/admin.mjs";
import { EDGE, EDGE_RE, edgeConfig, render, ROOT } from "../tools/song-page.mjs";

const DATA = JSON.parse(readFileSync(join(ROOT, "songs.json"), "utf8"));
const read = (f) => readFileSync(join(ROOT, f), "utf8");

test("songs.json follows the rules (slugs, dates, -vN assets, Spotify links, no pre-saves)", () => {
  assert.deepEqual(problems(), []);
  assert.ok(SONGS.length >= 2);
  assert.deepEqual(problems([{ slug: "x", title: "X", date: "2026-1-1", cover: "a.jpg", coverWeb: "assets/x-v1.webp", share: "assets/s-v1.jpg",
    spotifyTrack: "https://ffm.to/presave", spotifyArtist: "nope" }]).length > 3, true, "bad entries are caught");
});

test("every song has its page, and each page is exactly what the list + template produce", () => {
  for (const s of DATA.songs) {
    const f = s.slug + ".html";
    assert.ok(existsSync(join(ROOT, f)), f + " is missing: run node tools/new-song.mjs --rebuild");
    assert.equal(read(f), render(s, DATA.spotifyArtist), f + " drifted from songs.json: run node tools/new-song.mjs --rebuild");
  }
});

test("the edge function's literal path list matches the list", () => {
  const edge = readFileSync(EDGE, "utf8");
  assert.equal(edge.match(EDGE_RE)[0], edgeConfig(DATA.songs), "run node tools/new-song.mjs --rebuild");
  for (const p of edgePaths()) assert.ok(edge.includes(`"${p}"`), p);
});

test("every image a song uses exists; share images are under 200 KB (WhatsApp)", () => {
  for (const s of DATA.songs) {
    for (const k of ["cover", "coverWeb", "share"]) assert.ok(existsSync(join(ROOT, s[k])), s[k]);
    assert.ok(statSync(join(ROOT, s.share)).size < 200 * 1024, s.share + " is over 200 KB");
  }
});

test("/admin lists every song (newest first) plus the home page, and opens on the newest song that is out", () => {
  const ids = LINKS.map((l) => l.id);
  for (const s of SONGS) assert.ok(ids.includes(s.slug), s.slug);
  assert.equal(ids.at(-1), "home");
  assert.equal(defaultLink(Date.parse("2026-11-10T12:00:00Z")).id, "touchme");
  assert.equal(defaultLink(Date.parse("2026-11-25T12:00:00Z")).id, "medaseubody");
});

test("song paths: /slug, /slug.html and /slug/ are the song; anything else is not", () => {
  assert.equal(songFromPath("/touchme").title, "Touch Me");
  assert.equal(songFromPath("/touchme.html").title, "Touch Me");
  assert.equal(songFromPath("/medaseubody/").title, "Me Dá Seu Body");
  for (const p of ["/", "/admin", "/touchme/x", "/../touchme", "/privacy", "", null]) assert.equal(songFromPath(p), null, String(p));
});

test("the visit counter accepts every song, the home page and the old listen page", () => {
  const hit = read("netlify/functions/hit.mjs");
  assert.match(hit, /new Set\(\["home", "listen", \.\.\.SONGS\.map/);
});

/* ---------- "Out now / Released <date>" (11 Nov 2026) ---------- */

const TEMPLATE_HTML = readFileSync(join(ROOT, "tools/song-template.html"), "utf8");
const OUT = { slug: "outsong", title: "Out Song", date: "2026-10-30", cover: "assets/a-v1.jpg", coverWeb: "assets/a-600-v1.webp", share: "assets/share-a-1200-v1.jpg",
  spotifyTrack: "https://open.spotify.com/track/6Y0BIHxJvTVIjOmk636Cw3", spotifyArtist: DATA.spotifyArtist };
const SOON = { ...OUT, slug: "soonsong", title: "Soon Song", date: "2026-11-24", spotifyTrack: "" };

/* Runs the page's own before-paint script against a stand-in page, with the clock and the
   phone's language set by the test. Returns what a visitor would see. */
function paint(html, now, lang) {
  const attr = (n) => (html.match(new RegExp(`<main id="song"[^>]*\\sdata-${n}="([^"]*)"`)) || [])[1] || "";
  const hiddenInHtml = (id) => new RegExp(`id="${id}"[^>]*\\shidden[\\s>]`).test(html);
  const els = {};
  const el = (id) => (els[id] ||= { id, hidden: hiddenInHtml(id), textContent: "", href: "", firstChild: { textContent: "", nodeValue: "" },
    getAttribute: (k) => (id === "song" ? attr(k.replace(/^data-/, "")) : null), querySelector: (q) => el(id + " " + q) });
  const script = html.match(/<script>([\s\S]*?)<\/script>\s*<\/main>/)[1];
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(now.getTime()); }
    static now() { return now.getTime(); }
  }
  const win = {};
  new Function("window", "document", "navigator", "Date", "performance", script)(
    win, { getElementById: el, documentElement: {} }, { languages: [lang], language: lang }, FakeDate, { now: () => 0 });
  return { outHidden: el("outnow").hidden, outNow: el("outnow").firstChild.textContent, released: el("rel").textContent,
    countdownShown: el("cd").hidden === false, button: el("spt").textContent, href: el("sp").href };
}

test("a released song page says Out now + Released <date>; an unreleased one keeps it hidden (no-JS HTML)", () => {
  const out = render(OUT, DATA.spotifyArtist), soon = render(SOON, DATA.spotifyArtist);
  assert.match(out, /<p class="when out" id="outnow"><span>Out now<\/span><small id="rel">Released 30 October 2026<\/small><\/p>/);
  assert.match(soon, /<p class="when out" id="outnow" hidden><span>Out now<\/span><small id="rel">Released 24 November 2026<\/small><\/p>/);
  assert.match(out, /<meta name="description" content="Out Song by BADSCANDAL\. Out now\. Released 30 October 2026\. Listen on Spotify\.">/);
  assert.match(soon, /<meta name="description" content="Soon Song by BADSCANDAL\. Out 24 November 2026\. Follow on Spotify\.">/);
  /* the released text is plain text, never a link (an uncounted way off the page) */
  for (const h of [out, soon]) assert.doesNotMatch(h.match(/<p class="when out"[\s\S]*?<\/p>/)[0], /<a[\s>]|href=/);
  /* and the real pages agree with the list */
  for (const s of DATA.songs) {
    const h = read(s.slug + ".html");
    if (s.spotifyTrack) assert.match(h, /id="outnow"><span>Out now<\/span><small id="rel">Released \d{1,2} [A-Z][a-z]+ \d{4}</, s.slug);
    else assert.match(h, /id="outnow" hidden><span>Out now</, s.slug);
  }
});

test("the before-paint script shows the released block by the visitor's date, in their language", () => {
  const out = render(OUT, DATA.spotifyArtist), soon = render(SOON, DATA.spotifyArtist);
  const nov11 = new Date(2026, 10, 11, 9, 0, 0);

  const en = paint(out, nov11, "en-IE");
  assert.deepEqual([en.outHidden, en.outNow, en.released, en.countdownShown, en.button, en.href],
    [false, "Out now", "Released 30 October 2026", false, "Listen on Spotify", OUT.spotifyTrack]);
  const pt = paint(out, nov11, "pt-BR");
  assert.deepEqual([pt.outHidden, pt.outNow, pt.released, pt.button], [false, "Já disponível", "Lançamento: 30 de outubro de 2026", "Ouvir no Spotify"]);
  assert.equal(paint(out, nov11, "de-DE").released, "Veröffentlicht am 30. Oktober 2026");
  assert.equal(paint(out, nov11, "fr-FR").released, "Sorti le 30 octobre 2026");
  assert.equal(paint(out, nov11, "ja-JP").released, "Released 30 October 2026", "an unknown language falls back to English");

  /* before release nothing changes: Follow + the countdown, no released text */
  const before = paint(soon, nov11, "en-IE");
  assert.deepEqual([before.outHidden, before.countdownShown, before.button, before.href], [true, true, "Follow on Spotify", DATA.spotifyArtist]);
  const lastSecond = paint(soon, new Date(2026, 10, 23, 23, 59, 59), "pt-BR");
  assert.deepEqual([lastSecond.outHidden, lastSecond.countdownShown, lastSecond.button], [true, true, "Seguir no Spotify"]);

  /* release day, local midnight: it flips even though the track link isn't in the list yet */
  const day = paint(soon, new Date(2026, 10, 24, 0, 0, 1), "en-IE");
  assert.deepEqual([day.outHidden, day.released, day.countdownShown, day.button, day.href],
    [false, "Released 24 November 2026", false, "Listen on Spotify", DATA.spotifyArtist]);

  /* a track link pasted in early must not show "Out now" before the day */
  const early = paint(render({ ...SOON, spotifyTrack: OUT.spotifyTrack }, DATA.spotifyArtist), nov11, "en-IE");
  assert.deepEqual([early.outHidden, early.countdownShown, early.button], [true, true, "Follow on Spotify"]);
});

test("every language row on the song page has all five strings (the fifth is \"Released\")", () => {
  const rows = new Function("return " + TEMPLATE_HTML.match(/var B=(\{[\s\S]*?\}),\s*d=document/)[1])();
  assert.deepEqual(Object.keys(rows).sort(), ["cs", "de", "en", "es", "fr", "it", "nl", "pl", "pt"]);
  for (const [lang, row] of Object.entries(rows)) {
    assert.equal(row.length, 5, lang);
    for (const s of row) assert.ok(typeof s === "string" && s.trim().length > 1, lang + ": " + s);
  }
  assert.equal(rows.en[4], "Released");
  assert.equal(rows.pt[4], "Lançamento:");
  assert.equal(rows.es[4], "Lanzamiento:");
});

test("the home page lists what's out from /songs.json, counts the taps, and translates the new text", () => {
  const home = read("index.html"), js = read("js/listen.js"), i18n = read("js/i18n.js");
  assert.match(home, /<div class="outs" data-outs hidden>\s*<p class="tag">Out now<\/p>/);
  assert.match(home, /data-cd="rel" hidden/);
  assert.match(js, /songs\.json/);
  assert.match(js, /setAttribute\("data-link", x\.slug\)/, "js/count.js counts a[data-link] taps");
  assert.match(js, /a\.href = "\/" \+ x\.slug/, "rows go to our own song page");
  assert.match(read("js/count.js"), /a\[data-link\]/);
  assert.match(i18n, /"Released": \{ es: "[^"]+", pt: "[^"]+" \}/);
  assert.match(i18n, /"Out now": \{ es: "[^"]+", pt: "[^"]+" \}/);
});

test("the not-found page: branded, tiny, noindex, no visit counter, a way home", () => {
  assert.ok(existsSync(join(ROOT, "404.html")), "404.html is missing");
  const h = read("404.html");
  assert.match(h, /<meta name="robots" content="noindex/);
  assert.match(h, /BADSCANDAL/);
  assert.match(h, /<a class="btn" id="go" href="\/">/);
  assert.doesNotMatch(h, /<script[^>]*\ssrc=|\/api\/hit|fbq\(|<img|<video/, "no outside scripts, no counter, no Meta, no media");
  const sheets = [...h.matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map((m) => m[0]);
  assert.equal(sheets.length, 1);
  assert.match(sheets[0], /href="https:\/\/fonts\.googleapis\.com\/css2\?family=Archivo[^"]*text=BADSCANDAL/, "only the ten-letter wordmark font");
  assert.doesNotMatch(h, /(src|href)="(?!\/|https:\/\/fonts\.g)/, "every URL absolute: the page is shown at any path");
  assert.ok(statSync(join(ROOT, "404.html")).size < 8 * 1024, "keep it tiny");
  assert.match(read("_redirects"), /^\/tools\/\*\s+\/404\s+404!$/m);
});

/* ---------- link previews ---------- */

const PAGES = readdirSync(ROOT).filter((f) => f.endsWith(".html"));
test("every og:image is an absolute https://badscandal.com/ URL to a file that exists", () => {
  for (const f of PAGES) {
    for (const m of read(f).matchAll(/<meta property="og:image" content="([^"]+)"/g)) {
      assert.match(m[1], /^https:\/\/badscandal\.com\/assets\//, f);
      assert.ok(existsSync(join(ROOT, m[1].replace("https://badscandal.com/", ""))), f + ": " + m[1]);
    }
  }
});

test("home, /touchme and /medaseubody previews: 1200x1200 JPG under 200 KB, og:url, og:type, twitter:card", () => {
  for (const f of ["index.html", "touchme.html", "medaseubody.html"]) {
    const h = read(f);
    const img = h.match(/<meta property="og:image" content="https:\/\/badscandal\.com\/([^"]+)"/)[1];
    assert.match(img, /^assets\/share-[a-z0-9-]+-1200-v\d+\.jpg$/, f);
    assert.ok(statSync(join(ROOT, img)).size < 200 * 1024, img);
    assert.match(h, /<meta property="og:image:width" content="1200">/, f);
    assert.match(h, /<meta property="og:image:height" content="1200">/, f);
    assert.match(h, /<meta property="og:url" content="https:\/\/badscandal\.com\//, f);
    assert.match(h, /<meta property="og:type" content="[a-z.]+">/, f);
    assert.match(h, /<meta name="twitter:card" content="summary_large_image">/, f);
  }
});

/* ---------- Feature.fm is gone, no pre-saves ---------- */

test("no Feature.fm, music.badscandal.com or pre-save links in anything the site serves", () => {
  const served = [...PAGES, "_redirects", "listen.json", "songs.json", ...readdirSync(join(ROOT, "js")).map((f) => "js/" + f)];
  for (const f of served) {
    const t = read(f);
    assert.doesNotMatch(t, /(https?:)?\/\/[^\s"'<>]*(music\.badscandal\.com|ffm\.to|feature\.fm)/i, f);
    assert.doesNotMatch(t, /href="[^"]*pre-?save|"presave"\s*:\s*"http/i, f);
  }
  assert.match(read("_redirects"), /^\/listen\s+\/\s+302!$/m);
  assert.match(read("_redirects"), /^\/listen\.html\s+\/\s+302!$/m);
  for (const f of ["hq.html", "js/hq.js", "js/hq-pages.js", "index.html", "js/listen.js"]) assert.doesNotMatch(read(f), /Feature\.fm/i, f);
});
