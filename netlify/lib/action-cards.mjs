/* One-tap action cards (HQ automation, phase 1).
   A bot puts the finished action on a card. Luke answers Yes, No or Edit on the phone.
   The answer is kept with the time and the card's version. An edit after a Yes is a new
   version and needs a new Yes. The card is done only when the owner records proof.
   "Taps count as Luke's yes" is off until Luke switches it on. Payments and signatures
   always stay with him. Nothing here changes an ad, sends mail, or stores a secret. */
import * as S from "./staff.mjs";

export const CARD_KEY = "action-cards.json";
export const AUTO_KEY = "auto.json";
export const KINDS = ["message", "booking", "post", "link", "payment", "signature", "ads", "track", "month", "monday", "other"];
export const WAITING = ["luke", "bot", "label", "store"];
const SELF = new Set(["payment", "signature"]);
const HANDS_OFF = new Set(["payment", "signature", "ads", "monday"]);
export const TAP_OFF = "tap recorded, bot will still confirm with Luke";
export const SELF_LINE = "Luke does this himself";
export const ADS_LINE = "HQ never changes ads. Luke switches them off himself.";
export const MONDAY_LINE = "No amount is chosen. HQ does not change ads.";
const MAKERS = ["Nova", "Claude", "Luke", "HQ"];
const PROVERS = ["Nova", "Claude", "Luke", "HQ"];

const fail = (m, code) => { throw new S.StaffError(m, code); };
const low = (s) => String(s == null ? "" : s).trim().toLowerCase();
const round = (n) => Math.round(Number(n) * 100) / 100;

export function lineFor(kind, tapsOn) {
  if (SELF.has(kind)) return SELF_LINE;
  if (kind === "ads") return ADS_LINE;
  if (kind === "monday") return MONDAY_LINE;
  if (!tapsOn) return TAP_OFF;
  return "Yes counts as Luke's yes for this version.";
}
export function countsAsYes(kind, tapsOn) {
  return !!tapsOn && !HANDS_OFF.has(kind);
}

async function load(store) {
  const { data } = await S.readDoc(store, CARD_KEY, []);
  return Array.isArray(data) ? data : [];
}
export async function getAuto(store) {
  const { data } = await S.readDoc(store, AUTO_KEY, {});
  const d = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  const hooks = d.webhooks && typeof d.webhooks === "object" && !Array.isArray(d.webhooks) ? d.webhooks : {};
  return { tapsCountAsYes: d.tapsCountAsYes === true, webhooks: hooks, changedAt: d.changedAt || null };
}
function hostOf(url) {
  try { return new URL(url).host; } catch { return ""; }
}
export function webhookUrl(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (!s) return "";
  if (s.length > 400) fail("The address is too long (400 characters at most).");
  let u;
  try { u = new URL(s); } catch { fail("The address must be a full https:// link."); }
  if (u.protocol !== "https:") fail("The address must start with https://. Nothing was saved.");
  if (u.username || u.password) fail("Don't put a name or password in front of the address. Nothing was saved.");
  if (/(?:\d[ -]?){13,19}/.test(s) || /-----BEGIN /.test(s)) fail("That address looks like a card or a key. Paste the webhook address only.");
  return s;
}
export function autoPublic(auto, roster) {
  const names = (roster || []).map((b) => b.name);
  return {
    tapsCountAsYes: auto.tapsCountAsYes === true,
    tapsLine: auto.tapsCountAsYes
      ? "Taps count as Luke's yes: on. Payments and signatures still say Luke does this himself."
      : "Taps count as Luke's yes: off. " + TAP_OFF + ". Payments and signatures always stay with Luke.",
    webhooks: names.map((bot) => {
      const row = auto.webhooks && auto.webhooks[bot];
      const url = row && row.url ? String(row.url) : "";
      return { bot, on: !!url, host: url ? hostOf(url) : "", ...(row && row.error ? { error: String(row.error).slice(0, 80) } : {}) };
    }),
  };
}
export async function setAuto(store, now, a) {
  const by = S.whoIs(a.by, a.roster || S.DEFAULT_ROSTER, { people: true });
  if (by !== "Luke") fail("Only Luke changes this. Nothing was saved.", "not_allowed");
  const taps = typeof a.tapsCountAsYes === "boolean" ? a.tapsCountAsYes : null;
  let hook = null;
  if (a.webhook && typeof a.webhook === "object") {
    const bot = S.whoIs(a.webhook.bot, a.roster || S.DEFAULT_ROSTER);
    hook = { bot, url: webhookUrl(a.webhook.url) };
  }
  if (taps == null && !hook) fail("Nothing to change: tapsCountAsYes, or a webhook address.");
  return S.mutate(store, AUTO_KEY, {}, (doc) => {
    const d = doc && typeof doc === "object" && !Array.isArray(doc) ? doc : {};
    if (!d.webhooks || typeof d.webhooks !== "object" || Array.isArray(d.webhooks)) d.webhooks = {};
    if (taps != null) d.tapsCountAsYes = taps;
    if (hook) {
      if (!hook.url) delete d.webhooks[hook.bot];
      else d.webhooks[hook.bot] = { url: hook.url, at: new Date(now).toISOString() };
    }
    d.changedAt = new Date(now).toISOString();
    d.changedBy = "Luke";
    return { replace: d, value: d };
  });
}

