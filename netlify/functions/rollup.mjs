/* Daily at 06:00 UTC: the 90-day rule from the privacy page. Raw visit keys older than 90 days
   are folded into one daily-totals blob per UTC day (daily/<day>.json, counts only: no visitor
   ids, no visit log) and then deleted. The admin portal merges these back in for old ranges
   (netlify/functions/admin.mjs). Scheduled functions only run on the published production
   deploy, so this never touches preview data. */
import { getStore } from "@netlify/blobs";
import { compact, LINKS, summarize, spDay } from "../lib/admin.mjs";
import { dayOf, parseKey, PREFIX } from "../lib/stats.mjs";

const KEEP_DAYS = 90;
const SCAN_DAYS = 30; /* looks at days 91..120 back; normally only one has raw keys left */
const PAGES = [...new Set(LINKS.map((l) => l.id).concat("listen"))];

export default async () => {
  const store = getStore("stats");
  const now = Date.now();
  for (let i = KEEP_DAYS + 1; i <= KEEP_DAYS + SCAN_DAYS; i++) {
    const day = dayOf(now - i * 86400000);
    const { blobs } = await store.list({ prefix: PREFIX + day + "/" });
    if (!blobs.length) continue;

    const events = blobs.map((b) => parseKey(b.key)).filter(Boolean);
    const spDays = [...new Set(events.map((e) => spDay(e.ts)))].sort();
    const out = { day, made: new Date().toISOString(), events: events.length, pages: {} };
    for (const p of PAGES) {
      const s = summarize(events, spDays, p);
      if (s.visits || s.taps) out.pages[p] = compact(s);
    }
    /* If a rollup for this day already exists (a run that died half-way), keep the bigger one
       rather than double-counting. */
    const existing = await store.get("daily/" + day + ".json", { type: "json" }).catch(() => null);
    if (!existing || existing.events < out.events) await store.setJSON("daily/" + day + ".json", out);

    for (let j = 0; j < blobs.length; j += 50) {
      await Promise.all(blobs.slice(j, j + 50).map((b) => store.delete(b.key)));
    }
    console.log(`rollup ${day}: ${events.length} events folded`);
  }
};

export const config = { schedule: "0 6 * * *" };
