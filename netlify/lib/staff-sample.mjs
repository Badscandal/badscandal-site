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
  ];
  const E = (back, payer, amount, currency, status, account, category, by = "Ledger") => ({ id: "i" + back + payer.length, at: new Date(ago(back * 1440 + 90)).toISOString(), by, date: d(back), payer, amount, currency, status, category, account, reference: "", period: "", source: "", note: "" });
  const entries = [E(0, "Sample Distro", 104.04, "USD", "received", "PayPal", "Self-releases"), E(2, "Northlight Records", 112.01, "EUR", "pending", "Statement only", "Label deals"),
    E(9, "Sample Publishing", 420.5, "USD", "received", "Wise", "Publishing"), E(34, "Northlight Records", 96.4, "EUR", "received", "Bank", "Label deals"), E(36, "Sample Distro", 88.1, "USD", "received", "PayPal", "Self-releases")];
  const checks = [{ at: new Date(ago(6)).toISOString(), day: today, by: "Ledger", account: "Wise", new: 0, note: "" }, { at: new Date(ago(6)).toISOString(), day: today, by: "Ledger", account: "PayPal", new: 1, note: "" }];
  const seen = Object.fromEntries(["Ledger", "Atlas", "Nova", "Steve", "Forge", "Drop"].map((n, i) => [n, { at: new Date(ago(6 + i * 27)).toISOString(), tool: "post_update" }]));
  seen.Claude = { at: new Date(ago(130)).toISOString(), tool: "send_message" };
  return { roster: ROSTER, updates, messages, cards: { atlas: { workingOn: "Backfilling Touch Me's daily rows to release day", needs: "", at: new Date(ago(200)).toISOString() }, kevin: { workingOn: "TikTok banner", needs: "Luke's phone code for TikTok", at: new Date(ago(400)).toISOString() } },
    seen, income: S.incomeReport(entries, checks, SOURCES.map((s) => ({ match: [], category: "Other", currency: "", lands: "", how: "", blocker: "", needsLuke: "", ...s })), today), config: { botsOn: true, changedAt: null } };
}

export function sampleBoard(now = Date.now()) {
  const today = S.spDay(now), desk = sampleDesk(now);
  const sheets = sampleSheets(today, now);
  const hq = hqModel(sheets, today, {}, sampleMeta(sheets, today), S.spHM(now), { updates: desk.updates, overlay: S.dutyOverlay(desk.updates, today) });
  return { ...S.board(desk, now, hq), hqRead: true, keys: { bots: true, claude: true } };
}
