#!/usr/bin/env node
/* A song page job from the staff desk (16 Nov 2026), run by GitHub (.github/workflows/song-page.yml), never on
   Luke's Mac. The site asks GitHub for it ONLY after Luke answered "Yes, correct" to Webmaster's (or Nova's)
   song_page question (netlify/lib/staff.mjs proposeSongPage).

   The job arrives as JSON in the env variable JOB (the workflow's client_payload, never pasted into a shell)
   and is checked again here, field by field, whatever the site checked:
     {kind: "new", slug, title, date, cover, by}   a new song page: the cover is fetched (https only, 25 MB at
                                                    most, a real image), made square (1400 px JPG) as
                                                    assets/listen-<slug>-cover-vN.jpg, then tools/new-song.mjs
     {kind: "track", slug, track, by}              release day: the Spotify track link, then --rebuild
   It writes the files to commit to .song-files (one per line; the workflow adds exactly those) and the commit
   message to .song-commit. The workflow then runs EVERY test and pushes only if they all pass. */
import { execFileSync } from "node:child_process";
import { readdirSync, writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { RESERVED, SLUG_RE, TRACK_RE } from "../netlify/lib/songs.mjs";

const bad = (why) => { throw new Error(why); };
const CONTROL = /[\u0000-\u001f\u007f]/;

export function checkJob(j) {
  if (!j || typeof j !== "object" || Array.isArray(j)) bad("the job is not an object");
  const slug = String(j.slug || "");
  if (!SLUG_RE.test(slug) || slug.length > 60) bad("slug must be lowercase letters and digits (dashes allowed)");
  if (RESERVED.has(slug)) bad("that address is taken by the site");
  const by = String(j.by || "the desk");
  if (!/^[A-Za-z ]{2,20}$/.test(by)) bad("by must be a team name");
  if (j.kind === "new") {
    const title = String(j.title || "").trim();
    if (!title || title.length > 120 || CONTROL.test(title)) bad("title must be one line of 1 to 120 characters");
    const date = String(j.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date + "T12:00:00Z").toISOString().slice(0, 10) !== date) bad("date must be YYYY-MM-DD");
    const cover = String(j.cover || "");
    if (!/^https:\/\/[^\s"'<>`]+$/.test(cover) || cover.length > 500) bad("cover must be an https link");
    return { kind: "new", slug, title, date, cover, by };
  }
  if (j.kind === "track") {
    const track = String(j.track || "");
    if (!TRACK_RE.test(track)) bad("track must be https://open.spotify.com/track/<id>");
    return { kind: "track", slug, track, by };
  }
  return bad("kind must be new or track");
}

/* a Dropbox share link downloads the file itself with dl=1; a Google Drive share link through its download
   address (it must be shared "Anyone with the link", or Drive answers with a sign-in page, which is refused) */
export function directLink(u) {
  const url = new URL(u);
  if (/^drive\.google\.com$/i.test(url.hostname)) {
    const id = (/\/file\/d\/([\w-]+)/.exec(url.pathname) || [])[1] || url.searchParams.get("id");
    return id && /^[\w-]+$/.test(id) ? `https://drive.google.com/uc?export=download&id=${id}` : u;
  }
  if (!/(^|\.)dropbox\.com$/i.test(url.hostname)) return u;
  url.searchParams.set("dl", "1");
  return url.toString();
}

const MAX = 25 * 1024 * 1024;
async function fetchCover(link) {
  const res = await fetch(directLink(link), { redirect: "follow", signal: AbortSignal.timeout(30000) });
  if (!res.ok) bad(`the cover link answered ${res.status}`);
  if (!res.url.startsWith("https://")) bad("the cover link went to a non-https address");
  if (Number(res.headers.get("content-length") || 0) > MAX) bad("the cover is over 25 MB");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX) bad("the cover is over 25 MB");
  const jpg = buf[0] === 0xff && buf[1] === 0xd8, png = buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    webp = buf.slice(0, 4).toString("latin1") === "RIFF" && buf.slice(8, 12).toString("latin1") === "WEBP";
  if (!jpg && !png && !webp) bad("the cover link is not a JPG, PNG or WebP picture (a share PAGE or a sign-in page instead of the file? A Google Drive link must be shared \"Anyone with the link\")");
  return buf;
}

const ROOT = new URL("..", import.meta.url).pathname;
const magick = () => { for (const c of ["magick", "convert"]) { try { execFileSync("/usr/bin/which", [c], { stdio: "ignore" }); return c; } catch {} } return bad("needs ImageMagick"); };
const nextCover = (slug) => {
  const used = readdirSync(join(ROOT, "assets")).map((f) => (new RegExp(`^listen-${slug}-cover-v(\\d+)\\.jpg$`).exec(f) || [])[1]).filter(Boolean).map(Number);
  return `assets/listen-${slug}-cover-v${used.length ? Math.max(...used) + 1 : 1}.jpg`;
};

async function main() {
  const job = checkJob(JSON.parse(process.env.JOB || "null"));
  const filesOut = join(ROOT, ".song-files");
  let msg;
  if (job.kind === "new") {
    const raw = join(tmpdir(), `song-cover-${process.pid}`);
    writeFileSync(raw, await fetchCover(job.cover));
    const cover = nextCover(job.slug);
    /* square, 1400 px, centre-cropped, no metadata */
    execFileSync(magick(), [raw, "-auto-orient", "-resize", "1400x1400^", "-gravity", "center", "-extent", "1400x1400", "-strip", "-quality", "88", join(ROOT, cover)], { stdio: "inherit" });
    unlinkSync(raw);
    execFileSync(process.execPath, [join(ROOT, "tools/new-song.mjs"), job.slug, job.title, job.date, "--files-out", filesOut], { stdio: "inherit", cwd: ROOT });
    msg = `Song page: ${job.title} -> badscandal.com/${job.slug} (out ${job.date})`;
  } else {
    execFileSync(process.execPath, [join(ROOT, "tools/new-song.mjs"), "--track", job.slug, job.track, "--files-out", filesOut], { stdio: "inherit", cwd: ROOT });
    msg = `Release day: the Spotify link on badscandal.com/${job.slug}`;
  }
  writeFileSync(join(ROOT, ".song-commit"), `${msg}\n\nFrom the staff desk: ${job.by} asked, Luke said "Yes, correct". Built and checked by GitHub (song-page.yml).\n`);
  console.log("files to commit:\n" + readFileSync(filesOut, "utf8"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error("✗ " + (e && e.message ? e.message : e)); process.exit(1); });
