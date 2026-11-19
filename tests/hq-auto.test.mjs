/* HQ automation phase 1 (18 Nov 2026). Made-up names and amounts only. No live site, no Meta, no Spotify key. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as S from "../netlify/lib/staff.mjs";
import * as C from "../netlify/lib/action-cards.mjs";
import { pingBot, pingBody } from "../netlify/lib/desk-push.mjs";
import { capFromRows, mondayDraft, mondayText, pageProblems, listenProblems, readOembed, whoseTrack, runSiteCheck, runCapCheck, runReleaseWatch, runMonthJob, runMonday, judgeRelease } from "../netlify/lib/hq-jobs.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS } from "../netlify/lib/staff-tools.mjs";

const NOW = Date.parse("2026-11-18T15:00:00Z"); /* 12:00 São Paulo */
const NIGHT = Date.parse("2026-11-18T05:00:00Z"); /* 02:00 São Paulo */
const tool = (n) => TOOLS.find((t) => t.name === n);
const call = (d, name, args, now = NOW) => callTool(tool(name), args, { store: d, now, role: "bot", hq: async () => null });
const roster = S.DEFAULT_ROSTER;

test("the connector stays at 49 tools", () => {
  assert.equal(TOOLS.length, 55); /* content_ideas (Spark) + account_health, needs_you, song_pl (18 Nov 2026 night test) + profile_jobs, profile_master, profile_rework, profile_uploaded (PR #87) */
  assert.ok(tool("my_day").inputSchema.properties.luke_tap);
  assert.ok(tool("send_message").inputSchema.properties.card);
  assert.ok(tool("post_update").inputSchema.properties.card);
});

test("a card keeps the action, dedupes, versions a Yes, and is done only with proof", async () => {
  const d = memoryDesk();
  const made = await call(d, "send_message", { bot: "Nova", to: "Luke", text: "not posted", card: { kind: "message", text: "Send the sample note.", dedupe_key: "note-1", action: "send the note", owner: "Nova", recipient: "Sample Distro", deadline: "2026-11-20" } });
  assert.equal(made.card.owner_bot, "Nova");
  assert.equal(made.card.version, 1);
  assert.match(made.note, /not also posted/);
  const again = await call(d, "send_message", { bot: "Nova", to: "Luke", text: "not posted", card: { kind: "message", text: "A second copy.", dedupe_key: "note-1", action: "send the note", owner: "Nova" } });
  assert.equal(again.card.duplicate, true);
  assert.equal(again.card.id, made.card.id);
  assert.equal(again.card.text, "Send the sample note.");
  await assert.rejects(C.recordProof(d, NOW, roster, { by: "Nova", id: made.card.id, messageId: "m1" }), /has not said yes/);
  const off = await C.answerCard(d, NOW, roster, { by: "Luke", id: made.card.id, choice: "yes" });
  const tap = off.answers.at(-1);
  assert.equal(tap.counts, false);
  assert.equal(tap.line, C.TAP_OFF);
  assert.equal(tap.version, 1);
  const day = await call(d, "my_day", { bot: "Nova" });
  assert.equal(day.card_answers[0].answer.choice, "yes");
  const early = await call(d, "my_day", { bot: "Drop", luke_tap: { id: made.card.id, version: 1, action: "distribute" } });
  assert.equal(early.luke_tap.yes, false);
  await C.setAuto(d, NOW, { by: "Luke", tapsCountAsYes: true });
  await C.answerCard(d, NOW + 1000, roster, { by: "Luke", id: made.card.id, choice: "no" });
  await C.answerCard(d, NOW + 2000, roster, { by: "Luke", id: made.card.id, choice: "yes" });
  const check = await C.checkTap(d, { id: made.card.id, version: 1, action: "send the note" }, NOW + 2000);
  assert.equal(check.yes, true);
  assert.ok(check.at);
  const stale = await C.checkTap(d, { id: made.card.id, version: 2, action: "send the note" }, NOW + 2000);
  assert.equal(stale.yes, false);
  const edited = await C.answerCard(d, NOW + 3000, roster, { by: "Luke", id: made.card.id, choice: "edit", text: "Send the sample note, shorter." });
  assert.equal(edited.version, 2);
  assert.equal(edited.status, "open");
  await assert.rejects(C.recordProof(d, NOW + 3000, roster, { by: "Nova", id: made.card.id, messageId: "m1" }), /this version/);
  await C.answerCard(d, NOW + 4000, roster, { by: "Luke", id: made.card.id, choice: "yes" });
  const proved = await call(d, "post_update", { bot: "Nova", status: "done", message: "Sample note sent.", card: made.card.id, proof_message: "sample-msg-1" });
  assert.equal(proved.card_done.status, "done");
  assert.equal(proved.card_done.proof.messageId, "sample-msg-1");
});

