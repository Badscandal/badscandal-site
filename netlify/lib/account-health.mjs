/* Account health (18 Nov 2026). One judgement per official account, from numbers HQ already
   stored or a bot recorded. It never calls Meta or Instagram, never sends anything off the desk,
   and never deletes, appeals or posts. A missing number stays "not enough data". */
import * as S from "./staff.mjs";

export const HEALTH_SCHEDULE = "30 13 * * *"; /* 10:30 São Paulo, after the morning numbers */
const CHECKS_KEY = "health/checks.json";
const LAST_KEY = "health/last.json";
const DAY_MS = 86400000;

export const ACCOUNTS = [
  { id: "instagram", label: "Instagram", owner: "Steve" },
  { id: "tiktok", label: "TikTok", owner: "Kevin" },
  { id: "youtube", label: "YouTube", owner: "Laura" },
  { id: "spotify", label: "Spotify", owner: "Atlas" },
  { id: "site", label: "Site", owner: "Webmaster" },
];
const OWNER = Object.fromEntries(ACCOUNTS.map((a) => [a.id, a.owner]));
const HELPERS = ["Nova", "Claude"];
const STATUS = ["clear", "restricted", "strike", "copyright", "ineligible", "age"];
const STATUS_RED = ["restricted", "strike", "ineligible", "age"];

const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "") && new Date(v + "T12:00:00Z").toISOString().slice(0, 10) === v;
const addDays = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / DAY_MS);
const num = (v) => (v == null || v === "" || !isFinite(Number(v)) ? null : Number(v));
const fmt = (n) => Number(n).toLocaleString("en-US");
const low = (s) => String(s == null ? "" : s).trim().toLowerCase();

export function platformId(name) {
  const s = low(name);
  if (!s) return "";
  if (s === "ig" || s.includes("instagram")) return "instagram";
  if (s.includes("tiktok")) return "tiktok";
  if (s.includes("youtube")) return "youtube";
  if (s === "site" || s === "website" || s.includes("badscandal.com")) return "site";
  if (s.includes("spotify") || s === "dsp" || s === "dsps") return "spotify";
  return "";
}

