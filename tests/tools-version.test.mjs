/* 17 Nov 2026 (Nova): the bots' app keeps its own copy of the tool list, so new tools and options looked missing until
   someone reconnected. my_day now says how many tools the desk has and a version of the list (it changes whenever a
   tool or an option is added); the instructions say to refresh when it differs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryDesk } from "../netlify/lib/staff-sample.mjs";
import { callTool, TOOLS, INSTRUCTIONS, toolsVersion } from "../netlify/lib/staff-tools.mjs";

const NOW = Date.parse("2026-11-17T12:00:00Z");
const call = (d, name, args) => callTool(TOOLS.find((t) => t.name === name), args, { store: d, now: NOW, role: "bot", hq: async () => null });

test("my_day says how many tools the desk has and the list's version; a new option changes the version", async () => {
  const md = await call(memoryDesk(), "my_day", { bot: "Ledger" });
  assert.equal(md.connector.tools, TOOLS.length, "the shared connector lists every tool");
  assert.match(md.connector.version, /^[0-9a-f]{8}$/);
  assert.match(md.connector.check, /refresh|reconnect/);
  const v1 = toolsVersion(TOOLS);
  const more = TOOLS.map((t) => (t.name === "fix_payment" ? { ...t, inputSchema: { ...t.inputSchema, properties: { ...t.inputSchema.properties, made_up: { type: "string" } } } } : t));
  assert.notEqual(toolsVersion(more), v1, "an added option is a new version");
  assert.equal(toolsVersion(TOOLS), v1, "the same list, the same version");
  assert.match(INSTRUCTIONS, /connector.*version/);
});

test("income_status points to payments for a month or an account", () => {
  assert.match(TOOLS.find((t) => t.name === "income_status").description, /payments/);
});