function deadlineOf(v) {
  const s = S.clean(v, 16);
  if (!s) return "";
  if (!/^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?$/.test(s)) fail("deadline must be YYYY-MM-DD or YYYY-MM-DD HH:MM (São Paulo).");
  return s;
}
/* 23:00–08:00 São Paulo. Only a money-at-risk card may sit on Needs you in that window. */
export function quietNow(now) {
  const hm = S.spHM(now);
  return hm >= "23:00" || hm < "08:00";
}
export function isExpired(card, now) {
  if (!card || !card.expiresAt) return false;
  const t = Date.parse(card.expiresAt);
  return Number.isFinite(t) && t <= now;
}
function expiresOf(v) {
  const s = String(v == null ? "" : v).trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) {
    const t = Date.parse(s.replace(" ", "T") + ":00-03:00");
    if (!Number.isFinite(t)) fail("expires_at could not be read.");
    return new Date(t).toISOString();
  }
  const t = Date.parse(s);
  if (!Number.isFinite(t)) fail("expires_at must be an ISO time, or YYYY-MM-DD HH:MM in São Paulo.");
  return new Date(t).toISOString();
}
function dedupeOf(v) {
  const s = S.clean(v, 80);
  if (!s) fail("dedupe_key is required, so the same item is never posted twice.");
  if (!/^[A-Za-z0-9._:-]{2,80}$/.test(s)) fail("dedupe_key uses letters, digits and . _ : - only.");
  return s;
}
function moneyFlag(a, money, kind) {
  if (kind === "payment") return true;
  if (a.money_at_risk === false && money.amount == null) return false;
  if (a.money_at_risk === true) return true;
  return money.amount != null;
}
export function daysWaiting(from, now) {
  const raw = String(from || "");
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + "T12:00:00Z" : raw);
  if (!Number.isFinite(t) || now == null) return null;
  return Math.max(0, Math.floor((now - t) / 86400000));
}
/* "EUR 4 · USD 12 at risk": the money_at_risk amounts of these cards, by currency. "" when there are none. */
export function moneyLine(cards) {
  const sums = {};
  for (const c of cards || []) {
    if (!c || !c.money_at_risk || c.amount == null || !c.currency) continue;
    sums[c.currency] = round((sums[c.currency] || 0) + Number(c.amount));
  }
  const rest = Object.keys(sums).filter((k) => k !== "EUR" && k !== "USD").sort();
  const bits = ["EUR", "USD", ...rest].filter((k) => sums[k] != null).map((k) => `${k} ${String(round(sums[k]))}`);
  return bits.length ? bits.join(" · ") + " at risk" : "";
}
/* A Farm or Label workspace's own Needs you line (its cards are the only thing that needs Luke there). */
export function needsHeader(cards) {
  const list = cards || [];
  return `${list.length} need you · ${moneyLine(list) || "nothing at risk"}`;
}

