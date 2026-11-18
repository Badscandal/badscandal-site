/* HQ automation, phase 1. Every 15 minutes on the published site. Each check writes to the
   desk only when something changed or a check failed. No ad is changed. No Instagram or Meta
   call is made. Spotify is the public page only (no API key). */
import { getStore } from "@netlify/blobs";
import { runAuto } from "../lib/hq-jobs.mjs";
import * as S from "../lib/staff.mjs";

export default async () => {
  const now = Date.now();
  const desk = getStore({ name: "staff", consistency: "strong" });
  const ig = getStore({ name: "instagram", consistency: "strong" });
  try {
    const out = await runAuto({ store: desk, ig, now, fetch: globalThis.fetch, origin: "https://badscandal.com" });
    const bits = ["site", "cap", "release", "month", "monday"].map((k) => k + ":" + (out[k] && out[k].wrote ? "wrote" : "quiet"));
    console.log("hq auto " + bits.join(" "));
  } catch (e) {
    console.error("hq auto failed", e && e.name ? e.name : e);
    try {
      await S.sendMessage(desk, now, S.DEFAULT_ROSTER, { from: "HQ", to: "Nova", text: `HQ's scheduled check could not finish on ${S.spDay(now)}. It will try again. Nothing was changed.`, needs: "none" });
    } catch { /* already logged */ }
  }
};

export const config = { schedule: "*/15 * * * *" };
