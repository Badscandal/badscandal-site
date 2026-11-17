/* The HQ apps' hourly push job (12 Nov 2026), at five past every hour, published site only:
   1. a sweep: anything waiting on Luke that was never alerted (a song that showed in Spotify for Artists, something a
      quiet sweep missed) alerts now, under the same once / flood / quiet-hours rules;
   2. the 08:00 summary: each device whose own clock says 08:xx and that had alerts go silently overnight
      gets ONE "<n> things are waiting on you".
   3. the song-page builds (A2, 17 Nov 2026): how each build sent in the last 3 days ended; a failed one tells
      the bot that asked "Not done: <why>" (netlify/lib/staff.mjs checkSongBuilds).
   4. automatic chasing (A4, 17 Nov 2026): a late duty or release step gets ONE reminder to its bot; still
      late 2 hours later, Nova gets ONE message to chase or escalate (07:00-22:00 São Paulo; S.chaseLate).
   Logic: netlify/lib/push.mjs. No key or no device: it does nothing. */
import { getStore } from "@netlify/blobs";
import { morning, sweep } from "../lib/push.mjs";
import * as S from "../lib/staff.mjs";
import { readSongReport } from "../lib/github.mjs";
import { loadHq } from "../lib/hq-load.mjs";

export default async () => {
  const now = Date.now();
  const store = getStore({ name: "staff", consistency: "strong" });
  const env = (k) => Netlify.env.get(k);
  let loaded = null;
  const desk = () => loaded || (loaded = S.loadDesk(store, now));
  try {
    const s = await sweep(store, now, { desk, env });
    console.log(`push hourly sweep: ${s.skipped || `${s.newKeys.length} new, ${s.buzzed} buzzed, ${s.silent} silent`}`);
  } catch (e) {
    console.error("push hourly sweep failed", e?.name || "Error");
  }
  try {
    const m = await morning(store, now, { desk, env });
    if (m.sent) console.log(`push morning summary: ${m.sent} sent`);
  } catch (e) {
    console.error("push morning summary failed", e?.name || "Error");
  }
  try {
    const d = await desk();
    const hq = await loadHq({ cache: getStore("meta-cache"), desk: store, env, now }).catch(() => null);
    const today = S.spDay(now), sightings = d.sightings || null;
    const releases = (d.releases || []).map((r) => S.releaseView(r, today, { sightings })).filter(S.releaseActive);
    const c = await S.chaseLate(store, now, d.roster || S.DEFAULT_ROSTER, { hq: hq && hq.team ? hq : null, releases });
    if (c.nudged.length || c.escalated.length) console.log(`chasing: ${c.nudged.length} reminded, ${c.escalated.length} to Nova`);
  } catch (e) {
    console.error("chasing failed", e?.name || "Error");
  }
  try {
    S.useSongReports((id) => readSongReport(id));
    const b = await S.checkSongBuilds(store, now, (await desk()).roster || S.DEFAULT_ROSTER);
    if (b.length) console.log(`song builds: ${b.length} report${b.length === 1 ? "" : "s"} read, ${b.filter((x) => !x.ok).length} not done`);
  } catch (e) {
    console.error("song builds check failed", e?.name || "Error");
  }
};

export const config = { schedule: "5 * * * *" };