test("payments never count as a tap, and quiet hours keep everything else until 08:00", async () => {
  const d = memoryDesk();
  await C.setAuto(d, NOW, { by: "Luke", tapsCountAsYes: true });
  const pay = await C.saveCard(d, NOW, roster, { by: "Ledger", kind: "payment", text: "Pay the sample studio.", dedupe_key: "pay-1", action: "pay the sample invoice", amount: 12, currency: "USD", recipient: "Sample Studio" });
  assert.equal(pay.moneyAtRisk, true);
  const yes = await C.answerCard(d, NOW, roster, { by: "Luke", id: pay.id, choice: "yes" });
  assert.equal(yes.answers.at(-1).line, C.SELF_LINE);
  assert.equal(yes.answers.at(-1).counts, false);
  const tap = await C.checkTap(d, { dedupe_key: "pay-1", version: 1, action: "pay the sample invoice" }, NOW);
  assert.equal(tap.tapped, true);
  assert.equal(tap.yes, false);
  const note = await C.saveCard(d, NOW, roster, { by: "Nova", kind: "message", text: "Send the sample note.", dedupe_key: "note-q", action: "send the note" });
  const shown = C.presentLuke([pay, note], true, NIGHT);
  assert.equal(shown.quiet, true);
  assert.deepEqual(shown.needsYou.map((c) => c.id), [pay.id]);
  assert.equal(shown.held.length, 1);
  assert.equal(shown.header, "1 need you · USD 12 at risk");
  const day = C.presentLuke([
    { ...note, moneyAtRisk: false, waitingOn: "luke", status: "open" },
    { id: "ke", waitingOn: "luke", status: "open", moneyAtRisk: true, amount: 4, currency: "EUR", kind: "other", owner: "Ledger", text: "EUR sample", preview: "EUR sample", createdAt: "2026-11-18T12:00:00Z" },
    pay,
  ], false, NOW);
  assert.match(day.header, /^3 need you · EUR 4 · USD 12 at risk$/);
  assert.equal(day.needsYou[0].currency, "USD");
});

test("waiting on others carries a ticket and days, and is not Luke's", () => {
  const lane = C.othersLane({
    now: NOW,
    cards: [{ id: "kw", owner: "Drop", waitingOn: "label", status: "open", text: "Sample Label has the cover.", preview: "Sample Label has the cover.", ticket: "SAMPLE-44", createdAt: "2026-11-15T15:00:00Z" }],
    messages: [{ id: "m1", from: "HQ", to: "Webmaster", text: "Site check failed: home", needs: "action", at: "2026-11-17T15:00:00Z", resolved: null }],
    releases: [{ id: "slow", title: "Slow Burn", status: "scheduled", pack: { storeStatus: "in moderation", ticket: "RN-SAMPLE" }, storeLog: [{ status: "in moderation", on: "2026-11-16" }] }],
    roster,
  });
  assert.equal(lane[0].ticket, "SAMPLE-44");
  assert.equal(lane[0].days, 3);
  assert.equal(lane[1].tone, "bad");
  assert.equal(lane[1].days, 1);
  assert.equal(lane[2].ticket, "RN-SAMPLE");
  assert.equal(lane.some((x) => x.who === "luke"), false);
  const chatter = C.othersLane({
    now: NOW, cards: [], roster,
    messages: [
      { id: "brief", from: "Alfred", to: "Nova", needs: "none", text: "Ad spend this morning is inside the cap.", at: "2026-11-18T13:00:00Z" },
      { id: "chat", from: "Alfred", to: "Nova", needs: "reply", text: "The 10:00 spend line.", at: "2026-11-18T13:00:00Z" }
    ],
    releases: [],
  });
  assert.deepEqual(chatter, []);
});

test("an empty webhook sends nothing; a pasted one gets a short ping", async () => {
  const d = memoryDesk();
  let calls = 0;
  const fetch = async (url, init) => { calls += 1; assert.equal(url, "https://example.com/hook?token=sample"); const body = JSON.parse(init.body); assert.deepEqual(Object.keys(body).sort(), ["at", "bot", "desk", "id", "kind"]); assert.equal(body.desk, "badscandal"); assert.equal(body.text, undefined); return { status: 204 }; };
  const off = await pingBot(d, NOW, "Nova", { kind: "message", id: "m1" }, fetch);
  assert.equal(off.off, true);
  assert.equal(calls, 0);
  await C.setAuto(d, NOW, { by: "Luke", webhook: { bot: "Nova", url: "https://example.com/hook?token=sample" } });
  const on = await pingBot(d, NOW, "Nova", { kind: "card", id: "k1" }, fetch);
  assert.equal(on.sent, true);
  assert.equal(calls, 1);
  const pub = C.autoPublic(await C.getAuto(d), roster);
  assert.equal(pub.webhooks.find((w) => w.bot === "Nova").host, "example.com");
  assert.equal(JSON.stringify(pub).includes("example.com/hook"), false);
  assert.deepEqual(pingBody({ bot: "Nova", kind: "task", id: "T-1", at: "2026-11-18T15:00:00.000Z" }).kind, "task");
  await assert.rejects(C.setAuto(d, NOW, { by: "Forge", webhook: { bot: "Forge", url: "https://example.com/x" } }), /Only Luke/);
});

