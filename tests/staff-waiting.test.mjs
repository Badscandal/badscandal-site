/* What is waiting on Luke (12 Nov 2026, the HQ apps): ONE rule that the app badge, GET /api/hq/push/waiting
   and the push alerts all use. luke_briefing is not changed by it. Built with the in-memory desk and the
   real desk operations. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";

const NOW = Date.parse("2026-11-12T12:20:00Z"); /* Thu 12 Nov, 09:20 in São Paulo */
const TODAY = "2026-11-12";
const DAY = 86400000, MIN = 60000;
const R = S.DEFAULT_ROSTER;
const FULL = { kind: "Self-release", wav: "https://example.com/m.wav", artwork: "https://example.com/c.jpg", language: "English", explicit: "No", genre: "Dance", writers: "Sample Writer: music and lyrics", copyright: "℗ 2026 Sample · © 2026 Sample" };
const day = (n) => new Date(Date.parse(TODAY + "T12:00:00Z") + n * DAY).toISOString().slice(0, 10);
async function sent(d, title, date, now = NOW) {
  const r = await S.saveRelease(d, now, R, { by: "Luke", title, date, pack: FULL });
  return (await S.sendRelease(d, now, R, { by: "Luke", id: r.id })).release;
}
const waiting = async (d, now = NOW) => S.waitingOnLuke(await S.loadDesk(d, now), S.spDay(now), now);

test("waitingOnLuke: open decision/reply/action messages to Luke, not to others, not resolved, not needs none", async () => {
  const d = memoryDesk();
  const say = (min, from, to, text, needs) => S.sendMessage(d, NOW - min * MIN, R, { from, to, text, needs });
  const dec = (await say(50, "Nova", "Luke", "Survivors on Fri 11 Dec?", "decision")).message;
  const act = (await say(40, "Kevin", "Luke", "TikTok wants the code from your phone.", "action")).message;
  const rep = (await say(30, "Atlas", "Luke", "Is Dance / House right for the pitch?", "reply")).message;
  await say(20, "Ledger", "Luke", "Wise checked, nothing new.", "none");
  await say(15, "Nova", "Ledger", "Did Wise load today?", "decision");
  const done = (await say(10, "Drop", "Luke", "New cover?", "decision")).message;
  await S.resolveMessage(d, NOW - 5 * MIN, R, { id: done.id, by: "Luke", note: "Yes" });
  await say(5, "HQ", "Luke", "HQ check: all good.", "none");

  const w = await waiting(d);
  assert.deepEqual(w.map((x) => x.key), ["m:" + dec.id, "m:" + act.id, "m:" + rep.id], "oldest first; only open ones to Luke");
  assert.deepEqual(w[0], { key: "m:" + dec.id, kind: "message", id: dec.id, text: "Nova asked you to decide something", href: "#messages/" + dec.id, at: dec.at });
  assert.equal(w[1].text, "Kevin needs you to do something");
  assert.equal(w[2].text, "Atlas is waiting for your reply");
  assert.equal(w[2].href, "#messages/" + rep.id);

  /* Luke's answer settles it, and it leaves the list */
  await S.sendMessage(d, NOW, R, { from: "Luke", to: "Atlas", text: "Yes.", re: rep.id });
  assert.deepEqual((await waiting(d)).map((x) => x.id), [dec.id, act.id]);
});

test("waitingOnLuke: spotify unknown and retry count, answered and pipeline don't", async () => {
  const d = memoryDesk();
  await sent(d, "Pipeline Song", day(20));
  await S.reportSightings(d, NOW - 60 * MIN, R, { by: "Atlas", releases: [
    { title: "Velvet Night", date: day(16) }, { title: "Pipeline Song", date: day(20) }, { title: "Told Song", date: day(18) }, { title: "Lost Song", date: day(19) }] });
  await S.answerSighting(d, NOW - 50 * MIN, R, { by: "Luke", key: S.sightKey("Told Song", day(18)), answer: "notmine" });
  await S.answerSighting(d, NOW - 40 * MIN, R, { by: "Luke", key: S.sightKey("Lost Song", day(19)), answer: "mistake" });
  /* the message to Nova about Lost Song never went: the claim is older than a minute, so Luke is asked again (retry) */
  const doc = await d.getWithMetadata("sightings.json", { type: "json" });
  doc.data.answers[S.sightKey("Lost Song", day(19))].msg = "sending:" + new Date(NOW - 30 * MIN).toISOString();
  await d.setJSON("sightings.json", doc.data);

  const w = (await waiting(d)).filter((x) => x.kind === "spotify");
  assert.deepEqual(w.map((x) => x.key).sort(), ["s:" + S.sightKey("Lost Song", day(19)), "s:" + S.sightKey("Velvet Night", day(16))].sort());
  const v = w.find((x) => x.id === S.sightKey("Velvet Night", day(16)));
  assert.deepEqual(v, { key: "s:" + S.sightKey("Velvet Night", day(16)), kind: "spotify", id: S.sightKey("Velvet Night", day(16)), text: "Velvet Night is in Spotify for Artists: say what it is", href: "#releases", at: TODAY });
  assert.ok(!w.some((x) => /Pipeline Song|Told Song/.test(x.text)));
  /* no report at all: nothing */
  assert.deepEqual(await waiting(memoryDesk()), []);
});

test("waitingOnLuke: teasers due today or late counts; tomorrow, done, skipped, draft and cancelled don't", async () => {
  const d = memoryDesk();
  const due = await sent(d, "Due Song", day(3));
  const late = await sent(d, "Late Song", day(1), NOW - 5 * DAY); /* sent 5 days ago: teasers were due 2 days ago */
  await sent(d, "Tomorrow Song", day(4));
  const doneR = await sent(d, "Done Song", day(3));
  await S.setStep(d, NOW, R, { by: "Luke", id: doneR.id, step: "teasers", status: "done" });
  const skipR = await sent(d, "Skip Song", day(3));
  await S.setStep(d, NOW, R, { by: "Luke", id: skipR.id, step: "teasers", status: "skipped", note: "No clips for this one" });
  await S.saveRelease(d, NOW, R, { by: "Luke", title: "Draft Song", date: day(3), pack: FULL });
  const gone = await sent(d, "Gone Song", day(3));
  await S.cancelRelease(d, NOW, R, { by: "Luke", id: gone.id });

  const w = await waiting(d);
  assert.deepEqual(w.map((x) => x.key), ["t:" + late.id, "t:" + due.id], "oldest first: the late one leads");
  assert.deepEqual(w[1], { key: "t:" + due.id, kind: "step", id: due.id, text: "Due Song: your teaser clips are due", href: "#releases/" + due.id, at: day(0) });
  assert.equal(w[0].text, "Late Song: your teaser clips are late");
  assert.equal(w[0].at, day(-2));
});

test("waitingOnLuke: alert text never carries amounts", async () => {
  const d = memoryDesk();
  await S.sendMessage(d, NOW, R, { from: "Ledger", to: "Luke", text: "Did USD 1,234.56 from Northlight Records land in Wise? It is still pending.", needs: "decision" });
  await S.sendMessage(d, NOW + MIN, R, { from: "Sheet", to: "Luke", text: "EUR 1.204,00 or EUR 1.240,00 for October?", needs: "reply" });
  const w = await waiting(d, NOW + 2 * MIN);
  assert.equal(w.length, 2);
  for (const x of w) {
    assert.doesNotMatch(x.text, /\d/, x.text);
    assert.doesNotMatch(x.text, /Northlight|Wise|USD|EUR/, x.text);
  }
});