function guard(...texts) {
  for (const t of texts) {
    const what = S.secretIn(t);
    if (what) throw new S.StaffError(`That looks like ${what}. Never write passwords, codes, keys, card or bank account numbers here. Say what is needed in words and ask Luke.`, "secret");
  }
}
function countOf(v, name) {
  const t = String(v == null ? "" : v).trim().replace(/\s/g, "");
  if (!/^(\d{1,3}(,\d{3})+|\d+)$/.test(t)) throw new S.StaffError(`${name} must be a number as shown (for example 1240 or 1,240), never an estimate. If you could not read it, leave it out.`);
  return Number(t.replace(/,/g, ""));
}
function shareOf(v) {
  const t = String(v == null ? "" : v).trim().replace(/%$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d)?$/.test(t)) throw new S.StaffError("non_follower_share must be the percent the platform shows (for example 42 or 42%). If you could not read it, leave it out.");
  const n = Number(t);
  if (n < 0 || n > 100) throw new S.StaffError("non_follower_share is a percent from 0 to 100, as shown.");
  return Math.round(n * 10) / 10;
}
export function median(list) {
  const v = (list || []).map(Number).filter((n) => isFinite(n)).slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

const CHECK_KEYS = ["account_status", "status_note", "visible", "visible_where", "non_follower_share", "recent_posts", "artificial_streams", "track_moved", "moved_to", "site_ok", "site_note"];
export function hasAccountCheck(args) {
  if (!args || typeof args !== "object") return false;
  return CHECK_KEYS.some((k) => {
    const v = args[k];
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    return String(v).trim() !== "";
  });
}

function may(by, platform, kind) {
  if (HELPERS.includes(by)) return true;
  if (kind === "artificial" || kind === "moved") return false;
  if (kind === "site") return by === "Webmaster" && platform === "site";
  return OWNER[platform] === by;
}
function refuse(by, platform, who) {
  throw new S.StaffError(`${ACCOUNTS.find((a) => a.id === platform).label} checks of this kind are recorded by ${who}. Nothing was saved.`, "not_allowed");
}

/* One status-page check, or a warning Atlas or Drop actually saw. A claim stays on recordContentClaim. */
export async function recordAccountCheck(store, now, roster, a) {
  const by = S.whoIs(a.by || a.bot, roster, { people: true });
  const platform = platformId(a.platform);
  if (!platform) throw new S.StaffError("platform must be Instagram, TikTok, YouTube, Spotify or badscandal.com.");
  const date = S.clean(a.date, 10);
  if (!isDay(date)) throw new S.StaffError("date must be the day you checked, YYYY-MM-DD.");
  if (date > S.spDay(now)) throw new S.StaffError("date is in the future.");
  const reading = {};
  const events = [];
  if (a.account_status != null && String(a.account_status).trim()) {
    if (!may(by, platform, "reading")) refuse(by, platform, OWNER[platform]);
    const status = low(a.account_status);
    if (!STATUS.includes(status)) throw new S.StaffError(`account_status must be one of: ${STATUS.join(", ")}. Use the word the platform's own page uses. Nothing was saved.`);
    reading.account_status = status;
    if (a.status_note != null && String(a.status_note).trim()) reading.status_note = S.clean(a.status_note, 200);
  } else if (a.status_note != null && String(a.status_note).trim()) {
    throw new S.StaffError("A status note needs account_status (the word the platform's page uses). Nothing was saved.");
  }
  if (a.visible != null && String(a.visible).trim()) {
    if (platform === "site") throw new S.StaffError("The site check is site_ok yes or no. Nothing was saved.");
    if (!may(by, platform, "reading")) refuse(by, platform, OWNER[platform]);
    const visible = low(a.visible);
    if (!["yes", "no", "unknown"].includes(visible)) throw new S.StaffError("visible must be yes, no or unknown. Nothing was saved.");
    reading.visible = visible;
    if (a.visible_where != null && String(a.visible_where).trim()) reading.visible_where = S.clean(a.visible_where, 80);
  } else if (a.visible_where != null && String(a.visible_where).trim()) {
    throw new S.StaffError("visible_where needs visible (yes, no or unknown). Nothing was saved.");
  }
  if (a.non_follower_share != null && String(a.non_follower_share).trim() !== "") {
    if (platform === "site") throw new S.StaffError("The site has no non-follower share. Nothing was saved.");
    if (!may(by, platform, "reading")) refuse(by, platform, OWNER[platform]);
    reading.non_follower_share = shareOf(a.non_follower_share);
  }
  if (Array.isArray(a.recent_posts) && a.recent_posts.length) {
    if (platform === "site") throw new S.StaffError("The site check does not take posts. Nothing was saved.");
    if (!may(by, platform, "reading")) refuse(by, platform, OWNER[platform]);
    if (a.recent_posts.length > 12) throw new S.StaffError("recent_posts is the last few posts, 12 at most. Nothing was saved.");
    reading.posts = a.recent_posts.map((p, i) => {
      if (!p || typeof p !== "object") throw new S.StaffError(`recent_posts ${i + 1} needs views or reach, and the day.`);
      const at = S.clean(p.at || p.date, 40);
      const day = at.slice(0, 10);
      if (!isDay(day)) throw new S.StaffError(`recent_posts ${i + 1}: at must be the day the post went out, YYYY-MM-DD.`);
      const views = p.views != null && String(p.views).trim() !== "" ? countOf(p.views, "views") : null;
      const reach = p.reach != null && String(p.reach).trim() !== "" ? countOf(p.reach, "reach") : null;
      if (views == null && reach == null) throw new S.StaffError(`recent_posts ${i + 1} needs views or reach, as shown.`);
      return { at: day, ...(views != null ? { views } : {}), ...(reach != null ? { reach } : {}) };
    });
  }
  if (a.artificial_streams != null && String(a.artificial_streams).trim()) {
    if (platform !== "spotify") throw new S.StaffError("An artificial-streams warning is recorded on Spotify. Nothing was saved.");
    if (!HELPERS.includes(by) && by !== "Atlas" && by !== "Drop") throw new S.StaffError("An artificial-streams warning is recorded by Atlas or Drop. Nothing was saved.", "not_allowed");
    events.push({ kind: "artificial", text: S.clean(a.artificial_streams, 240) });
  }
  if (a.track_moved != null && String(a.track_moved).trim()) {
    if (platform !== "spotify") throw new S.StaffError("A track that moved is recorded on Spotify. Nothing was saved.");
    if (!HELPERS.includes(by) && by !== "Atlas") throw new S.StaffError("A track that moved is recorded by Atlas. Nothing was saved.", "not_allowed");
    events.push({ kind: "moved", text: S.clean(a.track_moved, 120), moved_to: a.moved_to != null && String(a.moved_to).trim() ? S.clean(a.moved_to, 80) : "" });
  } else if (a.moved_to != null && String(a.moved_to).trim()) {
    throw new S.StaffError("moved_to needs track_moved (the track Atlas saw on another profile). Nothing was saved.");
  }
  if (a.site_ok != null && String(a.site_ok).trim()) {
    if (!may(by, platform, "site")) refuse(by, platform, "Webmaster");
    const ok = low(a.site_ok);
    if (!["yes", "no"].includes(ok)) throw new S.StaffError("site_ok must be yes or no, as the page answered. Nothing was saved.");
    reading.site_ok = ok;
    if (a.site_note != null && String(a.site_note).trim()) reading.site_note = S.clean(a.site_note, 200);
  } else if (a.site_note != null && String(a.site_note).trim()) {
    throw new S.StaffError("A site note needs site_ok yes or no. Nothing was saved.");
  }
  if (!Object.keys(reading).length && !events.length) throw new S.StaffError("Nothing to record. Send account_status, visible, or the warning you actually saw.");
  guard(reading.status_note, reading.visible_where, reading.site_note, ...events.map((e) => `${e.text || ""} ${e.moved_to || ""}`));
  const at = new Date(now).toISOString();
  return S.mutate(store, CHECKS_KEY, [], (list) => {
    const rows = Array.isArray(list) ? list : [];
    let saved = false, duplicate = true;
    if (Object.keys(reading).length) {
      let old = rows.find((x) => x && x.type === "reading" && x.by === by && x.platform === platform && x.date === date);
      if (!old) {
        old = { id: S.newId("h", now), type: "reading", platform, date, by, at, ...reading };
        rows.push(old);
        saved = true; duplicate = false;
      } else {
        for (const [k, v] of Object.entries(reading)) {
          if (JSON.stringify(old[k]) !== JSON.stringify(v)) { old[k] = v; saved = true; duplicate = false; }
        }
        if (saved) old.at = at;
      }
    }
    for (const e of events) {
      const prev = rows.find((x) => x && x.type === "event" && x.kind === e.kind && x.by === by && x.platform === platform && x.date === date && x.text === e.text);
      if (prev) continue;
      rows.push({ id: S.newId("h", now), type: "event", platform, date, by, at, ...e });
      saved = true; duplicate = false;
    }
    rows.sort((a, b) => (a.at < b.at ? 1 : -1));
    if (rows.length > 400) rows.length = 400;
    const summary = [
      reading.account_status ? `status ${reading.account_status}` : "",
      reading.visible ? `visible ${reading.visible}${reading.visible_where ? " on " + reading.visible_where : ""}` : "",
      reading.non_follower_share != null ? `non-follower share ${reading.non_follower_share}%` : "",
      reading.posts ? `${reading.posts.length} posts` : "",
      reading.site_ok ? `site ${reading.site_ok}` : "",
      ...events.map((e) => e.kind === "moved" ? `track moved: ${e.text}` : e.kind === "artificial" ? "artificial-streams warning" : e.kind),
    ].filter(Boolean).join("; ");
    return { value: { saved, duplicate: duplicate && !saved, platform, summary } };
  });
}

export async function listChecks(store) {
  const doc = await S.readDoc(store, CHECKS_KEY, []);
  return Array.isArray(doc.data) ? doc.data : [];
}

function sig(id, level, text, source, at) {
  return { id, level, text, source, at: at || "" };
}
const gap = (id, text, source) => sig(id, "gap", "Not enough data: " + text, source, "");

/* unit: what a reach point is on this platform. Spotify has tracks, not posts (18 Nov 2026, handoff bug 2). */
const POSTS = { one: "post", many: "posts", Many: "Posts" };
const TRACKS = { one: "track", many: "tracks", Many: "Tracks" };
function reachSignal(points, today, source, u = POSTS) {
  const usable = (points || []).filter((p) => p && isDay(p.day) && num(p.value) != null && daysBetween(p.day, today) >= 0 && daysBetween(p.day, today) <= 30);
  const byAt = new Map();
  for (const p of usable) byAt.set(p.at || p.day, p);
  const pts = [...byAt.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  if (pts.length < 7) return gap("reach", `this account has ${pts.length} ${pts.length === 1 ? u.one : u.many} with a view or reach number in 30 days. A run of weak ${u.many} needs at least 7 (3 recent, and 4 older to take a median from).`, source);
  const same = pts.filter((p) => p.age === "1 day" && p.metric === "views");
  const series = same.length >= 7 ? same : pts;
  const note = same.length >= 7 ? "views at 1 day" : (series[0].metric === "views" ? "views" : "views or reach");
  const last3 = series.slice(0, 3);
  const older = series.slice(3);
  const inWin = (list, days) => list.filter((p) => daysBetween(p.day, today) <= days);
  const med = (list) => (list.length >= 4 ? median(list.map((p) => p.value)) : null);
  const med14 = med(inWin(older, 14)), med30 = med(inWin(older, 30));
  if (med14 == null && med30 == null) return gap("reach", `the older ${u.many} are not enough for a 14-day or a 30-day median (4 older ${u.many} in the window).`, source);
  const under = (m) => m != null && last3.every((p) => p.value < 0.3 * m);
  const primary = med30 != null ? med30 : med14;
  const window = med30 != null ? "30-day" : "14-day";
  const nums = `last 3 ${note}: ${last3.map((p) => fmt(p.value)).join(", ")}` +
    (med30 != null ? `; 30-day median ${fmt(Math.round(med30))}` : "") +
    (med14 != null ? `; 14-day median ${fmt(Math.round(med14))}` : "");
  const at = last3[0].at || last3[0].day;
  if (under(med30) || (med30 == null && under(med14))) {
    return sig("reach", "red", `The last 3 ${u.many} are each under 30% of this account's own ${window} median (${nums}). Possible suppression.`, source, at);
  }
  if (med14 != null && med30 != null && under(med14)) {
    return sig("reach", "watch", `The last 3 ${u.many} are under 30% of the 14-day median, and not under the 30-day median (${nums}). One short dip, not a 30-day drop.`, source, at);
  }
  const weak = series.filter((p) => p.value < 0.3 * primary);
  const newestWeak = series[0].value < 0.3 * primary;
  if (newestWeak && weak.length === 1) return sig("reach", "watch", `One recent ${u.one} is under 30% of the ${window} median (${fmt(series[0].value)} against ${fmt(Math.round(primary))}). The ${u.many} before it are not. That is one ${u.one}, not a run.`, source, at);
  if (newestWeak && weak.length === 2) return sig("reach", "watch", `Two recent ${u.many} are under 30% of the ${window} median (${nums}). Not three in a row.`, source, at);
  return sig("reach", "ok", `Recent ${u.many} are in line with this account's own median (${nums}).`, source, at);
}

function shareSignal(rows, today) {
  const list = (rows || []).filter((r) => r && isDay(r.date) && num(r.value) != null && daysBetween(r.date, today) >= 0 && daysBetween(r.date, today) <= 30)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const byDay = new Map();
  for (const r of list) byDay.set(r.date, r);
  const days = [...byDay.values()];
  if (days.length < 5) return gap("non_follower", `non-follower share is recorded on ${days.length} day${days.length === 1 ? "" : "s"} in 30 days. A sharp drop needs 5 (the latest, and 4 earlier for a median).`, days[0] ? days[0].source : "not recorded");
  const latest = days[days.length - 1];
  const prior = days.slice(0, -1);
  const med = median(prior.map((r) => r.value));
  const drop = med - latest.value;
  const source = latest.source || "recorded on the desk";
  if (latest.value <= med * 0.5 && drop >= 15) {
    const level = latest.value <= 10 && med >= 40 ? "red" : "watch";
    return sig("non_follower", level, `The share of views from people who do not follow is ${latest.value}% on ${latest.date}. The median of the earlier days is ${Math.round(med)}%. That is a sharp drop.`, source, latest.at || latest.date);
  }
  return sig("non_follower", "ok", `Non-follower share is ${latest.value}% on ${latest.date}. The earlier median is ${Math.round(med)}%.`, source, latest.at || latest.date);
}

function followerSignal(rows, today) {
  const days = (rows || []).filter((r) => r && isDay(r.date) && num(r.change) != null && daysBetween(r.date, today) >= 0 && daysBetween(r.date, today) <= 30)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const by = new Map();
  for (const r of days) by.set(r.date, r);
  const list = [...by.values()];
  if (list.length < 7) return gap("followers", `follower change is on the desk for ${list.length} day${list.length === 1 ? "" : "s"} in 30 days. An unusual loss needs 7.`, "growth rows on the desk");
  const latest = list[list.length - 1];
  const prior = list.slice(0, -1);
  const med = median(prior.map((r) => r.change));
  const bar = Math.max(15, Math.abs(med) * 2);
  const unusual = (r) => r.change <= -bar;
  const last3 = list.slice(-3);
  const source = "growth rows on the desk";
  if (last3.every(unusual)) return sig("followers", "red", `Followers fell on each of the last 3 logged days (${last3.map((r) => `${r.date} ${r.change}`).join(", ")}). The account's own median daily change before that is ${Math.round(med)}.`, source, latest.date);
  if (unusual(latest)) return sig("followers", "watch", `The latest logged day lost ${fmt(Math.abs(latest.change))} followers (${latest.date}). The median daily change before that is ${Math.round(med)}. A loss of ${fmt(Math.round(bar))} or more is unusual for this account.`, source, latest.date);
  const views = list.filter((r) => num(r.views) != null);
  const recent = list.slice(-3);
  const flat = med >= 10 && recent.every((r) => r.change >= -1 && r.change <= 1);
  const baseViews = views.filter((r) => !recent.some((x) => x.date === r.date) && daysBetween(r.date, today) <= 14);
  if (flat && recent.every((r) => num(r.views) != null) && baseViews.length >= 4) {
    const vm = median(baseViews.map((r) => r.views));
    if (vm > 0 && recent.every((r) => r.views >= 0.7 * vm)) {
      return sig("followers", "watch", `Followers barely moved for 3 logged days (${recent.map((r) => r.change).join(", ")}) while views stayed near this account's own 14-day median (${fmt(Math.round(vm))}).`, source, latest.date);
    }
  }
  if (flat && recent.some((r) => num(r.views) == null)) {
    return sig("followers", "ok", `The latest follower change is ${latest.change} on ${latest.date} (median before that ${Math.round(med)}). Views are not on those days, so "flat while views stay normal" is not judged.`, source, latest.date);
  }
  return sig("followers", "ok", `Follower change on ${latest.date} is ${latest.change >= 0 ? "+" : ""}${fmt(latest.change)}. The median of the earlier logged days is ${Math.round(med)}.`, source, latest.date);
}

function visibilitySignal(reading, today) {
  if (!reading || !reading.visible || !isDay(reading.date) || daysBetween(reading.date, today) > 14) {
    return gap("visibility", "nobody has recorded a hashtag, For You or Explore check in the last 14 days (visible yes, no or unknown, and where).", "not recorded");
  }
  const where = reading.visible_where || "";
  const source = `recorded by ${reading.by}`;
  if (reading.visible === "unknown") return sig("visibility", "gap", `Not enough data: the last check was unknown${where ? " (" + where + ")" : ""}, on ${reading.date}.`, source, reading.date);
  if (reading.visible === "yes") return sig("visibility", "ok", `A check on ${reading.date} saw it${where ? " on " + where : ""}.`, source, reading.date);
  const dist = /for you|explore|fyp|recommended/i.test(where);
  return sig("visibility", dist ? "red" : "watch", `A check on ${reading.date} did not see it${where ? " on " + where : ""}.`, source, reading.date);
}

function statusSignal(reading, today) {
  if (!reading || !reading.account_status || !isDay(reading.date) || daysBetween(reading.date, today) > 30) {
    return gap("status", "nobody has recorded the platform's own Account Status (or Studio, or Account Check) in the last 30 days.", "not recorded");
  }
  const note = reading.status_note ? ` The page said: "${reading.status_note}".` : "";
  const source = `recorded by ${reading.by}`;
  if (reading.account_status === "clear") return sig("status", "ok", `Account Status was recorded clear on ${reading.date}.${note}`, source, reading.date);
  if (reading.account_status === "copyright") return sig("status", "watch", `Account Status has a copyright claim, recorded on ${reading.date}.${note}`, source, reading.date);
  return sig("status", "red", `Account Status was recorded as ${reading.account_status} on ${reading.date}.${note}`, source, reading.date);
}

function claimSignals(claims, today) {
  const list = (claims || []).filter((c) => c && c.claim && isDay(c.date) && daysBetween(c.date, today) >= 0 && daysBetween(c.date, today) <= 90);
  if (!list.length) return [gap("claims", "no Content ID claim has been recorded in the last 90 days. That does not mean there is none. Laura records one when YouTube shows one.", "Content ID claims on the desk")];
  return list.map((c) => {
    const hard = c.impact && /block|removed|ineligible|restrict|taken down|age-restrict/i.test(c.impact);
    const who = c.claimant ? c.claimant : "not reported";
    const impact = c.impact ? c.impact : "not reported";
    return sig("claim:" + (c.key || c.date + ":" + c.claim), hard ? "red" : "watch",
      `Content ID claim recorded by ${c.by || "Laura"} on ${c.date}: "${c.claim}". Claimant: ${who}. Impact: ${impact}.`,
      "Content ID claims on the desk", c.at || c.date);
  });
}

function listenerSignal(rows) {
  const list = (rows || []).filter((r) => r && isDay(r.date) && num(r.monthly_listeners) != null).sort((a, b) => (a.date < b.date ? -1 : 1));
  const by = new Map();
  for (const r of list) by.set(r.date, r);
  const days = [...by.values()];
  if (days.length < 4) return gap("listeners", `monthly listeners are on the desk for ${days.length} day${days.length === 1 ? "" : "s"}. A sudden drop needs 4 readings.`, "Spotify rows Atlas logged");
  const latest = days[days.length - 1], prev = days[days.length - 2];
  const med = median(days.slice(0, -1).map((r) => r.monthly_listeners));
  if (!(prev.monthly_listeners > 0) || !(med > 0)) return gap("listeners", "the earlier monthly-listener readings are not a usable baseline.", "Spotify rows Atlas logged");
  const drop = (prev.monthly_listeners - latest.monthly_listeners) / prev.monthly_listeners;
  const source = "Spotify monthly listeners recorded by Atlas";
  const text = `${fmt(latest.monthly_listeners)} on ${latest.date}, ${fmt(prev.monthly_listeners)} on ${prev.date}, median of the earlier readings ${fmt(Math.round(med))}`;
  if (latest.monthly_listeners < 0.7 * med && drop >= 0.2) return sig("listeners", "red", `Monthly listeners fell sharply (${text}).`, source, latest.date);
  if (drop >= 0.15) return sig("listeners", "watch", `Monthly listeners are down from the previous reading (${text}).`, source, latest.date);
  return sig("listeners", "ok", `Monthly listeners: ${text}.`, source, latest.date);
}

const NEXT = {
  status: "Open Account Status and record the exact line. Post only what that page allows. Do not appeal from here, do not delete posts, and do not sign in somewhere else to get around it.",
  reach: "Pause hashtags, check Account Status, post normally, no deleting.",
  visibility: "Pause hashtags, check Account Status, and record visible yes or no. Post normally. Do not delete posts.",
  non_follower: "Pause hashtags for a few posts. Check Account Status and record it. Post normally. Do not delete posts.",
  followers: "Check Account Status and record it. Keep posting as normal. Do not buy followers and do not delete posts.",
  listeners: "Open Spotify for Artists and record the listeners and any warning on the screen. Do not buy streams.",
  moved: "Open Spotify for Artists and confirm which profile the track is on. Tell Luke what you see. Do not move it from here.",
  artificial: "Open the artificial-streams warning and record the exact line. Do not buy streams. Luke decides any reply.",
  claim: "Open the Content ID claim and record who claimed it and the impact, if YouTube shows them. Do not delete the video and do not appeal from here.",
  site: "Open badscandal.com and record what the page shows, and the time. Do not change DNS or passwords from here.",
};
function nextFor(signals) {
  const rank = ["status", "artificial", "moved", "reach", "visibility", "listeners", "claim", "non_follower", "followers", "site", "builds"];
  const reds = (signals || []).filter((s) => s.level === "red");
  if (!reds.length) return "";
  reds.sort((a, b) => rank.indexOf(a.id.split(":")[0]) - rank.indexOf(b.id.split(":")[0]));
  const id = reds[0].id.split(":")[0];
  return NEXT[id] || NEXT.reach;
}
function guidanceFor(state, signals) {
  const red = (signals || []).find((s) => s.level === "red");
  const watch = (signals || []).find((s) => s.level === "watch");
  const hold = " Do not buy reach or followers, and do not use a pod or another login. HQ will not delete, appeal or post anything.";
  if (state === "red" && red) return red.text + " " + nextFor(signals) + hold;
  if (state === "watch" && watch) return watch.text + " Post as normal. Do not delete posts." + hold;
  if (state === "watch") return "Not enough of this account's own numbers are on the desk to call it healthy. Open Account Status (or the site) and record what it says. Post as normal. Do not delete posts." + hold;
  return "Nothing in the numbers on the desk points to a restriction. Post as normal. Do not delete posts to chase a number." + hold;
}
function judge(signals) {
  const list = signals.filter(Boolean);
  const state = list.some((s) => s.level === "red") ? "red" : list.some((s) => s.level === "watch") ? "watch" : list.some((s) => s.level === "ok") ? "green" : "watch";
  const known = list.some((s) => s.level === "ok" || s.level === "watch" || s.level === "red");
  return { state, known: state === "green" ? true : known, signals: list, next: state === "red" ? nextFor(list) : "", guidance: guidanceFor(state, list),
    headline: (list.find((s) => s.level === "red") || list.find((s) => s.level === "watch") || list.find((s) => s.level === "ok") || list[0] || { text: "Not enough data." }).text };
}

function latestReading(checks, platform, field) {
  return (checks || []).filter((c) => c && c.type === "reading" && c.platform === platform && c[field] != null)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.at < b.at ? 1 : -1)))[0] || null;
}
function events(checks, platform, kind, today, days) {
  return (checks || []).filter((c) => c && c.type === "event" && c.kind === kind && c.platform === platform && isDay(c.date) && daysBetween(c.date, today) >= 0 && daysBetween(c.date, today) <= days);
}

