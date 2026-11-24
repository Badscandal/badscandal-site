/* 24 Nov 2026, Luke: "i also want the books site to literally be our money page just move it there". HQ hands its
   stored money documents to badscandal books as one file, read only, Luke's login only. Made-up payments. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { exportMoney } from "../netlify/lib/money-export.mjs";
import { makeSession, sessionCookie } from "../netlify/lib/session.mjs";

const FAKE = new URL("./fixtures/fake-blobs.mjs", import.meta.url).href;
registerHooks({ resolve(spec, ctx, next) { return spec === "@netlify/blobs" ? { url: FAKE, shortCircuit: true } : next(spec, ctx); } });
const ENV = { ADMIN_KEY: "correct horse", STAFF_BOT_KEY: "bot-key-for-tests-0123456789", STAFF_CLAUDE_KEY: "claude-key-for-tests-0123456789" };
globalThis.Netlify = { env: { get: (k) => ENV[k] } };
const NOW = Date.parse("2026-11-24T15:00:00Z");

test("the export holds every month of payments and checks, the sources, source edits, split rules and closed months, and nothing else", async () => {
  const d = memoryDesk();
  await d.setJSON("inc/2026-10.json", [{ id: "p1", payer: "Sample Label", amount: 10, currency: "EUR", status: "received" }]);
  await d.setJSON("inc/2026-11.json", []);
  await d.setJSON("chk/2026-11.json", [{ account: "Wise", day: "2026-11-20" }]);
  await d.setJSON("sources.json", [{ id: "s1", name: "Sample Label" }]);
  await d.setJSON("closes.json", []);
  await d.setJSON("close/2026-10.json", { month: "2026-10" });
  await d.setJSON("srcedit.json", {});
  await d.setJSON("splits.json", {});
  await d.setJSON("roster.json", [{ name: "Nova" }]);
  await d.setJSON("msg/2026-11.json", [{ id: "m1", text: "not money" }]);
  const before = JSON.stringify(await d.get("inc/2026-10.json", { type: "json" }));
  const out = await exportMoney(d, NOW);
  assert.deepEqual(Object.keys(out.docs).sort(), ["chk/2026-11.json", "close/2026-10.json", "closes.json", "inc/2026-10.json", "inc/2026-11.json", "sources.json", "splits.json", "srcedit.json"]);
  assert.equal(out.docs["inc/2026-10.json"][0].payer, "Sample Label");
  assert.equal(out.exportedAt, "2026-11-24T15:00:00.000Z");
  assert.equal(JSON.stringify(await d.get("inc/2026-10.json", { type: "json" })), before, "nothing is changed");
  const empty = await exportMoney(memoryDesk(), NOW);
  assert.deepEqual(empty.docs, {});
});

test("the route: Luke's login downloads it; Claude's key, the bots and the sample do not", async () => {
  const { default: staff } = await import("../netlify/functions/staff.mjs");
  const ctx = { ip: "203.0.113.5", deploy: { context: "production" } };
  const cookie = sessionCookie(await makeSession("correct horse")).split(";")[0];
  const get = (q, headers) => staff(new Request("https://badscandal.com/api/staff/money-export" + q, { headers }), ctx);
  const ok = await get("", { cookie });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("content-disposition"), /attachment; filename="hq-money-export-\d{4}-\d{2}-\d{2}\.json"/);
  assert.equal(ok.headers.get("cache-control"), "no-store");
  const body = await ok.json();
  assert.ok(body.docs && typeof body.docs === "object");
  assert.equal((await get("", { authorization: "Bearer " + ENV.STAFF_CLAUDE_KEY })).status, 403);
  assert.equal((await get("", { authorization: "Bearer " + ENV.STAFF_BOT_KEY })).status, 403);
  assert.equal((await get("", {})).status, 401);
  assert.equal((await get("?sample=1", { cookie })).status, 404);
});
