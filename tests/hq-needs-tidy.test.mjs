/* Needs you tidy (25 Nov 2026). Luke: "the needs you section keeps showing both of these messages and they're
   fully outdated and pointless"; "anything from the messages section should show up in needs you. messages
   section is pointless"; "waiting on others in needs you is also pointless because any info regarding bots
   should only be in the team section". Made-up names, songs and amounts only. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { needsCount } from "../netlify/lib/action-cards.mjs";
import { needsDesk } from "../netlify/lib/needs.mjs";

const NOW = Date.parse("2026-11-25T15:00:00Z");
const DAY = 86400000;
const R = S.DEFAULT_ROSTER;
const read = (f) => fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
const items = (desk, now) => needsCount(desk, S.spDay(now), now).items;
const TASK = { id: "T-77", owner: "Nova", task: "Made-up task", status: "blocked", blocker: "Waiting on Luke to approve the made-up poster" };

test("Done on a Nova task card takes it off, and it stays off while the sheet still says the same", async () => {
  const d = memoryDesk();
  let desk = { ...(await needsDesk(d, NOW, {})), lukeTasks: [TASK] };
  const t = items(desk, NOW).find((x) => x.id === "T-77");
  assert.ok(t, "the task is on the list");
  assert.equal(t.kind, "handle");
  await S.markNeedDone(d, NOW, R, { by: "Luke", key: t.key, to: "Nova", text: "Done" });
  for (const later of [NOW + 1000, NOW + 5 * DAY]) {
    desk = { ...(await needsDesk(d, later, {})), lukeTasks: [TASK] };
    assert.equal(items(desk, later).some((x) => x.id === "T-77"), false, "still off " + (later - NOW) / DAY + " days later");
  }
  /* the blocker changes: that is a new ask */
  desk = { ...(await needsDesk(d, NOW + 2000, {})), lukeTasks: [{ ...TASK, blocker: "Waiting on Luke to approve the second made-up poster" }] };
  assert.ok(items(desk, NOW + 2000).some((x) => x.id === "T-77"));
});

test("a money task is not on Needs you: money is not on HQ any more", async () => {
  const d = memoryDesk();
  const desk = { ...(await needsDesk(d, NOW, {})), lukeTasks: [
    { id: "T-90", owner: "Nova", task: "Made-up payout", status: "blocked", blocker: "blocked: waiting for Luke (a task). Made-up Label EUR 12.34, no proof of arrival." },
    { id: "T-91", owner: "Nova", task: "Made-up statement", status: "blocked", blocker: "Waiting on Luke to confirm the made-up royalty statement landed" },
    TASK,
  ] };
  const ids = items(desk, NOW).map((x) => x.id);
  assert.equal(ids.includes("T-90"), false);
  assert.equal(ids.includes("T-91"), false);
  assert.ok(ids.includes("T-77"), "an ordinary task still shows");
});

test("a bot card line older than two days is not on Needs you", async () => {
  const d = memoryDesk();
  await S.setCard(d, NOW - 3 * DAY, R, { bot: "Forge", working_on: "Made-up ads", blockers: "Google Ads 111-222-3333 signed out since 21 Nov" });
  let desk = await needsDesk(d, NOW, {});
  assert.equal(items(desk, NOW).some((x) => x.kind === "signin"), false, "three days old: outdated");
  await S.setCard(d, NOW - 3600000, R, { bot: "Forge", blockers: "Google Ads 111-222-3333 signed out since 24 Nov" });
  desk = await needsDesk(d, NOW, {});
  assert.ok(items(desk, NOW).some((x) => x.kind === "signin"), "said an hour ago: still real");
});

test("Done on a sign-in card holds until the bot says it again", async () => {
  const d = memoryDesk();
  await S.setCard(d, NOW - 3600000, R, { bot: "Forge", working_on: "Made-up ads", blockers: "Google Ads 111-222-3333 signed out since 24 Nov" });
  let desk = await needsDesk(d, NOW, {});
  const s = items(desk, NOW).find((x) => x.kind === "signin");
  assert.ok(s);
  await S.markNeedDone(d, NOW, R, { by: "Luke", key: s.key, to: "Forge", text: "Signed in" });
  desk = await needsDesk(d, NOW + 1000, {});
  assert.equal(items(desk, NOW + 1000).some((x) => x.kind === "signin"), false);
  /* Forge writes the blocker again after Luke's Done: it is back */
  await S.setCard(d, NOW + 60000, R, { bot: "Forge", blockers: "Google Ads 111-222-3333 signed out since 24 Nov, still" });
  desk = await needsDesk(d, NOW + 120000, {});
  assert.ok(items(desk, NOW + 120000).some((x) => x.kind === "signin"));
});

test("Needs you has no Waiting on others: that list is on Team", () => {
  const phone = read("js/hq-phone.js"), ws = read("js/hq-workspaces.js"), staff = read("js/hq-staff.js"), page = read("hq.html");
  assert.equal(/Waiting on others/.test(phone), false);
  assert.equal(/Waiting on others/.test(ws), false);
  assert.match(staff, /Waiting on others/);
  const team = page.slice(page.indexOf('id="team"'), page.indexOf("</section>", page.indexOf('id="autoCard"')));
  assert.match(team, /id="othersFold"/);
});

test("the Messages tab is gone: its address lands on Needs you, and You answered is on Needs you", () => {
  const page = read("hq.html"), shell = read("js/hq-shell.js"), lib = read("js/hq-lib.js");
  assert.equal(/data-tab="messages"/.test(page), false, "not in the rail or the More sheet");
  assert.match(shell, /TABS = \["today", "songs", "ads", "pages", "growth", "profiles", "releases", "team"\]/);
  assert.match(shell, /messages: "today"/);
  assert.match(page, /<section class="card view" id="messages" hidden>/);
  const today = page.slice(page.indexOf('id="today"'), page.indexOf('id="weekAhead"'));
  assert.match(today, /id="answeredCard"/);
  assert.equal(/\["messages", "Messages"/.test(lib), false, "Search no longer offers a Messages tab");
});