function igSeries(posts) {
  const out = [];
  for (const p of posts || []) {
    if (!p || !p.at) continue;
    const day = String(p.at).slice(0, 10);
    if (!isDay(day)) continue;
    const snaps = p.snaps || {};
    const take = (snap, age) => {
      if (!snap) return null;
      if (num(snap.views) != null) return { value: num(snap.views), metric: "views", age };
      if (num(snap.reach) != null) return { value: num(snap.reach), metric: "reach", age };
      return null;
    };
    const chosen = take(snaps.d1, "1 day") || take(snaps.d7, "1 week") || take(p.latest, "latest");
    if (!chosen) continue;
    out.push({ at: p.at, day, ...chosen });
  }
  return out;
}
function recordedSeries(checks, platform) {
  const out = [];
  for (const c of checks || []) {
    if (!c || c.type !== "reading" || c.platform !== platform || !Array.isArray(c.posts)) continue;
    for (const p of c.posts) {
      if (!p) continue;
      const day = String(p.at || "").slice(0, 10);
      if (!isDay(day)) continue;
      const views = num(p.views), reach = num(p.reach);
      if (views == null && reach == null) continue;
      out.push({ at: day, day, value: views != null ? views : reach, metric: views != null ? "views" : "reach", age: "recorded", by: c.by });
    }
  }
  return out;
}
function shareRows(checks, platform, igPosts) {
  const rows = [];
  for (const c of checks || []) if (c && c.type === "reading" && c.platform === platform && num(c.non_follower_share) != null) rows.push({ date: c.date, value: c.non_follower_share, at: c.at, source: `recorded by ${c.by}` });
  if (platform === "instagram") {
    for (const p of igPosts || []) {
      const snaps = [p && p.snaps && p.snaps.d1, p && p.snaps && p.snaps.d7, p && p.latest];
      for (const s of snaps) {
        if (s && num(s.non_follower_share) != null) rows.push({ date: String(p.at || "").slice(0, 10), value: num(s.non_follower_share), at: s.at || p.at, source: "Instagram reads HQ already stored" });
      }
    }
  }
  return rows;
}

