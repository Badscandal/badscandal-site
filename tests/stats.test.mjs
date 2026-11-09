import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregate, dayRange, eventKey, parseKey, slug } from "../netlify/lib/stats.mjs";

const NOW = Date.parse("2026-10-11T15:00:00Z");
const ev = (o, ts = NOW) => parseKey(eventKey({ type: "view", page: "listen", country: "br", ...o }, ts, "abc123"));

test("key round-trips and sanitises", () => {
  const e = ev({ src: "IG<script>", visitor: "AbC/../x", type: "click", target: "Spotify!" });
  assert.equal(e.day, "2026-10-11");
  assert.equal(e.type, "click");
  assert.equal(e.page, "listen");
  assert.equal(e.src, "igscript");
  assert.equal(e.target, "spotify");
  assert.equal(e.country, "br");
  assert.equal(e.visitor, "abc..x");
  assert.equal(e.ts, NOW);
  assert.equal(ev({ src: "", visitor: "v1" }).src, "direct");
  assert.equal(parseKey("ev/2026-10-11/view/listen"), null);
});

test("9 Nov fields: ad, city, device, speed, Meta flag, returning", () => {
  const key = eventKey({
    type: "click", page: "touchme", src: "meta", target: "spotify", country: "BR", visitor: "abcdefgh12",
    pv: "pv123456", campaign: "br", content: "TM BR - vocal contatinho 🌙", city: "São Paulo",
    device: "mobile", os: "ios", browser: "webview", app: "instagram", ref: "l.instagram.com",
    ms: 2412.6, meta: 1, ret: 0,
  }, NOW, "r4nd");
  assert.equal(key.split("/").length, 23);
  assert.ok(key.length < 300, "Blob keys must stay short");
  const e = parseKey(key);
  assert.equal(e.content, "tm-br-vocal-contatinho");
  assert.equal(e.city, "sao-paulo");
  assert.equal(e.country, "br");
  assert.equal(e.app, "instagram");
  assert.equal(e.ref, "l.instagram.com");
  assert.equal(e.ms, 2413);
  assert.equal(e.meta, "1");
  assert.equal(e.ret, "0");
  assert.equal(e.pv, "pv123456");
  assert.equal(e.bot, "-", "a person unless something says otherwise");
  assert.equal(e.fb, "-");
});

test("bot reason and fbclid flag ride in the key; junk bot values can't break it", () => {
  const e = parseKey(eventKey({ type: "view", page: "touchme", visitor: "v", bot: "dc-meta", fb: 1 }, NOW, "r"));
  assert.equal(e.bot, "dc-meta");
  assert.equal(e.fb, "1");
  assert.equal(e.parts, 23);
  const junk = eventKey({ type: "view", page: "touchme", visitor: "v", bot: "../../x/y" }, NOW, "r");
  assert.equal(junk.split("/").length, 23);
});

test("keys written before the bot flag (21 parts) still parse as people", () => {
  const old = "ev/2026-11-09/view/touchme/ig/-/us/abc/1791990000000-x1/pv1/-/-/prineville/mobile/ios/webview/instagram/-/300/-/0";
  const e = parseKey(old);
  assert.equal(e.parts, 21);
  assert.equal(e.bot, "-");
  assert.equal(e.city, "prineville");
});

test("old 11 Oct keys still parse, with the new fields empty", () => {
  const e = parseKey("ev/2026-10-11/view/listen/ig/-/br/abc/1791990000000-x1");
  assert.equal(e.src, "ig");
  assert.equal(e.pv, "-");
  assert.equal(e.content, "-");
  assert.equal(e.ms, null);
});

test("slug never produces a path segment that could break a key", () => {
  assert.equal(slug(".."), "-");
  assert.equal(slug("a/b"), "ab");
  assert.equal(slug("  --x--  "), "x");
  assert.equal(slug("Ação"), "acao");
  assert.equal(slug(null, 8, "home"), "home");
});

test("bad numbers and unknown types are neutralised", () => {
  const e = parseKey(eventKey({ type: "drop table", page: "touchme", ms: "9e99", meta: "yes" }, NOW, "z"));
  assert.equal(e.type, "view");
  assert.equal(e.ms, 600000, "anything over 10 minutes is stored as the 10-minute cap");
  assert.equal(e.meta, "-");
  assert.equal(parseKey(eventKey({ type: "view", page: "touchme", ms: "abc" }, NOW, "z")).ms, null);
  assert.equal(parseKey(eventKey({ type: "view", page: "touchme", ms: -5 }, NOW, "z")).ms, null);
  assert.equal(parseKey(eventKey({ type: "act", page: "touchme", target: "touch" }, NOW, "z")).type, "act");
});

test("visits vs unique people, IG split, taps, days outside the range ignored", () => {
  const days = dayRange(7, NOW);
  assert.equal(days.length, 7);
  assert.equal(days[6], "2026-10-11");
  const events = [
    ev({ src: "ig", visitor: "a" }), ev({ src: "ig", visitor: "a" }), ev({ src: "ig", visitor: "b" }),
    ev({ src: "direct", visitor: "c" }), ev({ src: "ig", visitor: "a" }, NOW - 86400000),
    ev({ src: "ig", visitor: "z" }, NOW - 30 * 86400000),             // outside 7 days
    ev({ src: "ig", visitor: "a", type: "click", target: "spotify" }),
    ev({ src: "direct", visitor: "c", type: "click", target: "spotify" }),
    ev({ src: "ig", visitor: "q", page: "store" }),                   // other page
    ev({ src: "ig", visitor: "a", type: "consent", target: "yes" }),  // not a view
  ];
  const r = aggregate(events, days);
  assert.deepEqual(r.totals, { views: 5, unique: 3, igViews: 4, igUnique: 2, igTapped: 1 });
  assert.deepEqual(r.days.at(-1), { day: "2026-10-11", views: 4, unique: 3, igViews: 3, igUnique: 2 });
  assert.deepEqual(r.days.at(-2), { day: "2026-10-10", views: 1, unique: 1, igViews: 1, igUnique: 1 });
  assert.deepEqual(r.sources[0], { src: "ig", count: 4, unique: 2 });
  assert.deepEqual(r.clicks, [{ target: "spotify", count: 2, unique: 2 }]);
  assert.deepEqual(r.countries, [{ country: "br", count: 5, unique: 3 }]);
});