/* THE Needs you count for BADSCANDAL (18 Nov 2026, handoff bug 1: the phone said "1 need you · 11 at risk" and
   "0 need you · nothing at risk" on one screen, and the needs_you tool said open: 0). One rule, used by the board
   (the phone's line) and the needs_you tool, and the same as js/hq-look.js needTotal():
     decisions = open messages to Luke that need a decision and carry options (lyrics and pitch approvals too)
     cards     = his open Yes/No/Edit cards, including the ones held for the morning in quiet hours
     accounts  = accounts whose health is red, and the HQ connection when it is down
   Alerts (late steps, the cap, quiet bots...) are NOT in it: the phone calls those "to check". */
export function decisionsForLuke(messages) {
  return (messages || []).filter((m) => m && !m.resolved && m.to === "Luke" && m.needs === "decision" && Array.isArray(m.options) && m.options.length > 0);
}
export function redAccounts(report) {
  const out = ((report && report.accounts) || []).filter((a) => a && a.state === "red").map((a) => ({ id: a.id || "", label: a.label || "" }));
  if (report && report.connection && report.connection.state === "down") out.push({ id: "connection", label: "HQ connection" });
  return out;
}
export const needLine = (n) => (n ? `${n} need you` : "Nothing needs you");
export function needsCount({ messages, cards, report } = {}) {
  const decisions = decisionsForLuke(messages);
  const live = (cards && cards.needsYou) || [], held = (cards && cards.held) || [];
  const red = redAccounts(report);
  const total = decisions.length + live.length + held.length + red.length;
  return { total, decisions: decisions.length, cards: live.length + held.length, held: held.length, accounts: red.length, line: needLine(total),
    money: moneyLine([...live, ...held]) };
}
function moneyOf(a) {
  const has = a.amount != null && String(a.amount).trim() !== "";
  if (!has) return { amount: null, currency: "" };
  const amount = S.amountOf(a.amount);
  if (amount == null || amount < 0) fail("amount must be a number, as written (for example 12.50). If you could not see it, leave it out.");
  const currency = S.clean(a.currency, 8).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) fail("currency must be the three-letter code the amount was written in. HQ does not convert it.");
  return { amount: round(amount), currency };
}
function currentAnswer(card) {
  const list = card.answers || [];
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    if (a && a.version === card.version && (a.choice === "yes" || a.choice === "no")) return a;
  }
  return null;
}
export function mayAct(card) {
  const a = currentAnswer(card);
  if (!a || a.choice !== "yes") return false;
  if (HANDS_OFF.has(card.kind)) return false;
  return a.counts === true;
}
export function botCard(card) {
  const a = currentAnswer(card);
  return {
    id: card.id, version: card.version, kind: card.kind, status: card.status, owner: card.owner, owner_bot: card.owner,
    dedupe_key: card.dedupeKey || "", action: card.action || "",
    expires_at: card.expiresAt || "", money_at_risk: card.moneyAtRisk === true,
    ...(card.ticket ? { ticket: card.ticket } : {}),
    ...(card.duplicate ? { duplicate: true } : {}),
    text: card.text, recipient: card.recipient || "", preview: card.preview || "",
    ...(card.amount != null ? { amount: card.amount, currency: card.currency } : {}),
    ...(card.link ? { link: card.link } : {}),
    ...(card.deadline ? { deadline: card.deadline } : {}),
    waiting_on: card.waitingOn,
    answer: a ? { choice: a.choice, at: a.at, version: a.version, counts: a.counts === true, line: a.line, text: a.text } : null,
    may_act: mayAct(card),
    needs_proof: card.status !== "done" && !!(a && a.choice === "yes"),
    ...(card.proof ? { proof: card.proof } : {}),
    line: a ? a.line : lineFor(card.kind, false),
  };
}
/* what the bot is told: the line that was true when Luke tapped, not a later switch */
export function answersForList(cards, name) {
  const mine = name === "Claude" ? cards : (cards || []).filter((c) => c.owner === name);
  return mine.filter((c) => c.status !== "done").map((c) => {
    const a = currentAnswer(c);
    const view = botCard(c);
    view.line = a ? a.line : lineFor(c.kind, false);
    return view;
  });
}
export async function answersFor(store, name) {
  return answersForList(await load(store), name);
}
/* Before an irreversible step: did Luke tap yes for this exact action and this card version, and when.
   yes is true only when that tap counts. Payments and signatures never return yes. */
