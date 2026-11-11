/* The connector's protocol (11 Nov 2026): a small, hand-written Model Context Protocol server over
   plain HTTPS, no library, no session, no streaming. The bots' app ("Add a custom connector",
   Remote HTTPS, one header) and Claude Code both speak it. What the tools DO is in staff-tools.mjs.

   Two generations of the protocol are answered, because clients differ:
   - legacy (2024-11-05 .. 2025-11-25): initialize -> notifications/initialized -> tools/list,
     tools/call, ping. Every answer is one application/json body (the spec allows that instead of
     an event stream); a notification gets 202 with no body; GET and DELETE get 405.
   - 2026-07-28 (no handshake): each request names its version in params._meta and in the
     MCP-Protocol-Version header; server/discover replaces initialize; results carry resultType.
   Pure: handle() takes the parsed pieces and returns { status, body | null }, tested in
   tests/mcp.test.mjs. Auth happens BEFORE this (netlify/functions/staff.mjs). */

export const LEGACY = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
export const MODERN = "2026-07-28";
export const SERVER = { name: "badscandal-hq", title: "BADSCANDAL HQ", version: "1.0.0" };
const META_VERSION = "io.modelcontextprotocol/protocolVersion";

const err = (id, code, message, data) => ({ jsonrpc: "2.0", id: id === undefined ? null : id, error: data === undefined ? { code, message } : { code, message, data } });
const ok = (id, result) => ({ jsonrpc: "2.0", id, result });

/* "=?base64?…?=" (non-ASCII header values in the 2026 transport) -> text */
export function headerText(v) {
  const m = /^=\?base64\?(.*)\?=$/.exec(String(v || ""));
  if (!m) return String(v || "");
  try { return new TextDecoder().decode(Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0))); } catch { return ""; }
}

/* tools as the protocol lists them */
export function toolList(tools) {
  return tools.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema,
    annotations: { title: t.title, readOnlyHint: !!t.readOnly, destructiveHint: false, idempotentHint: !!t.readOnly || !!t.idempotent, openWorldHint: false } }));
}

/* The answer of a tool: text the model reads + the same thing as data. Failures a bot can fix
   (a wrong name, a missing amount) are results with isError, never protocol errors. */
export function toolResult(value, isError = false) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 1);
  const out = { content: [{ type: "text", text: text.slice(0, 60000) }], isError: !!isError };
  if (!isError && value && typeof value === "object" && !Array.isArray(value)) out.structuredContent = value;
  return out;
}

/* headers: a plain object with lowercase names. msg: the parsed JSON body.
   deps: { tools, instructions, call(name, args) -> value (throws {code:"..."} errors for the bot to read) } */