export function connectionFrom(igState, now) {
  const source = "Instagram reader state HQ already stored";
  if (igState == null) return { label: "HQ connection", platform: "Instagram", state: "gap", text: "Not enough data: HQ has no stored Instagram connection to show.", source, at: "" };
  const at = igState.lastOkAt || igState.lastRunAt || "";
  const when = at ? new Date(at).toISOString() : "";
  if (igState.pausedUntil && now < igState.pausedUntil || igState.errorKind === "limit") {
    const until = igState.pausedUntil ? S.spStamp(igState.pausedUntil) : "";
    return { label: "HQ connection", platform: "Instagram", state: "watch", text: "Meta asked HQ to slow down, so Instagram reads are paused" + (until ? ` until ${until} São Paulo` : "") + ". This is the connection, not the account. Nothing is retried before then.", source, at: when };
  }
  if (igState.stopped || igState.errorKind === "blocked" || igState.errorKind === "refused") {
    const why = igState.errorKind === "refused" ? "Instagram refused HQ's key, so HQ is not reading." : "Meta told HQ to stop, so HQ has stopped reading Instagram.";
    return { label: "HQ connection", platform: "Instagram", state: "down", text: why + " This is the connection, not a verdict on the account. Check Account Status and record what that page says.", source, at: when };
  }
  if (igState.errorKind === "missing" || igState.connected === false) return { label: "HQ connection", platform: "Instagram", state: "watch", text: "Instagram is not connected, so HQ has no reads of its own. This is the connection, not the account.", source, at: when };
  if (igState.errorKind && igState.errorKind !== "ok") return { label: "HQ connection", platform: "Instagram", state: "watch", text: "HQ's last Instagram read did not succeed. The next read tries again on its own. This is the connection, not the account.", source, at: when };
  if (igState.lastOkAt) return { label: "HQ connection", platform: "Instagram", state: "ok", text: "HQ connection: the last stored Instagram read succeeded. No new read was made for this check.", source, at: when };
  return { label: "HQ connection", platform: "Instagram", state: "gap", text: "Not enough data: the stored Instagram connection has no successful read and no error.", source, at: "" };
}