export function lukeTap(card, ask = {}, now = Date.now()) {
  const action = low(ask.action);
  const version = ask.version != null && String(ask.version).trim() !== "" ? Number(ask.version) : null;
  const base = { found: !!card, yes: false, tapped: false, at: "", counts: false, expired: card ? isExpired(card, now) : false,
    id: card ? card.id : "", owner_bot: card ? card.owner : "", dedupe_key: card ? card.dedupeKey || "" : "",
    action: card ? card.action || "" : "", version: card ? card.version : null };
  if (!card) return { ...base, line: "There is no card for that action." };
  const wantId = ask.id ? S.clean(ask.id, 24) : "";
  const wantKey = ask.dedupe_key || ask.dedupeKey ? S.clean(ask.dedupe_key || ask.dedupeKey, 80) : "";
  if ((wantId && wantId !== card.id) || (wantKey && wantKey !== card.dedupeKey)) return { ...base, found: false, line: "That id and dedupe_key are not the same card." };
  if (!action || version == null || !Number.isFinite(version)) return { ...base, line: "Give the action and the card version before you do it." };
  if (low(card.action || "") !== action) return { ...base, line: "Luke's answer is for a different action." };
  if (version !== card.version) return { ...base, line: "Luke has not said yes to this version." };
  if (base.expired) return { ...base, line: "That card has expired. Ask for a new one." };
  const ans = currentAnswer(card);
  if (!ans || ans.choice !== "yes" || ans.version !== card.version) return { ...base, line: "Luke has not tapped yes." };
  const allowed = ans.counts === true && !HANDS_OFF.has(card.kind);
  return { ...base, tapped: true, at: ans.at, counts: ans.counts === true, yes: allowed, line: ans.line };
}
export async function checkTap(store, ask, now = Date.now()) {
  const cards = await load(store);
  const id = ask && ask.id ? S.clean(ask.id, 24) : "";
  const key = ask && (ask.dedupe_key || ask.dedupeKey) ? S.clean(ask.dedupe_key || ask.dedupeKey, 80) : "";
  const card = cards.find((c) => (id && c.id === id) || (key && c.dedupeKey === key)) || null;
  return lukeTap(card, ask || {}, now);
}

export function cardWorkspace(c) {
  const w = low(c && c.workspace);
  return w === "farm" || w === "label" ? w : "badscandal";
}
export function cardsFor(cards, ws) {
  const want = ws === "farm" || ws === "label" ? ws : "badscandal";
  return (cards || []).filter((c) => cardWorkspace(c) === want);
}
function workspaceOf(v, fallback) {
  if (v == null || String(v).trim() === "") return fallback || "badscandal";
  const s = low(v);
  if (s === "badscandal" || s === "farm" || s === "label") return s;
  fail("workspace must be badscandal, farm or label. Nothing was saved.");
}
function scrub(card) {
  const blob = [card.text, card.preview, card.recipient, card.link].filter(Boolean).join("\n");
  const what = S.secretIn(blob);
  if (what) fail(`That looks like ${what}. Never write passwords, codes, keys, card or bank account numbers here.`);
}

