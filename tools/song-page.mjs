/* Renders one song page from tools/song-template.html + its /songs.json entry (10 Nov 2026).
   Used by tools/new-song.mjs (writes the files) and tests/songs.test.mjs (checks every <slug>.html
   still matches the list). No dependencies. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const TEMPLATE = fileURLToPath(new URL("./song-template.html", import.meta.url));
export const EDGE = fileURLToPath(new URL("../netlify/edge-functions/song-geo.js", import.meta.url));

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function longDate(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${d} ${months[m - 1]} ${y}`;
}

/* The page as it is served. Everything that depends on the visitor's clock (Follow vs Listen,
   the countdown) is decided by the page's inline script; the HTML only carries the no-JS fallback,
   which depends on the list alone, so a rebuild on any day gives the same file. */
export function render(song, artistUrl, template = readFileSync(TEMPLATE, "utf8")) {
  const artist = song.spotifyArtist || artistUrl;
  const out = !!song.spotifyTrack;
  const v = {
    SLUG: song.slug,
    TITLE: song.title,
    DATE: song.date,
    TRACK: song.spotifyTrack || "",
    ARTIST: artist,
    COVER_WEB: song.coverWeb,
    SHARE: song.share,
    DESC: out ? "Out now. Listen on Spotify." : `Out ${longDate(song.date)}. Follow on Spotify.`,
    BUTTON_HREF: out ? song.spotifyTrack : artist,
    BUTTON_LABEL: out ? "Listen on Spotify" : "Follow on Spotify",
  };
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (all, k) => {
    if (!(k in v)) throw new Error("song-template.html: unknown placeholder " + all);
    return esc(v[k]);
  });
}

/* The edge function's path list (it must be a literal there). */
export function edgeConfig(songs) {
  const lines = songs.map((s) => `  "/${s.slug}", "/${s.slug}.html", "/${s.slug}/",`);
  return "export const config = { path: [\n" + lines.join("\n") + "\n] };";
}
export const EDGE_RE = /export const config = \{ path: \[[\s\S]*?\] \};/;