export async function handle(msg, headers, deps) {
  if (Array.isArray(msg)) return { status: 400, body: err(null, -32600, "Send one JSON-RPC message per request (batches are not supported)") };
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || (msg.method !== undefined && typeof msg.method !== "string")) return { status: 400, body: err(null, -32600, "Not a JSON-RPC 2.0 message") };
  const { id, method } = msg;
  const params = msg.params && typeof msg.params === "object" ? msg.params : {};
  /* a response or a notification from the client: accepted, nothing to say */
  if (method === undefined || id === undefined || id === null) return { status: 202, body: null };

  const meta = params._meta && typeof params._meta === "object" ? params._meta : {};
  const hv = String(headers["mcp-protocol-version"] || "").trim();
  const modern = method !== "initialize" && (meta[META_VERSION] !== undefined || hv === MODERN || method === "server/discover");

  if (modern) {
    const want = meta[META_VERSION] !== undefined ? String(meta[META_VERSION]) : hv || MODERN;
    if (want !== MODERN) return { status: 400, body: err(id, -32022, "Unsupported protocol version", { supported: [MODERN], requested: want }) };
    if (hv && hv !== want) return { status: 400, body: err(id, -32020, "The MCP-Protocol-Version header and the body disagree") };
    const hm = headerText(headers["mcp-method"]);
    if (hm && hm !== method) return { status: 400, body: err(id, -32020, "The Mcp-Method header and the body disagree") };
    const done = (r) => ({ status: 200, body: ok(id, { resultType: "complete", ...r }) });
    const info = { [`io.modelcontextprotocol/serverInfo`]: SERVER };
    if (method === "server/discover") return done({ supportedVersions: [MODERN], capabilities: { tools: {} }, instructions: deps.instructions, ttlMs: 300000, cacheScope: "private", _meta: info });
    if (method === "tools/list") return done({ tools: toolList(deps.tools), ttlMs: 300000, cacheScope: "private" });
    if (method === "tools/call") {
      const hn = headerText(headers["mcp-name"]);
      if (hn && hn !== params.name) return { status: 400, body: err(id, -32020, "The Mcp-Name header and the body disagree") };
      const r = await callTool(params, deps);
      return r.error ? { status: 200, body: err(id, r.error.code, r.error.message) } : done(r.result);
    }
    /* The 2026-07-28 text says an unknown method is HTTP 404. A real client (the bots' app, 11 Nov
       2026) showed "Connector returned HTTP 404" and gave up, so: things a client may probe for get an
       empty answer, and anything else is a JSON-RPC error with HTTP 200, like the legacy path. */
    if (method === "ping") return done({});
    if (method === "resources/list") return done({ resources: [], ttlMs: 300000, cacheScope: "private" });
    if (method === "resources/templates/list") return done({ resourceTemplates: [], ttlMs: 300000, cacheScope: "private" });
    if (method === "prompts/list") return done({ prompts: [], ttlMs: 300000, cacheScope: "private" });
    return { status: 200, body: err(id, -32601, "Method not found: " + method) };
  }

  /* legacy */
  if (method !== "initialize" && hv && !LEGACY.includes(hv) && hv !== MODERN) return { status: 400, body: err(id, -32600, "Unsupported MCP-Protocol-Version: " + hv) };
  if (method === "initialize") {
    const asked = String(params.protocolVersion || "");
    return { status: 200, body: ok(id, { protocolVersion: LEGACY.includes(asked) ? asked : LEGACY[0], capabilities: { tools: { listChanged: false } }, serverInfo: SERVER, instructions: deps.instructions }) };
  }
  if (method === "ping") return { status: 200, body: ok(id, {}) };
  if (method === "tools/list") return { status: 200, body: ok(id, { tools: toolList(deps.tools) }) };
  if (method === "tools/call") {
    const r = await callTool(params, deps);
    return { status: 200, body: r.error ? err(id, r.error.code, r.error.message) : ok(id, r.result) };
  }
  /* things a client may probe for that this server doesn't have: empty lists, not errors */
  if (method === "resources/list") return { status: 200, body: ok(id, { resources: [] }) };
  if (method === "resources/templates/list") return { status: 200, body: ok(id, { resourceTemplates: [] }) };
  if (method === "prompts/list") return { status: 200, body: ok(id, { prompts: [] }) };
  return { status: 200, body: err(id, -32601, "Method not found: " + method) };
}

async function callTool(params, deps) {
  const name = String(params.name || "");
  const tool = deps.tools.find((t) => t.name === name);
  if (!tool) return { error: { code: -32602, message: "Unknown tool: " + name.slice(0, 60) } };
  const args = params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments) ? params.arguments : {};
  /* required arguments are checked here so every tool gives the same plain answer */
  const missing = (tool.inputSchema.required || []).filter((k) => args[k] === undefined || args[k] === null || args[k] === "");
  if (missing.length) return { result: toolResult(`Missing: ${missing.join(", ")}. ${tool.title} needs ${(tool.inputSchema.required || []).join(", ")}.`, true) };
  try {
    return { result: toolResult(await deps.call(tool, args)) };
  } catch (e) {
    if (e && e.name === "StaffError") return { result: toolResult(e.message, true) };
    console.error("mcp tool failed: " + name + " " + (e && e.name));
    return { result: toolResult("Something went wrong on the site's side. Nothing was saved. Try once more; if it fails again, tell Nova.", true) };
  }
}