export async function saveCard(store, now, roster, a) {
  const by = S.whoIs(a.by, roster, { people: true });
  const id = a.id ? S.clean(a.id, 24) : "";
  const kind = low(a.kind);
  if (!KINDS.includes(kind)) fail(`kind must be one of: ${KINDS.join(", ")}.`);
  const text = S.cleanText(a.text, 600);
  if (text.length < 2) fail("text is the finished action, exactly. It is empty.");
  const preview = S.cleanText(a.preview != null && String(a.preview).trim() ? a.preview : text, 400);
  const recipient = S.clean(a.recipient, 80);
  const link = a.link != null && String(a.link).trim() ? S.httpsLink(a.link) : "";
  if (a.link != null && String(a.link).trim() && !link) fail("link must start with https://.");
  const deadline = a.deadline != null && String(a.deadline).trim() ? deadlineOf(a.deadline) : "";
  const money = moneyOf(a);
  const waitingOn = a.waiting_on != null && String(a.waiting_on).trim() ? low(a.waiting_on) : "luke";
  if (!WAITING.includes(waitingOn)) fail("waiting_on must be luke, bot, label or store.");
  let owner = a.owner ? S.whoIs(a.owner, roster) : (S.PEOPLE.includes(by) ? "" : by);
  if (!owner && !id) fail("owner is the bot who carries this out.");
  if (owner && owner !== by && !MAKERS.includes(by)) fail(`That card would be ${owner}'s. Only ${owner} (or Nova) creates it.`, "not_allowed");
  const action = S.clean(a.action, 80);
  const ticket = S.clean(a.ticket, 80);
  const at = new Date(now).toISOString();
  return S.mutate(store, CARD_KEY, [], (list) => {
    const rows = Array.isArray(list) ? list : [];
    if (!id) {
      const key = dedupeOf(a.dedupe_key != null ? a.dedupe_key : a.dedupeKey);
      const existing = rows.find((c) => c.dedupeKey === key);
      if (existing) return { skip: true, value: { ...existing, duplicate: true } };
      const next = { kind, text, preview, recipient, link, deadline, waitingOn, action, ticket, workspace: workspaceOf(a.workspace), dedupeKey: key, expiresAt: expiresOf(a.expires_at != null ? a.expires_at : a.expiresAt), moneyAtRisk: moneyFlag(a, money, kind), ...money };
      scrub(next);
      if (rows.length >= 80) {
        const drop = rows.findIndex((c) => c.status === "done");
        if (drop >= 0) rows.splice(drop, 1);
        else fail("The card list is full. Tell Claude.", "limit");
      }
      const card = { id: S.newId("k", now), owner, version: 1, status: "open", answers: [], proof: null, createdAt: at, createdBy: by, updatedAt: at, ...next };
      rows.push(card);
      return { value: card };
    }
    const cur = rows.find((c) => c.id === id);
    if (!cur) fail("There is no card with that id.", "not_found");
    if (cur.status === "done") fail("That card is done. A change needs a new card.");
    if (cur.owner !== by && !MAKERS.includes(by)) fail(`That card is ${cur.owner}'s.`, "not_allowed");
    const key = a.dedupe_key != null || a.dedupeKey != null ? dedupeOf(a.dedupe_key != null ? a.dedupe_key : a.dedupeKey) : cur.dedupeKey;
    if (key !== cur.dedupeKey && rows.some((c) => c.dedupeKey === key)) fail("Another card already uses that dedupe_key.");
    const sentAmount = a.amount != null && String(a.amount).trim() !== "";
    const next = {
      kind, text,
      preview: a.preview != null && String(a.preview).trim() ? preview : (cur.preview || text),
      recipient: a.recipient != null ? recipient : (cur.recipient || ""),
      link: a.link != null ? link : (cur.link || ""),
      deadline: a.deadline != null && String(a.deadline).trim() ? deadline : (a.deadline != null ? "" : (cur.deadline || "")),
      waitingOn: a.waiting_on != null && String(a.waiting_on).trim() ? waitingOn : cur.waitingOn,
      action: a.action != null ? action : (cur.action || ""),
      ticket: a.ticket != null ? ticket : (cur.ticket || ""),
      dedupeKey: key,
      workspace: a.workspace != null ? workspaceOf(a.workspace) : cardWorkspace(cur),
      expiresAt: a.expires_at != null || a.expiresAt != null ? expiresOf(a.expires_at != null ? a.expires_at : a.expiresAt) : (cur.expiresAt || ""),
      amount: sentAmount ? money.amount : (cur.amount ?? null),
      currency: sentAmount ? money.currency : (cur.currency || ""),
      moneyAtRisk: a.money_at_risk != null || sentAmount || kind === "payment" ? moneyFlag(sentAmount ? a : { ...a, amount: cur.amount, currency: cur.currency }, sentAmount ? money : { amount: cur.amount ?? null, currency: cur.currency || "" }, kind) : cur.moneyAtRisk === true,
    };
    scrub(next);
    const changed = ["kind", "text", "preview", "recipient", "link", "deadline", "waitingOn", "amount", "currency", "action", "ticket", "dedupeKey", "expiresAt", "moneyAtRisk", "workspace"].some((k) => (k === "workspace" ? cardWorkspace(cur) : (cur[k] ?? "")) !== (next[k] ?? ""));
    if (!changed) return { skip: true, value: cur };
    Object.assign(cur, next, { version: (cur.version || 1) + 1, status: "open", updatedAt: at, updatedBy: by });
    return { value: cur };
  });
}
function PEOPLE_BOT(by) { return MAKERS.includes(by); }