function growthRows(growth, id) {
  return (growth || []).filter((r) => r && platformId(r.platform) === id && r.kind !== "song");
}

export function evaluate(input) {
  const now = input && input.now || Date.now();
  const today = S.spDay(now);
  const growth = input && input.growth || [];
  const checks = input && input.checks || [];
  const igPosts = input && input.igUnread ? null : (input && input.igPosts || []);
  const claims = input && input.claims || [];
  const builds = input && input.builds || [];
  const accounts = ACCOUNTS.map((a) => {
    const id = a.id;
    const signals = [];
    if (id === "site") {
      const site = latestReading(checks, "site", "site_ok");
      if (!site || !isDay(site.date) || daysBetween(site.date, today) > 14) signals.push(gap("site", "nobody has recorded whether badscandal.com is answering in the last 14 days (site_ok yes or no).", "not recorded"));
      else if (site.site_ok === "no") signals.push(sig("site", "red", `Webmaster recorded that the site was not answering on ${site.date}.` + (site.site_note ? ` "${site.site_note}".` : ""), `recorded by ${site.by}`, site.date));
      else signals.push(sig("site", "ok", `Webmaster recorded that the site was answering on ${site.date}.` + (site.site_note ? ` "${site.site_note}".` : ""), `recorded by ${site.by}`, site.date));
      const bad = (builds || []).filter((b) => b && typeof b.state === "string" && b.state.startsWith("not done"));
      if (bad.length) signals.push(sig("builds", "watch", bad.slice(0, 3).map((b) => `${b.what || "A song page"}: ${b.state}`).join(" "), "song page builds already on the desk", bad[0].asked || ""));
      else if ((builds || []).some((b) => b && b.state === "live")) signals.push(sig("builds", "ok", "The latest song-page record on the desk is live.", "song page builds already on the desk", ""));
    } else {
      const g = growthRows(growth, id);
      const reachPts = id === "instagram" && igPosts == null ? [] : id === "instagram" ? igSeries(igPosts) : recordedSeries(checks, id);
      const reachSource = id === "instagram" ? (input && input.igUnread ? "Instagram posts could not be read from the store just now" : "Instagram reads HQ already stored") : id === "spotify" ? "tracks Atlas recorded" : "posts the bot recorded";
      if (id === "instagram" && input && input.igUnread) signals.push(gap("reach", "the stored Instagram posts could not be read just now. Nothing was fetched from Instagram.", reachSource));
      else signals.push(reachSignal(reachPts, today, reachSource, id === "spotify" ? TRACKS : POSTS));
      signals.push(shareSignal(shareRows(checks, id, id === "instagram" ? igPosts : []), today));
      signals.push(followerSignal(g.map((r) => ({ date: r.date, change: r.change, views: r.views, followers: r.followers })), today));
      signals.push(visibilitySignal(latestReading(checks, id, "visible"), today));
      signals.push(statusSignal(latestReading(checks, id, "account_status"), today));
      if (id === "youtube") signals.push(...claimSignals(claims, today));
      if (id === "spotify") {
        signals.push(listenerSignal(g));
        for (const e of events(checks, "spotify", "moved", today, 60)) {
          signals.push(sig("moved", "red", `Atlas recorded that "${e.text}" is on another profile` + (e.moved_to ? ` (${e.moved_to})` : " (the other profile was not named)") + `, on ${e.date}.`, `recorded by ${e.by}`, e.date));
        }
        for (const e of events(checks, "spotify", "artificial", today, 60)) {
          signals.push(sig("artificial", "red", `An artificial-streams warning was recorded by ${e.by} on ${e.date}: "${e.text}".`, `recorded by ${e.by}`, e.date));
        }
        if (!events(checks, "spotify", "moved", today, 60).length) signals.push(gap("moved", "no track has been recorded as moved to another profile. That does not mean none moved.", "Atlas's log"));
        if (!events(checks, "spotify", "artificial", today, 60).length) signals.push(gap("artificial", "no artificial-streams warning has been recorded. That does not mean there is none.", "Atlas or Drop"));
      }
    }
    const j = judge(signals);
    return { id, label: a.label, owner: a.owner, ...j };
  });
  return { at: new Date(now).toISOString(), today, accounts, connection: connectionFrom(input && input.igState, now) };
}

