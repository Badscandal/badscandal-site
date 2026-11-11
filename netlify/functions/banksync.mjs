/* Revolut, read by itself once a day (11 Nov 2026): 09:50 UTC = 06:50 São Paulo, so the money that
   came in overnight is on the desk before Ledger (07:30), the site's check (09:35) and Alfred's
   message (10:00). Scheduled functions run on the published site only. Logic: netlify/lib/bank.mjs
   syncBank() (read-only towards the bank; it writes only the "bank" store and the staff desk). */
import { getStore } from "@netlify/blobs";
import { syncBank } from "../lib/bank.mjs";

export default async () => {
  try {
    const s = await syncBank({ bank: getStore({ name: "bank", consistency: "strong" }), desk: getStore({ name: "staff", consistency: "strong" }),
      env: (k) => Netlify.env.get(k), now: Date.now(), fetchImpl: (...a) => fetch(...a) });
    console.log(`bank daily read: ${s.ok ? "ok" : "failed"}, ${s.added} added, ${s.unsorted} to sort, ${s.transfers} transfers, ${s.refunds} refunds, ${s.skipped} skipped${s.more ? ", more next time" : ""}`);
  } catch (e) {
    console.error("bank daily read failed:", (e && e.name) || "Error");
  }
};

export const config = { schedule: "50 9 * * *" };
