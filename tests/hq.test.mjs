import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { hqModel, num, rowsToObjects, CAP, STEPS } from "../netlify/lib/hq.mjs";
import { sampleSheets } from "../netlify/lib/hq-sample.mjs";
import { batchUrl, parseKey, readTabs, signJwt } from "../netlify/lib/gsheets.mjs";

const TODAY = "2026-11-11";
const FX = { "2026-11": { USD: 1.12, GBP: 0.86 }, "2026-10": { USD: 1.12, GBP: 0.86 } };

test("hq: cells are read carefully; a missing number is never 0", () => {
  assert.equal(num("1,234"), 1234); assert.equal(num("USD 12.30"), 12.3); assert.equal(num("751,74"), 751.74);
  assert.equal(num("1.234,50"), 1234.5); assert.equal(num("-22"), -22);
  for (const v of ["", "not read", "#REF!", "missing", "n/a", "abc"]) assert.equal(num(v), null, v);
  assert.deepEqual(rowsToObjects([["Date", " Platform "], ["2026-11-10", "Meta"], ["", ""]]), [{ date: "2026-11-10", platform: "Meta" }]);
  assert.deepEqual(rowsToObjects([["date"]]), []);
});

test("hq: the cap is ALL platforms in USD, EUR counted at the month's average, never guessed", () => {
  assert.deepEqual(CAP, { amount: 1000, warn: 750, stop: 900, currency: "USD" });
  const sheets = { Spend: [["date", "platform", "campaign", "spend", "currency"],
    ["2026-11-08", "Meta", "x", "100.00", "USD"], ["2026-11-09", "Meta", "x", "50", "USD"], ["2026-11-10", "TikTok", "y", "10", "EUR"],
    ["2026-11-10", "Google", "z", "not read", "EUR"], ["2026-10-30", "Meta", "x", "999", "USD"]] };
  const cap = hqModel(sheets, TODAY, FX).money.cap;
  assert.equal(cap.spent, 161.2, "150 USD + 10 EUR x 1.12");
  assert.deepEqual(cap.native, { USD: 150, EUR: 10 });
  assert.equal(cap.left, 838.8); assert.equal(cap.status, "ok"); assert.equal(cap.estimated, true); assert.equal(cap.rate, 1.12);
  assert.equal(cap.perDay, Math.round(((100 + 50 + 11.2) / 3) * 100) / 100);
  const noRate = hqModel(sheets, TODAY, {}).money.cap;
  assert.equal(noRate.spent, 150); assert.equal(noRate.missingRate, true, "no rate: the EUR part is flagged, not invented");
  const big = { Spend: [["date", "platform", "campaign", "spend", "currency"], ["2026-11-05", "Meta", "x", "760", "USD"]] };
  assert.equal(hqModel(big, TODAY, FX).money.cap.status, "warn");
  big.Spend.push(["2026-11-06", "Meta", "x", "150", "USD"]);
  assert.equal(hqModel(big, TODAY, FX).money.cap.status, "stop");
});

test("hq: song momentum = last 7 days vs the 7 before, and only with enough days", () => {
  const rows = [["date", "song", "spotify_streams", "spotify_listeners", "saves", "playlist_adds"]];
  for (let i = 14; i >= 1; i--) rows.push([new Date(Date.UTC(2026, 10, 10 - i + 1)).toISOString().slice(0, 10), "A", i > 7 ? "100" : "150", "10", "1", "0"]);
  rows.push(["2026-11-09", "B", "40", "", "", ""], ["2026-11-10", "B", "not read", "", "", ""]);
  const m = hqModel({ Songs: rows, Releases: [["song", "release_date"], ["A", "2026-10-30"]] }, TODAY, FX);
  const a = m.songs.find((s) => s.song === "A"), b = m.songs.find((s) => s.song === "B");
  assert.equal(a.week, 1050); assert.equal(a.prevWeek, 700); assert.equal(a.momentum, 50); assert.equal(a.trend, "rising");
  assert.equal(a.daysOut, 12); assert.equal(a.dayChange, 0);
  assert.equal(b.momentum, null); assert.equal(b.trend, "new"); assert.equal(b.streams, 40, "a 'not read' day is skipped, not counted as 0");
});

test("hq: the sample builds every section and is clearly sample data", () => {
  const m = hqModel(sampleSheets(TODAY), TODAY, FX);
  assert.deepEqual(m.empty, []);
  assert.ok(m.songs.length >= 2 && m.growth.length === 4 && m.fans.people.length >= 4 && m.releases.length === 3);
  assert.ok(m.fans.people.every((p) => /^@sample_/.test(p.handle)), "sample fans are obviously fake");
  assert.equal(m.fans.repeat, 1);
  const mdsb = m.releases.find((r) => r.slug === "medaseubody");
  assert.equal(mdsb.steps.length, STEPS.length); assert.equal(mdsb.late, 1); assert.equal(mdsb.steps[2].late, true);
  assert.equal(m.next.song, "Me Dá Seu Body");
  assert.equal(m.team.forLuke.length, 1); assert.equal(m.team.blocked, 1);
  const nov = m.money.months.find((x) => x.month === "2026-11");
  assert.deepEqual(nov.pending, { Production: { USD: 1300 } }, "pending money is never counted as received");
  assert.equal(nov.income["Self-releases"].EUR, 112.01);
});

test("hq sheet reader: read-only scope, signed JWT, token never in a URL, clear errors", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const raw = JSON.stringify({ client_email: "hq@x.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) });
  const sa = parseKey(raw);
  const [h, b, sig] = signJwt(sa, 1794370000000).split(".");
  const claims = JSON.parse(Buffer.from(b, "base64url"));
  assert.equal(claims.scope, "https://www.googleapis.com/auth/spreadsheets.readonly");
  assert.ok(createVerify("RSA-SHA256").update(h + "." + b).verify(publicKey, Buffer.from(sig, "base64url")));
  assert.match(batchUrl("ID", ["Growth", "Songs"]), /spreadsheets\/ID\/values:batchGet\?ranges='Growth'!A1%3AZ5000&ranges='Songs'!A1%3AZ5000&/);
  const calls = [];
  const fake = async (u, init) => { calls.push({ u, init });
    return u.includes("oauth2") ? new Response('{"access_token":"TOK"}', { status: 200 })
      : new Response(JSON.stringify({ valueRanges: [{ values: [["date"], ["2026-11-10"]] }, {}] }), { status: 200 }); };
  const r = await readTabs(raw, "ID", ["Growth", "Songs"], fake);
  assert.deepEqual(r.sheets, { Growth: [["date"], ["2026-11-10"]], Songs: [] });
  assert.equal(calls[1].init.method, "GET"); assert.equal(calls[1].init.headers.Authorization, "Bearer TOK"); assert.ok(!calls[1].u.includes("TOK"));
  assert.match((await readTabs("not json", "ID", ["Growth"], fake)).error, /service-account/);
  const denied = async (u) => (u.includes("oauth2") ? new Response('{"access_token":"T"}', { status: 200 }) : new Response("{}", { status: 403 }));
  assert.match((await readTabs(raw, "ID", ["Growth"], denied)).error, /isn't shared with hq@x/);
});
