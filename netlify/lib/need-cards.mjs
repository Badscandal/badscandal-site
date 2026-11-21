/* BADSCANDAL HQ · Needs you cards (v18, 21 Nov 2026, Luke: "decision cards get one short question with Yes,
   No and Reply. The full email opens only on Reply and can be edited.").

   S.waitingOnLuke is still THE list (one count everywhere). needCard() turns one item of it into what a
   card shows, so the phone, Today, needs_you, my_day, team_board and the briefings say the same thing:

     type      decision  Yes / No / Reply      (a message with options or needs decision, a dispute case,
                                               a Yes/No/Edit card, a bot waiting on his yes)
               ask       Reply box + Send, and Done when it is an action (sign-in, access, a task, a fan)
               link      only he can answer it on another screen (a song in Spotify for Artists, a red account)
     title     one short plain question. Never the raw email, never an id.
     facts     { song, status, waiting, next } (only what is known; nothing is invented)
     recommend one line
     yes / no  { label, sub, choice }: choice is what gets recorded, the SAME way as before v18
     email     { to, cc, subject, body } when the ask carries a draft email (body keeps its line breaks)
     draft     the text the Reply box starts with when there is no email
     via       how an answer is recorded:
                 message  POST /api/staff/message (re = the message) or /api/staff/resolve for Done
                 case     POST /api/staff/case (confirm / ignore / respond)
                 card     POST /api/staff/card (yes / no / edit)
                 mark     POST /api/staff/need (a message to the bot + a done mark, so the ask leaves the list)
     to        who an answer goes to (a bot on the roster)
     done      true when a Done button makes sense

   Pure: the desk is passed in. Nothing here writes. */
import * as S from "./staff.mjs";

const MARKERS = /(^|\n|[ \t]|[.;:!?]\s)(to|cc|subject|body)\s*:\s*/gi;

/* "To: …\nCC: …\nSubject: …\nBody: …" (or all on one line) -> its parts. null when it is not an email.
   Literal "\n" written by a bot becomes a real line break. Blank lines inside the body are kept. */
export function emailParts(text) {
  let t = String(text == null ? "" : text).replace(/\r/g, "");
  if (!t.trim()) return null;
  if (!/\n/.test(t) && /\\n/.test(t)) t = t.replace(/\\n/g, "\n");
  const hits = [];
  let m;
  MARKERS.lastIndex = 0;
  while ((m = MARKERS.exec(t))) {
    const key = m[2].toLowerCase();
    /* only the first of each field counts, and Body ends the header (a "To:" inside the body is text) */
    if (hits.some((h) => h.key === "body")) break;
    if (hits.some((h) => h.key === key)) continue;
    hits.push({ key, start: m.index + m[1].length, from: m.index + m[0].length });
  }
  const keys = hits.map((h) => h.key);
  if (!keys.includes("to") || !(keys.includes("subject") || keys.includes("body"))) return null;
  const out = { to: "", cc: "", subject: "", body: "", intro: "" };
  out.intro = t.slice(0, hits[0].start).trim();
  hits.forEach((h, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].start : t.length;
    let v = t.slice(h.from, end);
    v = h.key === "body" ? v.replace(/^\s*\n/, "").replace(/\s+$/, "") : v.replace(/\s+/g, " ").trim().replace(/[.;,]$/, "");
    out[h.key] = v;
  });
  return out;
}
/* the email as one text again, for the bot: the same four labels it wrote */
export function emailText(e) {
  if (!e) return "";
  return [`To: ${e.to || ""}`, e.cc ? `CC: ${e.cc}` : "", `Subject: ${e.subject || ""}`, `Body:\n${e.body || ""}`].filter(Boolean).join("\n");
}