export function fingerprint(account) {
  const flags = (account.signals || []).filter((s) => s.level === "red" || s.level === "watch").map((s) => s.id + ":" + s.level).sort();
  return account.state + "|" + flags.join(",");
}

/* Who hears about a change. The first run tells each owner the baseline. A later run tells them
   only when the state or the watch/red signals changed. Luke is not messaged. */
export function notifyPlan(prev, report) {
  const before = prev && prev.accounts || null;
  const out = [];
  for (const a of report.accounts || []) {
    const fp = fingerprint(a);
    if (before && before[a.id] === fp) continue;
    const was = before && before[a.id] ? before[a.id].split("|")[0] : "";
    const lines = [`${a.label} account health is ${a.state}` + (was ? ` (it was ${was})` : " (first check)."), a.headline, a.guidance];
    for (const s of a.signals || []) if (s.level === "red" || s.level === "watch") lines.push(`${s.text} Source: ${s.source}.` + (s.at ? ` As of ${s.at}.` : ""));
    if (a.id === "instagram" && report.connection && report.connection.state !== "ok" && report.connection.state !== "gap") lines.push(report.connection.text);
    out.push({ platform: a.id, to: a.owner, needs: a.state === "red" ? "action" : "none", fp, text: lines.filter(Boolean).join("\n").slice(0, 1500) });
  }
  const c = report.connection;
  if (c && (c.state === "watch" || c.state === "down")) {
    const fp = c.state + "|" + c.text;
    if (!prev || prev.connection !== fp) out.push({ platform: "connection", to: "Steve", needs: "none", fp, text: c.text });
  }
  return out;
}

