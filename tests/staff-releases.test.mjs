/* The release pipeline (11 Nov 2026): the pack, its steps, who may do what, where it shows, and the
   replies that visibly land. Pure functions + the in-memory desk (memoryDesk), no Netlify. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../netlify/lib/staff.mjs";
import { memoryDesk, sampleBoard, sampleDesk, sampleReleases } from "../netlify/lib/staff-sample.mjs";
import { hqModel, mergeReleases } from "../netlify/lib/hq.mjs";
import { sampleSheets } from "../netlify/lib/hq-sample.mjs";

const NOW = Date.parse("2026-11-12T12:20:00Z"); /* Thu 12 Nov, 09:20 in São Paulo */
const TODAY = "2026-11-12";
const R = S.DEFAULT_ROSTER;
const fails = (p, re) => assert.rejects(p, (e) => e.name === "StaffError" && re.test(e.message));
const FULL = { kind: "Self-release", wav: "https://example.com/m.wav", artwork: "https://example.com/c.jpg", language: "Portuguese", explicit: "no", genre: "Dance", writers: "Sample Writer: music and lyrics", copyright: "℗ 2026 Sample · © 2026 Sample" };
const all = async (d) => S.listMessages(d, NOW + 86400000);
async function sent(d, title = "Survivors", date = "2026-12-11", pack = FULL) {
  const r = await S.saveRelease(d, NOW, R, { by: "Luke", title, date, pack });
  return (await S.sendRelease(d, NOW, R, { by: "Luke", id: r.id })).release;
}

test("releases: the pack is one list; every field has a group, the steps have owners and days", () => {
  assert.equal(S.PACK_FIELDS.length, 28);
  const groups = Object.fromEntries(["deal", "files", "stores", "lyrics", "pitch", "later", "notes"].map((g) => [g, S.PACK_FIELDS.filter((f) => f.group === g).map((f) => f.key)]));
  assert.deepEqual(groups, { deal: ["kind", "label", "split", "distributor", "deal"], files: ["wav", "artwork", "folder"], stores: ["language", "explicit", "genre", "subgenre", "version", "writers", "producers", "featuring", "copyright"],
    lyrics: ["lyrics"], pitch: ["mood", "instruments", "story"], later: ["isrc", "upc", "storeStatus", "spotifyTrack", "video", "page"], notes: ["notes"] });
  assert.deepEqual(S.PACK_FIELDS.filter((f) => f.required).map((f) => f.key), ["kind", "wav", "artwork", "language", "explicit", "genre", "writers", "copyright"], "the copyright line is required since 11 Nov 2026");
  assert.deepEqual(S.PACK_FIELDS.filter((f) => f.requiredWhen).map((f) => [f.key, f.requiredWhen.field, f.requiredWhen.equals]), [["label", "kind", "With a label"], ["split", "kind", "With a label"]]);
  for (const f of S.PACK_FIELDS) { assert.ok(f.label && f.short && f.hint, f.key); if (f.neededBy) assert.ok(S.RELEASE_STEPS.some((s) => s.key === f.neededBy), f.key); }
  assert.deepEqual(S.RELEASE_STEPS.map((s) => [s.key, s.owner, s.days]), [["upload", "Drop", 21], ["approved", "Drop", 16], ["spotify", "Atlas", 15], ["pitch", "Atlas", 14], ["lyrics", "Verse", 10], ["page", "Webmaster", 7], ["video", "Laura", 7], ["teasers", "Luke", 3], ["ads", "Forge", 1], ["live", "Webmaster", 0]]);
  assert.equal(S.RELEASE_STEPS.find((s) => s.key === "pitch").after, "spotify");
  assert.equal(S.releaseId("Me Dá Seu Body"), "medaseubody");
  assert.equal(S.dayWords("2026-12-11"), "Fri 11 Dec");
});

test("releases: steps are dated back from the release day; a late send is compressed to today and flagged tight", () => {
  const roomy = S.scheduleSteps("2026-12-11", TODAY);
  assert.equal(roomy.tight, false);
  assert.deepEqual(roomy.steps.map((s) => s.due), ["2026-11-20", "2026-11-25", "2026-11-26", "2026-11-27", "2026-12-01", "2026-12-04", "2026-12-04", "2026-12-08", "2026-12-10", "2026-12-11"]);
  assert.ok(roomy.steps.every((s) => s.status === "todo" && s.note === "" && s.at === null));
  const late = S.scheduleSteps("2026-11-27", TODAY); /* 15 days away */
  assert.equal(late.tight, true);
  assert.deepEqual(late.steps.slice(0, 4).map((s) => s.due), [TODAY, TODAY, TODAY, "2026-11-13"], "upload, approval and Spotify for Artists were due before today: due today, never born late");
  assert.equal(S.releaseView({ id: "x", title: "X", date: "2026-11-27", status: "scheduled", steps: late.steps, pack: {} }, TODAY).counts.late, 0);
});

