import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregate, dayRange, eventKey, parseKey } from "../netlify/lib/stats.mjs";

const NOW = Date.parse("2026-10-11T15:00:00Z");
const ev = (o, ts = NOW) => parseKey(eventKey({ type: "view", page: "listen", country: "br", ...o }, ts, "abc123"));

test("key round-trips and sanitises", () => {
  const e = ev({ src: "IG<script>", visitor: "AbC/../x", type: "click", target: "Spotify!" });
  assert.deepEqual(e, { day: "2026-10-11", type: "click", page: "listen", src: "igscript", target: "spotify",
    country: "br", visitor: "abc..x" });
  assert.equal(ev({ src: "", visitor: "v1" }).src, "direct");
  assert.equal(parseKey("ev/2026-10-11/view/listen"), null);
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
  ];
  const r = aggregate(events, days);
  assert.deepEqual(r.totals, { views: 5, unique: 3, igViews: 4, igUnique: 2, igTapped: 1 });
  assert.deepEqual(r.days.at(-1), { day: "2026-10-11", views: 4, unique: 3, igViews: 3, igUnique: 2 });
  assert.deepEqual(r.days.at(-2), { day: "2026-10-10", views: 1, unique: 1, igViews: 1, igUnique: 1 });
  assert.deepEqual(r.sources[0], { src: "ig", count: 4, unique: 2 });
  assert.deepEqual(r.clicks, [{ target: "spotify", count: 2, unique: 2 }]);
  assert.deepEqual(r.countries, [{ country: "br", count: 5, unique: 3 }]);
});
