/* BADSCANDAL HQ · pure calculations for the page (11 Nov 2026). No DOM, no network: every rule the
   page shows is written here so tests/hq-lib.test.mjs can check it. Loaded in the browser as
   window.HQLib (plain <script>); in node the tests import it and read globalThis.HQLib. */
(function (root, factory) {
  var lib = factory();
  if (typeof module === "object" && module.exports) module.exports = lib;
  else root.HQLib = lib;
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* "just now" / "12 min ago" / "3 h ago" / "2 days ago" */
  function ago(ms) {
    if (ms == null || !isFinite(ms)) return "";
    var m = Math.max(0, Math.round(ms / 60000));
    if (m < 1) return "just now";
    if (m < 60) return m + " min ago";
    var h = Math.round(m / 60);
    return h < 48 ? h + " h ago" : Math.round(h / 24) + " days ago";
  }
  var t = function (iso) { var v = iso == null ? NaN : typeof iso === "number" ? iso : Date.parse(iso); return isFinite(v) ? v : null; };

  /* The "Data health" panel: Sheet, Meta, page counter, exchange rate. state: ok | bad | off.
     sheet: the /api/hq/data answer (or null), sheetProblem: a plain reason when it couldn't be read,
     ov: the /api/admin/overview answer (or null). */
  function healthRows(o, now) {
    now = now || Date.now();
    var sheet = o.sheet, ov = o.ov, rows = [];
    /* Sheet */
    if (o.sheetProblem) rows.push({ key: "sheet", label: "Sheet", state: "bad", text: o.sheetProblem });
    else if (!sheet) rows.push({ key: "sheet", label: "Sheet", state: "off", text: "Not read yet" });
    else {
      var errs = Object.keys(sheet.sheetErrors || {});
      var at = t(sheet.health && sheet.health.sheetAt) || t(sheet.readAt);
      if (errs.length) rows.push({ key: "sheet", label: "Sheet", state: "bad", text: errs.length + " tab" + (errs.length > 1 ? "s show" : " shows") + " an error (" + errs.join(", ") + ")" + (at ? " · read " + ago(now - at) : "") });
      else rows.push({ key: "sheet", label: "Sheet", state: "ok", text: at ? "Read " + ago(now - at) : "Read" });
    }
    /* Meta (the read-only ads key) */
    var k = (ov && ov.metaKey) || (sheet && sheet.metaKey);
    if (!k) rows.push({ key: "meta", label: "Meta", state: "off", text: "Not read yet" });
    else if (k.state === "ok") rows.push({ key: "meta", label: "Meta", state: "ok", text: "Key reading OK" + (k.at ? ", last read " + ago(now - k.at) : "") });
    else if (k.state === "expired") rows.push({ key: "meta", label: "Meta", state: "bad", text: "The Meta key has expired: make a new one" });
    else if (k.state === "error") rows.push({ key: "meta", label: "Meta", state: "bad", text: k.text.replace(/^Meta key: /, "") });
    else rows.push({ key: "meta", label: "Meta", state: "off", text: k.text.replace(/^Meta key: /, "") });
    /* Page counter: the newest visit record (no visits for a while is not an error by itself) */
    if (!ov) rows.push({ key: "counter", label: "Page counter", state: "off", text: "Not read yet" });
    else if (!ov.lastEventAt) rows.push({ key: "counter", label: "Page counter", state: "off", text: "No visits in this range" });
    else rows.push({ key: "counter", label: "Page counter", state: now - ov.lastEventAt > 48 * 3600000 ? "off" : "ok", text: "Last visit " + ago(now - ov.lastEventAt) });
    /* Exchange rate (this month's ECB average) */
    var fx = sheet && sheet.health ? sheet.health.fx : null;
    if (!sheet) rows.push({ key: "fx", label: "Exchange rate", state: "off", text: "Not read yet" });
    else if (!fx) rows.push({ key: "fx", label: "Exchange rate", state: "bad", text: "This month's rate isn't read yet, so EUR estimates are missing" });
    else rows.push({ key: "fx", label: "Exchange rate", state: "ok", text: "1 EUR = " + fx.rate + " USD" + (fx.days ? " (average of " + fx.days + " days)" : "") + (t(fx.at) ? " · " + ago(now - t(fx.at)) : "") });
    return rows;
  }
  /* the one dot on the header button: red if anything needs attention, green if all is fine */
  function healthState(rows) {
    if (rows.some(function (r) { return r.state === "bad"; })) return "bad";
    return rows.every(function (r) { return r.state === "ok"; }) ? "ok" : "off";
  }

  return { ago: ago, healthRows: healthRows, healthState: healthState };
});
