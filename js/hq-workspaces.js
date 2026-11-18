/* BADSCANDAL / Social Farm / Label (18 Nov 2026). The last choice is remembered on this device.
   BADSCANDAL is the dashboard as it is. Farm and Label draw their own Needs you, numbers and team.
   Sample mode can look, and it does not save. */
(function () {
  "use strict";
  var KEY = "bs_hq_ws";
  var $ = function (id) { return document.getElementById(id); };
  var current = "badscandal";
  var openCard = "", editing = "";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function money(v) {
    if (v === "not reported" || v == null) return "not reported";
    if (!v.length) return "not reported";
    return v.map(function (x) { return x.currency + " " + Number(x.amount).toFixed(2); }).join(", ");
  }
  function field(label, name, type, placeholder) {
    return '<label>' + esc(label) + '<input name="' + name + '" type="' + (type || "text") + '" placeholder="' + esc(placeholder || "") + '"></label>';
  }
  function go(label) { return '<button class="wsgo" type="submit">' + esc(label) + '</button>'; }

  function apply(name) {
    current = name === "farm" || name === "label" ? name : "badscandal";
    document.body.classList.toggle("ws-on", current !== "badscandal");
    var note = $("farmNote");
    if (note) note.hidden = current !== "farm";
    [].forEach.call(document.querySelectorAll("#wsSwitch [data-ws]"), function (b) {
      b.setAttribute("aria-selected", b.getAttribute("data-ws") === current ? "true" : "false");
    });
    try { localStorage.setItem(KEY, current); } catch (e) {}
    if (window.HQShell) window.HQShell.show((location.hash || "#today").replace(/^#/, "").split("/")[0] || "today");
    if (current === "badscandal") { if ($("wsBody")) $("wsBody").innerHTML = ""; return; }
    load();
  }

  function load(silent) {
    var body = $("wsBody");
    if (!body) return;
    if (!silent) body.innerHTML = '<p>Loading…</p>';
    var sample = window.HQ && window.HQ.sample;
    var url = "/api/staff/workspace?ws=" + current + (sample ? "&sample=1" : "");
    var ask = window.HQ && window.HQ.getJSON ? window.HQ.getJSON(url) : fetch(url, { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); });
    ask.then(function (res) {
      if (!res || res.s === 401) { body.innerHTML = "<p>Sign in to see this workspace.</p>"; return; }
      if (!res.j || res.j.workspace !== current) { body.innerHTML = "<p>" + esc(res.j && res.j.error || "Could not load this workspace.") + "</p>"; return; }
      body.innerHTML = res.j.workspace === "farm" ? farmHtml(res.j) : labelHtml(res.j);
      bind(body, !!res.j.sample || sample);
    }).catch(function () { body.innerHTML = "<p>Could not load this workspace.</p>"; });
  }

  function stack(list, topOpen) {
    return (list || []).map(function (c, i) {
      var open = openCard ? openCard === c.id : (topOpen && i === 0);
      var money = c.money_at_risk && c.amount != null ? " · " + c.currency + " " + c.amount : "";
      var link = /^https:\/\//.test(c.link || "") ? '<p class="dmeta"><a href="' + esc(c.link) + '">' + esc(c.link) + "</a></p>" : "";
      return '<article class="dcard astack' + (open ? " open" : "") + '"><button class="astackbtn" type="button" data-wsopen="' + esc(c.id) + '"><b>' + esc(c.owner_bot || c.owner) + "</b> " + esc(c.preview || c.text) + esc(money) + "</button>" +
        '<div class="abody"' + (open ? "" : " hidden") + "><p>" + esc(c.text) + "</p>" +
        (c.recipient ? "<p>To " + esc(c.recipient) + "</p>" : "") + link +
        (c.deadline ? '<p class="dmeta">' + esc(c.deadline) + "</p>" : "") +
        '<p class="drec">' + esc(c.line) + "</p>" +
        '<div class="dacts"><button class="sendbtn" type="button" data-wschoice="yes" data-wsid="' + esc(c.id) + '">Yes</button>' +
        '<button class="copybtn" type="button" data-wschoice="no" data-wsid="' + esc(c.id) + '">No</button>' +
        '<button class="copybtn" type="button" data-wschoice="edit" data-wsid="' + esc(c.id) + '">Edit</button></div>' +
        (editing === c.id ? '<div class="aedit"><textarea class="fld" rows="4" maxlength="600" data-wsedit="' + esc(c.id) + '">' + esc(c.text) + '</textarea><button class="sendbtn" type="button" data-wssave="' + esc(c.id) + '">Save this version</button></div>' : "") +
        '<p class="ferr" data-wserr="' + esc(c.id) + '" hidden></p></div></article>';
    }).join("");
  }
  function needs(v) {
    var auto = v.auto || { header: "0 need you · nothing at risk", needsYou: [], held: [], waitingOnOthers: [] };
    var cards = auto.needsYou || [];
    var h = '<div class="wscard" id="wsNeeds"><h2>Needs you</h2><p class="dhead">' + esc(auto.header || "0 need you · nothing at risk") + "</p>";
    h += stack(cards, true);
    if (auto.quiet && auto.held && auto.held.length) h += '<p class="dnone">Quiet hours until 08:00. These wait.</p>' + stack(auto.held, false);
    if (v.needs && v.needs.length) h += "<ul>" + v.needs.map(function (n) { return "<li>" + esc(n.text) + "</li>"; }).join("") + "</ul>";
    else if (!cards.length && !(auto.held && auto.held.length)) h += '<p class="dnone">Nothing is waiting on you.</p>';
    var others = auto.waitingOnOthers || [];
    if (others.length) h += '<section class="waitlane"><h3>Waiting on others</h3><ul>' + others.map(function (it) {
      return '<li class="' + (it.tone === "bad" ? "bad" : "") + '"><b>' + esc(it.name) + "</b> " + esc(it.text) + "</li>";
    }).join("") + "</ul></section>";
    return h + "</div>";
  }
  function team(v) {
    return '<div class="wscard"><h2>Team</h2><ul>' + v.team.map(function (t) { return "<li><b>" + esc(t.name) + "</b> — " + esc(t.role) + "</li>"; }).join("") + "</ul></div>";
  }

  function farmHtml(v) {
    var accounts = v.accounts || [], posts = v.posts || [], roll = v.rollups || {};
    var list = accounts.length ? accounts.map(function (a) {
      return '<article class="wscard"><h3>@' + esc(a.handle) + '</h3><p>' + esc(a.platform) + ' · ' + esc(a.niche || "no niche yet") + '</p><p>Health: ' + esc(a.status) + '</p><p>Songs: ' + esc((a.songs || []).join(", ") || "none recorded") + '</p><p>Owner: ' + esc(a.owner || "not set") + ' · since ' + esc(a.created || "") + '</p></article>';
    }).join("") : '<div class="wscard"><p>No farm accounts yet. Add a TikTok, Instagram or YouTube page that already posts using our audio.</p></div>';
    var postList = posts.length ? '<ul>' + posts.map(function (p) {
      return "<li>" + esc(p.date) + " · @" + esc(p.handle) + " · " + esc(p.song) + " · " + esc(p.contentType || "post") + " · " + esc(p.views == null ? "views not read" : p.views + " views") + "</li>";
    }).join("") + "</ul>" : "<p>No posts recorded yet. A post needs the account, the day, the song and the numbers you could read.</p>";
    var songs = (roll.viewsPerSong || []).map(function (s) { return "<li>" + esc(s.song) + ": " + esc(s.views) + " views</li>"; }).join("") || "<li>No song rollup yet.</li>";
    return needs(v) + '<div class="wscard"><h2>Numbers</h2><p>' + esc(v.numbers.accounts) + " accounts · " + esc(v.numbers.posts) + " posts · " + esc(v.numbers.views) + " views</p></div>" + team(v) +
      "<h2>Accounts</h2>" + list + '<form class="wscard" data-act="add_account"><h3>Record an account</h3><p>' + esc(v.recording) + "</p>" +
      '<label>Platform<select name="platform"><option>TikTok</option><option>Instagram</option><option>YouTube</option></select></label>' +
      field("Handle", "handle", "text", "without the @") + field("Niche", "niche", "text", "what it posts") + field("Songs", "songs", "text", "our songs, separated by commas") +
      field("Owner", "owner", "text", "person or bot") + '<label>Health<select name="status"><option>active</option><option>paused</option><option>restricted</option><option>banned</option></select></label>' +
      field("Created", "created", "date") + go("Record account") + '<p class="ferr" hidden></p></form>' +
      "<h2>Posts</h2>" + postList + '<form class="wscard" data-act="add_post"><h3>Record a post</h3>' +
      field("Account", "account", "text", "the handle") + field("Date", "date", "date") + field("Song", "song", "text", "which of our songs") +
      field("Content type", "contentType", "text", "clip, photo, duet") + field("Views", "views", "text") + field("Likes", "likes", "text") +
      field("Shares", "shares", "text") + field("Saves", "saves", "text") + field("Follows", "follows", "text") + field("Link", "link", "url", "https://") +
      go("Record post") + '<p class="ferr" hidden></p></form>' +
      '<div class="wscard"><h2>Rollups</h2><p>Views per song</p><ul>' + songs + "</ul></div>";
  }

  function stepCard(s) {
    var extra = "";
    var state = s.status;
    if (s.key === "licence") {
      state = s.shown || (s.status === "licensed" ? "licensed" : "waiting on licence");
      extra = "<p>Proof " + esc(s.proof_link || "not set") + "</p><p>Order " + esc(s.esl_order_number || "not set") + "</p><p>PDF " + esc(s.licence_pdf_url || "not set") + "</p><p>Folder " + esc(s.drive_folder_url || "not set") + "</p><p>Original: " + esc(s.original_title || "not set") + "</p><p>Writers: " + esc(s.original_writers || "not known") + " · Publisher: " + esc(s.original_publisher || "not known") + "</p>" + (s.flag_reason ? "<p>Flag: " + esc(s.flag_reason) + "</p>" : "") + "<p>Only the Licence bot or Nova can mark this, after Luke says yes for this song. HQ does not take payment.</p>";
    }
    return '<article class="wsstep' + (s.status === "blocked" ? " blocked" : "") + '"><h3>' + esc(s.label) + '</h3><p>' + esc(s.owner_bot || s.owner) + " · " + esc(state) + "</p>" + (s.note ? "<p>" + esc(s.note) + "</p>" : "") + extra + "</article>";
  }
  function labelHtml(v) {
    var genres = v.genres || [];
    var blocks = genres.map(function (g) {
      var aliases = (g.aliases || []).map(function (a) { return "<li>" + esc(a.name || "Main alias — name not set") + (a.main ? " (main)" : "") + (a.s4a ? "" : " · no S4A access yet") + "</li>"; }).join("") || "<li>No alias yet.</li>";
      var rel = (g.releases || []).map(function (r) {
        return '<article class="wscard"><h3>' + esc(r.title) + "</h3><p>" + esc(r.date) + " · cover</p><div class=\"wssteps\">" + r.steps.map(stepCard).join("") + "</div></article>";
      }).join("") || '<p>No cover releases yet. Add one when the audio, the artwork and the canvas are ready. Label releases are covers only.</p>';
      var pl = g.playlist || { name: "", url: "", owner_bot: "", status: "not set up" };
      var st = g.stats || {};
      return '<section class="wscard"><h2>' + esc(g.name) + "</h2><h3>Aliases</h3><ul>" + aliases + "</ul>" +
        '<form data-act="add_alias"><input type="hidden" name="genre" value="' + esc(g.name) + '">' + field("Another alias", "name", "text", "artist name") + go("Add alias") + '<p class="ferr" hidden></p></form>' +
        "<h3>Playlist</h3><p>Name: " + esc(pl.name || "not set") + "</p><p>Link: " + esc(pl.url || "not set") + "</p><p>Owner: " + esc(pl.owner_bot || "not set") + '</p><p>Status: ' + esc(pl.status) + "</p><p>A playlist bot will fill this later. It is not set up.</p>" +
        "<h3>Covers</h3>" + rel +
        '<form data-act="create_release"><input type="hidden" name="genre" value="' + esc(g.name) + '">' + field("Cover title", "title", "text") + field("Release day", "date", "date") + go("Add cover") + '<p class="ferr" hidden></p></form>' +
        "<h3>Numbers</h3><p>Releases: " + esc(st.releases) + "</p><p>Spend: " + esc(money(st.spend)) + "</p><p>Streams: " + esc(st.streams) + "</p><p>Payout: " + esc(money(st.payout)) + "</p><p>ROI: " + esc(st.roi) + "</p>" +
        ((g.trends || []).length ? "<h3>Trends</h3><ul>" + g.trends.map(function (t) { return "<li>" + esc(t.date) + " · " + esc(t.direction) + " · " + esc(t.note || "") + "</li>"; }).join("") + "</ul>" : "<h3>Trends</h3><p>No trend recorded yet. Add a source, a date and whether it is rising or falling.</p>") +
        "</section>";
    }).join("");
    var research = (v.research || []).length ? "<ul>" + v.research.map(function (r) { return "<li>" + esc(r.name) + (r.score == null ? "" : " · " + esc(r.score)) + "</li>"; }).join("") + "</ul>" : "<p>No candidate genres yet. Add a name, a score and a note.</p>";
    return needs(v) + '<div class="wscard"><h2>Numbers</h2><p>' + esc(v.numbers.genres) + " genres · " + esc(v.numbers.releases) + " covers</p><p>" + esc(v.payments) + "</p></div>" + team(v) + blocks +
      '<form class="wscard" data-act="add_genre"><h2>Add genre</h2>' + field("Genre", "name", "text", "a genre to add") + go("Add genre") + '<p class="ferr" hidden></p></form>' +
      '<form class="wscard" data-act="research"><h2>Genre research</h2>' + field("Name", "name", "text") + field("Score", "score", "text", "0 to 100") + field("Notes", "notes", "text") + field("Source", "source", "url", "https://") + go("Add candidate") + '<p class="ferr" hidden></p></form>' +
      research;
  }

  function sendChoice(id, choice, text) {
    if (window.HQ && window.HQ.sample) return;
    var send = window.HQ && window.HQ.postJSON ? window.HQ.postJSON("/api/staff/card", { id: id, choice: choice, text: text || "" }) : Promise.resolve({ s: 0, j: {} });
    send.then(function (res) {
      if (res && res.s === 200 && res.j && res.j.ok) { editing = ""; openCard = ""; load(); return; }
      var p = document.querySelector('[data-wserr="' + id + '"]');
      if (p) { p.hidden = false; p.textContent = (res && res.j && res.j.error) || "Couldn't save that."; }
    }, function () {
      var p = document.querySelector('[data-wserr="' + id + '"]');
      if (p) { p.hidden = false; p.textContent = "No connection. Nothing was sent."; }
    });
  }
  function bind(root, sample) {
    if (sample) [].forEach.call(root.querySelectorAll("#wsNeeds .dacts button, #wsNeeds .aedit button, #wsNeeds textarea"), function (el) { el.disabled = true; });
    [].forEach.call(root.querySelectorAll("form"), function (form) {
      if (sample) {
        [].forEach.call(form.querySelectorAll("input,select,button"), function (el) { el.disabled = true; });
        var p = document.createElement("p"); p.textContent = "Sample: nothing is saved."; form.appendChild(p); return;
      }
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var data = { workspace: current, action: form.getAttribute("data-act") };
        [].forEach.call(form.elements, function (el) { if (el.name) data[el.name] = el.value; });
        var err = form.querySelector(".ferr");
        var send = window.HQ && window.HQ.postJSON ? window.HQ.postJSON("/api/staff/workspace", data) : Promise.resolve({ s: 0, j: {} });
        send.then(function (res) {
          if (!res || res.s >= 400 || (res.j && res.j.error)) { if (err) { err.hidden = false; err.textContent = (res.j && res.j.error) || "Could not save that."; } return; }
          load();
        });
      });
    });
  }

  [].forEach.call(document.querySelectorAll("#wsSwitch [data-ws]"), function (b) {
    b.addEventListener("click", function () { apply(b.getAttribute("data-ws")); });
  });
  document.addEventListener("hq:refreshed", function () { if (current !== "badscandal") load(); });
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("[data-wsopen],[data-wschoice],[data-wssave]");
    if (!a || current === "badscandal") return;
    if (a.hasAttribute("data-wsopen")) { openCard = a.getAttribute("data-wsopen"); load(true); return; }
    if (window.HQ && window.HQ.sample) return;
    var id = a.getAttribute("data-wsid") || a.getAttribute("data-wssave");
    if (a.getAttribute("data-wschoice") === "edit") { editing = id; openCard = id; load(true); return; }
    if (a.hasAttribute("data-wssave")) {
      var box = document.querySelector('[data-wsedit="' + id + '"]');
      sendChoice(id, "edit", box ? box.value : "");
      return;
    }
    if (a.getAttribute("data-wschoice") === "yes" || a.getAttribute("data-wschoice") === "no") sendChoice(id, a.getAttribute("data-wschoice"));
  });
  var saved = "badscandal";
  try { saved = localStorage.getItem(KEY) || "badscandal"; } catch (e) {}
  if (saved === "farm" || saved === "label") apply(saved);
})();