test("site check flags a pre-save and stays quiet when nothing changed", async () => {
  const d = memoryDesk();
  const ok = (body) => ({ status: 200, text: async () => body });
  const home = '<title>BADSCANDAL</title><meta property="og:image" content="https://badscandal.com/assets/x.jpg"><a data-rel="cta">Follow on Spotify</a>';
  const song = '<title>Night Drive · BADSCANDAL</title><img class="cover" src="https://badscandal.com/assets/x.webp"><a id="sp">Listen on Spotify</a>';
  const listen = JSON.stringify({ release: { title: "Night Drive", cover: "assets/x.jpg", cta: "https://open.spotify.com/artist/29kaubgb6Esvwu0idVndGy" } });
  const pages = { "/": home, "/listen.json": listen, "/night": song };
  const fetch = async (url) => ok(pages[new URL(url).pathname] || "");
  const songs = [{ slug: "night", title: "Night Drive" }];
  const first = await runSiteCheck(d, NOW, roster, { fetch, songs, origin: "https://example.com" });
  assert.equal(first.ok, true);
  assert.equal(first.wrote, false);
  pages["/night"] = song + " https://ffm.to/presave";
  const bad = await runSiteCheck(d, NOW + 86400000, roster, { fetch, songs, origin: "https://example.com" });
  assert.equal(bad.ok, false);
  const msgs = await S.listMessages(d, NOW + 86400000, 1);
  assert.equal(msgs[0].to, "Webmaster");
  assert.match(msgs[0].text, /^Site check failed/);
  assert.match(msgs[0].text, /pre-save|Feature\.fm/i);
  const again = await runSiteCheck(d, NOW + 86400000 + 1000, roster, { fetch, songs, origin: "https://example.com" });
  assert.equal(again.skipped, "already");
  assert.ok(pageProblems({ name: "home", status: 500, body: "" }).length);
  assert.deepEqual(listenProblems(200, "{}"), ["listen.json: no title", "listen.json: no cover", "listen.json: no Listen link"]);
});

test("the cap check alerts at 750 and cards Luke at 900, and never writes an ad", async () => {
  const d = memoryDesk();
  const month = "2026-11";
  const warn = await runCapCheck(d, NOW, roster, { spend: [{ date: "2026-11-02", amount: 760, currency: "USD" }] });
  assert.equal(warn.level, "warn");
  const msgs = await S.listMessages(d, NOW, 1);
  assert.ok(msgs.some((m) => m.to === "Nova" && /750/.test(m.text)));
  assert.equal(JSON.stringify(msgs).includes("760"), false);
  const same = await runCapCheck(d, NOW + 1000, roster, { spend: [{ date: "2026-11-02", amount: 760, currency: "USD" }] });
  assert.equal(same.wrote, false);
  const stop = await runCapCheck(d, NOW + 2000, roster, { spend: [{ date: "2026-11-02", amount: 910, currency: "USD" }] });
  assert.equal(stop.level, "stop");
  const cards = await C.answersFor(d, "Forge");
  assert.equal(cards[0].kind, "ads");
  assert.match(cards[0].text, /Switch all ads off/);
  assert.equal(cards[0].may_act, false);
  assert.equal(JSON.stringify(cards).includes("910"), false);
  const foreign = capFromRows([{ date: "2026-11-02", amount: 10, currency: "EUR" }], month);
  assert.equal(foreign.level, "unread");
  const gap = capFromRows([{ date: "2026-11-02", amount: 800, currency: "USD" }, { date: "2026-11-03", amount: null, currency: "USD" }], month);
  assert.equal(gap.level, "unread");
});