export async function answerCard(store, now, roster, a) {
  const by = S.whoIs(a.by, roster, { people: true });
  if (by !== "Luke") fail("Only Luke answers a card.", "not_allowed");
  const id = S.clean(a.id, 24);
  const choice = low(a.choice);
  if (!["yes", "no", "edit"].includes(choice)) fail("choice must be yes, no or edit.");
  const auto = await getAuto(store);
  const tapsOn = auto.tapsCountAsYes === true;
  const at = new Date(now).toISOString();
  return S.mutate(store, CARD_KEY, [], (list) => {
    const cur = (Array.isArray(list) ? list : []).find((c) => c.id === id);
    if (!cur) fail("There is no card with that id.", "not_found");
    if (cur.waitingOn !== "luke") fail(`That one is waiting on the ${cur.waitingOn}, not on Luke. Nothing was answered.`);
    if (cur.status === "done") fail("That card is already done.");
    if (isExpired(cur, now)) fail("That card has expired. Ask for a new one.");
    if (choice === "edit") {
      const text = S.cleanText(a.text, 600);
      if (text.length < 2) fail("Edit needs the new text.");
      if (S.secretIn(text)) fail("That looks like a password, a code or a key. Nothing was saved.");
      if (text === cur.text) return { skip: true, value: cur };
      cur.text = text;
      cur.preview = text;
      cur.version = (cur.version || 1) + 1;
      cur.status = "open";
      cur.updatedAt = at;
      cur.answers = (cur.answers || []).concat({ choice: "edit", at, version: cur.version, text, counts: false, line: "Edited. This version needs a new Yes." }).slice(-12);
      return { value: cur };
    }
    const prev = currentAnswer(cur);
    if (prev && prev.choice === choice) return { skip: true, value: cur };
    const counts = choice === "yes" && countsAsYes(cur.kind, tapsOn);
    const line = choice === "no" ? "No." : lineFor(cur.kind, tapsOn);
    cur.answers = (cur.answers || []).concat({ choice, at, version: cur.version, text: cur.text, counts, line, tapsOn }).slice(-12);
    cur.status = choice === "yes" ? "answered" : "no";
    cur.updatedAt = at;
    return { value: cur };
  });
}

export async function recordProof(store, now, roster, a) {
  const by = S.whoIs(a.by, roster, { people: true });
  const id = S.clean(a.id, 24);
  const messageId = S.clean(a.messageId, 80);
  const bookingRef = S.clean(a.bookingRef, 40);
  const link = a.link != null && String(a.link).trim() ? S.httpsLink(a.link) : "";
  if (a.link != null && String(a.link).trim() && !link) fail("proof link must start with https://.");
  if (!messageId && !bookingRef && !link) fail("Proof needs a message id, a booking reference, or an https link. Nothing was marked done.");
  if (S.secretIn([messageId, bookingRef, link].join(" "))) fail("That proof looks like a password, a code or a key. Nothing was saved.");
  const at = new Date(now).toISOString();
  return S.mutate(store, CARD_KEY, [], (list) => {
    const cur = (Array.isArray(list) ? list : []).find((c) => c.id === id);
    if (!cur) fail("There is no card with that id.", "not_found");
    if (cur.owner !== by && !PROVERS.includes(by)) fail(`That card is ${cur.owner}'s to close.`, "not_allowed");
    if (cur.status === "done" && cur.proof) return { skip: true, value: cur };
    if (cur.waitingOn === "luke") {
      const ans = currentAnswer(cur);
      if (!ans || ans.choice !== "yes") fail("Luke has not said yes to this version. Nothing was marked done.");
    }
    cur.proof = { at, by, ...(messageId ? { messageId } : {}), ...(bookingRef ? { bookingRef } : {}), ...(link ? { link } : {}), version: cur.version };
    cur.status = "done";
    cur.updatedAt = at;
    return { value: cur };
  });
}