const clip = (v, n) => S.clipWords(v, n);
/* the first question in a text, else its first sentence, plain and short */
export function questionOf(text, max = 90) {
  const t = String(text || "").replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const head = (emailParts(text) || {}).intro || t;
  const plain = S.lukeLine(head) || head;
  const q = /[^.!?]*\?/.exec(plain);
  const s = q ? q[0].trim() : (/^[^.!?]+[.!?]?/.exec(plain) || [plain])[0].trim();
  return clip(s.replace(/^(hi|hey|hello) luke[,:!]?\s*/i, "").replace(/^luke[,:]\s*/i, ""), max);
}
const YES = /^(yes|yep|ok|okay|approve|approved|go|go ahead|send|send it|confirm|correct|do it|publish|sim)\b/i;
const NO = /^(no|nope|not yet|don'?t|do not|skip|hold|reject|later|wait|cancel|não|nao)\b/i;
/* a message's options as Yes / No. The rest stay on the message (Reply shows them). */
export function yesNo(options) {
  const opts = (options || []).map(String).filter(Boolean);
  if (!opts.length) return { yes: null, no: null, rest: [] };
  let y = opts.find((o) => YES.test(o.trim())), n = opts.find((o) => NO.test(o.trim()) && o !== y);
  if (!y) y = opts.find((o) => o !== n) || null;
  if (!n) n = opts.find((o) => o !== y) || null;
  return { yes: y, no: n, rest: opts.filter((o) => o !== y && o !== n) };
}
const sub = (label, choice) => (choice && choice.trim().toLowerCase() !== label.toLowerCase() ? clip(choice, 40) : "");

function songIn(text, releases) {
  const t = S.songKey(text || "");
  if (!t) return null;
  const list = (releases || []).filter((r) => r && r.title && r.status !== "cancelled").sort((a, b) => String(b.title).length - String(a.title).length);
  return list.find((r) => { const k = S.songKey(r.title); return k.length >= 4 && t.includes(k); }) || null;
}
/* the distributor's word for a release (Drop's store_status), else "" */
function statusOf(r) {
  const p = (r && r.pack) || {};
  return S.clean(p.storeStatus || (r && r.mail && r.mail.status) || "", 40);
}
function facts(o) {
  const f = {};
  for (const k of ["song", "status", "waiting", "next"]) if (o[k]) f[k] = S.clean(o[k], 80);
  return f;
}
const firstLine = (v, n = 140) => clip(String(v || "").split(/\n/)[0], n);
const nextWords = (d) => (/^\d{4}-\d{2}-\d{2}/.test(String(d || "")) ? S.dayWords(String(d).slice(0, 10)) : S.clean(d, 30));

/* a bot's "waiting on Luke's yes for X" -> "Yes to X?" */
export function yesTitle(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  const m = /(?:waiting on|waits on|needs|need)\s+luke'?s?\s+(?:yes(?:,?\s*correct)?|ok|approval)\s*(?:for|on|to|about)?\s*(.*)$/i.exec(t);
  const what = m && m[1] ? m[1].replace(/[.;]+$/, "").trim() : "";
  return what ? clip(`Yes to ${what}?`, 90) : clip(S.lukeLine(t) || t, 90);
}

/* desk: the needsDesk() desk (messages, releases, disputes, lukeCards, needsReply). today: São Paulo day. */
export function needCard(x, desk = {}, today = "") {
  const releases = desk.releases || [];
  const base = { type: "ask", title: S.clean(x.text, 120), facts: {}, recommend: "", yes: null, no: null, email: null, draft: "", via: "mark", to: x.from || "", done: false };
  if (x.kind === "message" || x.kind === "handle") {
    const m = (desk.messages || []).find((y) => y && y.id === x.id) || {};
    const rel = songIn(m.text, releases);
    const email = emailParts(m.text);
    const recs = Array.isArray(m.recommendations) ? m.recommendations : [];
    const r = recs[recs.length - 1];
    const card = { ...base, via: "message", to: m.from || x.from || "", email,
      title: x.kind === "handle" ? base.title : (questionOf(m.text) || base.title),
      facts: facts({ song: rel && rel.title, status: statusOf(rel) }),
      recommend: r ? firstLine((r.option ? r.option + ": " : "") + r.why) : "" };
    if (m.needs === "decision" && !(m.questions && m.questions.length >= 2)) {
      const yn = yesNo(m.options);
      card.type = "decision";
      card.yes = { label: m.proposal ? "Yes, correct" : "Yes", sub: sub("Yes", yn.yes || ""), choice: yn.yes || "Yes" };
      card.no = { label: "No", sub: sub("No", yn.no || ""), choice: yn.no || "No" };
      if (m.proposal && /^yes,? correct$/i.test(yn.yes || "")) card.yes.sub = "";
      if (yn.rest.length) card.more = yn.rest;
    } else card.done = m.needs === "action";
    if (m.questions && m.questions.length >= 2) card.draft = m.questions.map((q, i) => `${i + 1}. `).join("\n");
    return card;
  }
  if (x.kind === "dispute") {
    const c = (desk.disputes || []).find((y) => y && y.id === x.id) || {};
    const v = S.caseOut(c) || {};
    const song = v.song || "a song";
    const rel = songIn(v.song, releases);
    const email = emailParts(v.proposal);
    const solved = v.status === "solved - confirm";
    const place = v.platform || "the store";
    const title = solved ? `Is ${song} solved on ${place}?` : email ? `Send the ${place} email for ${song}?` : `Go ahead with ${v.owner || "the bot"}'s plan for ${song}?`;
    return { ...base, type: "decision", via: "case", to: v.owner || "", title: clip(title, 90), email,
      draft: email ? "" : (v.proposal || ""),
      facts: facts({ song: v.song, status: statusOf(rel) || [v.platform, v.type].filter(Boolean).join(" · "), waiting: v.waitingOn && v.waitingOn !== "Luke" ? v.waitingOn : "", next: v.nextCheck ? nextWords(v.nextCheck) : "" }),
      recommend: firstLine(v.recommendation),
      yes: { label: "Yes", sub: solved ? "Close it" : email ? "Send it" : "Go ahead", choice: "confirm" },
      no: solved ? { label: "No", sub: "Not solved", choice: "respond", text: "Not solved yet. Keep the case open." } : { label: "No", sub: "Close the case", choice: "ignore" } };
  }
  if (x.kind === "card") {
    const c = (desk.lukeCards || []).find((y) => y && y.id === x.id) || {};
    const t = String(c.preview || c.text || "");
    const title = /\?\s*$/.test(t) ? clip(t, 90) : clip(`${clip(t, 80).replace(/[.…]+$/, "")}?`, 90);
    return { ...base, type: "decision", via: "card", to: c.owner || x.from || "", title: t ? title : base.title, draft: String(c.text || ""),
      facts: facts({ song: c.song || "", next: c.deadline ? nextWords(c.deadline) : "" }), recommend: firstLine(c.line || ""),
      yes: { label: "Yes", sub: "", choice: "yes" }, no: { label: "No", sub: "", choice: "no" } };
  }
  if (x.kind === "yes") {
    const what = yesTitle(x.detail || x.text);
    return { ...base, type: "decision", to: x.from || x.id, title: what, facts: facts({ song: (songIn(x.detail, releases) || {}).title }),
      yes: { label: "Yes", sub: "", choice: "yes", text: `Yes, correct: ${what.replace(/^Yes to /, "").replace(/\?$/, "")}` },
      no: { label: "No", sub: "", choice: "no", text: `No: ${what.replace(/^Yes to /, "").replace(/\?$/, "")}` } };
  }
  if (x.kind === "signin") return { ...base, to: x.from || "Nova", done: true };
  if (x.kind === "access") return { ...base, title: clip(`Give ${x.id} Netlify Viewer access`, 90), to: x.id, done: true };
  if (x.kind === "fan") {
    const f = (desk.needsReply || []).find((y) => y && String(y.id || y.handle || y.text || y.quote).slice(0, 40) === x.id) || {};
    const quote = clip(f.text || f.quote || "", 80);
    return { ...base, title: quote ? `A fan on Instagram asks: “${quote}”` : "A fan on Instagram needs a reply", to: "Steve", done: true, facts: facts({ song: f.song || "" }) };
  }
  if (x.kind === "task") return { ...base, to: x.from || "Nova", done: true };
  return { ...base, type: "link", via: "", to: "" };
}
/* the whole list, each item with its card */
export function needCards(items, desk, today) {
  return (items || []).map((x) => ({ ...x, ...needCard(x, desk, today) }));
}
