/* Asking GitHub to build a song page (16 Nov 2026, Luke: Webmaster must be able to add song pages "without
   my computer"; he chose "GitHub does it"). ONE kind of call: POST /repos/<repo>/dispatches with event_type
   "song-page", which starts .github/workflows/song-page.yml. That workflow checks the job again itself,
   makes the page with tools/new-song.mjs, runs every test and publishes only when they all pass.

   The key: Netlify env GITHUB_SONG_TOKEN, a fine-grained GitHub token for THIS repo only (Contents: read and
   write, which repository_dispatch needs). It travels only in the Authorization header, is never logged,
   never stored, never answered. Luke puts it on Netlify with the helper outside this repo. */
export const SONG_REPO = "Badscandal/badscandal-site";
export const SONG_EVENT = "song-page";

export async function dispatchSongJob(env, job, fetchImpl = fetch) {
  const token = String((env && env.GITHUB_SONG_TOKEN) || "").trim();
  if (!token) return { ok: false, error: "The site has no GitHub key for song pages yet: Luke puts it on Netlify once with the helper (Claude knows which)." };
  let res;
  try {
    res = await fetchImpl(`https://api.github.com/repos/${SONG_REPO}/dispatches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", "User-Agent": "badscandal-hq" },
      body: JSON.stringify({ event_type: SONG_EVENT, client_payload: job }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
    });
  } catch {
    return { ok: false, error: "The site could not reach GitHub just now. Ask Luke again later (nothing was built)." };
  }
  if (res.status === 204 || res.status === 200) return { ok: true };
  /* GitHub's own words are never passed on: they could quote the request */
  if ([401, 403, 404].includes(res.status)) return { ok: false, error: "GitHub refused the site's key (it may have expired, or lost its access to the repo). Luke makes a new one and runs the helper again." };
  if (res.status >= 500) return { ok: false, error: "GitHub did not answer properly just now. Ask Luke again later (nothing was built)." };
  return { ok: false, error: `GitHub said no (${res.status}). Nothing was built: tell Claude.` };
}
