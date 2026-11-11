/* Reads everything /hq's sheet side shows and builds the answer of /api/hq/data (moved out of
   netlify/functions/hq.mjs on 11 Nov 2026 so the staff connector and the site's own check read the
   very same picture). READ-ONLY: the bots' Google Sheet, Meta's own spend, the ECB rates. The one
   new input is the staff desk (netlify/lib/staff.mjs): the bots' connector updates join the sheet's
   Updates tab and can finish or block today's duties.

   loadHq({ cache, desk, env, now, sample, fresh, fetchImpl }) -> the JSON body:
     { connected:false, need:[…] } | { connected:true, error } | { connected:true, …hqModel(), metaKey, health, readAt, generated }
   cache = the "meta-cache" store, desk = the "staff" store (may be null), env = (name) => value. */
import { fetchMonthAverage } from "./fx.mjs";
import { readTabs } from "./gsheets.mjs";
import { hqModel, HQ_TABS } from "./hq.mjs";
import { sampleMeta, sampleSheets } from "./hq-sample.mjs";
import { EXPIRED_CODE, keyHealth, readKeyHealth, readMeta } from "./metaread.mjs";
import { DEFAULT_ACCOUNT } from "./metaspend.mjs";
import { dutyOverlay, getSightings, listReleases, listUpdates, releaseView, spDay, spHM } from "./staff.mjs";
import { sampleReleases, sampleSightings } from "./staff-sample.mjs";

/* the sheet is read at most every 2 minutes so the bots' live updates show quickly; one batch read
   + one small read of the optional "Updates" tab, well inside Google's limits */
export const SHEET_TTL = 2 * 60 * 1000;

async function rates(cache, months, today, fetchImpl) {
  const out = {}, at = {};
  await Promise.all(months.slice(0, 8).map(async (m) => {
    const key = `fx/${m}.json`;
    let got = null;
    try { got = await cache.get(key, { type: "json" }); } catch {}
    /* a past month is final only if it was read after the month ended; a copy cached mid-month
       would freeze that month's average without its last days */
    const fresh = got && (m < today.slice(0, 7) ? spDay(got.at).slice(0, 7) > m : Date.now() - got.at < 12 * 3600 * 1000);
    if (!fresh) {
      const fx = await fetchMonthAverage(m, today, fetchImpl);
      if (!fx.error) { got = { at: Date.now(), fx }; try { await cache.setJSON(key, got); } catch {} }
    }
    if (got) { out[m] = got.fx; at[m] = got.at; }
  }));
  return { fx: out, at };
}

/* For /hq's "Data health" panel: when the sheet was read and how fresh this month's rate is. */
function healthFor(sheetAt, r, today) {
  const m = today.slice(0, 7), fx = r.fx[m];
  return { sheetAt: sheetAt ? new Date(sheetAt).toISOString() : null,
    fx: fx && fx.USD ? { month: m, rate: fx.USD, days: fx.days || null, at: r.at[m] ? new Date(r.at[m]).toISOString() : null } : null };
}

/* Meta's own spend for the whole ad account, the 1st of last month .. today (read-only GET, cached an
   hour in meta-cache). -> the `meta` argument of hqModel(). */
