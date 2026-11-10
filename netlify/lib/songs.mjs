/* The song list, for the server side (10 Nov 2026). The data lives in /songs.json at the repo
   root (also served to the song pages, no-store); everything that used to hard-code "Touch Me"
   reads it through here: hit.mjs (which pages are counted), capi.mjs (content_name for Meta),
   admin.mjs (the link picker), the edge function (via the test that checks its path list).
   Pure: no Netlify imports, so tests can run it. */
import DATA from "../../songs.json" with { type: "json" };

export const ARTIST_URL = DATA.spotifyArtist;
export const SONGS = DATA.songs.map((s) => ({ ...s, path: "/" + s.slug }));

const BY_SLUG = new Map(SONGS.map((s) => [s.slug, s]));
export function songBySlug(slug) {
  return BY_SLUG.get(String(slug || "")) || null;
}

/* "/touchme", "/touchme.html", "/touchme/" (any case) -> the song, else null. */
export function songFromPath(pathname) {
  const m = /^\/([a-z0-9-]+?)(?:\.html|\/)?$/i.exec(String(pathname || ""));
  return m ? songBySlug(m[1].toLowerCase()) : null;
}

/* The three URL shapes the edge function must cover per song. */
export function edgePaths() {
  return SONGS.flatMap((s) => ["/" + s.slug, "/" + s.slug + ".html", "/" + s.slug + "/"]);
}

/* Rules every entry must follow; tests/songs.test.mjs runs this. Returns a list of problems. */
export function problems(list = DATA.songs) {
  const out = [], seen = new Set();
  const RESERVED = new Set(["admin", "api", "assets", "css", "js", "listen", "privacy", "stats", "store", "us", "live",
    "plugin", "activate", "index", "home", "netlify", "tests", "tools", "updatecleanslate", "404", "lukepower"]);
  for (const s of list) {
    const at = `song "${s.slug}"`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s.slug || "")) out.push(`${at}: slug must be lowercase letters/digits (dashes allowed)`);
    if (RESERVED.has(s.slug)) out.push(`${at}: slug clashes with an existing site path`);
    if (seen.has(s.slug)) out.push(`${at}: listed twice`);
    seen.add(s.slug);
    if (!s.title) out.push(`${at}: no title`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date || "")) out.push(`${at}: date must be YYYY-MM-DD`);
    for (const k of ["cover", "coverWeb", "share"]) if (!/^assets\/[\w.-]+-v\d+\.(jpg|webp)$/.test(s[k] || "")) out.push(`${at}: ${k} must be an assets/…-vN.jpg/webp file`);
    if (s.spotifyTrack && !/^https:\/\/open\.spotify\.com\/track\/[A-Za-z0-9]{22}$/.test(s.spotifyTrack)) out.push(`${at}: spotifyTrack must be https://open.spotify.com/track/<id> (no ?si=)`);
    if (!/^https:\/\/open\.spotify\.com\/artist\/[A-Za-z0-9]{22}$/.test(s.spotifyArtist || "")) out.push(`${at}: spotifyArtist must be https://open.spotify.com/artist/<id>`);
    for (const v of Object.values(s)) if (typeof v === "string" && /pre-?save|ffm\.to|feature\.fm|music\.badscandal\.com/i.test(v)) out.push(`${at}: no pre-save / Feature.fm links`);
  }
  return out;
}