test("release day proposes our track and flags a different profile", async () => {
  const id = "abcDEF1234567890xyzXYZ";
  const html = `"name":"Night Drive","uri":"spotify:track:${id}"`;
  const ours = readOembed({ title: "Night Drive", author_name: "badscandal", author_url: "https://open.spotify.com/artist/29kaubgb6Esvwu0idVndGy" });
  assert.equal(whoseTrack("Night Drive", ours), "ours");
  const other = readOembed({ title: "Night Drive", author_name: "Someone Else", author_url: "https://open.spotify.com/artist/0000000000000000000000" });
  assert.equal((await judgeRelease("Night Drive", html, { [id]: other })).state, "other");
  const d = memoryDesk();
  const day = S.spDay(NOW);
  const rel = [{ id: "night", title: "Night Drive", status: "scheduled", date: day, pack: {} }];
  const fetch = async (url) => {
    if (String(url).includes("oembed")) return { status: 200, text: async () => JSON.stringify({ title: "Night Drive", author_name: "badscandal", author_url: "https://open.spotify.com/artist/29kaubgb6Esvwu0idVndGy" }) };
    return { status: 200, text: async () => html };
  };
  const found = await runReleaseWatch(d, NOW, roster, { fetch, releases: rel });
  assert.equal(found.wrote, true);
  const card = (await C.answersFor(d, "Webmaster"))[0];
  assert.match(card.link, /^https:\/\/open\.spotify\.com\/track\/abcDEF1234567890xyzXYZ$/);
  assert.equal(card.may_act, false);
  const msgs = await S.listMessages(d, NOW, 1);
  assert.ok(msgs.some((m) => m.to === "Forge" && /Wait for his yes/.test(m.text)));
  const again = await runReleaseWatch(d, NOW + 60000, roster, { fetch, releases: rel });
  assert.deepEqual(again.ids, []);
});

test("the 1st asks Luke to close the month only when month_check is ready", async () => {
  const d = memoryDesk();
  const first = Date.parse("2026-12-01T03:30:00Z");
  const waiting = await runMonthJob(d, first, roster, { monthCheck: async () => ({ ready: false, toSort: [{}], waiting: [{ id: "w" }] }) });
  assert.equal(waiting.ready, false);
  const msgs = await S.listMessages(d, first, 1);
  assert.equal(msgs[0].to, "Ledger");
  assert.match(msgs[0].text, /1 to sort, 1 still/);
  assert.equal(JSON.stringify(msgs).includes("payer"), false);
  const ready = await runMonthJob(d, first + 1000, roster, { monthCheck: async () => ({ ready: true, toSort: [], waiting: [] }) });
  assert.equal(ready.ready, true);
  const card = (await C.answersFor(d, "Ledger"))[0];
  assert.match(card.text, /^Close 2026-11\?$/);
  const skip = await runMonthJob(d, Date.parse("2026-11-18T15:00:00Z"), roster, {});
  assert.equal(skip.skipped, "not the 1st");
});

test("the Monday draft names a post and no amount", async () => {
  const ranked = Array.from({ length: 10 }, (_, i) => ({ views: 2000, rate: 10 - i, caption: "Sample post " + i, link: "https://example.com/p" + i, before: { rate: i === 0 ? 9 : 1 }, paid: { costPerEng: i + 1 } }));
  const draft = mondayDraft({ ranked, notSettled: false });
  assert.equal(draft.settled, true);
  assert.equal(draft.pick.caption, "Sample post 0");
  assert.equal(draft.pick.cost, "reported");
  const text = mondayText(draft);
  assert.match(text, /No amount is chosen/);
  assert.equal(/USD|EUR|\$/.test(text), false);
  const thin = mondayDraft({ ranked: ranked.slice(0, 3), notSettled: true });
  assert.equal(thin.settled, false);
  const d = memoryDesk();
  const monday = Date.parse("2026-11-16T12:00:00Z");
  const ran = await runMonday(d, monday, roster, { ranking: { ranked, notSettled: false } });
  assert.ok(ran.cardId);
  const card = (await C.answersFor(d, "Forge"))[0];
  assert.equal(card.kind, "monday");
  assert.equal(card.may_act, false);
  const msgs = await S.listMessages(d, monday, 1);
  assert.ok(msgs.some((m) => m.to === "Nova"));
  assert.ok(msgs.some((m) => m.to === "Forge"));
});

test("the phone screen has the needs-you header, a stack and Waiting on others", () => {
  const phone = readFileSync(new URL("../js/hq-phone.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../hq.html", import.meta.url), "utf8");
  const fn = readFileSync(new URL("../netlify/functions/hqauto.mjs", import.meta.url), "utf8");
  assert.match(phone, /Do this first/);
  assert.match(phone, /data-achoice/);
  assert.match(phone, /Waiting on others/);
  assert.match(html, /id="autoCard"/);
  assert.match(fn, /schedule: "\*\/15 \* \* \* \*"/);
  const sample = C.sampleAuto(NOW);
  assert.match(sample.header, /need you/);
  assert.equal(sample.waitingOnOthers.some((x) => x.ticket === "SAMPLE-44"), true);
});