export function sortForLuke(cards) {
  const rank = (c) => (c === "USD" ? "0" : c === "EUR" ? "1" : "2" + (c || ""));
  return (cards || []).slice().sort((a, b) => {
    const ar = a.moneyAtRisk === true || a.money_at_risk === true, br = b.moneyAtRisk === true || b.money_at_risk === true;
    if (ar !== br) return ar ? -1 : 1;
    const am = a.amount != null, bm = b.amount != null;
    if (am !== bm) return am ? -1 : 1;
    if (am && bm) {
      const ca = String(a.currency || ""), cb = String(b.currency || "");
      if (ca !== cb) return rank(ca) < rank(cb) ? -1 : 1;
      if (a.amount !== b.amount) return b.amount - a.amount;
    }
    const da = a.deadline || "9999", db = b.deadline || "9999";
    if (da !== db) return da < db ? -1 : 1;
    return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  });
}

const STORE_WAIT = {
  uploaded: "the distributor has it",
  "in moderation": "the distributor is reviewing it",
  rejected: "the distributor sent it back",
  resubmitted: "it is back with the distributor",
};
function laneItem(extra) {
  return { ticket: "", days: null, ...extra };
}
export function othersLane({ cards, messages, releases, roster, now = Date.now() }) {
  const bots = new Set((roster || S.DEFAULT_ROSTER).map((b) => b.name));
  const out = [];
  for (const c of cards || []) {
    if (!c || c.waitingOn === "luke" || c.status === "done" || c.status === "no") continue;
    out.push(laneItem({ key: "c:" + c.id, who: c.waitingOn, name: c.waitingOn === "bot" ? c.owner : c.waitingOn, owner_bot: c.owner || "", text: c.preview || c.text, tone: "", ticket: c.ticket || "", days: daysWaiting(c.createdAt, now) }));
  }
  for (const m of messages || []) {
    if (!m || !S.isOpen(m) || !bots.has(m.to)) continue;
    const bad = /site check failed/i.test(m.text || "");
    out.push(laneItem({ key: "m:" + m.id, who: "bot", name: m.to, owner_bot: m.to, text: S.clean(`${m.from}: ${m.text}`, 180), tone: bad ? "bad" : "", href: "#messages/" + m.id, days: daysWaiting(m.at, now) }));
  }
  for (const r of releases || []) {
    if (!r || r.status === "cancelled") continue;
    const st = low((r.pack && r.pack.storeStatus) || r.storeStatus || "");
    if (!STORE_WAIT[st]) continue;
    const log = Array.isArray(r.storeLog) ? r.storeLog.filter((x) => x && low(x.status) === st) : [];
    const last = log[log.length - 1];
    const since = last && last.at ? last.at : last && last.on ? last.on + "T12:00:00Z" : r.updatedAt || "";
    out.push(laneItem({ key: "r:" + (r.id || r.title), who: "store", name: "store", text: `${r.title}: ${STORE_WAIT[st]}`, tone: st === "rejected" ? "bad" : "", ticket: (r.pack && r.pack.ticket) || r.ticket || "", days: daysWaiting(since, now) }));
  }
  return out.slice(0, 20);
}

