/* BADSCANDAL HQ · one line chart (19 Nov 2026).
   Every sparkline on /hq is this. Plain SVG, no library. A missing day is a gap: the line breaks
   and the scrub says "no reading". It never fills a gap with 0 or with a point in between.
   Touch: drag sideways to scrub (touch-action: pan-y, so the page still scrolls up and down).
   A tap pins the point; a tap outside clears it. A mouse hover scrubs and a click pins.
   Left and right arrows move the pinned point. */
(function (root) {
  "use strict";

  var W = 100, H = 100;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function isDay(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d || ""); }
  function addDays(d, n) {
    var x = new Date(d + "T12:00:00Z");
    x.setUTCDate(x.getUTCDate() + n);
    return x.toISOString().slice(0, 10);
  }
  function daysBetween(a, b) {
    return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);
  }
  function dateLabel(d) {
    if (!isDay(d)) return "";
    return Number(d.slice(5, 7)) + "/" + Number(d.slice(8, 10)) + "/" + d.slice(2, 4);
  }
  function group(n) {
    var s = String(Math.abs(Math.round(n))), out = "";
    for (var i = 0; i < s.length; i++) {
      if (i && (s.length - i) % 3 === 0) out += ",";
      out += s.charAt(i);
    }
    return out;
  }
  function fixed(n, digits) {
    var sign = n < 0 ? "-" : "";
    var p = Math.pow(10, digits);
    var r = Math.round(Math.abs(n) * p);
    var whole = Math.floor(r / p);
    var frac = String(r % p);
    while (frac.length < digits) frac = "0" + frac;
    return sign + group(whole) + (digits ? "." + frac : "");
  }
  function compact(n) {
    if (!isFinite(n)) return "";
    var sign = n < 0 ? "-" : "";
    var a = Math.abs(n), div = 1, unit = "";
    if (a >= 1000000) { div = 1000000; unit = "M"; }
    else if (a >= 1000) { div = 1000; unit = "K"; }
    else return sign + (Math.abs(a - Math.round(a)) < 0.001 ? group(a) : String(Math.round(a * 10) / 10));
    var q = a / div;
    var s = Math.abs(q - Math.round(q)) < 0.05 ? String(Math.round(q)) : String(Math.round(q * 10) / 10);
    return sign + s + unit;
  }
  function rateText(v) {
    var pct = v * 100;
    return (Math.abs(pct - Math.round(pct)) < 0.05 ? String(Math.round(pct)) : String(Math.round(pct * 10) / 10)) + "%";
  }
  function autoDigits(points) {
    for (var i = 0; i < points.length; i++) {
      var v = points[i].v;
      if (v != null && Math.abs(v - Math.round(v)) > 0.001) return 2;
    }
    return 0;
  }
  function valueText(v, opts) {
    if (v == null || !isFinite(Number(v))) return "";
    v = Number(v);
    opts = opts || {};
    if (opts.format === "rate") return rateText(v);
    var digits = opts.currency ? 2 : (opts.digits != null ? opts.digits : 0);
    var body = fixed(v, digits);
    return opts.currency ? opts.currency + " " + body : body;
  }
  function pillText(p, opts) {
    var when = (p && (p.label || dateLabel(p.d))) || "";
    var val = !p || p.v == null ? "no reading" : valueText(p.v, opts);
    if (when && val) return when + " • " + val;
    return when || val || "no reading";
  }
  function tickText(v, opts) {
    if (opts && opts.format === "rate") return rateText(v);
    return compact(v);
  }
  function niceCeil(max) {
    if (!(max > 0)) return 1;
    var exp = Math.floor(Math.log10(max));
    var pow = Math.pow(10, exp);
    var n = max / pow;
    var steps = [1, 2, 4, 5, 10];
    for (var i = 0; i < steps.length; i++) if (steps[i] >= n - 1e-6) return steps[i] * pow;
    return 10 * pow;
  }
  function readPoint(p) {
    if (p == null || typeof p !== "object") {
      var n = Number(p);
      return { d: "", v: p == null || p === "" || !isFinite(n) ? null : n, label: "" };
    }
    var raw = "v" in p ? p.v : ("value" in p ? p.value : null);
    var n = Number(raw);
    var d = String(p.d || p.date || "");
    d = isDay(d.slice(0, 10)) ? d.slice(0, 10) : "";
    return { d: d, v: raw == null || raw === "" || !isFinite(n) ? null : n, label: p.label ? String(p.label).slice(0, 40) : "" };
  }
  function expandDays(points) {
    if (points.length < 2 || points.some(function (p) { return !p.d; })) return points;
    var span = daysBetween(points[0].d, points[points.length - 1].d);
    if (span < 1 || span > 120) return points;
    var by = {};
    points.forEach(function (p) { by[p.d] = p; });
    var out = [], guard = 0;
    for (var d = points[0].d; d <= points[points.length - 1].d && guard < 130; d = addDays(d, 1), guard++) {
      out.push(by[d] ? { d: d, v: by[d].v, label: by[d].label || "" } : { d: d, v: null, label: "" });
    }
    return out;
  }
  function yOf(v, top, bottom) {
    return (top - v) / (top - bottom || 1) * H;
  }
  function model(input, opts) {
    opts = opts || {};
    var src = (input && input.points && !Array.isArray(input)) ? input.points : (input || []);
    var points = [];
    for (var i = 0; i < src.length; i++) points.push(readPoint(src[i]));
    if (points.every(function (p) { return p.d; })) points.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
    if (opts.expand !== false) points = expandDays(points);
    var finite = points.filter(function (p) { return p.v != null; });
    var max = finite.length ? Math.max.apply(null, finite.map(function (p) { return p.v; })) : 0;
    var min = finite.length ? Math.min.apply(null, finite.map(function (p) { return p.v; })) : 0;
    var top, bottom;
    if (min >= 0) { bottom = 0; top = niceCeil(max); }
    else if (max <= 0) { top = 0; bottom = -niceCeil(-min); }
    else { top = niceCeil(max); bottom = -niceCeil(-min); }
    if (top === bottom) top = bottom + 1;
    var n = points.length;
    points.forEach(function (p, i) {
      p.x = n <= 1 ? 50 : i / (n - 1) * W;
      p.y = p.v == null ? null : yOf(p.v, top, bottom);
      p.gap = p.v == null;
    });
    var tickVals = bottom === 0 ? [0, top / 2, top] : top === 0 ? [bottom, bottom / 2, 0] : [bottom, 0, top];
    var seen = {}, ticks = [];
    tickVals.forEach(function (v) {
      var k = String(Math.round(v * 1000) / 1000);
      if (seen[k]) return;
      seen[k] = 1;
      ticks.push({ v: v, y: yOf(v, top, bottom), text: tickText(v, opts) });
    });
    var style = {
      currency: opts.currency || "",
      format: opts.format || "",
      digits: opts.currency ? 2 : (opts.digits != null ? opts.digits : autoDigits(points)),
      label: opts.label || "",
      totals: opts.totals !== false,
      tone: opts.tone === "spot" ? "spot" : "accent"
    };
    return {
      points: points, ticks: ticks, top: top, bottom: bottom, finite: finite.length,
      w: W, h: H, plot: { l: 0, r: W, t: 0, b: H }, opts: style,
      x0: points.length && points[0].d ? dateLabel(points[0].d) : "",
      x1: points.length && points[points.length - 1].d ? dateLabel(points[points.length - 1].d) : ""
    };
  }
  function valueAt(m, x, width) {
    var pts = (m && m.points) || [];
    var n = pts.length;
    if (!n) return { index: -1, date: "", value: null, gap: true, label: "no reading" };
    var t = width == null ? clamp(x, 0, 1) : clamp(x / (width || 1), 0, 1);
    var i = n === 1 ? 0 : Math.round(t * (n - 1));
    var p = pts[i];
    return { index: i, date: p.d || "", value: p.v, gap: p.v == null, label: pillText(p, m.opts) };
  }
  function periodTotals(input) {
    var m = input && input.points ? input : model(input);
    var pts = m.points, n = pts.length, w = Math.floor(n / 2);
    if (w < 1) return null;
    var last = pts.slice(n - 2 * w, n - w), cur = pts.slice(n - w);
    if (last.some(function (p) { return p.v == null; }) || cur.some(function (p) { return p.v == null; })) return null;
    var sum = function (list) {
      var s = 0;
      list.forEach(function (p) { s += p.v; });
      return Math.round(s * 100) / 100;
    };
    return { window: w, last: sum(last), current: sum(cur) };
  }
  function stepIndex(i, n, key) {
    if (n < 1) return 0;
    if (i == null || i < 0) {
      if (key === "Home") return 0;
      if (key === "ArrowLeft") return Math.max(0, n - 2);
      return n - 1;
    }
    if (key === "ArrowLeft") return Math.max(0, i - 1);
    if (key === "ArrowRight") return Math.min(n - 1, i + 1);
    if (key === "Home") return 0;
    if (key === "End") return n - 1;
    return i;
  }
  function runs(points) {
    var out = [], run = [];
    points.forEach(function (p, i) {
      var brk = p.v == null || (run.length && p.d && points[run[run.length - 1]].d && daysBetween(points[run[run.length - 1]].d, p.d) > 1);
      if (brk) { if (run.length) out.push(run); run = []; if (p.v == null) return; }
      run.push(i);
    });
    if (run.length) out.push(run);
    return out;
  }
  function html(series, opts) {
    opts = opts || {};
    var m = model(series, opts);
    if (m.finite < 2) return "";
    var base = yOf(clamp(0, m.bottom, m.top), m.top, m.bottom);
    var marks = "", paths = "";
    runs(m.points).forEach(function (run) {
      if (run.length === 1) {
        var p = m.points[run[0]];
        marks += '<i class="hqchart-dotpt" style="left:' + p.x.toFixed(2) + "%;top:" + p.y.toFixed(2) + '%"></i>';
        return;
      }
      var line = run.map(function (i, k) {
        var p = m.points[i];
        return (k ? "L" : "M") + p.x.toFixed(2) + " " + p.y.toFixed(2);
      }).join("");
      var a = m.points[run[0]], b = m.points[run[run.length - 1]];
      paths += '<path class="hqchart-area" d="' + line + " L" + b.x.toFixed(2) + " " + base.toFixed(2) + " L" + a.x.toFixed(2) + " " + base.toFixed(2) + ' Z"/>';
      paths += '<path class="hqchart-line" d="' + line + '"/>';
    });
    var grid = m.ticks.map(function (t) {
      return '<line x1="0" x2="100" y1="' + t.y.toFixed(2) + '" y2="' + t.y.toFixed(2) + '"/>';
    }).join("");
    var yLabels = m.ticks.slice().reverse().map(function (t) { return "<span>" + esc(t.text) + "</span>"; }).join("");
    var xRow = m.x0 && m.x1 ? '<div class="hqchart-x"><span>' + esc(m.x0) + "</span><span>" + esc(m.x1) + "</span></div>" : "";
    var totals = null;
    if (m.opts.totals) totals = periodTotals(m);
    var sumRow = totals ? '<p class="hqchart-sum"><span>Last period <b>' + esc(valueText(totals.last, m.opts)) + '</b></span><span>This period <b>' + esc(valueText(totals.current, m.opts)) + "</b></span></p>" : "";
    var latest = null;
    for (var i = m.points.length - 1; i >= 0; i--) if (m.points[i].v != null) { latest = m.points[i]; break; }
    var name = m.opts.label || "Chart";
    var described = name + (latest ? ". Latest " + pillText(latest, m.opts) + "." : ".") + " Left and right arrows read each day.";
    var stored = m.points.map(function (p) { return { d: p.d, v: p.v, label: p.label }; });
    var opt = { currency: m.opts.currency, format: m.opts.format, digits: m.opts.digits, label: m.opts.label, totals: m.opts.totals, tone: m.opts.tone, expand: false };
    return '<div class="hqchart ' + m.opts.tone + '" tabindex="0" role="slider" aria-orientation="horizontal" aria-valuemin="0" aria-valuemax="' + (m.points.length - 1) + '"' +
      (latest ? ' aria-valuenow="' + (m.points.length - 1) + '" aria-valuetext="' + esc(pillText(latest, m.opts)) + '"' : "") +
      ' aria-label="' + esc(described) + '" style="touch-action:pan-y" data-pts="' + esc(JSON.stringify(stored)) + '" data-opts="' + esc(JSON.stringify(opt)) + '">' +
      '<div class="hqchart-plot" style="touch-action:pan-y"><div class="hqchart-ylabels">' + yLabels + '</div><div class="hqchart-stage" style="touch-action:pan-y">' +
      '<svg class="hqchart-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style="touch-action:pan-y"><g class="hqchart-grid">' + grid + "</g>" + paths + "</svg>" +
      '<div class="hqchart-marks">' + marks + '</div><div class="hqchart-cursor" hidden><i class="hqchart-guide"></i><i class="hqchart-dot"></i></div>' +
      '<div class="hqchart-pill" hidden></div></div></div>' + xRow + sumRow +
      '<div class="hqchart-live sr" aria-live="polite"></div></div>';
  }

  function modelOf(el) {
    var raw = el.getAttribute("data-pts") || "[]";
    if (el._raw !== raw || !el._model) {
      el._raw = raw;
      var opt = {};
      try { opt = JSON.parse(el.getAttribute("data-opts") || "{}"); } catch (e) { opt = {}; }
      var pts = [];
      try { pts = JSON.parse(raw); } catch (e) { pts = []; }
      opt.expand = false;
      el._model = model(pts, opt);
    }
    return el._model;
  }
  function hide(el) {
    var cur = el.querySelector(".hqchart-cursor"), pill = el.querySelector(".hqchart-pill");
    if (cur) cur.hidden = true;
    if (pill) pill.hidden = true;
    el.classList.remove("is-on");
    if (!el.classList.contains("is-pinned")) el._i = null;
  }
  function clearPins() {
    if (typeof document === "undefined") return;
    var nodes = document.querySelectorAll(".hqchart.is-pinned, .hqchart.is-on");
    for (var i = 0; i < nodes.length; i++) { nodes[i].classList.remove("is-pinned"); hide(nodes[i]); }
  }
  function showIndex(el, i, pin, speak) {
    var m = modelOf(el);
    if (!m.points.length) return;
    i = clamp(i, 0, m.points.length - 1);
    var p = m.points[i];
    var cur = el.querySelector(".hqchart-cursor"), guide = el.querySelector(".hqchart-guide"), dot = el.querySelector(".hqchart-dot"), pill = el.querySelector(".hqchart-pill");
    if (!cur || !pill) return;
    cur.hidden = false;
    guide.style.left = p.x.toFixed(2) + "%";
    if (p.v == null) dot.hidden = true;
    else { dot.hidden = false; dot.style.left = p.x.toFixed(2) + "%"; dot.style.top = p.y.toFixed(2) + "%"; }
    var text = pillText(p, m.opts);
    pill.textContent = text;
    pill.hidden = false;
    var stage = el.querySelector(".hqchart-stage");
    var w = stage ? stage.clientWidth : 0;
    var px = (p.x / 100) * w;
    var half = pill.offsetWidth / 2;
    pill.style.left = (w ? clamp(px, half + 4, Math.max(half + 4, w - half - 4)) : px) + "px";
    el._i = i;
    el.classList.add("is-on");
    if (pin) el.classList.add("is-pinned");
    el.setAttribute("aria-valuenow", String(i));
    el.setAttribute("aria-valuetext", text);
    if (speak) { var live = el.querySelector(".hqchart-live"); if (live) live.textContent = text; }
  }
  function showClient(el, clientX, pin) {
    var stage = el.querySelector(".hqchart-stage");
    if (!stage) return;
    var rect = stage.getBoundingClientRect();
    if (!rect.width) return;
    var m = modelOf(el);
    var info = valueAt(m, clientX - rect.left, rect.width);
    if (info.index < 0) return;
    showIndex(el, info.index, pin, false);
  }
  function chartEl(node) { return node && node.closest ? node.closest(".hqchart") : null; }
  var drag = null;
  function onDown(e) {
    var el = chartEl(e.target);
    if (!el) { clearPins(); return; }
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag = { el: el, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, type: e.pointerType };
  }
  function onMove(e) {
    if (e.pointerType === "mouse" && e.buttons === 0) {
      var hover = chartEl(e.target);
      if (hover && !hover.classList.contains("is-pinned")) showClient(hover, e.clientX, false);
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (drag.type !== "mouse" && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
      drag.moved = true;
      try { drag.el.setPointerCapture(e.pointerId); } catch (err) {}
    }
    if (drag.type !== "mouse" && e.cancelable) e.preventDefault();
    showClient(drag.el, e.clientX, false);
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var el = drag.el;
    drag = null;
    showClient(el, e.clientX, true);
  }
  function onCancel(e) { if (drag && e.pointerId === drag.id) drag = null; }
  function onOut(e) {
    if (!e.target || !e.target.closest || e.pointerType !== "mouse") return;
    var el = e.target.closest(".hqchart");
    if (!el || el.contains(e.relatedTarget) || el.classList.contains("is-pinned")) return;
    hide(el);
  }
  function onKey(e) {
    var el = typeof document !== "undefined" ? document.activeElement : null;
    if (!el || !el.classList || !el.classList.contains("hqchart")) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    var m = modelOf(el);
    e.preventDefault();
    var i = stepIndex(el._i == null ? null : el._i, m.points.length, e.key);
    showIndex(el, i, true, true);
  }
  function onClick(e) {
    if (e.target && e.target.closest && e.target.closest(".hqchart")) e.preventDefault();
  }
  function install() {
    if (root.__hqChartOn || typeof document === "undefined") return;
    root.__hqChartOn = true;
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick, true);
  }
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
    else install();
  }

  var api = { model: model, valueAt: valueAt, periodTotals: periodTotals, html: html, stepIndex: stepIndex };
  root.HQChart = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