export async function deliverHealth(store, now, roster, report, prev) {
  const plan = notifyPlan(prev, report);
  const seen = new Set((await S.listMessages(store, now, 2)).map((m) => m.mailId).filter(Boolean));
  const sent = [];
  const next = { at: new Date(now).toISOString(), accounts: { ...(prev && prev.accounts || {}) }, connection: prev && prev.connection || "" };
  for (const item of plan) {
    const mailId = `health:${item.platform}:${item.fp}`.slice(0, 80);
    if (seen.has(mailId)) {
      if (item.platform === "connection") next.connection = item.fp; else next.accounts[item.platform] = item.fp;
      continue;
    }
    await S.sendMessage(store, now, roster, { from: "HQ", to: item.to, text: item.text, needs: item.needs, kind: "note", mailId });
    seen.add(mailId);
    sent.push({ to: item.to, platform: item.platform, state: item.fp.split("|")[0] });
    if (item.platform === "connection") next.connection = item.fp; else next.accounts[item.platform] = item.fp;
  }
  if (report.connection && report.connection.state === "ok") next.connection = "ok|" + report.connection.text;
  await S.mutate(store, LAST_KEY, { accounts: {}, connection: "" }, () => ({ replace: next, value: next }));
  return { sent, snapshot: next };
}

