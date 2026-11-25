/* What HQ no longer handles (25 Nov 2026). Since 24 Nov 2026 money, Rights and Claude are off HQ, and Ledger and
   Sheet work on badscandal books and report to Alfred. Two rules every part of HQ shares:

   - offHqNames(roster): the bots that are on the roster (their my_day still answers) but are not on Team, are
     never quiet, late, chased or counted, and never put anything on Needs you.
   - moneyText / dropMoneyText: words about income, payments, royalties, Revolut, Wise or PayPal checks, month
     close or Content ID claims. A duty or card line keeps everything else; the sheet itself is not changed.

   Pure, no imports: staff.mjs and hq.mjs both use it. */

/* the default; a roster entry with offHq: true or false (the private seed) overrides it */
export const OFF_HQ_DEFAULT = ["Ledger", "Sheet"];

const low = (s) => String(s == null ? "" : s).trim().toLowerCase();
export function isOffHq(bot) {
  if (!bot || typeof bot !== "object") return false;
  if (typeof bot.offHq === "boolean") return bot.offHq;
  return OFF_HQ_DEFAULT.some((n) => low(n) === low(bot.name));
}
/* lowercase names; with no roster, the default */
export function offHqNames(roster) {
  if (!Array.isArray(roster) || !roster.length) return new Set(OFF_HQ_DEFAULT.map(low));
  return new Set(roster.filter(isOffHq).map((b) => low(b.name)));
}
export const offHqOwner = (name, off) => !!name && (off || new Set(OFF_HQ_DEFAULT.map(low))).has(low(name));

/* a clause about money or Content ID claims. "Ad spend" and the cap are NOT money here: they stay on HQ. */
const MONEY_WORDS = /\bincome\b|\bpayments?\b|\bpayouts?\b|\broyalt\w*|\brevolut\b|\bpaypal\b|\bwise\b|\bstatements?\b|\binvoices?\b|proof of arrival|\bmonth[\s_-]*(?:close|check)\b|\bclose (?:the|a) month\b|\bcontent\s*id\b|\bclaims?\b|\bledger\b.*\bbooks\b/i;
/* an amount in a currency */
const AMOUNT = /\b(?:EUR|USD|GBP|BRL)\s?\d|[€$£]\s?\d/i;
/* ads stay on HQ: a line about ad spend, a campaign, a boost or the cap is never money */
const AD_WORDS = /\bads?\b|\bad spend\b|\bcampaigns?\b|\bboosts?\b|\bbudgets?\b|\bthe cap\b|\bcap\b|\bmeta\b|\btiktok\b|\bgoogle ads\b/i;

export function moneyText(text) {
  const t = String(text == null ? "" : text);
  if (!t.trim()) return false;
  if (MONEY_WORDS.test(t)) return !AD_WORDS.test(t) || /\bincome\b|\broyalt|\brevolut\b|\bpaypal\b|\bwise\b|proof of arrival|\bcontent\s*id\b/i.test(t);
  return AMOUNT.test(t) && !AD_WORDS.test(t);
}

/* a duty or card line without its money clauses. "Ad spend vs cap, income received this month per currency,
   Needs you" -> "Ad spend vs cap, Needs you". A line that is only about money becomes "". */
export function dropMoneyText(text) {
  const t = String(text == null ? "" : text);
  if (!t.trim() || !MONEY_WORDS.test(t)) return t;
  /* "(no royalties: that is Ledger's)": a bracket about money goes first, the line around it stays */
  const bare = t.replace(/\s*\(([^()]*)\)/g, (all, inner) => (MONEY_WORDS.test(inner) && moneyText(inner) ? "" : all));
  if (bare !== t) return dropMoneyText(bare);
  const parts = t.split(/(\s*[,;]\s*|(?<=[.!?])\s+|\s+\+\s+|\s+·\s+|\s+and then\s+)/);
  const out = [];
  for (let i = 0; i < parts.length; i += 2) {
    const clause = parts[i], sep = i > 0 ? parts[i - 1] : "";
    if (!clause || !clause.trim()) continue;
    if (MONEY_WORDS.test(clause) && moneyText(clause)) continue;
    out.push(out.length ? sep : "", clause);
  }
  let r = out.join("").replace(/\s{2,}/g, " ").replace(/\s+([,.;])/g, "$1").replace(/^[\s,;:+·]+|[\s,;:+·]+$/g, "").trim();
  /* a clause list that ended on a period keeps it */
  if (r && /[.!?]\s*$/.test(t) && !/[.!?]$/.test(r)) r += ".";
  /* "X: Y" where every listed item went: nothing left worth showing */
  if (/^[^:]{0,40}:$/.test(r)) r = "";
  return r;
}

/* ---------- the month's cap override: Luke's call (25 Nov 2026; stored by staff.mjs setCapOverride) ---------- */
export const LUKES_CALL = "lukes_call";
/* "Past the stop line on Luke's call (note)"; below the stop line: "Luke's call: keep running past the stop line" */
export function capCallLine(cap) {
  const o = cap && cap.override;
  const note = o && o.note ? ` (${o.note})` : "";
  return cap && cap.spent >= (cap.stop || 900) ? `Past the stop line on Luke's call${note}` : `Luke's call: keep running past the stop line${note}`;
}
/* the cap with the month's override applied: past 750/900/1,000 it is Luke's call (amber), never warn/stop/over */
export function applyCapOverride(cap, override) {
  if (!cap || !override || override.month !== cap.month) return cap;
  const out = { ...cap, override, overrideLine: "" };
  if (cap.status === "warn" || cap.status === "stop" || cap.status === "over") out.status = LUKES_CALL;
  out.overrideLine = capCallLine(out);
  return out;
}
