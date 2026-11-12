/* The HQ apps' hourly push job (12 Nov 2026), at five past every hour, published site only:
   1. a sweep: anything waiting on Luke that was never alerted (a teaser step that became due, something a
      quiet sweep missed) alerts now, under the same once / flood / quiet-hours rules;
   2. the 08:00 summary: each device whose own clock says 08:xx and that had alerts go silently overnight
      gets ONE "<n> things are waiting on you".
   Logic: netlify/lib/push.mjs. No key or no device: it does nothing. */
import { getStore } from "@netlify/blobs";
import { morning, sweep } from "../lib/push.mjs";
import * as S from "../lib/staff.mjs";

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
};

export const config = { schedule: "5 * * * *" };
