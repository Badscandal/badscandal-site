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
  assert.deepEqual(e.custom_data, { content_name: "Touch Me", service: "spotify", action: "listen", utm_content: "TM BR - vocal contatinho" });
});

test("country hash is SHA-256 of the lowercase code", async () => {
  /* reference value from node's own crypto: sha256("br") */
  assert.equal(await sha256("br"), "885036a0da3dff3c3e05bc79bf49382b12bc5098514ed57ce0875aba1aa2c40d");
  assert.notEqual(await sha256("br"), await sha256("BR"));
});

test("PageView + ViewContent on load; unknown events and bad ids dropped", async () => {
  const out = await buildEvents(
    { ev: [{ n: "PageView", id: "aaaaaaaaaaaa" }, { n: "ViewContent", id: "bbbbbbbbbbbb" }, { n: "Purchase", id: "cccccccccccc" }, { n: "PageView", id: "x" }], url: "https://badscandal.com/touchme" },
    REQ
  );
  assert.deepEqual(out.map((e) => e.event_name), ["PageView", "ViewContent"]);
  assert.equal(out[0].custom_data.service, undefined);
});

test("events from another site, or from a page that isn't a known song, are dropped", async () => {
  assert.deepEqual(await buildEvents({ ev: [{ n: "PageView", id: "aaaaaaaaaaaa" }], url: "https://evil.example/touchme" }, REQ), []);
  assert.deepEqual(await buildEvents({ ev: [{ n: "PageView", id: "aaaaaaaaaaaa" }] }, REQ), []);
  assert.deepEqual(await buildEvents({ ev: [{ n: "PageView", id: "aaaaaaaaaaaa" }], url: "https://badscandal.com/admin" }, REQ), []);
  assert.deepEqual(await buildEvents({ ev: [{ n: "PageView", id: "aaaaaaaaaaaa" }], url: "https://badscandal.com/" }, REQ), []);
});

test("content_name comes from the song list by page path, never from the browser", async () => {
  const [m] = await buildEvents({ ev: [{ n: "SpotifyClick", id: "aaaaaaaaaaaa", a: "follow" }], url: "https://badscandal.com/medaseubody.html?utm_content=x",
    content_name: "Something Else", title: "Hacked" }, REQ);
  assert.deepEqual(m.custom_data, { content_name: "Me Dá Seu Body", service: "spotify", action: "follow" });
  const [t] = await buildEvents({ ev: [{ n: "ViewContent", id: "aaaaaaaaaaaa" }], url: "https://badscandal.com/touchme/" }, REQ);
  assert.equal(t.custom_data.content_name, "Touch Me");
});

