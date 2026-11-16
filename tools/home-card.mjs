#!/usr/bin/env node
/* The home card (16 Nov 2026, Luke: Webmaster's "home card through a desk tool, with Luke confirming").
   Puts ONE song from songs.json on the home page's release card: listen.json's "release" and the home page's
   no-JS fallback (index.html: the cover, the title, and the link-preview image lines). Run by GitHub
   (song-page.yml, kind "card") after Luke's "Yes, correct", or by hand:
     node tools/home-card.mjs <slug> [--files-out <file>]
   Before release day the card says Follow on Spotify with a countdown; listen.js flips it to Listen at midnight
   in each visitor's own time zone, using the song's spotifyTrack from songs.json. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = new URL("..", import.meta.url).pathname;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const spToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/* listen.json's release for this song: upcoming before its day, out from it (with the track once it is known) */
export function cardRelease(song, today, current = {}) {
  const out = song.date <= today;
  return { mode: out ? "out" : "upcoming", title: song.title, kicker: (current && current.kicker) || "New single", date: song.date, cover: song.cover,
    cta: out && song.spotifyTrack ? song.spotifyTrack : song.spotifyArtist, links: {} };
}

/* the home page's own copy of the card and its link preview; every line must be found exactly once */
export function cardHtml(html, song) {
  const share = `https://badscandal.com/${song.share}`;
  const swaps = [
    [/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${share}">`, "og:image"],
    [/<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${share}">`, "twitter:image"],
    [/<meta property="og:image:alt" content="[^"]*">/, `<meta property="og:image:alt" content="BADSCANDAL — ${esc(song.title)}, cover art">`, "og:image:alt"],
    [/data-rel="cover" src="[^"]*" alt="[^"]*"/, `data-rel="cover" src="${song.cover}" alt="${esc(song.title)} — cover"`, "the card's cover"],
    [/<h2 class="rel-title" data-rel="title">[^<]*<\/h2>/, `<h2 class="rel-title" data-rel="title">${esc(song.title)}</h2>`, "the card's title"],
  ];
  let out = html;
  for (const [re, to, what] of swaps) {
    const n = (out.match(new RegExp(re.source, "g")) || []).length;
    if (n !== 1) throw new Error(`couldn't find ${what} exactly once in index.html (found ${n})`);
    out = out.replace(re, to);
  }
  return out;
}

function main(args) {
  let filesOut = "";
  const i = args.indexOf("--files-out");
  if (i >= 0) { filesOut = args[i + 1]; args.splice(i, 2); }
  const slug = args[0];
  const songs = JSON.parse(readFileSync(join(ROOT, "songs.json"), "utf8"));
  const song = songs.songs.find((s) => s.slug === slug);
  if (!song) throw new Error(`"${slug}" is not in songs.json`);
  const listen = JSON.parse(readFileSync(join(ROOT, "listen.json"), "utf8"));
  const today = spToday();
  listen.release = cardRelease(song, today, listen.release);
  listen.updated = today;
  writeFileSync(join(ROOT, "listen.json"), JSON.stringify(listen, null, 2) + "\n");
  writeFileSync(join(ROOT, "index.html"), cardHtml(readFileSync(join(ROOT, "index.html"), "utf8"), song));
  if (filesOut) writeFileSync(filesOut, "listen.json\nindex.html\n");
  console.log(`✓ the home card shows ${song.title} (${listen.release.mode})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); } catch (e) { console.error("✗ " + e.message); process.exit(1); }
}