async function metaForHq(cache, today, env) {
  const token = env("META_ADS_TOKEN");
  if (!token) return { ok: false, reason: "META_ADS_TOKEN is not set on Netlify" };
  const account = (env("META_AD_ACCOUNT_ID") || DEFAULT_ACCOUNT).replace(/\D/g, "");
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const since = (m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`) + "-01";
  const r = await readMeta({ cache, token, account, since, until: today, level: "account", key: `hq/${account}/${since}_${today}.json` });
  if (r.error) { console.error("hq meta: " + r.error); return { ok: false, reason: r.error, expired: r.code === EXPIRED_CODE }; }
  return { ok: true, rows: r.rows, since, until: today, at: r.at };
}

const monthsIn = (sheets, today) => {
  const set = new Set([today.slice(0, 7)]);
  for (const tab of ["Spend", "Income", "Royalties"]) for (const r of (sheets[tab] || []).slice(1)) {
    const m = String(r[0] || "").slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(m)) set.add(m);
  }
  return [...set].sort().reverse();
};

/* what the bots said through the connector over the last three days, and the desk's releases (11 Nov
   2026: the scheduled ones join the sheet's Releases tab, hq.mjs mergeReleases; every one that isn't
   cancelled tells Songs whose song it is, songs[].deal), and Atlas's last Spotify for Artists report
   (the sheet's own late pitch waits while the song isn't there); never breaks the page */
const live = (list, today, sightings) => list.filter((r) => r && r.status !== "cancelled").map((r) => releaseView(r, today, { sightings }));
async function staffSide(desk, now) {
  if (!desk) return null;
  try {
    const [updates, releases, sightings] = await Promise.all([listUpdates(desk, now, 3), listReleases(desk).catch(() => []), getSightings(desk).catch(() => undefined)]);
    /* undefined = the report could not be read: the sheet's late pitch is then left as the sheet says */
    return { updates, overlay: dutyOverlay(updates, spDay(now)), releases: live(releases, spDay(now), sightings || null), now, ...(sightings === undefined ? {} : { sightings }) };
  } catch { return null; }
}

export async function loadHq({ cache, desk = null, env, now = Date.now(), sample = false, fresh = false, fetchImpl }) {
  const today = spDay(now);
  const rawKey = env("GOOGLE_SA_KEY"), sheetId = env("HQ_SHEET_ID");
  if (sample || !rawKey || !sheetId) {
    if (!sample) return { connected: false, need: [!rawKey && "GOOGLE_SA_KEY", !sheetId && "HQ_SHEET_ID"].filter(Boolean) };
    const sheets = sampleSheets(today, now);
    const r = await rates(cache, monthsIn(sheets, today), today, fetchImpl);
    /* the made-up desk releases join the made-up sheet, so the sample shows one list as the real page does */
    return { connected: true, sample: true, ...hqModel(sheets, today, r.fx, sampleMeta(sheets, today), spHM(now), { releases: live(sampleReleases(now), today, sampleSightings(now)), sightings: sampleSightings(now), now }), health: healthFor(now - 4 * 60000, r, today),
      metaKey: { state: "ok", text: "Meta key: reading OK, last read 12 min ago (sample)" }, generated: new Date(now).toISOString() };
  }
  let got = null;
  try { got = await cache.get("hq/sheets.json", { type: "json" }); } catch {}
  let readError = "";
  if (!got || now - got.at > SHEET_TTL || fresh) {
    const read = await readTabs(rawKey, sheetId, HQ_TABS, fetchImpl);
    /* the bots' live log is its own read: a missing "Updates" tab must never break the rest */
    if (!read.error) {
      const up = await readTabs(rawKey, sheetId, ["Updates"], fetchImpl);
      read.sheets.Updates = up.error ? null : up.sheets.Updates || [];
    }
    if (read.error) {
      console.error("hq sheet: " + read.error);
      if (!got) return { connected: true, error: read.error };
      readError = read.error; /* the older copy is shown, and the answer says so */
    } else {
      got = { at: now, sheets: read.sheets };
      try { await cache.setJSON("hq/sheets.json", got); } catch {}
    }
  }
  const [fxr, meta, staff] = await Promise.all([rates(cache, monthsIn(got.sheets, today), today, fetchImpl),
    metaForHq(cache, today, env).catch((e) => ({ ok: false, reason: "Couldn't read Meta (" + (e?.name || "error") + ")" })),
    staffSide(desk, now)]);
  const metaKey = keyHealth(await readKeyHealth(cache), !!env("META_ADS_TOKEN"));
  return { connected: true, ...hqModel(got.sheets, today, fxr.fx, meta, spHM(now), staff), metaKey, health: healthFor(got.at, fxr, today),
    readAt: new Date(got.at).toISOString(), generated: new Date(now).toISOString(), ...(readError ? { staleBecause: readError } : {}) };
}
