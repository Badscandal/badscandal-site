/* What is waiting on Luke, loaded the same way everywhere (18 Nov 2026, handoff bug 1).
   needsDesk() = the desk (S.loadDesk) + his open Yes/No/Edit cards (live and held) + the account health
   report from the same inputs as the board (stored Instagram copy, claims, song-page builds).
   S.waitingOnLuke on it is the ONE list: the phone's "N need you", Today's "N things waiting on you",
   the app badge, the push alerts and the needs_you tool. Reads only. */
import * as S from "./staff.mjs";
import * as C from "./action-cards.mjs";
import { loadReport } from "./account-health.mjs";

export async function healthReport(store, now, { ig, claims, builds } = {}) {
  const [c, b] = await Promise.all([
    claims != null ? claims : S.readDoc(store, "claims.json", { items: [] }).then((d) => d.data).catch(() => ({ items: [] })),
    builds != null ? builds : S.songPages(store, now).catch(() => []),
  ]);
  return loadReport({ store, ig: ig || null, now, claims: c, builds: b });
}

/* o.desk: an already-loaded desk; o.auto / o.report: already computed (the board has both) */
export async function needsDesk(store, now, o = {}) {
  const desk = o.desk || (await S.loadDesk(store, now));
  const [auto, report] = await Promise.all([
    o.auto !== undefined ? o.auto : C.boardAuto(store, now, desk).catch(() => null),
    o.report !== undefined ? o.report : healthReport(store, now, { ig: o.ig, claims: desk.claims, builds: o.builds }).catch(() => null),
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
