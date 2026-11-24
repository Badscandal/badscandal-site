/* What is waiting on Luke, loaded the same way everywhere (18 Nov 2026, handoff bug 1).
   needsDesk() = the desk (S.loadDesk) + his open Yes/No/Edit cards (live and held) + the account health
   report from the same inputs as the board (stored Instagram copy, song-page builds).
   S.waitingOnLuke on it is the ONE list: the phone's "N need you", Today's "N things waiting on you",
   the app badge, the push alerts and the needs_you tool. Reads only. */
import * as S from "./staff.mjs";
import * as C from "./action-cards.mjs";
import { loadReport } from "./account-health.mjs";
import { igView } from "./instagram.mjs";

export async function healthReport(store, now, { ig, builds } = {}) {
  const b = builds != null ? builds : await S.songPages(store, now).catch(() => []);
  return loadReport({ store, ig: ig || null, now, builds: b });
}

/* o.desk: an already-loaded desk; o.auto / o.report: already computed (the board has both) */
export async function needsDesk(store, now, o = {}) {
  let desk = o.desk || (await S.loadDesk(store, now));
  /* Instagram fan questions only Luke can answer are part of the same list (needs_you, the phone, Today). */
  if (o.ig && typeof o.ig.get === "function" && !(desk.needsReply && desk.needsReply.length)) {
    try {
      const view = await igView(o.ig, now);
      desk = { ...desk, needsReply: (view && view.needsReply) || [] };
    } catch { /* a missing Instagram store must not blank Needs you */ }
  }
  const [auto, report] = await Promise.all([
    o.auto !== undefined ? o.auto : C.boardAuto(store, now, desk).catch(() => null),
    o.report !== undefined ? o.report : healthReport(store, now, { ig: o.ig, builds: o.builds }).catch(() => null),
  ]);
  return { ...desk, lukeCards: auto ? [...(auto.needsYou || []), ...(auto.held || [])] : [], health: report || null };
}

/* the made-up desk, with the made-up cards and health (?sample=1). No store is opened. */
export async function sampleNeedsDesk(now) {
  const { sampleDesk } = await import("./staff-sample.mjs");
  const { sampleReport } = await import("./account-health.mjs");
  const auto = C.sampleAuto(now);
  return { ...sampleDesk(now), lukeCards: [...(auto.needsYou || []), ...(auto.held || [])], health: sampleReport(now) };
}