export async function loadReport({ store, ig, now, claims, builds, igUnread }) {
  const growth = await S.listGrowth(store, now, 3);
  const checks = await listChecks(store);
  let igPosts = [], igState = null, unread = !!igUnread;
  if (ig && !unread) {
    try {
      const v = await ig.get("posts.json", { type: "json" });
      igPosts = Array.isArray(v) ? v : [];
    } catch { unread = true; igPosts = []; }
    try { igState = await ig.get("state.json", { type: "json" }); } catch { igState = null; }
  }
  const claimItems = Array.isArray(claims) ? claims : (claims && claims.items) || [];
  return evaluate({ now, growth, checks, igPosts, igUnread: unread, igState, claims: claimItems, builds: builds || [] });
}

export async function runAccountHealth({ desk, ig, now, roster, builds }) {
  const loaded = await S.loadDesk(desk, now);
  const pages = builds != null ? builds : await S.songPages(desk, now).catch(() => []);
  const report = await loadReport({ store: desk, ig, now, claims: loaded.claims, builds: pages });
  const prevDoc = await S.readDoc(desk, LAST_KEY, null);
  const prev = prevDoc.data && prevDoc.data.accounts ? prevDoc.data : null;
  const delivered = await deliverHealth(desk, now, roster || loaded.roster, report, prev);
  return { report, ...delivered };
}

/* Made-up, so the sample phone can show a dot and one red card. No real account. */
export function sampleReport(now) {
  const today = S.spDay(now);
  const day = (n) => addDays(today, -n);
  const igPosts = [];
  for (let i = 0; i < 8; i++) igPosts.push({ id: "s" + i, at: day(2 + i * 2) + "T12:00:00Z", snaps: { d1: { views: 2000 + i * 100, reach: 1500 } } });
  const posts = (base, last) => last.map((views, i) => ({ at: day(i + 1), views })).concat([4, 5, 6, 7, 8, 9].map((n) => ({ at: day(n + 3), views: base })));
  const growth = [];
  for (let i = 0; i < 10; i++) {
    growth.push({ kind: "growth", platform: "Instagram", date: day(i), followers: 4000 + i, change: 5, views: null });
    growth.push({ kind: "growth", platform: "TikTok", date: day(i), followers: 8000 - i, change: i < 3 ? -40 : 8, views: 9000 });
    growth.push({ kind: "growth", platform: "YouTube", date: day(i), followers: 2000 + i * 2, change: 2, views: 3000 });
    growth.push({ kind: "growth", platform: "Spotify", date: day(i), followers: 5000 + i, change: 3, monthly_listeners: 10000 + i * 20 });
  }
  const checks = [
    { type: "reading", platform: "instagram", date: day(1), by: "Steve", at: day(1), account_status: "clear", visible: "yes", visible_where: "Explore" },
    { type: "reading", platform: "tiktok", date: day(1), by: "Kevin", at: day(1), posts: posts(8000, [400, 500, 300]) },
    { type: "reading", platform: "youtube", date: day(1), by: "Laura", at: day(1), posts: posts(4000, [500, 4200, 4100]) },
    { type: "reading", platform: "site", date: day(0), by: "Webmaster", at: day(0), site_ok: "yes" },
  ];
  return evaluate({ now, growth, checks, igPosts, igState: { lastOkAt: now - 3600000, errorKind: "", pausedUntil: now + DAY_MS }, claims: [], builds: [{ what: "new page: Sample Song", state: "live" }] });
}
