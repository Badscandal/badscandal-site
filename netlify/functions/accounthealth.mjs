/* Daily account-health check (18 Nov 2026). 10:30 São Paulo (13:30 UTC), after the morning
   numbers. It reads what is already on the desk and the stored Instagram copy, then posts to
   the owning bot only when that account's health changed. It does not call Meta or Instagram,
   does not read a mailbox, and does not delete, appeal or post anything. */
import { getStore } from "@netlify/blobs";
import { runAccountHealth } from "../lib/account-health.mjs";
import * as S from "../lib/staff.mjs";

export default async () => {
  const now = Date.now();
  const desk = getStore({ name: "staff", consistency: "strong" });
  const ig = getStore({ name: "instagram", consistency: "strong" });
  try {
    const r = await runAccountHealth({ desk, ig, now, roster: await S.getRoster(desk) });
    const who = r.sent.map((s) => `${s.to} ${s.platform}`).join(", ");
    console.log(`account health ${r.report.today}: ${r.sent.length} note${r.sent.length === 1 ? "" : "s"}${who ? " (" + who + ")" : ""}`);
  } catch (e) {
    console.error("account health failed", e?.name || e);
  }
};

export const config = { schedule: "30 13 * * *" }; /* HEALTH_SCHEDULE in account-health.mjs: 10:30 São Paulo */
