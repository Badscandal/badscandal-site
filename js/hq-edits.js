/* Social Farm › Edits (25 Nov 2026). The edit machine's screens: Review (watch, approve, reject, undo),
   Make (ask the cloud for edits), Jobs, Stock, Scores. Server: /api/edits/* (netlify/functions/edits.mjs).
   Shown only in the Social Farm workspace, behind the Farm | Edits switch. Phone first: 44 px targets.
   ?sample=1 shows made-up edits and saves nothing. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var TAB_KEY = "bs_hq_farmtab", SUB_KEY = "bs_hq_editstab";
  var state = { tab: "farm", sub: "review", overview: null, review: null, stock: null, scores: null, decided: {}, shown: 12, sound: "", busy: false, allArm: 0, why: "" };
  var observer = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function sample() { return !!(window.HQ && window.HQ.sample); }
  function api(path) { return "/api/edits/" + path + (sample() ? (path.indexOf("?") < 0 ? "?" : "&") + "sample=1" : ""); }
  function get(path) {
    if (window.HQ && window.HQ.getJSON) return window.HQ.getJSON(api(path));
    return fetch(api(path), { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); });
  }
  function post(path, body) {
    if (window.HQ && window.HQ.postJSON) return window.HQ.postJSON(api(path), body);
    return Promise.resolve({ s: 0, j: {} });
  }
  function when(iso) {
    var t = Date.parse(iso || "");
    if (!t) return "";
    var m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + " min ago";
    if (m < 60 * 24) return Math.round(m / 60) + " h ago";
    return Math.round(m / 1440) + (Math.round(m / 1440) === 1 ? " day ago" : " days ago");
  }
  function inFarm() { return !!(window.HQWorkspace && window.HQWorkspace.current() === "farm"); }

  /* ---------- the Farm | Edits switch ---------- */
  function applyTab() {
    var on = inFarm();
    var tabs = $("farmTabs"), body = $("editsBody"), ws = $("wsBody");
    if (!tabs || !body) return;
    tabs.hidden = !on;
    var edits = on && state.tab === "edits";
    body.hidden = !edits;
    if (ws) ws.hidden = edits;
    [].forEach.call(tabs.querySelectorAll("[data-ft]"), function (b) { b.setAttribute("aria-selected", b.getAttribute("data-ft") === state.tab ? "true" : "false"); });
    if (edits) load(); else stopVideos();
    if (on && !state.overview) loadCount();
  }
  function loadCount() {
    get("review").then(function (res) {
      if (res && res.s === 200 && res.j && res.j.items) { state.review = res.j.items; count(); }
    }).catch(function () {});
  }
  function count() {
    var n = (state.review || []).filter(function (it) { return !state.decided[it.id]; }).length;
    var c = $("editsCount");
    if (c) { c.textContent = n ? String(n) : ""; c.hidden = !n; }
  }

  /* ---------- loading ---------- */
  function load() {
    var body = $("editsBody");
    if (!body) return;
    draw();
    get("overview").then(function (res) {
      if (!res || res.s === 401) { state.overview = { error: "Sign in to see the edits." }; draw(); return; }
      state.overview = res.j || { error: "Couldn't load the edits." };
      draw();
    }).catch(function () { state.overview = { error: "No connection. Try again in a moment." }; draw(); });
    loadSub();
  }
  function loadSub() {
    var sub = state.sub;
    if (sub === "review") get("review").then(function (res) { state.review = res && res.s === 200 ? res.j.items || [] : { error: (res && res.j && res.j.error) || "Couldn't read 1 Review." }; count(); if (state.sub === "review") draw(); });
    if (sub === "stock") get("stock").then(function (res) { state.stock = res && res.s === 200 ? res.j : { error: (res && res.j && res.j.error) || "Couldn't read the stock." }; if (state.sub === "stock") draw(); });
    if (sub === "scores") get("scores").then(function (res) { state.scores = res && res.s === 200 ? res.j : { error: (res && res.j && res.j.error) || "Couldn't read the scores." }; if (state.sub === "scores") draw(); });
    if (sub === "jobs") get("jobs").then(function (res) { if (res && res.s === 200 && state.overview && !state.overview.error) { state.overview.jobs = res.j.jobs; } if (state.sub === "jobs") draw(); });
  }

  /* ---------- drawing ---------- */
  var SUBS = [["review", "Review"], ["make", "Make"], ["jobs", "Jobs"], ["stock", "Stock"], ["scores", "Scores"]];
  function draw() {
    var body = $("editsBody");
    if (!body) return;
    stopVideos();
    var ov = state.overview;
    var h = '<div class="edsubs" role="tablist" aria-label="Edits">' + SUBS.map(function (s) {
      return '<button type="button" role="tab" data-esub="' + s[0] + '" aria-selected="' + (state.sub === s[0]) + '">' + esc(s[1]) + "</button>";
    }).join("") + "</div>";
    if (sample()) h += '<p class="ednote">Sample: made-up edits, no video, nothing is saved.</p>';
    if (ov && ov.drive && !ov.drive.ok) h += '<p class="ednote edwarn">' + esc(ov.drive.why) + "</p>";
    if (ov && ov.error) h += '<p class="ednote edwarn">' + esc(ov.error) + "</p>";
    if (state.sub === "review") h += reviewHtml();
    else if (state.sub === "make") h += makeHtml(ov);
    else if (state.sub === "jobs") h += jobsHtml(ov);
    else if (state.sub === "stock") h += stockHtml(state.stock);
    else h += scoresHtml(state.scores);
    body.innerHTML = h;
    if (state.sub === "review") watchVideos(body);
    if (state.sub === "make") estimate();
  }

  function reviewHtml() {
    var items = state.review;
    if (!items) return '<p class="ednote">Loading the edits…</p>';
    if (items.error) return '<p class="ednote edwarn">' + esc(items.error) + "</p>";
    if (!items.length) return '<div class="wscard"><p>Nothing to review. Make some edits, and they land here when the cloud has made them.</p></div>';
    var open = items.filter(function (it) { return !state.decided[it.id] || state.decided[it.id].undoUntil > Date.now(); });
    var list = open.slice(0, state.shown);
    var pending = list.filter(function (it) { return !state.decided[it.id]; });
    var h = '<p class="edhead">' + open.filter(function (it) { return !state.decided[it.id]; }).length + " waiting · newest first · tap a video for sound</p>";
    h += '<div class="edgrid">' + list.map(card).join("") + "</div>";
    if (open.length > list.length) h += '<button type="button" class="copybtn edmore" data-emore="1">Show ' + Math.min(12, open.length - list.length) + " more</button>";
    if (pending.length > 1) h += '<button type="button" class="sendbtn edall" data-eall="1"' + (state.busy ? " disabled" : "") + ">" + (state.allArm ? "Tap again to approve all " + pending.length : "Approve all " + pending.length + " on screen") + "</button>";
    return h;
  }
  function card(it) {
    var d = state.decided[it.id];
    var vid = it.preview && it.preview.id
      ? '<video muted loop playsinline preload="none" data-src="' + esc("/api/edits/preview/" + it.preview.id) + '" data-eid="' + esc(it.id) + '"></video><span class="edsound" aria-hidden="true">' + (state.sound === it.id ? "Sound on" : "Muted") + "</span>"
      : '<div class="edblank">' + (sample() ? "Sample: no video" : "Preview not made") + "</div>";
    var acts;
    if (d) {
      acts = '<p class="edstate">' + (d.choice === "approve" ? "Approved" : "Rejected: " + esc(d.label)) + '</p><button type="button" class="copybtn" data-eundo="' + esc(it.id) + '">Undo</button>';
    } else if (state.why === it.id) {
      acts = '<p class="edq">Why?</p><div class="edchips">' + ((state.overview && state.overview.reasons) || []).map(function (r) {
        return '<button type="button" class="copybtn" data-ereason="' + esc(r.key) + '" data-eid="' + esc(it.id) + '">' + esc(r.label) + "</button>";
      }).join("") + '<button type="button" class="copybtn" data-ecancel="1">Back</button></div>';
    } else {
      acts = '<div class="edacts"><button type="button" class="edok" data-eok="' + esc(it.id) + '">Approve</button><button type="button" class="edno" data-eno="' + esc(it.id) + '">Reject</button></div>';
    }
    return '<article class="edcard' + (d ? " done" : "") + '" id="ed-' + esc(it.id) + '"><div class="edvid" data-etap="' + esc(it.id) + '">' + vid + "</div>" +
      '<p class="edline">' + esc(it.line || "") + "</p>" + (it.recipe && it.recipe.hook && it.recipe.hook.text ? '<p class="edhook">“' + esc(it.recipe.hook.text) + "”</p>" : "") +
      acts + '<p class="ferr" data-eerr="' + esc(it.id) + '" hidden></p></article>';
  }

  function makeHtml(ov) {
    if (!ov) return '<p class="ednote">Loading…</p>';
    if (ov.error) return "";
    var songs = ov.songs || [];
    if (!songs.length) return '<div class="wscard"><p>No song is ready yet. A song can be made once its folder in Drive has <b>timings.json</b> (0 Songs/&lt;song&gt;/).</p></div>';
    var h = '<form class="wscard edmake" id="edMake"><h3>Make edits</h3>';
    h += '<label>Song<select name="song">' + songs.map(function (s) { return '<option value="' + esc(s.slug) + '">' + esc(s.title) + "</option>"; }).join("") + "</select></label>";
    h += '<fieldset class="edstyles"><legend>Styles</legend>' + (ov.styles || []).map(function (s, i) {
      return '<label class="edcheck"><input type="checkbox" name="styles" value="' + esc(s.key) + '"' + (i === 0 || s.key === "movie-card" ? " checked" : "") + "><span><b>" + esc(s.label) + "</b> " + esc(s.hint) + "</span></label>";
    }).join("") + "</fieldset>";
    h += '<label>How many<input name="n" type="number" inputmode="numeric" min="1" max="' + esc(ov.maxEdits || 50) + '" value="10"></label>';
    h += '<label>Language<select name="lang">' + (ov.langs || []).map(function (l) { return '<option value="' + esc(l.key) + '">' + esc(l.label) + "</option>"; }).join("") + "</select></label>";
    h += '<fieldset class="edlen"><legend>Length</legend>' + (ov.seconds || [15, 31]).map(function (s, i) {
      return '<label class="edcheck"><input type="radio" name="seconds" value="' + s + '"' + (i === 0 ? " checked" : "") + "><span>" + s + " seconds</span></label>";
    }).join("") + "</fieldset>";
    h += '<p class="edest" id="edEst"></p>';
    if (!ov.cloud) h += '<p class="ednote">The cloud worker isn\'t switched on yet: a job waits for it.</p>';
    h += '<button class="sendbtn" type="submit"' + (sample() || (ov.drive && !ov.drive.ok) ? " disabled" : "") + ">Make</button>";
    h += '<p class="ferr" id="edMakeErr" hidden></p><p class="fok" id="edMakeOk" role="status"></p></form>';
    return h;
  }
  function estimate() {
    var f = $("edMake"), out = $("edEst");
    if (!f || !out) return;
    var n = Math.max(0, Math.min(50, parseInt(f.elements.n.value, 10) || 0));
    var secs = (f.querySelector('input[name="seconds"]:checked') || { value: "15" }).value;
    var mins = Math.ceil(3 + n * (secs === "31" ? 1.1 : 0.6));
    out.textContent = n ? "About " + mins + " cloud minutes for " + n + (n === 1 ? " edit." : " edits.") : "";
  }

  function jobsHtml(ov) {
    var jobs = (ov && ov.jobs) || [];
    if (!ov) return '<p class="ednote">Loading…</p>';
    if (!jobs.length) return '<div class="wscard"><p>No jobs yet. Make some edits.</p></div>';
    return '<div class="edjobs">' + jobs.map(function (j) {
      var bad = j.state === "failed";
      return '<article class="wscard edjob' + (bad ? " bad" : "") + '"><p class="edjw">' + esc(j.words) + "</p><p>" + esc(songTitle(j.song)) + " · " + esc((j.styles || []).map(styleWord).join(", ")) + " · " + esc(j.n) + " × " + esc(j.seconds) + " s · " + esc((j.lang || "").toUpperCase()) + '</p><p class="dmeta">' + esc(when(j.createdAt)) + (j.minutes ? " · about " + esc(j.minutes) + " cloud minutes" : "") + "</p></article>";
    }).join("") + "</div>";
  }

  function stockHtml(s) {
    if (!s) return '<p class="ednote">Loading…</p>';
    if (s.error) return '<p class="ednote edwarn">' + esc(s.error) + "</p>";
    var h = '<div class="wscard"><h3>Films waiting to be chopped</h3><p class="ednum">' + esc(s.filmsWaiting == null ? "not read" : s.filmsWaiting) + "</p><p>Drop films in 0 Clips/Movies. They're chopped every night.</p></div>";
    if (!s.reported) h += '<p class="ednote">The cloud worker hasn\'t counted the clips yet. It does after each run.</p>';
    h += (s.songs || []).map(function (r) {
      var per = r.per ? Object.keys(r.per).map(function (k) { return '<li><span>' + esc(styleWord(k === "vibe" ? "vibe-bigword" : k).replace("Big word", "Vibe styles")) + '</span><b class="' + (r.per[k] < ((state.overview && state.overview.lowStock) || 30) ? "edlow" : "") + '">' + esc(r.per[k]) + " unused</b></li>"; }).join("") : "<li>Not counted yet.</li>";
      return '<div class="wscard"><h3>' + esc(r.title) + '</h3><ul class="edrows">' + per + "</ul>" + (r.warn ? '<p class="edwarn">' + esc(r.warn) + "</p>" : "") + "</div>";
    }).join("");
    if (s.at) h += '<p class="dmeta">Counted ' + esc(when(new Date(s.at).toISOString())) + "</p>";
    return h;
  }

  function songTitle(slug) {
    var s = ((state.overview && state.overview.songs) || []).filter(function (x) { return x.slug === slug; })[0];
    return s ? s.title : slug;
  }
  function styleWord(key) {
    var parts = String(key || "").split(" · ");
    var st = ((state.overview && state.overview.styles) || []).filter(function (x) { return x.key === parts[0]; })[0];
    return (st ? st.label : parts[0]) + (parts[1] ? " (" + parts[1] + ")" : "");
  }
  function table(title, rows, emptyWord, label) {
    if (!rows || !rows.length) return '<div class="wscard"><h3>' + esc(title) + '</h3><p class="dnone">' + esc(emptyWord || "No decisions yet.") + "</p></div>";
    return '<div class="wscard"><h3>' + esc(title) + '</h3><ul class="edrows">' + rows.map(function (r) {
      return "<li><span>" + esc(label ? label(r.key) : r.key) + "</span><b>" + (r.rate == null ? "—" : esc(r.rate) + "%") + '</b><i>' + esc(r.approved) + " ✓ · " + esc(r.rejected) + " ✗</i></li>";
    }).join("") + "</ul></div>";
  }
  function scoresHtml(s) {
    if (!s) return '<p class="ednote">Loading…</p>';
    if (s.error) return '<p class="ednote edwarn">' + esc(s.error) + "</p>";
    var h = '<div class="wscard"><h3>Approved</h3><p class="ednum">' + (s.rate == null ? "—" : esc(s.rate) + "%") + "</p><p>" + esc(s.approved) + " of " + esc(s.total) + " edits in the last 3 months.</p></div>";
    h += table("By style", s.styles, "", styleWord) + table("By hook", s.hooks) + table("By grade", s.grades);
    if (s.reasons && s.reasons.length) h += '<div class="wscard"><h3>Why rejected</h3><ul class="edrows">' + s.reasons.map(function (r) { return "<li><span>" + esc(r.label) + "</span><b>" + esc(r.n) + "</b></li>"; }).join("") + "</ul></div>";
    h += '<div class="wscard"><h3>Spotify taps per farm page</h3>' + (s.pages && s.pages.length
      ? '<ul class="edrows">' + s.pages.map(function (p) { return "<li><span>" + esc(p.page) + "</span><b>" + esc(p.taps) + " taps</b><i>" + esc(p.visits) + " visits</i></li>"; }).join("") + "</ul><p class=\"dmeta\">Last 30 days, people only.</p>"
      : '<p class="dnone">No taps from farm pages yet. Each page\'s bio link is badscandal.com/&lt;song&gt;?utm_source=edits&amp;utm_content=&lt;page&gt;.</p>') + "</div>";
    return h;
  }

  /* ---------- videos: play what's on screen, muted; tap for sound ---------- */
  function stopVideos() {
    if (observer) { observer.disconnect(); observer = null; }
    [].forEach.call(document.querySelectorAll("#editsBody video"), function (v) { try { v.pause(); } catch (e) {} });
  }
  function watchVideos(root) {
    var vids = root.querySelectorAll("video[data-src]");
    if (!vids.length) return;
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!("IntersectionObserver" in window)) { [].forEach.call(vids, function (v) { v.src = v.getAttribute("data-src"); v.preload = "metadata"; }); return; }
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var v = en.target;
        if (en.isIntersecting && en.intersectionRatio >= 0.5) {
          if (!v.getAttribute("src")) v.src = v.getAttribute("data-src");
          if (!reduce || state.sound === v.getAttribute("data-eid")) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
        } else { try { v.pause(); } catch (e) {} }
      });
    }, { threshold: [0, 0.5] });
    [].forEach.call(vids, function (v) { observer.observe(v); });
  }
  function toggleSound(id) {
    state.sound = state.sound === id ? "" : id;
    [].forEach.call(document.querySelectorAll("#editsBody video[data-eid]"), function (v) {
      var on = v.getAttribute("data-eid") === state.sound;
      v.muted = !on;
      var tag = v.parentNode.querySelector(".edsound");
      if (tag) tag.textContent = on ? "Sound on" : "Muted";
      if (on) { if (!v.getAttribute("src")) v.src = v.getAttribute("data-src"); v.currentTime = 0; var p = v.play(); if (p && p.catch) p.catch(function () {}); }
    });
  }

  /* ---------- decisions ---------- */
  function showErr(id, text) {
    var p = document.querySelector('[data-eerr="' + id + '"]');
    if (p) { p.hidden = false; p.textContent = text; }
  }
  function reasonLabel(key) {
    var r = ((state.overview && state.overview.reasons) || []).filter(function (x) { return x.key === key; })[0];
    return r ? r.label : key;
  }
  function decide(id, choice, reason) {
    if (sample()) { showErr(id, "Sample: nothing is saved."); return Promise.resolve(false); }
    return post("decide", { id: id, choice: choice, reason: reason || "" }).then(function (res) {
      if (res && res.s === 200 && res.j && res.j.ok) {
        state.decided[id] = { choice: choice, label: reasonLabel(reason), undoUntil: res.j.undoUntil || Date.now() + 600000 };
        setTimeout(function () { if (state.sub === "review") draw(); count(); }, 600000 + 500);
        return true;
      }
      showErr(id, (res && res.j && res.j.error) || "Couldn't save that. Nothing changed.");
      return false;
    }, function () { showErr(id, "No connection. Nothing changed."); return false; });
  }
  function redraw(id) {
    state.why = "";
    var el = $("ed-" + id);
    count();
    if (!el) { draw(); return; }
    draw();
    var again = $("ed-" + id);
    if (again && again.scrollIntoView && again.getBoundingClientRect().top < 0) again.scrollIntoView({ block: "nearest" });
  }
  function approveAll() {
    var list = (state.review || []).filter(function (it) { return !state.decided[it.id]; }).slice(0, state.shown);
    state.busy = true; state.allArm = 0; draw();
    var i = 0;
    (function next() {
      if (i >= list.length) { state.busy = false; draw(); count(); return; }
      decide(list[i++].id, "approve").then(next);
    })();
  }

  /* ---------- events ---------- */
  document.addEventListener("click", function (ev) {
    var t = ev.target.closest && ev.target.closest("[data-ft],[data-esub],[data-eok],[data-eno],[data-ereason],[data-ecancel],[data-eundo],[data-etap],[data-emore],[data-eall]");
    if (!t) return;
    if (t.hasAttribute("data-ft")) {
      state.tab = t.getAttribute("data-ft") === "edits" ? "edits" : "farm";
      try { localStorage.setItem(TAB_KEY, state.tab); } catch (e) {}
      applyTab(); return;
    }
    if (!t.closest("#editsBody")) return;
    if (t.hasAttribute("data-esub")) {
      state.sub = t.getAttribute("data-esub");
      try { localStorage.setItem(SUB_KEY, state.sub); } catch (e) {}
      draw(); loadSub(); return;
    }
    if (t.hasAttribute("data-etap")) { toggleSound(t.getAttribute("data-etap")); return; }
    if (t.hasAttribute("data-emore")) { state.shown += 12; draw(); return; }
    if (t.hasAttribute("data-eall")) {
      if (state.busy) return;
      if (sample()) { t.textContent = "Sample: nothing is saved."; return; }
      if (!state.allArm) { state.allArm = setTimeout(function () { state.allArm = 0; if (state.sub === "review") draw(); }, 4000); draw(); return; }
      clearTimeout(state.allArm); approveAll(); return;
    }
    if (t.hasAttribute("data-eok")) { var id = t.getAttribute("data-eok"); t.disabled = true; decide(id, "approve").then(function () { redraw(id); }); return; }
    if (t.hasAttribute("data-eno")) { state.why = t.getAttribute("data-eno"); draw(); return; }
    if (t.hasAttribute("data-ecancel")) { state.why = ""; draw(); return; }
    if (t.hasAttribute("data-ereason")) {
      var rid = t.getAttribute("data-eid");
      [].forEach.call(t.parentNode.querySelectorAll("button"), function (b) { b.disabled = true; });
      decide(rid, "reject", t.getAttribute("data-ereason")).then(function () { redraw(rid); }); return;
    }
    if (t.hasAttribute("data-eundo")) {
      var uid = t.getAttribute("data-eundo");
      t.disabled = true;
      post("undo", { id: uid }).then(function (res) {
        if (res && res.s === 200 && res.j && res.j.ok) { delete state.decided[uid]; redraw(uid); return; }
        showErr(uid, (res && res.j && res.j.error) || "Couldn't undo.");
        t.disabled = false;
      }, function () { showErr(uid, "No connection. Nothing changed."); t.disabled = false; });
    }
  });
  document.addEventListener("input", function (ev) { if (ev.target.closest && ev.target.closest("#edMake")) estimate(); });
  document.addEventListener("change", function (ev) { if (ev.target.closest && ev.target.closest("#edMake")) estimate(); });
  document.addEventListener("submit", function (ev) {
    var f = ev.target;
    if (!f || f.id !== "edMake") return;
    ev.preventDefault();
    var err = $("edMakeErr"), ok = $("edMakeOk");
    err.hidden = true; ok.textContent = "";
    if (sample()) { err.hidden = false; err.textContent = "Sample: nothing is saved."; return; }
    var styles = [].map.call(f.querySelectorAll('input[name="styles"]:checked'), function (i) { return i.value; });
    var body = { song: f.elements.song.value, styles: styles, n: parseInt(f.elements.n.value, 10), lang: f.elements.lang.value, seconds: parseInt((f.querySelector('input[name="seconds"]:checked') || { value: "15" }).value, 10) };
    var btn = f.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = "Sending…";
    post("jobs", body).then(function (res) {
      btn.disabled = false; btn.textContent = "Make";
      if (res && res.s === 200 && res.j && res.j.ok) {
        ok.textContent = "Asked for " + body.n + (body.n === 1 ? " edit" : " edits") + ". " + res.j.job.words + ".";
        if (state.overview && state.overview.jobs) state.overview.jobs.unshift(res.j.job);
        return;
      }
      err.hidden = false; err.textContent = (res && res.j && res.j.error) || "Couldn't send that. Nothing was asked.";
    }, function () { btn.disabled = false; btn.textContent = "Make"; err.hidden = false; err.textContent = "No connection. Nothing was asked."; });
  });
  document.addEventListener("hq:ws", applyTab);
  document.addEventListener("hq:refreshed", function () { if (inFarm() && state.tab === "edits" && state.sub !== "review") loadSub(); });
  document.addEventListener("visibilitychange", function () { if (document.hidden) stopVideos(); });

  try { state.tab = localStorage.getItem(TAB_KEY) === "edits" ? "edits" : "farm"; } catch (e) {}
  try { var s = localStorage.getItem(SUB_KEY); if (/^(review|make|jobs|stock|scores)$/.test(s || "")) state.sub = s; } catch (e) {}
  window.HQEdits = { apply: applyTab, state: function () { return state; } };
  applyTab();
})();
