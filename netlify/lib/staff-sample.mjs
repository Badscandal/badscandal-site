/* MADE-UP staff desk for /hq?sample=1 (11 Nov 2026) and for the tests: invented messages, invented
   payers and amounts, invented notes. Nothing here is real and nothing real is ever opened: the
   sample is built in memory. Also memoryDesk(): an in-memory stand-in for the Netlify Blob store
   that honours "write only if unchanged" (onlyIfMatch / onlyIfNew), which the real desk relies on. */
import { hqModel } from "./hq.mjs";
import { sampleMeta, sampleSheets } from "./hq-sample.mjs";
import * as S from "./staff.mjs";

export function memoryDesk() {
  const m = new Map();
  let n = 0;
  return {
    _map: m,
    async get(key, o) { const v = m.get(key); return v ? (o && o.type === "json" ? JSON.parse(v.body) : v.body) : null; },
    async getWithMetadata(key, o) { const v = m.get(key); return v ? { data: o && o.type === "json" ? JSON.parse(v.body) : v.body, etag: v.etag, metadata: {} } : null; },
    async setJSON(key, value, o = {}) {
      const cur = m.get(key);
      if (o.onlyIfNew && cur) return { modified: false };
      if (o.onlyIfMatch && (!cur || cur.etag !== o.onlyIfMatch)) return { modified: false };
      const etag = '"e' + ++n + '"';
      m.set(key, { body: JSON.stringify(value), etag });
      return { modified: true, etag };
    },
    async set(key, value) { m.set(key, { body: String(value), etag: '"e' + ++n + '"' }); return { modified: true }; },
    async delete(key) { m.delete(key); },
    async list({ prefix = "" } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
  };
}

const ROSTER = S.DEFAULT_ROSTER.map((b) => ({ access: "", blockers: b.name === "Kevin" ? "TikTok asks for Luke's phone code on a new sign-in" : "", ...b }));

const SOURCES = [
  { id: "wise", name: "Wise", kind: "account", owner: "Ledger", cadence: "daily", state: "active", how: "read-only connection" },
  { id: "paypal", name: "PayPal", kind: "account", owner: "Ledger", cadence: "daily", state: "active", how: "read-only connection" },
  { id: "bank", name: "Bank", kind: "account", owner: "Ledger", cadence: "daily", state: "blocked", blocker: "Not connected yet", needsLuke: "Reconnect the bank feed" },
  { id: "northlight", name: "Northlight Records", kind: "payer", category: "Label deals", currency: "EUR", lands: "Bank", cadence: "monthly", owner: "Ledger", state: "active", match: ["northlight"] },
  { id: "distro", name: "Sample Distro", kind: "payer", category: "Self-releases", currency: "USD", lands: "PayPal", cadence: "monthly", owner: "Drop", state: "active", match: ["sample distro"] },
  { id: "publisher", name: "Sample Publishing", kind: "payer", category: "Publishing", currency: "USD", lands: "Wise", cadence: "quarterly", owner: "Ledger", state: "active", match: ["sample publishing"] },
  { id: "plugin", name: "Plug-in sales", kind: "payer", category: "Other", currency: "USD", lands: "Bank", cadence: "monthly", owner: "", state: "not_tracked" },
];

/* MADE-UP releases for the pipeline (11 Nov 2026; V2-V5 the same evening). Four, one of each kind:
   - Survivors: a draft in the pipeline, required fields missing;
   - Me Dá Seu Body: an upcoming self-release 13 days out, with warnings: a blocked step, no lyrics yet,
     not showing in Spotify for Artists yet, so the pitch is waiting;
   - Slow Burn: an upcoming label release with a split; the label delivers it (upload and approval
     skipped), it shows in Spotify for Artists (the matched item of the report), so its pitch is open;
   - Touch Me: out 12 days ago, every step done, with its (made-up) deal.
   Links point at example.com; the "lyrics" are placeholder words; the labels and splits are invented. */
export function sampleReleases(now = Date.now()) {
  const today = S.spDay(now);
  const d = (n) => new Date(Date.parse(today + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
  const iso = (n, h = 12) => new Date(Date.parse(d(n) + "T00:00:00Z") + h * 3600000).toISOString();
  const L = (n, by, what) => ({ at: iso(n), by, what });
  const files = (slug) => ({ wav: `https://example.com/sample/${slug}-master.wav`, artwork: `https://example.com/sample/${slug}-cover-3000.jpg`, folder: `https://example.com/sample/${slug}/` });
  const stores = { language: "Portuguese", explicit: "No", genre: "Dance", subgenre: "House", writers: "Sample Writer One: music\nSample Writer Two: lyrics", producers: "BADSCANDAL", copyright: "℗ 2026 BADSCANDAL · © 2026 BADSCANDAL" };
  const steps = (date, sentDay, set, o) => S.scheduleSteps(date, sentDay, o).steps.map((st) => ({ ...st, ...(set[st.key] || {}) }));

  const mdsbDate = d(13), mdsbSent = d(-9);
  const mdsb = { id: "medaseubody", title: "Me Dá Seu Body", date: mdsbDate, status: "scheduled", createdAt: iso(-11), createdBy: "Luke", updatedAt: iso(-1), sentAt: iso(-9), tight: false,
    pack: { kind: "Self-release", ...files("medaseubody"), ...stores, mood: "late night, warm, flirty", instruments: "synth bass, drum machine, vocal chops", isrc: "SAMPLE0000002", storeStatus: "in review at RouteNote", page: "https://badscandal.com/medaseubody" },
    steps: steps(mdsbDate, mdsbSent, {
      upload: { status: "done", note: "Uploaded with the release date", link: "https://example.com/sample/routenote", at: iso(-8), by: "Drop" },
      approved: { status: "blocked", note: "RouteNote wants a cover without the web address on it. Needs a new cover from Luke.", at: iso(-2), by: "Drop" },
      page: { status: "working", note: "Page made, waiting for the cover", at: iso(-1), by: "Webmaster" } }),
    log: [L(-11, "Luke", "Luke started the pack"), L(-9, "Luke", "Luke sent it to the team for " + S.dayWords(mdsbDate)), L(-8, "Drop", "Drop: Uploaded to RouteNote with the release date — done"), L(-2, "Drop", "Drop: Approved by RouteNote (nothing waiting) — blocked")] };

  const sbDate = d(24), sbSent = d(-2);
  const sb = { id: "slowburn", title: "Slow Burn", date: sbDate, status: "scheduled", createdAt: iso(-3), createdBy: "Luke", updatedAt: iso(0, 9), sentAt: iso(-2), tight: false,
    pack: { kind: "With a label", label: "Sample Label", split: "BADSCANDAL 50% · Sample Label 50%", deal: "(sample) A made-up deal: contract signed in October, the label pays twice a year.",
      ...files("slowburn"), ...stores, language: "English", copyright: "℗ 2026 Sample Label · © 2026 BADSCANDAL", mood: "slow, warm, hopeful" },
    steps: steps(sbDate, sbSent, { spotify: { status: "done", note: "Showing in Spotify for Artists since " + S.dayWords(d(0)), at: iso(0, 9), by: "Atlas" } }, { labelDelivers: true }),
    log: [L(-3, "Luke", "Luke started the pack"), L(-2, "Luke", "Luke sent it to the team for " + S.dayWords(sbDate)), { at: iso(0, 9), by: "Atlas", what: "Atlas: Showing as upcoming in Spotify for Artists — done" }] };

  const surv = { id: "survivors", title: "Survivors", date: d(30), status: "draft", createdAt: iso(-1), createdBy: "Luke", updatedAt: iso(-1), sentAt: null, tight: false,
    pack: { kind: "Self-release", wav: "https://example.com/sample/survivors-master.wav", genre: "Dance" }, steps: [], log: [L(-1, "Luke", "Luke started the pack for " + S.dayWords(d(30)))] };

  const tmDate = d(-12), tmSent = d(-40);
  const tm = { id: "touchme", title: "Touch Me", date: tmDate, status: "scheduled", createdAt: iso(-41), createdBy: "Luke", updatedAt: iso(-12), sentAt: iso(-40), tight: false,
    pack: { kind: "With a label", label: "Sample Records", split: "BADSCANDAL 50% · Sample Records 50%", distributor: "RouteNote", deal: "(sample) A made-up deal for the sample only.",
      ...files("touchme"), ...stores, language: "English", lyrics: "(sample) Made-up words for the sample only.\nNothing here is a real lyric.", mood: "euphoric", instruments: "synths, drums", story: "A made-up two-line story for the sample.\nNothing here is real.",
      isrc: "SAMPLE0000001", upc: "0000000000001", storeStatus: "live", spotifyTrack: "https://open.spotify.com/track/sample", video: "https://example.com/sample/touchme-video", page: "https://badscandal.com/touchme" },
    steps: steps(tmDate, tmSent, Object.fromEntries(S.RELEASE_STEPS.map((st) => [st.key, { status: "done", at: iso(-12 - st.days), by: st.owner }]))),
    log: [L(-40, "Luke", "Luke sent it to the team for " + S.dayWords(tmDate)), L(-12, "Webmaster", "Webmaster: Release day: Spotify link on the song page and the home card — done")] };
  return [surv, mdsb, sb, tm];
}

/* MADE-UP Spotify for Artists report (V4): Atlas looked 3 hours ago; one song is in the pipeline (Slow
   Burn), one nobody put through it (Velvet Night: Luke is asked what it is). */
export function sampleSightings(now = Date.now()) {
  const today = S.spDay(now), at = now - 3 * 3600000;
  const d = (n) => new Date(Date.parse(today + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
  const item = (title, date, shownAs, firstSeen) => ({ key: S.sightKey(title, date), title, date, shownAs, firstSeen });
  return { at: new Date(at).toISOString(), sp: S.spStamp(at), by: "Atlas", note: "",
    list: [item("Slow Burn", d(24), "BADSCANDAL · Sample Label", today), item("Velvet Night", d(16), "BADSCANDAL · Sample Distro", d(-1))], answers: {} };
}

export function sampleDesk(now = Date.now()) {
  const today = S.spDay(now), ago = (min) => now - min * 60000;
  const d = (back) => new Date(Date.parse(today + "T12:00:00Z") - back * 86400000).toISOString().slice(0, 10);
  const U = (min, bot, status, message, duty = "") => ({ id: "u" + min, at: new Date(ago(min)).toISOString(), sp: S.spStamp(ago(min)), bot, status, message, link: "", duty });
  const updates = [U(6, "Ledger", "done", "Wise and PayPal checked: 1 new payment (USD 104.04)"), U(33, "Atlas", "working", "Reading Spotify for Artists for Touch Me"), U(58, "Nova", "info", "Duties reset for today; 2 briefs read")];
  const M = (min, id, from, to, text, needs = "none", extra = {}) => ({ id, at: new Date(ago(min)).toISOString(), sp: S.spStamp(ago(min)), from, to, text, needs, re: "", options: [], kind: "note", resolved: null, ...extra });
  const messages = [
    M(12, "msample0001a", "HQ", "Luke", "HQ check, " + today + " morning: 3 things to look at\n\nNeeds a look:\n- Kevin is blocked: TikTok login expired\n- Laura is late (due 00:30): Log YouTube subscribers\n- Income: Bank: blocked. Not connected yet\n\nRunning:\n- Duties: 3 of 6 done, 1 late, 1 blocked\n- Income logged this month: USD 104.04 + EUR 112.01 received", "none", { kind: "report" }),
    M(40, "msample0002a", "Kevin", "Luke", "TikTok signed me out. I need the 6-digit code TikTok sends to your phone, typed into the secure form (not here).", "action"),
    M(95, "msample0003a", "Nova", "Luke", "Survivors on Fri 11 Dec? Files have to reach Drop by Fri 13 Nov.", "decision", { options: ["Yes, Fri 11 Dec", "Move it to January", "Not this one"] }),
    M(130, "msample0004a", "Claude", "Nova", "Ledger's Bank row for this month is still pending. Ask Ledger to check the statement email again at 12:00.", "action"),
    M(125, "msample0005a", "Nova", "Claude", "Asked. Ledger will post an update when it has looked.", "none", { re: "msample0004a" }),
    M(300, "msample0006a", "Claude", "all", "From today every bot starts its run with my_day and finishes with post_update. The guide is in read_guide.", "none"),
    /* two things Luke already answered (the "You answered" block): Atlas has looked since, Drop not yet */
    M(200, "msample0007a", "Atlas", "Luke", "OK to pitch Me Dá Seu Body as Dance / House?", "decision", { options: ["Yes", "Pick another genre"], resolved: { by: "Luke", at: new Date(ago(150)).toISOString(), note: "Yes" } }),
    M(240, "msample0008a", "Drop", "Luke", "RouteNote wants the Me Dá Seu Body cover without the web address on it. Can you put a new one in the folder?", "action", { resolved: { by: "Luke", at: new Date(ago(50)).toISOString(), note: "answered" } }),
    M(50, "msample0009a", "Luke", "Drop", "New cover is in the folder now.", "none", { re: "msample0008a" }),
  ];
  messages.sort((a, b) => (a.at < b.at ? 1 : -1)); /* newest first, as the real desk lists them */
  const E = (back, payer, amount, currency, status, account, category, by = "Ledger") => ({ id: "i" + back + payer.length, at: new Date(ago(back * 1440 + 90)).toISOString(), by, date: d(back), payer, amount, currency, status, category, account, reference: "", period: "", source: "", note: "" });
  const entries = [E(0, "Sample Distro", 104.04, "USD", "received", "PayPal", "Self-releases"), E(2, "Northlight Records", 112.01, "EUR", "pending", "Statement only", "Label deals"),
    E(9, "Sample Publishing", 420.5, "USD", "received", "Wise", "Publishing"), E(34, "Northlight Records", 96.4, "EUR", "received", "Bank", "Label deals"), E(36, "Sample Distro", 88.1, "USD", "received", "PayPal", "Self-releases")];
  const checks = [{ at: new Date(ago(6)).toISOString(), day: today, by: "Ledger", account: "Wise", new: 0, note: "" }, { at: new Date(ago(6)).toISOString(), day: today, by: "Ledger", account: "PayPal", new: 1, note: "" }];
  const seen = Object.fromEntries(["Ledger", "Atlas", "Nova", "Steve", "Forge", "Drop"].map((n, i) => [n, { at: new Date(ago(6 + i * 27)).toISOString(), tool: "post_update" }]));
  seen.Claude = { at: new Date(ago(130)).toISOString(), tool: "send_message" };
  /* read markers (V6): the same six read their messages when they last came (my_day); so Luke's answer
     to Atlas reads "Read by Atlas", his reply to Drop "Not read yet", and Claude's note to everyone
     "Read by 6 of 12" */
  const read = Object.fromEntries(Object.entries(seen).filter(([n]) => n !== "Claude").map(([n, v]) => [n, { at: v.at }]));
  return { roster: ROSTER, updates, messages, cards: { atlas: { workingOn: "Backfilling Touch Me's daily rows to release day", needs: "", at: new Date(ago(200)).toISOString() }, kevin: { workingOn: "TikTok banner", needs: "Luke's phone code for TikTok", at: new Date(ago(400)).toISOString() } },
    seen, income: S.incomeReport(entries, checks, SOURCES.map((s) => ({ match: [], category: "Other", currency: "", lands: "", how: "", blocker: "", needsLuke: "", ...s })), today), config: { botsOn: true, changedAt: null },
    releases: sampleReleases(now), read, sightings: sampleSightings(now) };
}

export function sampleBoard(now = Date.now()) {
  const today = S.spDay(now), desk = sampleDesk(now);
  const sheets = sampleSheets(today, now);
  const hq = hqModel(sheets, today, {}, sampleMeta(sheets, today), S.spHM(now), { updates: desk.updates, overlay: S.dutyOverlay(desk.updates, today),
    releases: desk.releases.filter((r) => r.status !== "cancelled").map((r) => S.releaseView(r, today, { sightings: desk.sightings })), sightings: desk.sightings });
  return { ...S.board(desk, now, hq), hqRead: true, keys: { bots: true, claude: true } };
}
