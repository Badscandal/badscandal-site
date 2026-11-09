/* The admin portal (admin.html, 9 Nov 2026). Hand-rolled on purpose: no libraries, charts are
   plain SVG/HTML. Talks to netlify/functions/admin.mjs:
     GET  /api/admin/data   -> everything on the page (401 -> the login screen)
     GET  /api/admin/csv    -> the visit log download
     POST /api/admin/login | /api/admin/logout
   Refreshes every 60 s while the tab is visible. All times are São Paulo. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var REFRESH_MS = 60000;
  var GREY = "#5A5A5A", GREEN = "#1ED760";
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  var state = { link: "", range: "7d", from: "", to: "", unit: "day", filter: "all", fAd: "", fCc: "", shown: 50 };
  try { var saved = JSON.parse(localStorage.getItem("bs_admin_view") || "{}"); if (saved.range) state.range = saved.range; if (saved.link) state.link = saved.link; } catch (e) {}
  var data = null, timer = null, loading = false;

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmt(n) { return n == null ? "–" : Math.round(n).toLocaleString("en-US"); }
  function pct(r, digits) { return r == null || !isFinite(r) ? "–" : (r * 100).toFixed(digits == null ? 1 : digits) + "%"; }
  function secs(ms) { return ms == null ? "–" : (ms / 1000).toFixed(ms < 10000 ? 2 : 1); }
  function title(slug) { return String(slug || "").replace(/[-_.]+/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  var regionNames = null;
  try { regionNames = new Intl.DisplayNames(["en"], { type: "region" }); } catch (e) {}
  function country(cc) {
    if (!cc || cc === "xx") return "Unknown";
    var up = cc.toUpperCase(), flag = "";
    if (/^[A-Z]{2}$/.test(up)) flag = String.fromCodePoint(0x1f1a5 + up.charCodeAt(0), 0x1f1a5 + up.charCodeAt(1)) + " ";
    var name = up;
    try { name = regionNames ? regionNames.of(up) : up; } catch (e) {}
    return flag + name;
  }
  var APPS = { instagram: ["Instagram", "in-app"], facebook: ["Facebook", "in-app"], messenger: ["Messenger", "in-app"],
    threads: ["Threads", "in-app"], tiktok: ["TikTok", "in-app"], snapchat: ["Snapchat", "in-app"], x: ["X", "in-app"],
    linkedin: ["LinkedIn", "in-app"], whatsapp: ["WhatsApp", "in-app"], safari: ["Safari", ""], chrome: ["Chrome", ""],
    samsung: ["Samsung Internet", ""], firefox: ["Firefox", ""], edge: ["Edge", ""], opera: ["Opera", ""],
    webview: ["Other app", "in-app"], other: ["Other", ""], unknown: ["Unknown", ""] };
  var DEVICES = { iphone: ["iPhone", "iOS"], ipad: ["iPad", "iOS"], android: ["Android", "phone"], "android-tablet": ["Android", "tablet"],
    mac: ["Mac", "desktop"], windows: ["Windows", "desktop"], linux: ["Linux", "desktop"], chromeos: ["Chromebook", ""], other: ["Other", ""], unknown: ["Unknown", ""] };
  var SOURCES = { meta: "Meta ads", ig: "Instagram", facebook: "Facebook", tiktok: "TikTok", direct: "Direct / unknown", google: "Google", x: "X" };
  function adName(r) { return r.ad ? r.ad.replace(/-/g, " ") : "(no ad)"; }
  function spNow() {
    try { return new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()); }
    catch (e) { return ""; }
  }
  function dayLabel(d, short) {
    var dt = new Date(d + "T12:00:00Z");
    var wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getUTCDay()];
    return short ? String(dt.getUTCDate()) : wd + " " + dt.getUTCDate();
  }
  function longDay(d) {
    return new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  }
  function query(extra) {
    var q = new URLSearchParams({ link: state.link || "", range: state.range });
    if (state.range === "custom") { if (state.from) q.set("from", state.from); if (state.to) q.set("to", state.to); }
    if (extra) for (var k in extra) q.set(k, extra[k]);
    return q.toString();
  }
  function remember() { try { localStorage.setItem("bs_admin_view", JSON.stringify({ range: state.range, link: state.link })); } catch (e) {} }

  /* ---------- login ---------- */
  function showLogin(msg) {
    $("app").hidden = true;
    $("login").hidden = false;
    $("err").textContent = msg || "";
    clearInterval(timer);
    setTimeout(function () { $("pw").focus(); }, 50);
  }
  $("loginForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var btn = $("go");
    btn.disabled = true;
    $("err").textContent = "";
    fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
      body: JSON.stringify({ password: $("pw").value }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (res) {
        btn.disabled = false;
        if (res.s === 200) { $("pw").value = ""; $("login").hidden = true; load(true); return; }
        if (res.s === 401) $("err").textContent = "Wrong password." + (res.j.left != null ? " " + res.j.left + " tries left." : "");
        else $("err").textContent = res.j.error || "Couldn't log in (" + res.s + ").";
      })
      .catch(function () { btn.disabled = false; $("err").textContent = "No connection. Try again."; });
  });
  $("logout").addEventListener("click", function () {
    fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" }).finally(function () { showLogin(""); });
  });

  /* ---------- loading ---------- */
  function load(first) {
    if (loading) return;
    loading = true;
    if (!first && data) $("main").classList.add("busy");
    fetch("/api/admin/data?" + query(), { credentials: "same-origin", cache: "no-store" })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (res) {
        loading = false;
        $("main").classList.remove("busy");
        if (res.s === 401) return showLogin("");
        if (res.s === 503) return showLogin("The admin password isn't set on Netlify yet (ADMIN_KEY).");
        if (res.s !== 200) { banner("Couldn't load the numbers (" + res.s + "). Retrying in a minute."); $("dot").classList.add("off"); return; }
        $("login").hidden = true;
        $("app").hidden = false;
        banner("");
        data = res.j;
        if (!state.link) state.link = data.link;
        render();
        $("main").classList.remove("skel");
        $("dot").classList.remove("off");
        $("liveTxt").textContent = "Live · " + spNow() + " SP";
        armRefresh();
      })
      .catch(function () {
        loading = false;
        $("main").classList.remove("busy");
        $("dot").classList.add("off");
        $("liveTxt").textContent = "Offline";
        if (!data) showLogin("No connection.");
      });
  }
  function armRefresh() {
    clearInterval(timer);
    timer = setInterval(function () { if (!document.hidden) load(false); }, REFRESH_MS);
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden && data) load(false); });
  function banner(msg) { $("banner").hidden = !msg; $("banner").textContent = msg; }

  /* ---------- controls ---------- */
  function syncChips() {
    [].forEach.call(document.querySelectorAll("#chips .chip"), function (c) { c.classList.toggle("on", c.getAttribute("data-r") === state.range); });
    $("custom").hidden = state.range !== "custom";
  }
  $("chips").addEventListener("click", function (ev) {
    var c = ev.target.closest(".chip");
    if (!c) return;
    state.range = c.getAttribute("data-r");
    if (state.range === "custom" && data) { state.from = state.from || data.from; state.to = state.to || data.to; $("from").value = state.from; $("to").value = state.to; }
    state.shown = 50;
    syncChips(); remember(); load(false);
  });
  ["from", "to"].forEach(function (id) {
    $(id).addEventListener("change", function () { state[id] = $(id).value; if (state.from && state.to) load(false); });
  });
  $("link").addEventListener("change", function () { state.link = $("link").value; state.fAd = ""; state.fCc = ""; remember(); load(false); });
  $("seg").addEventListener("click", function (ev) {
    var b = ev.target.closest("button");
    if (!b) return;
    state.unit = b.getAttribute("data-u");
    [].forEach.call($("seg").children, function (x) { x.classList.toggle("on", x === b); });
    drawSeries();
  });
  document.querySelector(".c-log .tools").addEventListener("click", function (ev) {
    var c = ev.target.closest(".chip");
    if (!c) return;
    state.filter = c.getAttribute("data-f");
    [].forEach.call(document.querySelectorAll(".c-log .chip"), function (x) { x.classList.toggle("on", x === c); });
    state.shown = 50; drawLog();
  });
  $("fAd").addEventListener("change", function () { state.fAd = $("fAd").value; state.shown = 50; drawLog(); });
  $("fCc").addEventListener("change", function () { state.fCc = $("fCc").value; state.shown = 50; drawLog(); });
  $("more").addEventListener("click", function () { state.shown += 50; drawLog(); });
  window.addEventListener("resize", function () { if (data) { clearTimeout(window.__rs); window.__rs = setTimeout(drawSeries, 150); } });

  /* ---------- render ---------- */
  function render() {
    var sel = $("link");
    sel.innerHTML = data.links.map(function (l) { return '<option value="' + esc(l.id) + '"' + (l.id === data.link ? " selected" : "") + ">" + esc(l.title) + "</option>"; }).join("");
    var cur = data.links.filter(function (l) { return l.id === data.link; })[0];
    if (cur && cur.cover) $("pickImg").src = cur.cover;
    syncChips();
    if (state.range === "custom") { $("from").value = data.from; $("to").value = data.to; }
    drawKpis(); drawFunnel(); drawSeries(); drawBreakdowns(); drawSpeed(); drawMeta(); fillFilters(); drawLog();
  }

  function delta(cur, prev, isRate) {
    if (cur == null || prev == null) return "";
    var vs = '<em> vs previous ' + (data.days === 1 ? "day" : data.days + " days") + "</em>";
    if (isRate) {
      var pts = (cur - prev) * 100;
      if (!prev && !cur) return "";
      return '<span class="' + (pts >= 0 ? "up" : "dn") + '">' + (pts >= 0 ? "+" : "") + pts.toFixed(1) + " pts</span>" + vs;
    }
    if (!prev) return cur ? '<span class="up">new</span>' + vs : "";
    var ch = (cur - prev) / prev * 100;
    return '<span class="' + (ch >= 0 ? "up" : "dn") + '">' + (ch >= 0 ? "+" : "") + ch.toFixed(0) + "%</span>" + vs;
  }

  function spark(svg, values, color) {
    if (!values || values.length < 2) { svg.innerHTML = ""; return; }
    var w = 200, h = 34, mx = Math.max.apply(0, values), mn = Math.min.apply(0, values);
    if (mx === mn) { mx = mn + 1; }
    var pts = values.map(function (v, i) { return [i / (values.length - 1) * w, h - 3 - (v - mn) / (mx - mn) * (h - 8)]; });
    var p = pts.map(function (q, i) { return (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1); }).join("");
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.innerHTML = '<path d="' + p + " L" + w + " " + h + " L0 " + h + 'Z" fill="' + color + '" opacity=".12"/>' +
      '<path d="' + p + '" fill="none" stroke="' + color + '" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>';
  }

  function drawKpis() {
    var k = data.kpis, p = k.prev;
    $("kTaps").textContent = fmt(k.taps);
    $("kVisits").textContent = fmt(k.visits);
    $("kUnique").textContent = fmt(k.unique);
    $("kCtr").innerHTML = k.ctr == null ? "–" : (k.ctr * 100).toFixed(1) + "<small>%</small>";
    $("dTaps").innerHTML = delta(k.taps, p.taps);
    $("dVisits").innerHTML = delta(k.visits, p.visits);
    $("dUnique").innerHTML = delta(k.unique, p.unique);
    $("dCtr").innerHTML = k.ctr == null || p.ctr == null ? "" : delta(k.ctr, p.ctr, true);
    spark($("sTaps"), data.spark.taps, GREEN);
    spark($("sVisits"), data.spark.visits, "#8A8A8A");
    spark($("sUnique"), data.spark.unique || data.spark.visits, "#8A8A8A");
    spark($("sCtr"), data.spark.ctr, "#B4B4B4");
  }

  function drawFunnel() {
    var f = data.funnel, v = f.visits || 0;
    var row = function (k, n, cls, base) {
      var w = v ? Math.max(1, n / v * 100) : 0;
      return '<div class="fun-row"><span class="k">' + k + '</span><div class="bar ' + cls + '" style="width:' + w.toFixed(1) + '%"></div>' +
        '<span class="n num">' + fmt(n) + (base ? "<small>" + pct(v ? n / v : null) + "</small>" : "") + "</span></div>";
    };
    $("funnel").innerHTML = v || f.spotify
      ? row("Visits", f.visits, "", false) + row("Unique", f.unique, "", true) + row("Spotify taps", f.spotify, "s", true) + row("Other stores", f.other, "o", true)
      : '<p class="empty">No visits in this period yet.</p>';
    var names = { apple: "Apple", youtube: "YouTube", deezer: "Deezer", amazon: "Amazon" };
    $("stores").innerHTML = Object.keys(names).map(function (k) { return names[k] + "<b>" + fmt(f.stores[k] || 0) + "</b>"; }).join("");
    $("ctr1").textContent = pct(data.kpis.ctr);
    $("ctr2").textContent = pct(data.kpis.ctrUnique);
  }

  /* Grouped bars, one axis (people). Day view for multi-day ranges, hour-of-day otherwise. */
  function drawSeries() {
    if (!data) return;
    var svg = $("ts"), tip = $("tip");
    tip.hidden = true;
    var unit = data.days === 1 ? "hour" : state.unit;
    [].forEach.call($("seg").children, function (x) { x.classList.toggle("on", x.getAttribute("data-u") === unit); });
    $("seg").hidden = data.days === 1;
    $("tsSub").textContent = unit === "hour" ? (data.days === 1 ? "By hour, São Paulo time." : "By hour of day, all " + data.days + " days added up. São Paulo time.") : "Per day, São Paulo time.";
    var rows = unit === "hour"
      ? data.series.hour.map(function (r) { return { label: String(r.h).padStart(2, "0"), tip: String(r.h).padStart(2, "0") + ":00–" + String(r.h).padStart(2, "0") + ":59", v: r.v, t: r.t }; })
      : data.series.day.map(function (r) { return { label: dayLabel(r.d, data.days > 10), tip: longDay(r.d), v: r.v, t: r.t }; });
    var W = Math.round(svg.getBoundingClientRect().width) || 640, H = W < 500 ? 230 : 220, L = 34, B = 24, T = 10;
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    var mx = Math.max.apply(0, rows.map(function (r) { return Math.max(r.v, r.t); }).concat([1]));
    var step = Math.pow(10, Math.floor(Math.log10(mx)));
    var nice = [1, 2, 2.5, 5, 10].map(function (m) { return m * step; }).filter(function (s) { return mx / s <= 5; })[0] || step * 10;
    var top = Math.ceil(mx / nice) * nice, ph = H - B - T, cw = (W - L) / rows.length, out = "";
    for (var g = 0; g <= top; g += nice) {
      var y = H - B - g / top * ph;
      out += '<line x1="' + L + '" x2="' + W + '" y1="' + y + '" y2="' + y + '" stroke="#1F1F1F"/>' +
        '<text x="' + (L - 8) + '" y="' + (y + 3.5) + '" fill="#6E6E6E" font-family="DM Mono,monospace" font-size="10" text-anchor="end">' + fmt(g) + "</text>";
    }
    var every = Math.ceil(rows.length / Math.max(4, Math.floor((W - L) / 34)));
    var bw = Math.max(2, Math.min(22, cw * 0.32));
    function bar(x, h, color) {
      if (h <= 0) return "";
      var r = Math.min(4, bw / 2, h);
      return '<path d="M' + x + " " + (H - B) + "V" + (H - B - h + r) + "q0 -" + r + " " + r + " -" + r + "h" + (bw - 2 * r) + "q" + r + " 0 " + r + " " + r + "V" + (H - B) + 'Z" fill="' + color + '"/>';
    }
    rows.forEach(function (r, i) {
      var cx = L + i * cw + cw / 2;
      out += '<rect class="hit" data-i="' + i + '" x="' + (L + i * cw) + '" y="' + T + '" width="' + cw + '" height="' + ph + '" fill="#fff" opacity="0"/>';
      out += bar(cx - bw - 1, r.v / top * ph, GREY) + bar(cx + 1, r.t / top * ph, GREEN);
      if (i % every === 0) out += '<text x="' + cx + '" y="' + (H - 6) + '" fill="#8A8A8A" font-family="DM Mono,monospace" font-size="10" text-anchor="middle">' + esc(r.label) + "</text>";
    });
    svg.innerHTML = out;

    var card = svg.closest(".card");
    function show(i) {
      var r = rows[i];
      if (!r) return;
      [].forEach.call(svg.querySelectorAll(".hit"), function (h) { h.setAttribute("opacity", +h.getAttribute("data-i") === i ? ".05" : "0"); });
      tip.innerHTML = '<div class="lbl">' + esc(r.tip) + "</div><b>" + fmt(r.v) + '</b> visits · <b style="color:#0a8a3a">' + fmt(r.t) + "</b> taps · " + pct(r.v ? r.t / r.v : null);
      tip.hidden = false;
      var sr = svg.getBoundingClientRect(), cr = card.getBoundingClientRect();
      var x = sr.left - cr.left + (L + i * cw + cw / 2) * (sr.width / W);
      var tw = tip.offsetWidth;
      tip.style.left = Math.max(8, Math.min(cr.width - tw - 8, x - tw / 2)) + "px";
      tip.style.top = (sr.top - cr.top + 4) + "px";
    }
    svg.onpointermove = svg.onpointerdown = function (ev) {
      var sr = svg.getBoundingClientRect(), x = (ev.clientX - sr.left) * (W / sr.width);
      show(Math.floor((x - L) / cw));
    };
    svg.onpointerleave = function (ev) { if (ev.pointerType === "mouse") { tip.hidden = true; [].forEach.call(svg.querySelectorAll(".hit"), function (h) { h.setAttribute("opacity", "0"); }); } };
  }

  function breakdown(el, rows, name, opts) {
    opts = opts || {};
    if (!rows.length) { el.innerHTML = '<p class="empty">Nothing yet.</p>'; return; }
    var mx = Math.max.apply(0, rows.map(function (r) { return r.v || r.t; }));
    var best = -1;
    if (opts.best) {
      var bestRate = -1;
      rows.forEach(function (r, i) { if (r.ad && r.v >= 20 && r.t / r.v > bestRate) { bestRate = r.t / r.v; best = i; } });
      if (rows.filter(function (r) { return r.ad && r.v >= 20; }).length < 2) best = -1;
    }
    el.innerHTML = rows.slice(0, opts.max || 8).map(function (r, i) {
      var n = name(r);
      var v = Math.max(r.v, r.t);
      return '<div class="bd-row"><div class="bd-name" title="' + esc(n[0]) + '">' + esc(n[0]) + (n[1] ? "<small>" + esc(n[1]) + "</small>" : "") +
        (i === best ? '<span class="best">BEST</span>' : "") + "</div>" +
        '<div class="bd-val num"><b>' + fmt(r.t) + "</b> / " + fmt(r.v) + ' <span class="bd-ctr">' + pct(r.v ? r.t / r.v : null) + "</span></div>" +
        '<div class="bd-bars"><i class="t" style="width:' + (r.t / mx * 100).toFixed(1) + '%"></i><i class="v" style="width:' + (Math.max(0, v - r.t) / mx * 100).toFixed(1) + '%"></i></div></div>';
    }).join("");
  }

  function drawBreakdowns() {
    breakdown($("bAd"), data.byAd, function (r) { return [adName(r), r.campaign ? r.campaign.toUpperCase() : r.ad ? "" : "bio, DMs, direct"]; }, { best: true, max: 12 });
    breakdown($("bGeo"), data.byCountry, function (r) { return [country(r.cc), r.city ? title(r.city) + (r.cities > 1 ? " +" + (r.cities - 1) : "") : ""]; }, { max: 10 });
    breakdown($("bApp"), data.byApp, function (r) { var a = APPS[r.k] || [title(r.k), ""]; return a; });
    breakdown($("bDev"), data.byDevice, function (r) { var a = DEVICES[r.k] || [title(r.k), ""]; return a; });
    breakdown($("bSrc"), data.bySource, function (r) { return [SOURCES[r.k] || r.k, ""]; });
    $("refs").innerHTML = data.refs.length ? "Referrers: " + data.refs.map(function (r) { return esc(r.k) + " <b>" + fmt(r.n) + "</b>"; }).join(" · ") : "";
  }

  function drawSpeed() {
    var s = data.speed;
    $("spMed").innerHTML = s.median == null ? "–" : secs(s.median) + "<small> s</small>";
    $("spP90").innerHTML = s.p90 == null ? "–" : secs(s.p90) + "<small> s</small>";
    var mx = Math.max.apply(0, s.hist.concat([1]));
    $("hist").innerHTML = s.hist.map(function (n, i) {
      return '<i class="' + (i < 3 ? "f" : "") + '" style="height:' + (n / mx * 100).toFixed(1) + '%" title="' + (i < 10 ? (i / 10).toFixed(1) + "–" + ((i + 1) / 10).toFixed(1) + " s" : "1 s+") + ": " + n + '"></i>';
    }).join("");
    $("spFast").textContent = s.fast.v ? pct(s.fast.t / s.fast.v) + " of " + fmt(s.fast.v) : "–";
    $("spSlow").textContent = s.slow.v ? pct(s.slow.t / s.slow.v) + " of " + fmt(s.slow.v) : "–";
  }

  function drawMeta() {
    var m = data.meta, total = m.sent + m.notSent;
    $("metaSub").textContent = "Of our " + fmt(total) + " counted Spotify taps.";
    $("mSent").innerHTML = total ? fmt(m.sent) + "<small> / " + fmt(total) + " · " + pct(m.sent / total, 0) + "</small>" : "–";
    $("mStack").innerHTML = total ? '<i style="width:' + (m.sent / total * 100) + '%;background:var(--spot)"></i><i style="width:' + (m.notSent / total * 100) + '%;background:var(--grey-mark)"></i>' : "";
    $("mS").textContent = fmt(m.sent);
    $("mN").textContent = fmt(m.notSent);
    $("mC").textContent = m.yes + m.no ? fmt(m.yes) + " / " + fmt(m.no) + " · " + pct(m.yes / (m.yes + m.no), 0) + " allow" : "–";
  }

  function fillFilters() {
    var ads = {}, ccs = {};
    data.log.forEach(function (r) { ads[r.ad] = 1; ccs[r.country] = 1; });
    $("fAd").innerHTML = '<option value="">Every ad</option>' + Object.keys(ads).sort().map(function (a) {
      return '<option value="' + esc(a || "-") + '"' + ((a || "-") === state.fAd ? " selected" : "") + ">" + esc(a ? a.replace(/-/g, " ") : "(no ad)") + "</option>";
    }).join("");
    $("fCc").innerHTML = '<option value="">Every country</option>' + Object.keys(ccs).sort().map(function (c) {
      return '<option value="' + esc(c) + '"' + (c === state.fCc ? " selected" : "") + ">" + esc(country(c)) + "</option>";
    }).join("");
    $("csv").href = "/api/admin/csv?" + query();
  }

  function drawLog() {
    var rows = data.log.filter(function (r) {
      if (state.filter === "yes" && !r.spotify) return false;
      if (state.filter === "no" && r.spotify) return false;
      if (state.fAd && (r.ad || "-") !== state.fAd) return false; /* "-" = visits with no ad */
      if (state.fCc && r.country !== state.fCc) return false;
      return true;
    });
    var show = rows.slice(0, state.shown), tb = "", mb = "";
    show.forEach(function (r) {
      var tap = r.spotify ? '<span class="yes">Yes</span>' : '<span class="no">No</span>';
      var ret = r.returning ? '<span class="ret">BACK</span>' : "";
      var where = (r.city ? title(r.city) + ", " : "") + (r.country && r.country !== "xx" ? r.country.toUpperCase() : "?");
      var dev = (DEVICES[r.device] || [title(r.device)])[0] + " · " + (APPS[r.app] || [title(r.app)])[0];
      var time = r.time.slice(5, 16).replace("-", "/");
      var meta = r.meta === true ? " · Meta" : r.meta === false ? " · not to Meta" : "";
      var other = r.other.length ? '<div class="m">also ' + esc(r.other.join(", ")) + "</div>" : "";
      tb += "<tr><td class=\"num\">" + esc(time) + '</td><td><span class="vid">' + esc(r.visitor.slice(0, 4) + "…" + r.visitor.slice(-2)) + "</span>" + ret +
        "</td><td>" + esc(where) + "</td><td>" + esc(dev) + "</td><td>" + esc(adName(r)) + "</td><td>" + tap + "<small class=\"no\">" + esc(meta) + "</small>" + other +
        '</td><td class="num">' + (r.tapMs != null ? secs(r.tapMs) + " s" : '<span class="no">—</span>') + '</td><td class="num">' + (r.readyMs != null ? secs(r.readyMs) + " s" : "") + "</td></tr>";
      mb += '<div class="lr"><div><b>' + esc(where) + "</b> " + ret + '<div class="m">' + esc(time + " · " + dev + " · " + adName(r)) + "</div>" + other + "</div>" +
        '<div style="text-align:right">' + tap + '<div class="m">' + (r.tapMs != null ? secs(r.tapMs) + " s" : "") + "</div></div></div>";
    });
    $("logBody").innerHTML = tb || '<tr><td colspan="8" class="empty">No visits match.</td></tr>';
    $("mlog").innerHTML = mb || '<p class="empty">No visits match.</p>';
    $("more").hidden = rows.length <= state.shown;
    $("logFoot").textContent = "Showing " + fmt(show.length) + " of " + fmt(rows.length) +
      (data.logTotal > data.log.length ? " (latest " + fmt(data.log.length) + " of " + fmt(data.logTotal) + " here; the CSV has every visit)" : "") +
      " · raw visits kept 90 days, then daily totals only";
  }

  /* ---------- go ---------- */
  syncChips();
  if (reduce) document.documentElement.classList.add("reduce");
  load(true);
})();