function lukeView(c, tapsOn) {
  return {
    id: c.id, version: c.version, kind: c.kind, owner: c.owner, owner_bot: c.owner,
    dedupe_key: c.dedupeKey || "", action: c.action || "",
    expires_at: c.expiresAt || "", money_at_risk: c.moneyAtRisk === true,
    preview: c.preview || c.text, text: c.text,
    recipient: c.recipient || "", ...(c.amount != null ? { amount: c.amount, currency: c.currency } : {}),
    ...(c.link ? { link: c.link } : {}), ...(c.deadline ? { deadline: c.deadline } : {}),
    line: lineFor(c.kind, tapsOn), self: SELF.has(c.kind),
  };
}
export function lukeCards(cards, tapsOn, now = Date.now()) {
  const open = (cards || []).filter((c) => c && c.waitingOn === "luke" && c.status === "open" && !isExpired(c, now));
  return sortForLuke(open).map((c) => lukeView(c, tapsOn));
}
function present(cards, tapsOn, now) {
  const all = lukeCards(cards, tapsOn, now);
  const quiet = quietNow(now);
  const needsYou = quiet ? all.filter((c) => c.money_at_risk) : all;
  const held = quiet ? all.filter((c) => !c.money_at_risk) : [];
  return { quiet, needsYou, held, header: needsHeader(needsYou), money: moneyLine(needsYou) };
}
/* During quiet hours the phone shows only money-at-risk cards. The rest wait until 08:00.
   A Farm or Label card stays on that workspace. It is not on the BADSCANDAL Needs you. */
export function presentLuke(cards, tapsOn, now = Date.now()) {
  return present(cardsFor(cards, "badscandal"), tapsOn, now);
}
export function workspaceNeedsFrom(cards, tapsOn, now, ws) {
  const mine = cardsFor(cards, ws);
  return { ...present(mine, tapsOn, now), waitingOnOthers: othersLane({ cards: mine, messages: [], releases: [], now }) };
}
export async function workspaceNeeds(store, now, ws) {
  const [cards, auto] = await Promise.all([load(store), getAuto(store)]);
  return workspaceNeedsFrom(cards, auto.tapsCountAsYes === true, now, ws);
}

export async function boardAuto(store, now, desk) {
  const [cards, auto] = await Promise.all([load(store), getAuto(store)]);
  const roster = (desk && desk.roster) || S.DEFAULT_ROSTER;
  const official = cardsFor(cards, "badscandal");
  return {
    ...autoPublic(auto, roster),
    ...present(official, auto.tapsCountAsYes === true, now),
    waitingOnOthers: othersLane({ cards: official, messages: desk && desk.messages, releases: desk && desk.releases, roster, now }),
  };
}

/* made-up cards for /hq?sample=1. No real payers, no real amounts from the desk. */
export function sampleAuto(now = Date.parse("2026-11-18T15:00:00Z")) {
  const tapsOn = false;
  const cards = [
    { id: "ksamplepay", version: 1, kind: "payment", owner: "Ledger", status: "open", waitingOn: "luke", action: "pay the sample invoice", dedupeKey: "sample-pay", moneyAtRisk: true, expiresAt: "2026-11-21T02:59:00Z", text: "Pay the sample studio the invoice they sent.", preview: "Pay the sample studio the invoice they sent.", recipient: "Sample Studio", amount: 12, currency: "USD", deadline: "2026-11-20", createdAt: "2026-11-18T12:00:00Z" },
    { id: "ksamplemsg", version: 1, kind: "message", owner: "Nova", status: "open", waitingOn: "luke", action: "send the sample note", dedupeKey: "sample-note", moneyAtRisk: false, text: "Send the sample note to the distributor.", preview: "Send the sample note to the distributor.", recipient: "Sample Distro", deadline: "2026-11-18", createdAt: "2026-11-18T12:01:00Z" },
    { id: "ksamplewait", version: 1, kind: "other", owner: "Drop", status: "open", waitingOn: "label", action: "wait for the cover", dedupeKey: "sample-label", ticket: "SAMPLE-44", moneyAtRisk: false, text: "Sample Label still has the cover.", preview: "Sample Label still has the cover.", createdAt: "2026-11-15T15:00:00Z" },
  ];
  return {
    tapsCountAsYes: false,
    tapsLine: "Taps count as Luke's yes: off. " + TAP_OFF + ". Payments and signatures always stay with Luke.",
    webhooks: S.DEFAULT_ROSTER.map((b) => ({ bot: b.name, on: false, host: "" })),
    ...presentLuke(cards, tapsOn, now),
    waitingOnOthers: othersLane({ cards, messages: [], releases: [{ id: "slow", title: "Slow Burn", status: "scheduled", pack: { storeStatus: "in moderation", ticket: "RN-SAMPLE" }, storeLog: [{ status: "in moderation", on: "2026-11-16" }] }], roster: S.DEFAULT_ROSTER, now }),
  };
}
