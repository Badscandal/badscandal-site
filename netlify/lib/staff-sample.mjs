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
  { id: "northlight", name: "Northlight Records", kind: "payer", category: "Label deals", currency: "EUR", lands: "Wise", cadence: "monthly", owner: "Ledger", state: "active", match: ["northlight"], main: true, dueDay: 10 },
  { id: "distro", name: "Sample Distro", kind: "payer", category: "Self-releases", currency: "USD", lands: "PayPal", cadence: "monthly", owner: "Drop", state: "active", match: ["sample distro"], main: true, dueDay: 5 },
  { id: "publisher", name: "Sample Publishing", kind: "payer", category: "Publishing", currency: "USD", lands: "Wise", cadence: "quarterly", owner: "Ledger", state: "active", match: ["sample publishing"], main: true, dueDay: 28 },
  /* the bank reader (11 Nov 2026): the site itself reads this one every morning */
  { id: "revolut", name: "Revolut", kind: "account", owner: "HQ", cadence: "daily", state: "active", how: "read-only, read by the site every morning" },
  { id: "plugin", name: "Plug-in sales", kind: "payer", category: "Other", currency: "USD", lands: "PayPal", cadence: "monthly", owner: "", state: "not_tracked" },
  /* L1 (18 Nov 2026): a monthly source with a pay day and nothing filed, so Expected can show "missing". Made up. */
  { id: "label", name: "Sample Label", kind: "payer", category: "Label deals", currency: "EUR", lands: "Wise", cadence: "monthly", owner: "Ledger", state: "active", match: ["sample label"], main: true, dueDay: 3 },
];

/* MADE-UP releases for the pipeline (11 Nov 2026; V2-V5 the same evening). Four, one of each kind:
   - Survivors: a draft in the pipeline, required fields missing;
   - Me Dá Seu Body: an upcoming self-release 13 days out, with warnings: a blocked step, no lyrics yet,
     not showing in Spotify for Artists yet, so the pitch is waiting;
   - Slow Burn: an upcoming label release with a split; the label delivers it (upload and approval
     skipped), it shows in Spotify for Artists (the matched item of the report), so its pitch is open;
   - Touch Me: out 12 days ago, every step done, with its (made-up) deal and both of Luke's approvals.
   Batch 3 (14 Nov 2026): Me Dá Seu Body's distributor history (uploaded, in moderation, rejected with a
   made-up reason) and Drop's "ready to resubmit?" question (sampleDesk's messages).
   Links point at example.com; the "lyrics" are placeholder words; the labels and splits are invented. */
