import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEvents, fbcFrom, graphRequest, GRAPH_VERSION, PIXEL_ID, sha256, validFbp } from "../netlify/lib/capi.mjs";

const NOW = Date.parse("2026-11-09T12:00:00Z");
const FBCLID = "IwAR2xYzAbCdEf_Gh-1234567890";
const REQ = { ip: "203.0.113.7", ua: "Mozilla/5.0 (iPhone) Instagram 300.0", country: "BR", origin: "https://badscandal.com", now: NOW };

test("fbc is built from fbclid as fb.1.<ms>.<fbclid>", () => {
  assert.equal(fbcFrom(undefined, FBCLID, 1794225600000), `fb.1.1794225600000.${FBCLID}`);
});

test("the _fbc cookie wins over fbclid; junk is ignored", () => {
  const cookie = "fb.1.1794225000000.AbCdEfGhIjKl";
  assert.equal(fbcFrom(cookie, FBCLID, 1794225600000), cookie);
  assert.equal(fbcFrom("nonsense", FBCLID, 1794225600000), `fb.1.1794225600000.${FBCLID}`);
  assert.equal(fbcFrom(undefined, "<script>", 1), undefined);
  assert.equal(fbcFrom(undefined, "", 1), undefined);
});

test("fbc uses now when the first-seen time is missing or silly", () => {
  const fbc = fbcFrom(undefined, FBCLID, 42);
  assert.match(fbc, new RegExp(`^fb\\.1\\.\\d{13}\\.${FBCLID}$`));
});

test("fbp only accepted in Meta's own format", () => {
  assert.equal(validFbp("fb.1.1794225600000.1234567890"), "fb.1.1794225600000.1234567890");
  assert.equal(validFbp("fb.1.x.y"), undefined);
});

test("SpotifyClick: event_id passes through, country hashed, no personal data", async () => {
  const [e] = await buildEvents(
    { ev: [{ n: "SpotifyClick", id: "abc123def456ghi7" }], url: "https://badscandal.com/touchme?utm_content=x&fbclid=" + FBCLID,
      fbclid: FBCLID, ft: 1794225600000, ux: "TM BR - vocal contatinho" },
    { ...REQ, cookieFbp: "fb.1.1794225600000.987654321" }
  );
  assert.equal(e.event_name, "SpotifyClick");
  assert.equal(e.event_id, "abc123def456ghi7");
  assert.equal(e.event_time, Math.floor(NOW / 1000));
  assert.equal(e.action_source, "website");
  assert.equal(e.event_source_url, "https://badscandal.com/touchme?utm_content=x&fbclid=" + FBCLID);
  assert.deepEqual(e.user_data.country, [await sha256("br")]);
  assert.equal(e.user_data.client_ip_address, "203.0.113.7");
  assert.equal(e.user_data.client_user_agent, REQ.ua);
  assert.equal(e.user_data.fbp, "fb.1.1794225600000.987654321");
  assert.equal(e.user_data.fbc, `fb.1.1794225600000.${FBCLID}`);
  assert.deepEqual(Object.keys(e.user_data).sort(), ["client_ip_address", "client_user_agent", "country", "fbc", "fbp"]);
  assert.deepEqual(e.custom_data, { content_name: "Touch Me", service: "spotify", utm_content: "TM BR - vocal contatinho" });
});

test("country hash is SHA-256 of the lowercase code", async () => {
  /* reference value from node's own crypto: sha256("br") */
  assert.equal(await sha256("br"), "885036a0da3dff3c3e05bc79bf49382b12bc5098514ed57ce0875aba1aa2c40d");
  assert.notEqual(await sha256("br"), await sha256("BR"));
});

test("PageView + ViewContent on load; unknown events and bad ids dropped", async () => {
  const out = await buildEvents(
    { ev: [{ n: "PageView", id: "aaaaaaaaaaaa" }, { n: "ViewContent", id: "bbbbbbbbbbbb" }, { n: "Purchase", id: "cccccccccccc" }, { n: "PageView", id: "x" }] },
    REQ
  );
  assert.deepEqual(out.map((e) => e.event_name), ["PageView", "ViewContent"]);
  assert.equal(out[0].custom_data.service, undefined);
});

test("event_source_url must be on our own site", async () => {
  const [e] = await buildEvents({ ev: [{ n: "PageView", id: "aaaaaaaaaaaa" }], url: "https://evil.example/touchme" }, REQ);
  assert.equal(e.event_source_url, "https://badscandal.com/touchme");
});

test("no country, no fbc/fbp: fields left out rather than sent empty", async () => {
  const [e] = await buildEvents({ ev: [{ n: "PageView", id: "aaaaaaaaaaaa" }] }, { ...REQ, country: "" });
  assert.deepEqual(Object.keys(e.user_data).sort(), ["client_ip_address", "client_user_agent"]);
});

test("Graph request: pinned version, dataset id, token + test code in the body, not the URL", () => {
  const { url, init } = graphRequest([{ event_name: "PageView" }], "SECRET", "TEST123");
  assert.equal(url, `https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL_ID}/events`);
  assert.ok(!url.includes("SECRET"));
  assert.equal(init.body.get("access_token"), "SECRET");
  assert.equal(init.body.get("test_event_code"), "TEST123");
  assert.deepEqual(JSON.parse(init.body.get("data")), [{ event_name: "PageView" }]);
  assert.equal(graphRequest([], "S", "").init.body.has("test_event_code"), false);
});