test("no country, no fbc/fbp: fields left out rather than sent empty", async () => {
  const [e] = await buildEvents({ ev: [{ n: "PageView", id: "aaaaaaaaaaaa" }], url: "https://badscandal.com/touchme" }, { ...REQ, country: "" });
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

/* ---------- Meta spend reader (cost per tap), 10 Nov 2026 ---------- */
import { adKey, fetchInsights, insightsRequest, spendReport } from "../netlify/lib/metaspend.mjs";

test("spend reader: GET only, token in the header (never the URL), pinned Graph version, the right fields", async () => {
  const url = insightsRequest("230002830106369", "2026-11-03", "2026-11-09");
  assert.match(url, /^https:\/\/graph\.facebook\.com\/v27\.0\/act_230002830106369\/insights\?/);
  const q = new URL(url).searchParams;
  assert.equal(q.get("level"), "ad");
  assert.equal(q.get("time_increment"), "1");
  assert.equal(q.get("fields"), "ad_name,adset_name,campaign_name,spend,account_currency");
  assert.deepEqual(JSON.parse(q.get("time_range")), { since: "2026-11-03", until: "2026-11-09" });
  const calls = [];
  const fake = async (u, init) => {
    calls.push({ u, init });
    const page2 = u.includes("after=");
    return new Response(JSON.stringify(page2
      ? { data: [{ date_start: "2026-11-04", ad_name: "TM BR - vocal", spend: "5.50", account_currency: "BRL" }] }
      : { data: [{ date_start: "2026-11-03", ad_name: "TM BR - vocal", adset_name: "BR", campaign_name: "Touch Me BR", spend: "10.25", account_currency: "BRL" }],
          paging: { next: "https://graph.facebook.com/v27.0/act_1/insights?access_token=SECRET&after=abc" } }), { status: 200 });
  };
  const { rows } = await fetchInsights("SECRET", "230002830106369", "2026-11-03", "2026-11-09", fake);
  assert.equal(rows.length, 2);
  for (const c of calls) {
    assert.equal(c.init.method, "GET");
    assert.equal(c.init.headers.Authorization, "Bearer SECRET");
    assert.ok(!c.u.includes("SECRET"), "the token never goes in a URL: " + c.u);
  }
});

test("spend reader errors are readable and never carry the token", async () => {
  const fake = async () => new Response(JSON.stringify({ error: { message: "Invalid OAuth access token EAABwzLixnjYBO1234567890abc", code: 190 } }), { status: 400 });
  const r = await fetchInsights("EAABwzLixnjYBO1234567890abc", "1", "2026-11-03", "2026-11-09", fake);
  assert.match(r.error, /Invalid OAuth access token/);
  assert.match(r.error, /code 190/);
  assert.ok(!r.error.includes("EAABwz"), r.error);
});

test("cost per tap: ads matched to real taps by name, per song, per day, currency kept, unmatched shown", () => {
  assert.equal(adKey("TM BR - Coração 🌙"), adKey("tm-br-coracao"));
  const rows = [
    { day: "2026-11-03", ad: "TM BR - vocal", adset: "BR", campaign: "Touch Me", spend: 30, currency: "BRL" },
    { day: "2026-11-04", ad: "TM BR - vocal", adset: "BR", campaign: "Touch Me", spend: 20, currency: "BRL" },
    { day: "2026-11-04", ad: "Me Dá Seu Body teaser", adset: "BR", campaign: "MDSB", spend: 12, currency: "BRL" },
    { day: "2026-11-04", ad: "mystery", adset: "x", campaign: "y", spend: 8, currency: "BRL" },
  ];
  const songs = [
    { id: "medaseubody", title: "Me Dá Seu Body", taps: 3, tapsByAd: {}, tapsByDay: { "2026-11-04": 3 } },
    { id: "touchme", title: "Touch Me", taps: 25, tapsByAd: { [adKey("tm-br-vocal")]: 20 }, tapsByDay: { "2026-11-03": 15, "2026-11-04": 10 } },
  ];
  const r = spendReport(rows, songs, "touchme");
  assert.equal(r.currency, "BRL");
  assert.equal(r.total, 70);
  assert.equal(r.unmatched, 8);
  assert.deepEqual(r.song, { spend: 50, taps: 25, cpt: 2 });
  assert.deepEqual(r.ads, [{ ad: "TM BR - vocal", spend: 50, taps: 20, cpt: 2.5 }]);
  assert.deepEqual(r.days, [{ d: "2026-11-03", spend: 30, taps: 15, cpt: 2 }, { d: "2026-11-04", spend: 20, taps: 10, cpt: 2 }]);
  assert.deepEqual(r.songs.find((s) => s.id === "medaseubody"), { id: "medaseubody", title: "Me Dá Seu Body", spend: 12, taps: 3, cpt: 4 });
  assert.deepEqual(r.allDays.find((d) => d.d === "2026-11-04"), { d: "2026-11-04", spend: 40, taps: 13, cpt: 40 / 13 });
  assert.equal(spendReport([], songs, "touchme").song.cpt, null, "no spend, no cost per tap");
});

/* ---------- the monthly ad cap (USD 1,000; warn 750, everything off at 900), 11 Nov 2026 ---------- */
import { capReport, MONTHLY_CAP } from "../netlify/lib/metaspend.mjs";

test("cap: the WHOLE ad account (level=account, so Instagram boosts count), GET only", async () => {
  const q = new URL(insightsRequest("230002830106369", "2026-11-01", "2026-11-11", "account")).searchParams;
  assert.equal(q.get("level"), "account");
  assert.equal(q.get("fields"), "spend,account_currency");
  let init;
  await fetchInsights("SECRET", "230002830106369", "2026-11-01", "2026-11-11", async (u, i) => { init = i; return new Response('{"data":[]}', { status: 200 }); }, "account");
  assert.equal(init.method, "GET");
});

const round2 = (n) => Math.round(n * 100) / 100;
test("cap: month to date, left, status lines and the pace", () => {
  assert.deepEqual(MONTHLY_CAP, { amount: 1000, warn: 750, stop: 900, currency: "USD" });
  const day = (d, spend) => ({ day: d, spend, currency: "USD" });
  const r = capReport([day("2026-11-01", 100), day("2026-11-09", 99.63), day("2026-11-10", 25.97), day("2026-11-11", 3)], "2026-11-11");
  assert.equal(r.month, "2026-11");
  assert.equal(r.spent, 228.6);
  assert.equal(r.left, 771.4);
  assert.equal(r.pct, 22.9);
  assert.equal(r.status, "ok");
  assert.equal(r.perDay, round2((0 + 99.63 + 25.97) / 3), "pace = the last 3 full calendar days (8, 9, 10 Nov), paused days count as 0");
  assert.equal(r.stopDay, 11 + Math.ceil((900 - 228.6) / ((99.63 + 25.97) / 3)));
  assert.equal(capReport([day("2026-11-05", 760)], "2026-11-06").status, "warn");
  assert.equal(capReport([day("2026-11-05", 900)], "2026-11-06").status, "stop");
  assert.equal(capReport([day("2026-11-05", 1000.01)], "2026-11-06").status, "over");
  assert.equal(capReport([], "2026-11-06").spent, 0);
  const eur = capReport([{ day: "2026-11-05", spend: 50, currency: "EUR" }], "2026-11-06");
  assert.equal(eur.status, "currency", "never converted: a non-USD account can't be compared");
  assert.equal(capReport([day("2026-11-01", 10)], "2026-11-02").stopDay, null, "pace that never reaches the line in this month");
  assert.equal(capReport([day("2026-11-01", 500)], "2026-11-11").perDay, 0, "ads paused for days: no pace, no false alarm");
});