export function sampleReleases(now = Date.now()) {
  const today = S.spDay(now);
  const d = (n) => new Date(Date.parse(today + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
  const iso = (n, h = 12) => new Date(Date.parse(d(n) + "T00:00:00Z") + h * 3600000).toISOString();
  const L = (n, by, what) => ({ at: iso(n), by, what });
  const files = (slug) => ({ wav: `https://example.com/sample/${slug}-master.wav`, artwork: `https://example.com/sample/${slug}-cover-3000.jpg`, folder: `https://example.com/sample/${slug}/` });
  const stores = { language: "Portuguese", explicit: "No", genre: "Dance", subgenre: "House", writers: "Sample Writer One: music\nSample Writer Two: lyrics", producers: "badscandal", copyright: "℗ 2026 badscandal · © 2026 badscandal" };
  const steps = (date, sentDay, set, o) => S.scheduleSteps(date, sentDay, o).steps.map((st) => ({ ...st, ...(set[st.key] || {}) }));

  const mdsbDate = d(13), mdsbSent = d(-9);
  const mdsb = { id: "medaseubody", title: "Me Dá Seu Body", date: mdsbDate, status: "scheduled", createdAt: iso(-11), createdBy: "Luke", updatedAt: iso(-1), sentAt: iso(-9), tight: false,
    pack: { kind: "Self-release", ...files("medaseubody"), ...stores, mood: "late night, warm, flirty", instruments: "synth bass, drum machine, vocal chops", isrc: "SAMPLE0000002", storeStatus: "rejected", page: "https://badscandal.com/medaseubody" },
    storeLog: [{ status: "uploaded", on: d(-8), at: iso(-8), by: "Drop" }, { status: "in moderation", on: d(-7), at: iso(-7), by: "Drop" },
      { status: "rejected", on: d(-2), at: iso(-2), by: "Drop", reason: "(sample) The cover has a web address on it" }],
    steps: steps(mdsbDate, mdsbSent, {
      upload: { status: "done", note: "Uploaded with the release date", link: "https://example.com/sample/routenote", at: iso(-8), by: "Drop" },
      approved: { status: "blocked", note: "RouteNote wants a cover without the web address on it. Needs a new cover from Luke.", at: iso(-2), by: "Drop" },
      page: { status: "working", note: "Page made, waiting for the cover", at: iso(-1), by: "Webmaster" } }),
    log: [L(-11, "Luke", "Luke started the pack"), L(-9, "Luke", "Luke sent it to the team for " + S.dayWords(mdsbDate)), L(-8, "Drop", "Drop: Uploaded to RouteNote with the release date — done"), L(-2, "Drop", "Drop: Approved by RouteNote — blocked")] };

  const sbDate = d(24), sbSent = d(-2);
  const sb = { id: "slowburn", title: "Slow Burn", date: sbDate, status: "scheduled", createdAt: iso(-3), createdBy: "Luke", updatedAt: iso(0, 9), sentAt: iso(-2), tight: false,
    pack: { kind: "With a label", label: "Sample Label", split: "badscandal 50% · Sample Label 50%", deal: "(sample) A made-up deal: contract signed in October, the label pays twice a year.",
      ...files("slowburn"), ...stores, language: "English", copyright: "℗ 2026 Sample Label · © 2026 badscandal", mood: "slow, warm, hopeful" },
    steps: steps(sbDate, sbSent, { spotify: { status: "done", note: "Showing in Spotify for Artists since " + S.dayWords(d(0)), at: iso(0, 9), by: "Atlas" } }, { labelDelivers: true }),
    log: [L(-3, "Luke", "Luke started the pack"), L(-2, "Luke", "Luke sent it to the team for " + S.dayWords(sbDate)), { at: iso(0, 9), by: "Atlas", what: "Atlas: Showing as upcoming in Spotify for Artists — done" }] };

  const surv = { id: "survivors", title: "Survivors", date: d(30), status: "draft", createdAt: iso(-1), createdBy: "Luke", updatedAt: iso(-1), sentAt: null, tight: false,
    pack: { kind: "Self-release", wav: "https://example.com/sample/survivors-master.wav", genre: "Dance" }, steps: [], log: [L(-1, "Luke", "Luke started the pack for " + S.dayWords(d(30)))] };

  const tmDate = d(-12), tmSent = d(-40);
  const tm = { id: "touchme", title: "Touch Me", date: tmDate, status: "scheduled", createdAt: iso(-41), createdBy: "Luke", updatedAt: iso(-12), sentAt: iso(-40), tight: false,
    pack: { kind: "With a label", label: "Sample Records", split: "badscandal 50% · Sample Records 50%", distributor: "RouteNote", deal: "(sample) A made-up deal for the sample only.",
      ...files("touchme"), ...stores, language: "English", lyrics: "(sample) Made-up words for the sample only.\nNothing here is a real lyric.", mood: "euphoric", instruments: "synths, drums", story: "A made-up two-line story for the sample.\nNothing here is real.",
      isrc: "SAMPLE0000001", upc: "0000000000001", storeStatus: "live", spotifyTrack: "https://open.spotify.com/track/sample", video: "https://example.com/sample/touchme-video", page: "https://badscandal.com/touchme" },
    steps: steps(tmDate, tmSent, Object.fromEntries(S.RELEASE_STEPS.map((st) => [st.key, { status: "done", at: iso(-12 - st.days), by: st.owner }]))),
    storeLog: [{ status: "approved", on: d(-30), at: iso(-30), by: "Drop" }, { status: "live", on: tmDate, at: iso(-12), by: "Drop" }],
    editorial: [{ name: "Sample Dance Mix", date: d(-8), by: "Atlas", at: iso(-8) }],
    approvals: { pitch: { by: "Luke", at: iso(-25), text: "(sample) A made-up pitch for the sample only." }, lyrics: { by: "Luke", via: "Alfred", at: iso(-20), text: "(sample) Made-up words for the sample only.\nNothing here is a real lyric.", words: "(sample) yes, final" } },
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
    list: [item("Slow Burn", d(24), "badscandal · Sample Label", today), item("Velvet Night", d(16), "badscandal · Sample Distro", d(-1))], answers: {} };
}

export function sampleDesk(now = Date.now()) {
  const today = S.spDay(now), ago = (min) => now - min * 60000;
  const d = (back) => new Date(Date.parse(today + "T12:00:00Z") - back * 86400000).toISOString().slice(0, 10);
  const U = (min, bot, status, message, duty = "") => ({ id: "u" + min, at: new Date(ago(min)).toISOString(), sp: S.spStamp(ago(min)), bot, status, message, link: "", duty });
  const updates = [U(6, "Ledger", "done", "Wise and PayPal checked: 1 new payment (USD 104.04)"), U(33, "Atlas", "working", "Reading Spotify for Artists for Touch Me"), U(58, "Nova", "info", "Duties reset for today; 2 briefs read")];
  const M = (min, id, from, to, text, needs = "none", extra = {}) => ({ id, at: new Date(ago(min)).toISOString(), sp: S.spStamp(ago(min)), from, to, text, needs, re: "", options: [], kind: "note", resolved: null, ...extra });
  const messages = [
    M(12, "msample0001a", "HQ", "Luke", "HQ check, " + today + " morning: 3 things to look at\n\nNeeds a look:\n- Kevin is blocked: TikTok login expired\n- Laura is late (due 00:30): Log YouTube subscribers\n- Income: 2 payments in Revolut that nobody has sorted yet\n\nRunning:\n- Duties: 3 of 6 done, 1 late, 1 blocked\n- Income logged this month: USD 104.04 + EUR 112.01 received", "none", { kind: "report" }),
    M(40, "msample0002a", "Kevin", "Luke", "TikTok signed me out. I need the 6-digit code TikTok sends to your phone, typed into the secure form (not here).", "action"),
    M(95, "msample0003a", "Nova", "Luke", "Survivors on Fri 11 Dec? Files have to reach Drop by Fri 13 Nov.", "decision", { options: ["Yes, Fri 11 Dec", "Move it to January", "Not this one"],
      recommendations: [{ by: "Nova", option: "Move it to January", why: "Fri 11 Dec is only 6 days after Slow Burn and in the slow holiday weeks: a January Friday gives the pitch time (made up).", at: new Date(ago(90)).toISOString() }] }),
    M(130, "msample0004a", "Claude", "Nova", "Ledger's Northlight row for this month is still pending. Ask Ledger to check the statement email again at 12:00.", "action"),
    M(125, "msample0005a", "Nova", "Claude", "Asked. Ledger will post an update when it has looked.", "none", { re: "msample0004a" }),
    M(300, "msample0006a", "Claude", "all", "From today every bot starts its run with my_day and finishes with post_update. The guide is in read_guide.", "none"),
    /* two things Luke already answered (the "You answered" block): Atlas has looked since, Drop not yet */
    M(200, "msample0007a", "Atlas", "Luke", "OK to pitch Me Dá Seu Body as Dance / House?", "decision", { options: ["Yes", "Pick another genre"], resolved: { by: "Luke", at: new Date(ago(150)).toISOString(), note: "Yes" } }),
    M(240, "msample0008a", "Drop", "Luke", "RouteNote wants the Me Dá Seu Body cover without the web address on it. Can you put a new one in the folder?", "action", { resolved: { by: "Luke", at: new Date(ago(50)).toISOString(), note: "answered" } }),
    M(50, "msample0009a", "Luke", "Drop", "New cover is in the folder now.", "none", { re: "msample0008a" }),
    /* made-up numbered questions (14 Nov 2026): one answered, two still open */
    M(70, "msample0010a", "Verse", "Luke", "Three things about the Me Dá Seu Body lyrics before they go live.", "reply", { questions: [
      { q: "Is the hook sung 4 times, not 5?", answer: "Yes, 4 times", by: "Luke", at: new Date(ago(65)).toISOString() },
      { q: "Is the second verse in Portuguese?", answer: "", by: "", at: "" }, { q: "Does the bridge repeat at the end?", answer: "", by: "", at: "" }] }),
    /* batch 3: Drop asks whether to resubmit the rejected song (made up) */
    /* 16 Nov 2026: a bot proposes a new song; Luke confirms first (made up) */
    M(15, "msample0012p", "Nova", "Luke", "Nova asks: is this correct? Add a new song: Paper Moon, out Fri 27 Nov. Self-release or label: Self-release; Featured artists: Sample Singer; UPC: 0000000000017; Status at the distributor: in moderation. Why: (sample) Luke said yes in chat at 11:40. Nothing changes until you say \"Yes, correct\".", "decision", { options: S.PROPOSE_OPTIONS.slice(),
      proposal: { action: "add", title: "Paper Moon", date: "2026-11-27", pack: { kind: "Self-release", featuring: "Sample Singer", upc: "0000000000017", storeStatus: "in moderation" }, send: false, by: "Nova",
        changes: [{ label: "Title", from: "", to: "Paper Moon" }, { label: "Release day", from: "", to: "Fri 27 Nov" }, { label: "Self-release or label", from: "", to: "Self-release" }, { label: "Featured artists", from: "", to: "Sample Singer" }, { label: "UPC", from: "", to: "0000000000017" }, { label: "Status at the distributor", from: "", to: "in moderation" }] } }),
    M(20, "msample0011a", "Drop", "Luke", "Me Dá Seu Body: ready to resubmit to the distributor? It was rejected: \"(sample) The cover has a web address on it\". What changed: the new cover from the folder is uploaded.", "decision", { options: S.RESUBMIT_OPTIONS.slice(), release: "medaseubody", ask: "resubmit" }),
    /* L12: a new YouTube banner waiting for "Yes, correct" (made up) */
    M(18, "msampleprof2", "Laura", "Luke", "Laura asks: is this correct? A new YouTube banner. Link: https://example.com/sample/yt-banner.jpg. Nothing changes until you say \"Yes, correct\". After that, Laura uploads it by hand. HQ does not log in and does not change YouTube.", "decision", { options: S.PROPOSE_OPTIONS.slice(),
      proposal: { action: "profile", slot: "youtube-banner", platform: "YouTube", kind: "Banner", title: "YouTube banner", link: "https://example.com/sample/yt-banner.jpg", owner: "Laura", by: "Laura",
        changes: [{ label: "Platform", from: "", to: "YouTube" }, { label: "Image", from: "", to: "Banner" }, { label: "New image", from: "", to: "https://example.com/sample/yt-banner.jpg" }, { label: "Rule", from: "", to: "YouTube channel banner" }, { label: "Checked", from: "", to: "2560 x 1440, jpg, 2 MB: nothing to fix" }] } }),
  ];
  messages.sort((a, b) => (a.at < b.at ? 1 : -1)); /* newest first, as the real desk lists them */
  const E = (back, payer, amount, currency, status, account, category, by = "Ledger") => ({ id: "i" + back + payer.length, at: new Date(ago(back * 1440 + 90)).toISOString(), by, date: d(back), payer, amount, currency, status, category, account, reference: "", period: "", source: "", note: "" });
  const entries = [E(0, "Sample Distro", 104.04, "USD", "received", "PayPal", "Self-releases"), E(2, "Northlight Records", 112.01, "EUR", "pending", "Statement only", "Label deals"),
    E(9, "Sample Publishing", 420.5, "USD", "received", "Revolut", "Publishing"), E(34, "Northlight Records", 96.4, "EUR", "received", "Wise", "Label deals"), E(36, "Sample Distro", 88.1, "USD", "received", "PayPal", "Self-releases"),
    /* batch 4 (15 Nov 2026): owed and ready to pay out, and a statement still under the payout line (made up) */
    E(3, "Sample Collecting Society", 61.2, "USD", "payable", "Statement only", "Publishing"), E(4, "Sample Small Store", 7.35, "USD", "statement only", "Statement only", "Self-releases")];
  /* MADE-UP rows as the Revolut reader files them (by HQ): two it could not place ("to sort", in no
     total) and one of Luke's own transfers between his accounts (never income) */
  const R = (back, payer, amount, status) => ({ ...E(back, payer, amount, "EUR", status, "Revolut", "Other", "HQ"), id: "irevsample" + back + payer.length + "x" + amount, reference: "sample-tx-" + back + payer.length + "x" + amount, note: "Read from Revolut" });
  entries.push(R(0, "A. Example", 60, "unsorted"), R(1, "Made-up Studio Ltd", 350, "unsorted"), R(1, "Own savings pocket", 200, "transfer"));
  /* L1 + L9 (18 Nov 2026), made up. One statement still open (due on the source's pay day). One statement
     of USD 110 paid as USD 104.04 in PayPal and USD 100 in Revolut, so the route's fee is the gap.
     One Wise payout in EUR that landed in USD, so the exchange is "not enough data". */
  const pp = entries.find((e) => e.payer === "Sample Distro" && e.amount === 104.04);
  pp.id = "isamplepp01"; pp.source = "distro"; pp.movedTo = "isamplerev01";
  const wise = entries.find((e) => e.payer === "Northlight Records" && e.account === "Wise");
  wise.id = "isamplewise1"; wise.source = "northlight"; wise.movedTo = "isamplerev02";
  entries.push(
    { id: "isamplerev01", at: pp.at, by: "Ledger", date: today, payer: "Sample Distro", amount: 100, currency: "USD", status: "received", category: "Self-releases", account: "Revolut", reference: "", period: "", source: "distro", note: "From PayPal", from: ["isamplepp01"] },
    { id: "isamplestmt1", at: new Date(ago(20 * 1440)).toISOString(), by: "Ledger", date: d(20), payer: "Sample Distro", amount: 110, currency: "USD", status: "pending", category: "Self-releases", account: "Statement only", reference: "", period: "", source: "distro", note: "", paidBy: "isamplepp01" },
    { id: "isamplestmt2", at: new Date(ago(8 * 1440)).toISOString(), by: "Ledger", date: today.slice(0, 7) + "-01", payer: "Sample Distro", amount: 40, currency: "USD", status: "statement only", category: "Self-releases", account: "Statement only", reference: "", period: "", source: "distro", note: "" },
    { id: "isamplerev02", at: wise.at, by: "Ledger", date: wise.date, payer: "Northlight Records", amount: 100, currency: "USD", status: "received", category: "Label deals", account: "Revolut", reference: "", period: "", source: "northlight", note: "From Wise", from: ["isamplewise1"] });
  const checks = [{ at: new Date(ago(6)).toISOString(), day: today, by: "Ledger", account: "Wise", new: 0, note: "" }, { at: new Date(ago(6)).toISOString(), day: today, by: "Ledger", account: "PayPal", new: 1, note: "" },
    { at: new Date(ago(200)).toISOString(), day: today, by: "HQ", account: "Revolut", new: 2, note: "" }];
  const seen = Object.fromEntries(["Ledger", "Atlas", "Nova", "Steve", "Forge", "Drop"].map((n, i) => [n, { at: new Date(ago(6 + i * 27)).toISOString(), tool: "post_update" }]));
  seen.Claude = { at: new Date(ago(130)).toISOString(), tool: "send_message" };
  /* read markers (V6): the same six read their messages when they last came (my_day); so Luke's answer
     to Atlas reads "Read by Atlas", his reply to Drop "Not read yet", and Claude's note to everyone
     "Read by 6 of 14" */
  const read = Object.fromEntries(Object.entries(seen).filter(([n]) => n !== "Claude").map(([n, v]) => [n, { at: v.at }]));
  return { roster: ROSTER, updates, messages, cards: { atlas: { workingOn: "Backfilling Touch Me's daily rows to release day", needs: "", at: new Date(ago(200)).toISOString() }, kevin: { workingOn: "TikTok banner", needs: "Luke's phone code for TikTok", at: new Date(ago(400)).toISOString() } },
    seen, income: S.incomeReport(entries, checks, SOURCES.map((s) => ({ match: [], category: "Other", currency: "", lands: "", how: "", blocker: "", needsLuke: "", ...s })), today), config: { botsOn: true, changedAt: null },
    releases: sampleReleases(now), read, sightings: sampleSightings(now),
    /* L5: one made-up claim so the panel has a shape under the SAMPLE banner. Mail stays not connected. */
    claims: { items: [{ key: "sampleclaimsample|samplechannel|2026-11-01", song: "Slow Burn", claim: "Sample claim (sample)", claimant: "Sample Channel", impact: "one video flagged", date: "2026-11-01", by: "Laura" }] },
    /* one case waiting on Luke (Needs you) and one RouteNote case the bot is still running. Made up. */
    disputes: [
      { id: "dsampleyt", issue: "A Content ID claim on one of our own videos.", song: "Slow Burn", songKey: "slowburn", platform: "YouTube", type: "Content ID claim", opened: d(1), owner: "Laura", status: "waiting on Luke", waitingOn: "Luke", waitingSince: new Date(ago(180)).toISOString(), nextCheck: d(-1), claimId: "sampleclaimsample|samplechannel|2026-11-01", recommendation: "The claim is on one video of ours. Ask them to release it.", proposal: "Hello. This video is our own recording. Please release the claim.", decision: null, timeline: [{ at: new Date(ago(180)).toISOString(), by: "Laura", text: "Opened. Content ID claim with YouTube." }], createdAt: new Date(ago(180)).toISOString(), updatedAt: new Date(ago(180)).toISOString() },
      /* v18 (21 Nov 2026): a decision card with a draft email (made up), so the preview shows Reply -> the email */
      { id: "dsamplemail", issue: "RouteNote flagged the featured artist's name as spelled wrong.", song: "Paper Moon", songKey: "papermoon", platform: "RouteNote", type: "moderation", opened: d(3), owner: "Drop", status: "waiting on Luke", waitingOn: "RouteNote", waitingSince: new Date(ago(90)).toISOString(), nextCheck: d(-3), claimId: "", recommendation: "Send it today: the release is close and moderation is slow.", proposal: "To: moderation@example.com\nCC: team@example.com\nSubject: Paper Moon: artist name fixed\nBody: Hi team,\n\nWe fixed the featured artist's name on Paper Moon.\nPlease review it again.\n\nThanks,\nbadscandal", decision: null, timeline: [{ at: new Date(ago(90)).toISOString(), by: "Drop", text: "Opened. moderation with RouteNote." }], createdAt: new Date(ago(90)).toISOString(), updatedAt: new Date(ago(90)).toISOString() },
      /* 23 Nov 2026: one closed case, so "resolved" shows what it was about and how it ended (made up) */
      { id: "dsampledone", song: "Touch Me", songKey: "touchme", platform: "RouteNote", type: "moderation", opened: d(9), owner: "Drop", status: "resolved", waitingOn: "", waitingSince: "", nextCheck: "", claimId: "", recommendation: "", proposal: "", issue: "RouteNote held the release over a missing songwriter credit.", outcome: "RouteNote accepted the added credit and approved the release.", closedAt: new Date(ago(3 * 1440)).toISOString(), decision: null, timeline: [{ at: new Date(ago(3 * 1440)).toISOString(), by: "Drop", text: "RouteNote approved it." }], createdAt: new Date(ago(9 * 1440)).toISOString(), updatedAt: new Date(ago(3 * 1440)).toISOString() },
      { id: "dsamplern", issue: "RouteNote asked whether we own the cover photo.", song: "Me Dá Seu Body", songKey: "medaseubody", platform: "RouteNote", type: "moderation", opened: d(2), owner: "Drop", status: "waiting on them", waitingOn: "RouteNote", waitingSince: new Date(ago(400)).toISOString(), nextCheck: d(-2), claimId: "", recommendation: "Wait for their reply. The cover they asked about is already replaced.", proposal: "", decision: null, timeline: [{ at: new Date(ago(400)).toISOString(), by: "Drop", text: "Opened. moderation with RouteNote." }], createdAt: new Date(ago(400)).toISOString(), updatedAt: new Date(ago(400)).toISOString() },
    ],
    /* L12: a live Spotify header, and an Instagram photo Luke already said yes to (made-up links) */
    profiles: { slots: {
      "spotify-header": { current: { link: "https://example.com/sample/spotify-header.jpg", changed: d(40), by: "Atlas", at: new Date(ago(40 * 1440)).toISOString() } },
      "instagram-photo": { current: { link: "https://example.com/sample/ig-now.jpg", changed: d(20), by: "Steve", at: new Date(ago(20 * 1440)).toISOString() },
        approved: { link: "https://example.com/sample/ig-next.jpg", by: "Steve", at: new Date(ago(30)).toISOString(), msg: "msampleprof1" } },
    } } };
}

/* MADE-UP state of the Revolut reader for /hq?sample=1 (GET /api/bank/status?sample=1): connected,
   read this morning at 06:50 São Paulo (09:50 UTC), 2 payments in, the approval good for 86 more days.
   The account names are invented; nothing is opened or asked of any bank. */
export function sampleBankStatus(now = Date.now()) {
  const d = new Date(now), at = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 9, 50);
  const read = new Date(at <= now ? at : at - 86400000).toISOString();
  return { configured: true, connected: true, needsApproval: false, aspsp: "Revolut", validUntil: new Date(now + 86.5 * 86400000).toISOString(), daysLeft: 86, expiring: false,
    accounts: [{ name: "Current", currency: "EUR", last4: "0001" }, { name: "Savings", currency: "EUR", last4: "0002" }, { name: "Current", currency: "USD", last4: "0003" }], /* made up */
    lastRunAt: read, lastOkAt: read, lastError: null, lastAdded: 2, partial: false, canConnectHere: true };
}

export function sampleBoard(now = Date.now()) {
  const today = S.spDay(now), desk = sampleDesk(now);
  desk.contentIdeas = { latest: { at: new Date(now - 3600000).toISOString(), by: "Spark", day: today,
    best: { platform: "Instagram", title: "Northwind clip", views: 10000, likes: 400, comments: 20, saves: 80, shares: 40, perView: 0.054, link: "https://example.com/northwind" },
    ideas: [
      { hook: "Open on the drop", text: "Northwind", format: "Reel", platform: "Instagram", why: "The clip's first second holds." },
      { hook: "One line, then the beat", text: "Stay for the beat", format: "short", platform: "TikTok", why: "Similar artists' outliers start with one line." },
      { hook: "The chorus, no intro", text: "Chorus first", format: "short", platform: "YouTube", why: "The official clip with the chorus first had the higher rate." },
    ],
    compared: "A similar artist's outlier opened on the chorus." } };
  const sheets = sampleSheets(today, now);
  const hq = hqModel(sheets, today, {}, sampleMeta(sheets, today), S.spHM(now), { updates: desk.updates, overlay: S.dutyOverlay(desk.updates, today),
    releases: desk.releases.filter((r) => r.status !== "cancelled").map((r) => S.releaseView(r, today, { sightings: desk.sightings })), sightings: desk.sightings });
  return { ...S.board(desk, now, hq), hqRead: true, keys: { bots: true, claude: true } };
}