test("releases: Luke or Claude start a draft; unknown fields, bad links and bots are refused in sentences", async () => {
  const d = memoryDesk();
  const r = await S.saveRelease(d, NOW, R, { by: "Luke", title: " Me Dá Seu Body ", date: "2026-12-11", pack: { wav: "https://example.com/m.wav", explicit: "YES" } });
  assert.deepEqual([r.id, r.title, r.status, r.createdBy, r.pack.explicit, r.steps.length], ["medaseubody", "Me Dá Seu Body", "draft", "Luke", "Yes", 0]);
  await fails(S.saveRelease(d, NOW, R, { by: "Luke", id: r.id, pack: { wav: "http://example.com/m.wav" } }), /Master WAV must be a link that starts with https:\/\//);
  await fails(S.saveRelease(d, NOW, R, { by: "Luke", id: r.id, pack: { bpm: "124", mood: "x" } }), /not a field of the release pack: bpm\. The fields are: kind, label/);
  await fails(S.saveRelease(d, NOW, R, { by: "Luke", id: r.id, pack: { explicit: "maybe" } }), /Explicit must be one of: No, Yes, Clean version/);
  await fails(S.saveRelease(d, NOW, R, { by: "Drop", title: "Mine" }), /Only Luke or Claude can start or edit a release pack/);
  await fails(S.saveRelease(d, NOW, R, { by: "Luke", title: "me da seu body" }), /already a release called "Me Dá Seu Body".*edit it instead/, "the same form twice never makes two");
  assert.match((await S.saveRelease(d, NOW, R, { by: "Luke", title: "Old", date: "2026-11-01" })).log[0].what, /^Luke started the pack for Sun 1 Nov \(already out\)$/, "a song already out can be recorded (11 Nov 2026)");
  await fails(S.saveRelease(d, NOW, R, { by: "Luke", title: "Bad day", date: "2026-02-30" }), /YYYY-MM-DD/);
  /* a new title keeps the id; the fields left out keep their value; "" clears one */
  const renamed = await S.saveRelease(d, NOW + 1, R, { by: "Claude", id: r.id, title: "Me Da Seu Body (Radio)", pack: { genre: "Dance", explicit: "" } });
  assert.deepEqual([renamed.id, renamed.title, renamed.pack.wav, renamed.pack.genre, "explicit" in renamed.pack], ["medaseubody", "Me Da Seu Body (Radio)", "https://example.com/m.wav", "Dance", false]);
  assert.match(renamed.log.at(-1).what, /^Claude renamed it from "Me Dá Seu Body" to "Me Da Seu Body \(Radio\)"; changed Genre and Explicit$/);
  assert.equal((await S.listReleases(d)).length, 2);
});

test("releases: lyrics with ordinary words pass the secrets guard; a real secret does not, and the refusal names the line", async () => {
  const d = memoryDesk();
  const r = await S.saveRelease(d, NOW, R, { by: "Luke", title: "Lyric test", date: "2026-12-11" });
  const lyrics = "You know the password, baby\nThe password is forever\nMe liga 11 98765-4321 tonight\n\n\n\nOne more time";
  const ok = await S.saveRelease(d, NOW, R, { by: "Luke", id: r.id, pack: { lyrics } });
  assert.equal(ok.pack.lyrics, "You know the password, baby\nThe password is forever\nMe liga 11 98765-4321 tonight\n\nOne more time", "lines kept, a long gap cut to one empty line");
  /* lines of a song with a digit in them (11 Nov 2026: each of these used to be refused as a password) */
  const sung = ["the password is 2night", "my secret is 4ever yours", "pass: 24/7 on my mind", "token: 1000 kisses", "Secret: 2getha!"];
  for (const line of sung) assert.equal(S.packValue("lyrics", "La la\n" + line), "La la\n" + line, line);
  await fails(S.saveRelease(d, NOW, R, { by: "Luke", id: r.id, pack: { lyrics: "La la la\npassword: hunter42x" } }), /^Lyrics, line 2 \("password: hunter••x"\) looks like a password, code or key\. Nothing was saved\. .*take that out and save again\.$/);
  await fails(S.saveRelease(d, NOW, R, { by: "Luke", id: r.id, pack: { notes: "pass: 24/7 on my mind" } }), /^Notes \("pass: ••\/• on my mind"\) looks like a password/, "outside the lyrics the guard is as strict as everywhere");
  await fails(S.saveRelease(d, NOW, R, { by: "Luke", id: r.id, pack: { notes: "card 4242 4242 4242 4242" } }), /card number/);
  assert.throws(() => S.packValue("storeStatus", "pass: 2fa9x8"), (e) => /^Status at the distributor \("pass: •fa•x•"\) looks like a password/.test(e.message) && !/ask Luke/i.test(e.message), "a bot is never told to ask Luke for this");
  assert.equal((await S.listReleases(d))[0].pack.lyrics, ok.pack.lyrics, "a refused save changes nothing");
});

test("releases: sending refuses with the list of what is missing; then schedules, tells everyone once, and never twice", async () => {
  const d = memoryDesk();
  const r = await S.saveRelease(d, NOW, R, { by: "Luke", title: "Survivors", pack: { wav: FULL.wav, genre: "Dance" } });
  await assert.rejects(S.sendRelease(d, NOW, R, { by: "Luke", id: r.id }), (e) => e.name === "StaffError" && e.message === "Still missing: Release day, Self-release or label, Artwork, Language, Explicit, Writers, Copyright line. Fill them in, then send again. The release day can't be left out: every step is dated from it." && e.missing.join() === "date,kind,artwork,language,explicit,writers,copyright" && !e.anyway);
  await fails(S.sendRelease(d, NOW, R, { by: "Nova", id: r.id }), /Only Luke or Claude can send a release/);
  await S.saveRelease(d, NOW, R, { by: "Luke", id: r.id, date: "2026-12-11", pack: FULL });
  const out = await S.sendRelease(d, NOW + 1, R, { by: "Luke", id: r.id });
  assert.equal(out.already, false); assert.ok(out.told);
  assert.deepEqual([out.release.status, out.release.steps.length, out.release.tight, out.release.steps[0].due], ["scheduled", 10, false, "2026-11-20"]);
  assert.match(out.release.log.at(-1).what, /^Luke sent it to the team for Fri 11 Dec$/);
  const again = await S.sendRelease(d, NOW + 2, R, { by: "Claude", id: r.id });
  assert.deepEqual([again.already, again.told], [true, null]);
  const notes = (await all(d)).filter((m) => m.to === "all");
  assert.equal(notes.length, 1, "ONE message, however many times it is sent");
  assert.equal(notes[0].from, "HQ", "the site's note, not a message in Luke's name on his own board");
  assert.equal(notes[0].text, "New release from Luke: Survivors, out Fri 11 Dec. The pack is on the desk (tool release_pack). Your steps and their dates are in my_day.");
  /* a late one says so */
  const t = await S.saveRelease(d, NOW, R, { by: "Claude", title: "Quick One", date: "2026-11-20", pack: FULL });
  const quick = await S.sendRelease(d, NOW, R, { by: "Claude", id: t.id });
  assert.equal(quick.release.tight, true);
  assert.match((await all(d)).find((m) => m.from === "HQ" && /^New release from Claude: Quick One/.test(m.text)).text, /8 days away, so the steps that should already be done are due today/);
  await fails(S.saveRelease(d, NOW, R, { by: "Luke", id: r.id, date: "2026-12-18" }), /already gone to the team.*Change the date/);
});

test("releases: moving the date moves only the open steps, logs it and tells everyone once", async () => {
  const d = memoryDesk();
  const r = await sent(d);
  await S.setStep(d, NOW, R, { by: "Drop", id: r.id, step: "upload", status: "done", link: "https://example.com/rn" });
  const m = await S.moveRelease(d, NOW + 1, R, { by: "Luke", id: r.id, date: "2026-12-18" });
  assert.equal(m.moved, true);
  const by = Object.fromEntries(m.release.steps.map((s) => [s.key, s.due]));
  assert.equal(by.upload, "2026-11-20", "a done step keeps its date");
  assert.deepEqual([by.approved, by.pitch, by.live], ["2026-12-02", "2026-12-04", "2026-12-18"]);
  assert.equal(m.release.date, "2026-12-18");
  assert.equal(m.release.log.at(-1).what, "Luke moved the date from Fri 11 Dec to Fri 18 Dec");
  assert.equal((await all(d)).filter((x) => /^Luke moved Survivors from Fri 11 Dec to Fri 18 Dec\. Every step that is not done has a new date/.test(x.text)).length, 1);
  assert.equal((await S.moveRelease(d, NOW + 2, R, { by: "Luke", id: r.id, date: "2026-12-18" })).moved, false, "the same date again does nothing");
  await fails(S.moveRelease(d, NOW, R, { by: "Atlas", id: r.id, date: "2026-12-25" }), /Only Luke or Claude/);
  await fails(S.moveRelease(d, NOW, R, { by: "Luke", id: r.id, date: "2026-11-01" }), /already passed/);
  /* cancelling a scheduled one tells the team; a draft that never went out does not */
  const c = await S.cancelRelease(d, NOW + 3, R, { by: "Claude", id: r.id });
  assert.equal(c.release.status, "cancelled"); assert.ok(c.told);
  const draft = await S.saveRelease(d, NOW, R, { by: "Luke", title: "Never Out" });
  assert.equal((await S.cancelRelease(d, NOW, R, { by: "Luke", id: draft.id })).told, null);
  assert.equal((await all(d)).filter((x) => /^Claude cancelled Survivors/.test(x.text)).length, 1);
  await fails(S.setStep(d, NOW, R, { by: "Drop", id: r.id, step: "approved", status: "done" }), /was cancelled/);
  /* a cancelled title can be started again: it gets its own id */
  assert.equal((await S.saveRelease(d, NOW, R, { by: "Luke", title: "Survivors" })).id, "survivors2");
});

test("releases: a step is marked by its owner, Nova, Claude or Luke; never by another bot", async () => {
  const d = memoryDesk();
  const r = await sent(d);
  await fails(S.setStep(d, NOW, R, { by: "Atlas", id: r.id, step: "upload", status: "done" }), /"Uploaded to RouteNote with the release date" is Drop's step\. Only Drop, Nova, Claude or Luke can mark it/);
  await fails(S.setStep(d, NOW, R, { by: "Drop", id: r.id, step: "approved", status: "blocked" }), /blocked step needs a note: say exactly what is needed and from whom/);
  await fails(S.setStep(d, NOW, R, { by: "Drop", id: r.id, step: "upload", status: "finished" }), /status must be one of: todo, working, done, blocked/);
  await fails(S.setStep(d, NOW, R, { by: "Drop", id: r.id, step: "mastering", status: "done" }), /not a step of this release\. The steps are: upload, approved/);
  await fails(S.setStep(d, NOW, R, { by: "Drop", id: "Nope", step: "upload", status: "done" }), /no release called "Nope"\. The releases on the desk are: Survivors \(survivors\)/);
  await fails(S.setStep(d, NOW, R, { by: "Drop", id: r.id, step: "upload", status: "done", link: "http://x.example" }), /link must start with https/);
  const a = await S.setStep(d, NOW, R, { by: "drop", id: "SURVIVORS", step: "upload", status: "done", note: "Uploaded with the date" });
  const up = a.steps.find((s) => s.key === "upload");
  assert.deepEqual([up.status, up.by, up.note], ["done", "Drop", "Uploaded with the date"]);
  assert.equal((await S.setStep(d, NOW, R, { by: "Nova", id: r.id, step: "pitch", status: "working" })).steps[3].by, "Nova");
  assert.equal((await S.setStep(d, NOW, R, { by: "Luke", id: r.id, step: "teasers", status: "done" })).steps[7].status, "done");
  /* the bot's mark is a line in the live log, but it never finishes the bot's daily duty */
  const ups = await S.listUpdates(d, NOW, 1);
  assert.equal(ups.length, 2, "Drop's and Nova's marks; Luke is not a bot");
  const drop = ups.find((u) => u.bot === "Drop");
  assert.equal(drop.message, "Survivors: Uploaded to RouteNote with the release date — done: Uploaded with the date");
  assert.equal(drop.release, "survivors");
  assert.deepEqual(S.dutyOverlay(ups, TODAY).byBot, {}, "a release step is not today's duty");
  /* the same mark again: nothing new in the log */
  await S.setStep(d, NOW + 5, R, { by: "Drop", id: r.id, step: "upload", status: "done", note: "Uploaded with the date" });
  assert.equal((await S.listUpdates(d, NOW, 1)).length, 2);
  /* a draft has no steps, and a bot can't even see it */
  const dr = await S.saveRelease(d, NOW, R, { by: "Luke", title: "Draft Song" });
  await fails(S.setStep(d, NOW, R, { by: "Luke", id: dr.id, step: "upload", status: "done" }), /not been sent to the team yet/);
  await fails(S.setStep(d, NOW, R, { by: "Drop", id: dr.id, step: "upload", status: "done" }), /no release called "draftsong"/);
});

test("releases: a bot fills only the fields it is responsible for; Nova what any bot may fill", async () => {
  const d = memoryDesk();
  const r = await sent(d);
  assert.equal((await S.fillRelease(d, NOW, R, { by: "Drop", id: "survivors", field: "isrc", value: " SAMPLE0000003 " })).pack.isrc, "SAMPLE0000003");
  /* the lyrics are Luke's words: Verse puts them live, it never writes them (the guide), so no bot fills them */
  for (const by of ["Drop", "Verse", "Nova"]) await fails(S.fillRelease(d, NOW, R, { by, id: r.id, field: "lyrics", value: "la la" }), /Lyrics is filled by Luke or Claude only, not by you/);
  await fails(S.fillRelease(d, NOW, R, { by: "Verse", id: r.id, field: "wav", value: "https://example.com/x.wav" }), /Master WAV is filled by Luke or Claude only, not by you/);
  await fails(S.fillRelease(d, NOW, R, { by: "Nova", id: r.id, field: "artwork", value: "https://example.com/x.jpg" }), /Luke or Claude only/);
  await fails(S.fillRelease(d, NOW, R, { by: "Drop", id: r.id, field: "bpm", value: "124" }), /"bpm" is not a field of the release pack\. You can fill: isrc, upc, storeStatus/);
  await fails(S.fillRelease(d, NOW, R, { by: "Atlas", id: r.id, field: "spotifyTrack", value: "open.spotify.com/track/1" }), /must be a link that starts with https/);
  await fails(S.fillRelease(d, NOW, R, { by: "Drop", id: r.id, field: "upc", value: "  " }), /value is empty/);
  assert.equal((await S.fillRelease(d, NOW, R, { by: "Nova", id: r.id, field: "upc", value: "0000000000009" })).pack.upc, "0000000000009");
  const v = await S.fillRelease(d, NOW, R, { by: "Webmaster", id: r.id, field: "spotifyTrack", value: "https://open.spotify.com/track/sample" });
  assert.equal(v.log.at(-1).what, "Webmaster filled Spotify track link");
  assert.deepEqual(S.fieldsFor("Drop"), ["isrc", "upc", "storeStatus"]);
  assert.equal(S.fieldsFor("Nova").length, 6); assert.equal(S.fieldsFor("Luke").length, 28); assert.deepEqual(S.fieldsFor("Verse"), []);
});

test("releases: the view says what is missing (required first), what is late, and what is next", () => {
  const today = "2026-11-12";
  const r = { id: "x", title: "X", date: "2026-11-25", status: "scheduled", pack: { ...FULL, mood: "warm" }, tight: false,
    steps: S.scheduleSteps("2026-11-25", "2026-11-01").steps };
  r.steps[0].status = "done"; r.steps[1].status = "blocked"; r.steps[1].note = "needs a new cover";
  const v = S.releaseView(r, today);
  assert.deepEqual([v.daysToGo, v.weekday, v.dateWords, v.released], [13, "Wed", "Wed 25 Nov", false]);
  assert.deepEqual(v.missing.map((m) => [m.key, m.required, m.neededBy]), [["lyrics", false, "lyrics"], ["instruments", false, "pitch"], ["story", false, "pitch"]],
    "the video link is Laura's result, not her input: never missing, like the ISRC");
  assert.deepEqual([v.missing[0].step, v.missing[0].owner, v.missing[0].due], ["Lyrics live", "Verse", "2026-11-15"]);
  assert.deepEqual([v.packFilled, v.packTotal], [8, 17], "the team's 'later' fields and the deal are not counted");
  assert.deepEqual(v.counts, { done: 1, total: 10, late: 2, blocked: 1, skipped: 0, waiting: 1 });
  assert.deepEqual(v.steps.map((s) => s.late), [false, true, true, false, false, false, false, false, false, false], "the pitch waits for Spotify for Artists: never late");
  assert.deepEqual([v.steps[3].key, v.steps[3].waiting, v.steps[3].waitingFor, v.steps[3].waitingText], ["pitch", true, "spotify", "waiting: the song is not in Spotify for Artists yet"]);
  assert.equal(v.steps[4].dueIn, 3);
  assert.deepEqual([v.next.key, v.next.status, v.next.late], ["approved", "blocked", true]);
  assert.equal(v.where, "1 of 10 steps done · next: Approved by RouteNote (nothing waiting), Drop, late since Mon 9 Nov");
  assert.deepEqual(v.warnings, ["Approved by RouteNote (nothing waiting) is blocked (Drop): needs a new cover", "Not showing in Spotify for Artists yet, 13 days before release: the pitch cannot be sent until it does", "Lyrics are missing and Lyrics live is due Sun 15 Nov"]);
  assert.deepEqual(v.deal, { kind: "Self-release", label: "", split: "", distributor: "RouteNote (badscandaladmin)", id: "x" });
  const draft = S.releaseView({ id: "y", title: "Y", status: "draft", pack: {} }, today);
  assert.deepEqual(draft.missing.filter((m) => m.required).map((m) => m.key), ["date", "kind", "wav", "artwork", "language", "explicit", "genre", "writers", "copyright"]);
  assert.match(draft.where, /^In the pipeline: 0 of 17 filled · still missing: Release day, Self-release or label, /);
  assert.equal(draft.next, null);
  const out = S.releaseView({ ...r, date: "2026-11-12" }, today);
  assert.equal(out.released, true, "released is computed: scheduled and its day has come");
  assert.equal(S.releaseView({ ...r, status: "draft", date: "2026-11-01" }, today).released, false);
});

test("releases: the board carries the releases, the pack fields, the steps, and each bot's release steps", () => {
  const b = sampleBoard(NOW);
  assert.deepEqual(b.releases.map((r) => [r.id, r.status, r.released]), [["medaseubody", "scheduled", false], ["slowburn", "scheduled", false], ["survivors", "draft", false], ["touchme", "scheduled", true]]);
  assert.equal(b.packFields.length, 28);
  assert.deepEqual(Object.keys(b.packFields[0]).sort(), ["choices", "fill", "group", "hint", "key", "kind", "label", "max", "neededBy", "required", "requiredWhen", "short"]);
  assert.deepEqual(b.packFields.find((f) => f.key === "explicit").choices, ["No", "Yes", "Clean version"]);
  assert.deepEqual([b.packFields[0].key, b.packFields[0].group, b.packFields[0].requiredWhen], ["kind", "deal", null]);
  assert.deepEqual(b.packFields.find((f) => f.key === "split").requiredWhen, { field: "kind", equals: "With a label" });
  assert.deepEqual(b.releaseSteps[0], { key: "upload", label: "Uploaded to RouteNote with the release date", owner: "Drop", days: 21 });
  assert.deepEqual(b.releaseSteps.find((s) => s.key === "pitch"), { key: "pitch", label: "Spotify pitch sent", owner: "Atlas", days: 14, after: "spotify" });
  const w = Object.fromEntries(b.staff.map((x) => [x.name, x]));
  assert.equal(w.Drop.state, "blocked", "a blocked release step makes the bot blocked");
  assert.equal(w.Atlas.state, "late", "a late release step makes the bot late");
  assert.deepEqual(w.Atlas.releaseSteps.map((s) => [s.id, s.key, s.status, s.late, s.waiting]), [["medaseubody", "spotify", "todo", true, false], ["medaseubody", "pitch", "todo", false, true], ["slowburn", "pitch", "todo", false, false]]);
  assert.deepEqual(Object.keys(w.Atlas.releaseSteps[0]).sort(), ["due", "dueIn", "id", "key", "label", "late", "note", "status", "title", "waiting"]);
  assert.deepEqual(w.Webmaster.releaseSteps.map((s) => s.key + ":" + s.id), ["page:medaseubody", "live:medaseubody", "page:slowburn", "live:slowburn"], "soonest first; the released song's steps are all done");
  assert.deepEqual(w.Drop.releaseSteps.map((s) => s.key + ":" + s.id), ["approved:medaseubody"], "the label delivers Slow Burn: its upload and approval are not Drop's");
  assert.equal(w.Steve.releaseSteps.length, 0);
});

test("releases: the same song in the sheet and on the desk is ONE entry in hqModel, with the desk's steps", () => {
  const sheet = { Releases: [["song", "slug", "release_date", "status", "T-21 submitted", "notes"], ["Me Da Seu Body", "medaseubody", "2026-11-20", "in review at RouteNote", "done", "sheet note"], ["Other Song", "other", "2026-12-04", "planned", "", ""]],
    Songs: [["date", "song", "spotify_streams"], ["2026-11-10", "Me Dá Seu Body", "10"]] };
  const desk = S.releaseView({ id: "medaseubody", title: "Me Dá Seu Body", date: "2026-11-25", status: "scheduled", pack: { ...FULL, notes: "desk note" }, steps: S.scheduleSteps("2026-11-25", "2026-11-01").steps }, TODAY);
  const m = hqModel(sheet, TODAY, {}, undefined, "09:20", { updates: [], overlay: null, releases: [desk] });
  assert.equal(m.releases.length, 2, "one entry per song");
  const one = m.releases.find((r) => r.desk);
  assert.deepEqual([one.song, one.date, one.status, one.slug, one.steps.length, one.id], ["Me Dá Seu Body", "2026-11-25", "in review at RouteNote", "medaseubody", 10, "medaseubody"]);
  assert.deepEqual(Object.keys(one.steps[0]).sort(), ["done", "due", "label", "late", "note", "owner"]);
  assert.equal(one.late, 3, "upload, approval and Spotify for Artists were due before today and are not done; the pitch waits");
  assert.deepEqual([one.steps[3].label, one.steps[3].late, one.steps[3].waiting], ["Spotify pitch sent", false, true]);
  assert.equal(m.next.song, "Me Dá Seu Body"); assert.equal(m.next.desk, true);
  assert.equal(m.songs[0].released, "2026-11-25", "the song's release date comes from the desk");
  /* a desk-only release joins the list; drafts never do; no desk = exactly the sheet */
  const solo = mergeReleases([], [desk, { ...desk, title: "Draft", status: "draft" }], TODAY);
  assert.equal(solo.length, 1);
  assert.deepEqual(mergeReleases(m.releases.filter((r) => !r.desk), [], TODAY).map((r) => r.song), ["Other Song"]);
  assert.equal(hqModel(sheet, TODAY).releases.find((r) => r.slug === "medaseubody").steps.length, 6, "without the desk the sheet's own timeline");
  /* the sample: the made-up desk joins the made-up sheet without doubles */
  const views = sampleReleases(NOW).filter((r) => r.status === "scheduled").map((r) => S.releaseView(r, TODAY));
  const sm = hqModel(sampleSheets(TODAY, NOW), TODAY, {}, undefined, "09:20", { releases: views });
  assert.deepEqual(sm.releases.map((r) => [r.song, !!r.desk]), [["Touch Me", true], ["Me Dá Seu Body", true], ["Slow Burn", true], ["Survivors", false]]);
  assert.deepEqual([sm.next.song, sm.next.desk, sm.next.status], ["Me Dá Seu Body", true, "in review at RouteNote"]);
});

test("releases: the site's check names late and blocked steps and a field a step needs within 3 days", () => {
  const desk = sampleDesk(NOW);
  const r = S.checkReport({ desk, hq: null, hqState: null, now: NOW });
  assert.ok(r.problems.includes("Me Dá Seu Body: Not showing in Spotify for Artists yet, 13 days before release: the pitch cannot be sent until it does"), r.problems.join("\n"));
  assert.ok(!r.problems.some((p) => /Spotify pitch sent is late|Showing as upcoming in Spotify for Artists is late/.test(p)), "the pitch waits; the Spotify step is said once, with what it means");
  assert.ok(r.problems.includes("'Velvet Night' is upcoming in Spotify for Artists but not in the pipeline: Luke has to say what it is"));
  assert.ok(r.problems.some((p) => /^Me Dá Seu Body: Approved by RouteNote \(nothing waiting\) is blocked \(Drop\): RouteNote wants a cover/.test(p)));
  assert.ok(r.problems.some((p) => /^Me Dá Seu Body: lyrics still missing and Lyrics live is due Sun 15 Nov/.test(p)));
  assert.ok(!r.problems.some((p) => /Approved by RouteNote.*is late/.test(p)), "a blocked step is said once, as blocked");
  assert.ok(!r.problems.some((p) => /^(Touch Me|Survivors|Slow Burn):/.test(p)), "the released one is done; the draft is Luke's; the label release is on time");
  assert.deepEqual(["morning", "afternoon", "evening"], [S.dayPart(NOW), S.dayPart(Date.parse("2026-11-12T18:35:00Z")), S.dayPart(Date.parse("2026-11-13T00:35:00Z"))]);
  assert.equal(S.dayPart(Date.parse("2026-11-12T15:59:00Z")), "morning", "12:59 São Paulo");
  assert.equal(S.dayPart(Date.parse("2026-11-12T22:00:00Z")), "evening", "19:00 São Paulo");
});

test("replies: Luke's answer settles what waits on him; a bot's answer to an action does not", async () => {
  const d = memoryDesk();
  const act = (await S.sendMessage(d, NOW, R, { from: "Kevin", to: "Luke", text: "Need the TikTok code in the secure form.", needs: "action" })).message;
  const dec = (await S.sendMessage(d, NOW, R, { from: "Nova", to: "Luke", text: "Survivors on Fri 11 Dec?", needs: "decision", options: ["Yes", "No"] })).message;
  const r1 = await S.sendMessage(d, NOW + 1000, R, { from: "Luke", to: "Kevin", text: "Done, check now.", re: act.id });
  assert.deepEqual([r1.parent.resolved.by, r1.parent.resolved.note], ["Luke", "answered"]);
  await S.sendMessage(d, NOW + 2000, R, { from: "Luke", to: "Nova", text: "Let me think until Friday.", re: dec.id });
  assert.equal(S.waitingOn(await S.listMessages(d, NOW + 3000), "Luke").length, 0, "nothing Luke answered stays in Waiting on you");
  /* everyone else: only a reply-type message is settled by an answer */
  const ask = (await S.sendMessage(d, NOW, R, { from: "Claude", to: "Ledger", text: "Please re-check the Bank row.", needs: "action" })).message;
  const r2 = await S.sendMessage(d, NOW + 4000, R, { from: "Ledger", to: "Claude", text: "Looking now.", re: ask.id });
  assert.equal(r2.parent.resolved, null);
  assert.equal(S.waitingOn(await S.listMessages(d, NOW + 5000), "Ledger").length, 1);
  /* Luke answering something that waits on a bot does not close it for the bot */
  const botAsk = (await S.sendMessage(d, NOW, R, { from: "Nova", to: "Atlas", text: "Pitch today please.", needs: "action" })).message;
  await S.sendMessage(d, NOW + 6000, R, { from: "Luke", to: "Atlas", text: "Yes, today.", re: botAsk.id });
  assert.equal(S.waitingOn(await S.listMessages(d, NOW + 7000), "Atlas").length, 1);
});

test("replies: every message says whether its reader has looked since, and Luke's answers are listed", async () => {
  const d = memoryDesk();
  const t0 = NOW;
  const q = (await S.sendMessage(d, t0, R, { from: "Nova", to: "Luke", text: "Which cover?", needs: "decision", options: ["A", "B"] })).message;
  const act = (await S.sendMessage(d, t0 + 60000, R, { from: "Drop", to: "Luke", text: "New cover please.", needs: "action" })).message;
  await S.sendMessage(d, t0 + 120000, R, { from: "Claude", to: "all", text: "Note for everyone." });
  await S.resolveMessage(d, t0 + 180000, R, { id: q.id, by: "Luke", note: "A" });
  const rep = (await S.sendMessage(d, t0 + 240000, R, { from: "Luke", to: "Drop", text: "It's in the folder.", re: act.id })).message;
  await S.touchRead(d, t0 + 300000, "Nova"); /* Nova read after Luke answered; Drop has not */
  await S.touchSeen(d, t0 + 300000, "Drop", "post_update"); /* using the desk is not reading it (V6) */
  let b = S.board(await S.loadDesk(d, t0 + 360000), t0 + 360000, null);
  const byId = Object.fromEntries(b.messages.flatMap((m) => [m, ...m.replies]).map((m) => [m.id, m]));
  assert.deepEqual([byId[q.id].seen, byId[act.id].seen], [null, null], "sent to Luke: nobody's visit to tell");
  assert.equal(b.messages.find((m) => m.to === "all").seen, null);
  assert.deepEqual([byId[rep.id].seen, byId[rep.id].seenAt], [false, null], "Drop has not looked yet");
  assert.deepEqual(b.answered.map((a) => [a.id, a.from, a.reply.kind, a.reply.text, a.reply.seen]), [[act.id, "Drop", "reply", "It's in the folder.", false], [q.id, "Nova", "settled", "A", true]]);
  assert.deepEqual(Object.keys(b.answered[0]).sort(), ["at", "from", "id", "needs", "reply", "sp", "text", "to"]);
  assert.deepEqual(Object.keys(b.answered[0].reply).sort(), ["at", "by", "kind", "seen", "seenAt", "sp", "text"]);
  await S.touchRead(d, t0 + 400000, "Drop");
  b = S.board(await S.loadDesk(d, t0 + 420000), t0 + 420000, null);
  assert.equal(b.answered[0].reply.seen, true); assert.ok(b.answered[0].reply.seenAt);
  assert.equal(b.messages.flatMap((m) => m.replies).find((m) => m.id === rep.id).seen, true);
  /* older than 48 hours: no longer listed */
  b = S.board(await S.loadDesk(d, t0 + 49 * 3600000), t0 + 49 * 3600000, null);
  assert.equal(b.answered.length, 0);
  /* "Mark as done" with no note */
  const x = (await S.sendMessage(d, t0, R, { from: "Atlas", to: "Luke", text: "Approve the pitch text?", needs: "action" })).message;
  await S.resolveMessage(d, t0 + 1000, R, { id: x.id, by: "Luke" });
  assert.equal(S.answeredByLuke(await S.listMessages(d, t0 + 2000), {}, t0 + 2000).find((a) => a.id === x.id).reply.text, "Marked as done");
});

test("releases: the sample is made up: example links, placeholder words, one of each kind", () => {
  const list = sampleReleases(NOW);
  assert.deepEqual(list.map((r) => r.status), ["draft", "scheduled", "scheduled", "scheduled"]);
  const links = JSON.stringify(list).match(/https:\/\/[^"\\]+/g);
  assert.ok(links.every((l) => /^https:\/\/(example\.com\/sample|badscandal\.com\/|open\.spotify\.com\/track\/sample)/.test(l)), links.join(" "));
  assert.match(list[3].pack.lyrics, /^\(sample\)/);
  assert.ok(!S.secretIn(JSON.stringify(list)));
});

/* ---------- fixes after review (11 Nov 2026) ---------- */
test("replies: an answer that can't be saved never closes the question (the board is full)", async () => {
  const d = memoryDesk();
  const q = (await S.sendMessage(d, NOW, R, { from: "Nova", to: "Luke", text: "Please fill the lyrics for Survivors.", needs: "action" })).message;
  const key = "msg/" + q.at.slice(0, 7) + ".json", got = await d.getWithMetadata(key, { type: "json" });
  const filler = Array.from({ length: S.LIMITS.messagesPerMonth - 1 }, (_, i) => ({ ...q, id: "mfill" + String(i).padStart(7, "0"), from: "Kevin", to: "Nova", needs: "none", sp: "2026-11-01 09:00" }));
  await d.setJSON(key, got.data.concat(filler));
  await fails(S.sendMessage(d, NOW + 1000, R, { from: "Luke", to: "Nova", text: "Yes, approved", re: q.id }), /The board is full for this month/);
  const list = await S.listMessages(d, NOW + 2000);
  assert.equal(list.find((m) => m.id === q.id).resolved, null, "the question is still open");
  assert.equal(S.waitingOn(list, "Luke").length, 1);
  assert.equal(S.answeredByLuke(list, {}, NOW + 2000).length, 0, "nothing reads 'Marked as done'");
});

test("replies: the answer is saved first; if the question can't be closed after that, the answer stays and says settled: false", async () => {
  const d = memoryDesk();
  const old = NOW - 20 * 86400000; /* a question from last month: its own document */
  const q = (await S.sendMessage(d, old, R, { from: "Atlas", to: "Luke", text: "Pitch as Dance?", needs: "decision", options: ["Yes", "No"] })).message;
  const qKey = "msg/" + q.at.slice(0, 7) + ".json";
  let reads = 0;
  const flaky = { ...d, getWithMetadata: (k, o) => (k === qKey && ++reads > 1 ? Promise.reject(new Error("store down")) : d.getWithMetadata(k, o)) };
  const r = await S.sendMessage(flaky, NOW, R, { from: "Luke", to: "Atlas", text: "Yes", re: q.id, note: "Yes" });
  assert.deepEqual([r.settled, r.parent], [false, null]);
  assert.ok((await S.listMessages(d, NOW)).some((m) => m.id === r.message.id), "Luke's answer is on the board");
  /* and when it can: a decision closes with the option Luke picked as its note */
  const ok = await S.sendMessage(d, NOW + 1000, R, { from: "Luke", to: "Atlas", text: "Yes", re: q.id, note: "Yes" });
  assert.deepEqual([ok.settled, ok.parent.resolved.by, ok.parent.resolved.note], [true, "Luke", "Yes"]);
  /* an unknown id is refused before anything is written */
  const before = (await S.listMessages(d, NOW + 2000)).length;
  await fails(S.sendMessage(d, NOW + 2000, R, { from: "Luke", to: "Atlas", text: "Hello", re: "m" + (NOW - 1000).toString(36) + "zzzz" }), /There is no message with that id/);
  assert.equal((await S.listMessages(d, NOW + 3000)).length, before);
});

test("replies: Luke answering a message deep in a thread closes THAT message, never the request at the top", async () => {
  const d = memoryDesk();
  const top = (await S.sendMessage(d, NOW, R, { from: "Nova", to: "Luke", text: "Please fill the lyrics for Survivors", needs: "action" })).message;
  const deep = (await S.sendMessage(d, NOW + 1000, R, { from: "Nova", to: "Luke", text: "Also: teaser A or B?", needs: "decision", options: ["Teaser A", "Teaser B"], re: top.id })).message;
  const ans = await S.sendMessage(d, NOW + 2000, R, { from: "Luke", to: "Nova", text: "Teaser A", re: deep.id, note: "Teaser A" });
  assert.equal(ans.settled, true);
  const list = await S.listMessages(d, NOW + 3000);
  assert.deepEqual(S.waitingOn(list, "Luke").map((m) => m.id), [top.id], "the lyrics request still waits on Luke");
  const b = S.board(await S.loadDesk(d, NOW + 3000), NOW + 3000, null);
  assert.deepEqual(b.answered.map((a) => [a.id, a.reply.kind, a.reply.text]), [[deep.id, "reply", "Teaser A"]]);
  assert.deepEqual(b.messages.find((t) => t.id === top.id).replies.map((m) => m.id), [deep.id, ans.message.id], "the answer shows in its thread");
});

test("releases: Luke's own step is his approval: no bot (not even Nova) and not Claude marks it done", async () => {
  const d = memoryDesk();
  const r = await sent(d);
  await fails(S.setStep(d, NOW, R, { by: "Nova", id: r.id, step: "teasers", status: "done" }), /is Luke's own approval: only Luke can mark it done/);
  await fails(S.setStep(d, NOW, R, { by: "Claude", id: r.id, step: "teasers", status: "done" }), /only Luke can mark it done/);
  await fails(S.setStep(d, NOW, R, { by: "Nova", id: r.id, step: "teasers", status: "skipped", note: "not needed" }), /only Luke can mark it skipped/);
  assert.equal((await S.setStep(d, NOW, R, { by: "Nova", id: r.id, step: "teasers", status: "working", note: "Clips ready for Luke" })).steps[7].status, "working", "Nova may still say it is moving");
  assert.equal((await S.setStep(d, NOW, R, { by: "Luke", id: r.id, step: "teasers", status: "done" })).steps[7].by, "Luke");
});

test("releases: two live releases never share a name; the merged list keeps both even if they did", async () => {
  const d = memoryDesk();
  await S.saveRelease(d, NOW, R, { by: "Luke", title: "Survivors", date: "2026-12-11" });
  const demo = await S.saveRelease(d, NOW, R, { by: "Luke", title: "Demo", date: "2026-12-18" });
  await fails(S.saveRelease(d, NOW, R, { by: "Luke", id: demo.id, title: "SURVIVORS" }), /^There is already a release called "Survivors" \(a draft\)\. Pick another title, or cancel that one first\. Nothing was saved\.$/);
  assert.equal((await S.listReleases(d)).find((x) => x.id === "demo").title, "Demo");
  const view = (id, title, date) => S.releaseView({ id, title, date, status: "scheduled", pack: {}, steps: S.scheduleSteps(date, TODAY).steps }, TODAY);
  const both = mergeReleases([], [view("survivors", "Survivors", "2026-12-11"), view("demo", "Survivors", "2026-12-18")], TODAY);
  assert.deepEqual(both.map((x) => [x.id, x.date]), [["survivors", "2026-12-11"], ["demo", "2026-12-18"]]);
  const withSheet = mergeReleases([{ song: "Survivors", slug: "survivors", date: "2026-12-11", status: "planned", steps: [] }], [view("survivors", "Survivors", "2026-12-11"), view("demo", "Survivors", "2026-12-18")], TODAY);
  assert.deepEqual(withSheet.map((x) => [x.id, x.status]), [["survivors", "planned"], ["demo", ""]], "the sheet's row joins one of them; the other keeps its own slot");
  /* a title with no Latin letters gets an address; two long titles alike for 40 letters are two releases */
  const night = await S.saveRelease(d, NOW, R, { by: "Luke", title: "Ночь" });
  assert.match(night.id, /^r[0-9a-z]+$/); assert.equal(night.title, "Ночь");
  const long = "A Very Long Song Title That Goes On And On Forever";
  const one = await S.saveRelease(d, NOW, R, { by: "Luke", title: long + " Part One" });
  const two = await S.saveRelease(d, NOW, R, { by: "Luke", title: long + " Part Two" });
  assert.notEqual(one.id, two.id);
});

test("releases: a pack key that every object has (constructor, toString, __proto__) is an unknown field", async () => {
  const d = memoryDesk();
  const r = await S.saveRelease(d, NOW, R, { by: "Luke", title: "Proto" });
  for (const pack of [{ constructor: "x" }, { toString: "y" }, JSON.parse('{"__proto__": "z"}'), { hasOwnProperty: "w" }])
    await fails(S.saveRelease(d, NOW, R, { by: "Luke", id: r.id, pack }), /is not a field|are not fields/);
  assert.throws(() => S.packValue("constructor", "x"), /"constructor" is not a field of the release pack/);
  await fails(S.fillRelease(d, NOW, R, { by: "Luke", id: r.id, field: "toString", value: "x" }), /is not a field/);
  assert.deepEqual((await S.listReleases(d))[0].pack, {});
});

test("releases: a release moved months out is no longer 'sent late'", async () => {
  const d = memoryDesk();
  const r = await sent(d, "Late One", "2026-11-20"); /* 8 days out */
  assert.equal(r.tight, true);
  const m = await S.moveRelease(d, NOW, R, { by: "Luke", id: r.id, date: "2027-02-05" });
  assert.equal(m.release.tight, false);
  assert.equal(m.release.steps[0].due, "2027-01-15", "every open step has its full time again");
});

test("releases: the desk's limit names what really frees room, and old releases can be removed", async () => {
  const d = memoryDesk();
  const old = (i, status, date) => ({ id: "old" + i, title: "Old " + i, date, status, createdAt: "2026-01-01T00:00:00Z", createdBy: "Luke", updatedAt: "2026-01-01T00:00:00Z", sentAt: null, tight: false, pack: {}, steps: [], log: [] });
  await d.setJSON("releases.json", Array.from({ length: S.LIMITS.releases }, (_, i) => old(i, i === 0 ? "cancelled" : i === 1 ? "scheduled" : "draft", i === 1 ? "2026-07-01" : "2026-12-01")));
  await fails(S.saveRelease(d, NOW, R, { by: "Luke", title: "New One" }), /limit\. Nothing was saved\. Ask Claude to remove old ones: a cancelled release, or one that came out more than 90 days ago, can be removed\./);
  await fails(S.saveRelease(d, NOW, R, { by: "Claude", title: "New One" }), /POST \/api\/staff\/release\/remove/);
  await fails(S.removeRelease(d, NOW, R, { by: "Luke", id: "old2" }), /can't be removed: only a cancelled release, or one that came out more than 90 days ago/);
  await fails(S.removeRelease(d, NOW, R, { by: "Nova", id: "old0" }), /Only Luke or Claude/);
  await fails(S.removeRelease(d, NOW, R, { by: "Luke", id: "nope" }), /no release with the id "nope"/);
  assert.deepEqual(await S.removeRelease(d, NOW, R, { by: "Claude", id: "old1" }), { removed: true, id: "old1", title: "Old 1", left: 59 }, "out 134 days ago");
  assert.equal((await S.removeRelease(d, NOW, R, { by: "Luke", id: "old0" })).left, 58, "cancelled");
  assert.equal((await S.saveRelease(d, NOW, R, { by: "Luke", title: "New One" })).id, "newone");
});

test("releases: the site's check gives one line per release for late steps and is cut by whole lines", async () => {
  const d = memoryDesk(), sentAt = Date.parse("2026-11-04T12:00:00Z");
  for (const t of ["Alpha Song", "Beta Song", "Gamma Song", "Delta Song"]) {
    const r = await S.saveRelease(d, sentAt, R, { by: "Luke", title: t, date: "2026-11-12", pack: FULL });
    await S.sendRelease(d, sentAt, R, { by: "Luke", id: r.id });
  }
  const at = Date.parse("2026-11-09T12:40:00Z"); /* five days later */
  const rep = S.checkReport({ desk: await S.loadDesk(d, at), hq: null, hqState: null, now: at });
  const late = rep.problems.filter((p) => /steps late/.test(p));
  assert.equal(late.length, 4, "one line per release");
  assert.match(late[0], /^\w+ Song: \d steps late: upload \(Drop, due Wed 4 Nov\), approved \(Drop, due Wed 4 Nov\), lyrics \(Verse, due Wed 4 Nov\)/, "the Spotify step and the pitch are said with what they mean, not as late");
  assert.ok(rep.text.length <= 1500, String(rep.text.length));
  assert.match(rep.text, /\nRunning:\n- /, "the Running section survives");
  /* the text is cut by whole lines and says how many are left out */
  const many = Array.from({ length: 40 }, (_, i) => `Song ${i}: something long enough to fill the message quickly, line number ${i} of forty`);
  const t = S.reportText("HQ check, today morning: 40 things to look at", many, ["Income logged this month: nothing yet received", "Second running line"]);
  assert.ok(t.length <= 1500);
  const lines = t.split("\n");
  assert.match(lines.find((l) => /more on \/hq$/.test(l)), /^- \+\d+ more on \/hq$/);
  for (const l of lines.filter((x) => /^- Song/.test(x))) assert.match(l, /of forty$/, "never cut mid-line");
  assert.ok(lines.includes("Running:") && lines.includes("- Income logged this month: nothing yet received"));
});

test("releases: the board sends no lyrics and no change log (a refresh stays small); the page asks for one whole release", async () => {
  const d = memoryDesk(), lyr = Array.from({ length: 200 }, (_, i) => "Made-up sample line number " + i + " la la la").join("\n").slice(0, 8000);
  for (let i = 0; i < 20; i++) {
    const r = await S.saveRelease(d, NOW, R, { by: "Luke", title: "Sample " + i, date: "2026-12-11", pack: { ...FULL, lyrics: lyr, notes: "n".repeat(900), story: "s".repeat(390) } });
    for (let j = 0; j < 12; j++) await S.saveRelease(d, NOW + j + 1, R, { by: "Luke", id: r.id, pack: { genre: "Dance " + j } });
  }
  const b = S.board(await S.loadDesk(d, NOW), NOW, null);
  const v = b.releases[0];
  assert.ok(!("lyrics" in v.pack)); assert.equal(v.lyricsChars, lyr.length); assert.deepEqual(v.log, []); assert.equal(v.logCount, 13); assert.equal(v.slim, true);
  assert.ok(JSON.stringify(b.releases).length < 60000, String(JSON.stringify(b.releases).length));
  assert.equal(S.releaseView((await S.listReleases(d))[0], TODAY).pack.lyrics, lyr, "the whole release still has everything");
});
