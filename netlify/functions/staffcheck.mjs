/* The site's own check of the whole set-up, three times a day (11 Nov 2026): 09:35, 15:35 and 21:35
   São Paulo (12:35, 18:35 and 00:35 UTC). Five minutes before each of Claude's three rounds (09:40,
   15:40, 21:40); the morning one is also before Alfred's 10:00 message, the evening one after Nova's
   21:00 wrap-up. It looks at what a person would otherwise check tab by tab: today's duties, who has
   said nothing, whether every money account was checked, messages nobody answered, the sheet, the
   Meta key, the cap, the next release, and the release pipeline (late or blocked steps, a pack field
   a step needs within 3 days, and since 11 Nov 2026 evening the warnings that say what lateness means:
   not in Spotify for Artists yet, too late for a pitch, out today without the Spotify link, sent
   without a required field, a label release with no split), plus Spotify for Artists itself: each song
   upcoming there that is not in the pipeline (Luke has to say what it is), and Atlas's report when it
   is older than 48 hours or was never made while something is coming. Facts only (netlify/lib/staff.mjs checkReport; its title says morning,
   afternoon or evening). It posts ONE message on the board from "HQ" to Luke, which Alfred reads
   through the connector (luke_briefing) and Claude reads on its rounds. Scheduled functions run on
   the published site only. It changes nothing else. */
import { getStore } from "@netlify/blobs";
import { loadHq } from "../lib/hq-load.mjs";
import * as S from "../lib/staff.mjs";

export default async () => {
  const now = Date.now();
  const desk = getStore({ name: "staff", consistency: "strong" }), cache = getStore("meta-cache");
  try {
    const [d, hqAns] = await Promise.all([S.loadDesk(desk, now), loadHq({ cache, desk, env: (k) => Netlify.env.get(k), now, fresh: true }).catch(() => null)]);
    const hq = hqAns && hqAns.team ? hqAns : null;
    const r = S.checkReport({ desk: d, hq, hqState: hqAns || { connected: false }, now });
    await S.sendMessage(desk, now, d.roster, { from: "HQ", to: "Luke", text: r.text, needs: "none", kind: "report" });
    console.log(`staff check ${r.day} ${r.part}: ${r.problems.length} to look at`);
  } catch (e) {
    console.error("staff check failed", e?.name || e);
    /* the board must never keep showing an old report as if it were today's */
    try { await S.sendMessage(desk, now, S.DEFAULT_ROSTER, { from: "HQ", to: "Luke", text: `HQ check, ${S.spDay(now)} ${S.dayPart(now)}: the check itself could not run. Open the dashboard's Data health.`, needs: "none", kind: "report" }); } catch {}
  }
};

export const config = { schedule: "35 0,12,18 * * *" };
