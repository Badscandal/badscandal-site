/* Growth page and Rights page (19 Nov 2026).
   One list of posts feeds the week card and the tables, at one age per column.
   A missing number is "not reported". Nothing here invents a zero. */
(function (g) {
  "use strict";
  var L = g.HQLib || (g.HQLib = {});
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function miss() { return '<span class="gmiss">not reported</span>'; }
  function shown(v) { return v == null || v === "" ? miss() : esc(v); }
  function num(v) {
    if (v == null || v === "") return miss();
    var n = Number(v);
    if (!isFinite(n)) return miss();
    return esc(n.toLocaleString("en-US"));
  }
  function signed(v) {
    if (v == null || v === "") return miss();
    var n = Number(v);
    if (!isFinite(n)) return miss();
    return esc((n > 0 ? "+" : "") + n.toLocaleString("en-US"));
  }
  function hours(v) {
    if (v == null || v === "") return miss();
    var n = Number(v);
    if (!isFinite(n)) return miss();
    return esc(String(Math.round(n * 10) / 10));
  }
  /* seconds of watch time, 2 decimals (v18, 21 Nov 2026, Kevin) */
  function secs(v) {
    if (v == null || v === "") return miss();
    var n = Number(v);
    if (!isFinite(n)) return miss();
    return esc(n.toFixed(2) + "s");
  }
  function pct(v) {
    if (v == null || !isFinite(v)) return miss();
    return esc((v * 100).toFixed(2) + "%");
  }
  function dayOf(v) {
    if (!v) return miss();
    return L.day ? esc(L.day(v)) : esc(v);
  }
  function platId(name) {
    var k = String(name || "").toLowerCase().replace(/[^a-z]/g, "");
    if (k === "ig" || k.indexOf("instagram") >= 0) return "instagram";
    if (k === "tt" || k.indexOf("tiktok") >= 0) return "tiktok";
    if (k === "yt" || k.indexOf("youtube") >= 0) return "youtube";
    if (k.indexOf("spotify") >= 0) return "spotify";
    return k || "";
  }
  var LABEL = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", spotify: "Spotify" };
  function labelOf(name) { var id = platId(name); return LABEL[id] || String(name || ""); }
  function unitOf(id) { return id === "youtube" ? "subscribers" : "followers"; }
  function linkOr(href, text) {
    if (!href) return shown(text);
    var t = text || href;
    if (!/^https:\/\//i.test(href)) return esc(t);
    return '<a href="' + esc(href) + '">' + esc(t) + "</a>";
  }
  function videoHref(p) {
    if (p && p.link && /^https:\/\//i.test(p.link)) return p.link;
    if (p && p.video_id && /^[A-Za-z0-9_-]{6,20}$/.test(p.video_id)) return "https://www.youtube.com/watch?v=" + p.video_id;
    return "";
  }
  function epv(p) {
    if (!p || p.views_24h == null || !(Number(p.views_24h) > 0)) return null;
    var keys = ["likes", "comments", "saves", "shares"];
    for (var i = 0; i < keys.length; i++) if (p[keys[i]] == null || p[keys[i]] === "") return null;
    return (Number(p.likes) + Number(p.comments) + Number(p.saves) + Number(p.shares)) / Number(p.views_24h);
  }
  function savesShares(p) {
    if (!p || p.views_24h == null || !(Number(p.views_24h) > 0) || p.saves == null || p.shares == null) return null;
    return (Number(p.saves) + Number(p.shares)) / Number(p.views_24h);
  }
  function fromIg(p) {
    var s = p && p.snaps || {};
    var d1 = s.d1 || null, d7 = s.d7 || null;
    var row = { platform: "Instagram", id: p && p.id || "", date: String(p && p.at || "").slice(0, 10), hook: String(p && (p.caption || p.song) || "").split("\n")[0].slice(0, 160), link: p && p.link || "" };
    if (d1) {
      ["views", "likes", "comments", "saves", "shares", "follows"].forEach(function (k) { if (d1[k] != null && d1[k] !== "") row[k === "views" ? "views_24h" : k] = Number(d1[k]); });
    }
    if (d7 && d7.views != null && d7.views !== "") row.views_7d = Number(d7.views);
    if (p && p.paid === true) row.boosted = true;
    else if (p && p.paid === false) row.boosted = false;
    return row;
  }
  function collectPosts(rows, igPosts) {
    var out = [], seen = {};
    (rows || []).forEach(function (r) {
      var plat = labelOf(r.platform);
      (r.posts || []).forEach(function (p) {
        if (!p || typeof p !== "object") return;
        out.push(Object.assign({ platform: plat }, p));
      });
    });
    (igPosts || []).forEach(function (p) { if (p) out.push(fromIg(p)); });
    return out.filter(function (p) {
      var k = [p.platform, p.date || "", p.link || p.video_id || "", p.hook || ""].join("|");
      if (seen[k]) return false;
      seen[k] = 1;
      return true;
    });
  }
  function latestRow(rows, id) {
    var list = (rows || []).filter(function (r) { return r && platId(r.platform) === id && r.kind !== "song"; })
      .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    return list[0] || null;
  }
  function signal(account, id) {
    return ((account && account.signals) || []).filter(function (s) { return s && (s.id === id || String(s.id).indexOf(id + ":") === 0); })[0] || null;
  }
  function accountOf(health, id) {
    return ((health && health.accounts) || []).filter(function (a) { return a && a.id === id; })[0] || null;
  }
  var DOT = { ok: "Fine", watch: "Watch", red: "Needs a look", gap: "Not enough data" };
  function dot(level, word) {
    var state = level && DOT[level] ? level : "gap";
    return '<a class="gdot ' + esc(state) + '" href="#growth"><i></i><span>' + esc(word) + ": " + esc(DOT[state]) + "</span></a>";
  }
  function blocks(c) {
    if (!c) return false;
    if (String(c.strike || "").toLowerCase() === "yes") return true;
    return /block|mute|remov|taken down|age-restrict/i.test([c.status, c.impact, c.reach_effect, c.claim_type].join(" "));
  }
  function headline(p, row) {
    var id = platId(p && p.platform);
    var unit = unitOf(id);
    var gaps = p && Array.isArray(p.gapDays) ? p.gapDays : null;
    var gapLine = gaps && gaps.length ? "Gap days: " + esc(gaps.map(function (d) { return L.day ? L.day(d) : d; }).join(", ")) : "";
    var late = row && row.views_date && row.date && row.views_date < row.date;
    var chart = g.HQChart && p && p.series ? g.HQChart.html(p.series, { label: labelOf(p.platform || id) + " " + unit, totals: false }) : "";
    return '<article class="tile ghead"><div class="row"><h3>' + esc(labelOf(p.platform || id)) + '</h3></div>' +
      '<p class="lbl">' + esc(unit === "subscribers" ? "Subscribers" : "Followers") + "</p>" +
      '<div class="big num">' + num(p.followers) + "</div>" +
      '<p class="d">Today ' + signed(p.day) + " · 7 days " + signed(p.d7 != null ? p.d7 : p.week) + (p.d28 != null ? " · 28 days " + signed(p.d28) : "") + "</p>" +
      (gapLine ? '<p class="d">' + gapLine + "</p>" : "") + chart +
      (late ? '<p class="d">Views are for ' + dayOf(row.views_date) + ", a day late.</p>" : "") +
      "</article>";
  }
  function weekCard(posts, pattern) {
    var ranked = posts.map(function (p) { return { p: p, e: epv(p) }; }).filter(function (x) { return x.e != null; })
      .sort(function (a, b) { return b.e - a.e; });
    var settled = ranked.length >= 10;
    var top = ranked.slice(0, 3);
    var bottom = settled ? ranked.slice(-3).reverse() : [];
    function line(x) {
      var p = x.p;
      return "<li>" + esc(p.platform) + " · " + dayOf(p.date) + " · " + linkOr(videoHref(p), p.hook || "post") + " · " + pct(x.e) + " per view</li>";
    }
    var h = '<section class="gsec"><h3>What worked this week</h3>';
    h += '<p class="sub">Engagement per view is (likes + comments + saves + shares) / views, at 24 hours. ' +
      (settled ? "Top 3 and bottom 3 use that same list." : "Fewer than 10 posts have a full 24-hour count, so the order is not settled yet.") + "</p>";
    h += "<p class=\"d\"><b>Pattern</b> · " + (pattern ? esc(pattern) : miss()) + "</p>";
    if (!top.length) h += "<p class=\"d\">Top 3: " + miss() + "</p><p class=\"d\">Bottom 3: " + miss() + "</p>";
    else {
      h += "<p class=\"lbl\">Top</p><ol>" + top.map(line).join("") + "</ol>";
      if (bottom.length) h += "<p class=\"lbl\">Bottom</p><ol>" + bottom.map(line).join("") + "</ol>";
    }
    return h + "</section>";
  }
  function tag(p) {
    if (p.boosted === true) return "Boosted";
    if (p.boosted === false) return "Organic";
    return null;
  }
  function table(platform, posts) {
    var rows = posts.filter(function (p) { return platId(p.platform) === platform; });
    var h = '<section class="gsec"><h3>' + esc(LABEL[platform]) + " posts</h3>";
    h += '<div class="scroll"><table class="posttable"><tr><th>Date</th><th>Hook</th><th>Views 24h</th><th>Views 7d</th><th>EPV 24h</th><th>Saves + shares / view</th><th>Follows</th><th></th></tr>';
    if (!rows.length) h += '<tr><td colspan="8">' + miss() + "</td></tr>";
    rows.forEach(function (p) {
      var e = epv(p), ss = savesShares(p);
      h += "<tr>" + cell("Date", dayOf(p.date)) + cell("Hook", linkOr(videoHref(p), p.hook)) + cell("Views 24h", num(p.views_24h)) + cell("Views 7d", num(p.views_7d)) +
        cell("EPV 24h", e == null ? miss() : pct(e)) + cell("Saves + shares / view", ss == null ? miss() : pct(ss)) + cell("Follows", num(p.follows)) + cell("Reach", shown(tag(p))) + "</tr>";
    });
    return h + "</table></div></section>";
  }
  function gateOf(row) {
    if (!row) return null;
    if (row.avg_watch_6h == null || row.follows_6h == null || !(Number(row.views_6h) > 0)) return null;
    var rate = Number(row.follows_6h) / Number(row.views_6h);
    return Number(row.avg_watch_6h) >= 2.5 && rate >= 0.0014 ? "pass" : "fail";
  }
  function pick(a, b) { return a != null && a !== "" ? a : b; }
  /* "First 6 hours: watch time ok, no new followers" (v18, 21 Nov 2026, Kevin: not "+6h gate PASS/FAIL") */
  function gateWords(row) {
    var watch = Number(row.avg_watch_6h) >= 2.5 ? "watch time ok" : "watch time short";
    var f = Number(row.follows_6h), rate = Number(row.views_6h) > 0 ? f / Number(row.views_6h) : 0;
    var fol = !(f > 0) ? "no new followers" : rate >= 0.0014 ? "new followers ok" : "few new followers";
    return "First 6 hours: " + watch + ", " + fol;
  }
  /* what was not read, on one line: "Not reported: followers, follows_48h (why…)" */
  function gapLine(keys, why) {
    var first = String(why[keys[0]] || "").replace(/\s+/g, " ").trim();
    var line = "Not reported: " + keys.map(function (k) { return String(k).replace(/_/g, " "); }).join(", ") + (first ? " (" + first + ")" : "");
    if (line.length <= 140) return line;
    var cut = line.slice(0, 139), sp = cut.lastIndexOf(" ");
    return (sp > 20 ? cut.slice(0, sp) : cut) + "…" + (first ? ")" : "");
  }
  function tiktokBlock(row, summary) {
    var gate = gateOf(row);
    var rate = row && row.follows_6h != null && Number(row.views_6h) > 0 ? Number(row.follows_6h) / Number(row.views_6h) : null;
    var viewsDate = pick(summary && summary.viewsDate, row && row.views_date);
    var late = viewsDate && ((summary && summary.lastDay) || (row && row.date)) && viewsDate < ((summary && summary.lastDay) || row.date);
    var h = '<section class="gsec" id="tiktokBox"><h3>TikTok</h3>';
    /* v18, 21 Nov 2026 (Kevin): plain words, watch time to 2 decimals, the views lag said where the views are */
    h += '<p class="d">First 6 hours: views ' + num(row && row.views_6h) + " · avg watch " + (row && row.avg_watch_6h != null ? secs(row.avg_watch_6h) : miss()) + " · follows " + num(row && row.follows_6h) + " · follows/view " + (rate == null ? miss() : pct(rate)) + "</p>";
    h += '<p class="d">1 day views ' + num(pick(summary && summary.views, row && row.views)) + (late ? " (for " + dayOf(viewsDate) + ", a day late)" : "") + " · avg watch " + (row && row.avg_watch != null ? secs(row.avg_watch) : miss()) + " · follows at 48h " + num(row && row.follows_48h) + "</p>";
    h += '<p class="d">' + (gate == null ? "First 6 hours: " + miss() : '<b class="gate-' + gate + '">' + esc(gateWords(row)) + "</b>") + "</p>";
    h += "<p class=\"d\">Best post, last 7 days " + (row && (row.best_post_link || row.best_post) ? linkOr(row.best_post_link, row.best_post || "link") : miss()) + "</p>";
    var gaps = row && row.gaps && typeof row.gaps === "object" ? Object.keys(row.gaps).filter(function (k) { return row[k] == null || row[k] === ""; }) : [];
    if (gaps.length) h += "<p class=\"d\">" + esc(gapLine(gaps, row.gaps)) + "</p>";
    return h + "</section>";
  }
  function youtubeBlock(row, health, summary) {
    var acc = accountOf(health, "youtube");
    var status = signal(acc, "status");
    var money = signal(acc, "monetisation");
    var claim = (acc && acc.signals || []).filter(function (s) { return s && String(s.id).indexOf("claim") === 0 && s.level === "red"; });
    var href = videoHref(row || {});
    var h = '<section class="gsec" id="youtubeBox"><h3>YouTube</h3>';
    var asShown = function (n, field) { var s = row && row.shown && row.shown[field]; return s ? esc("~" + s) : num(n); };
    var gained = pick(summary && summary.day, row && row.change);
    var gainedText = gained == null || gained === "" ? miss() : ((row && row.change_approx) ? "~" : "") + signed(gained);
    h += '<p class="d">Subscribers ' + asShown(pick(summary && summary.followers, row && (row.subscribers != null ? row.subscribers : row.followers)), "followers") + " · gained " + gainedText + "</p>";
    h += '<p class="d">Views that day ' + asShown(pick(summary && summary.views, row && row.views), "views") + " · official channel " + asShown(pick(summary && summary.officialViews, row && row.official_views), "official_views") + " · other channels " + asShown(pick(summary && summary.otherViews, row && row.other_views), "other_views") + "</p>";
    h += '<p class="d">Lifetime channel views ' + asShown(pick(summary && summary.channelViews, row && row.channel_views), "channel_views") + " · Shorts views " + asShown(pick(summary && summary.shortsViews, row && row.shorts_views), "shorts_views") + " · watch hours " + hours(pick(row && row.watch_hours, summary && summary.watchHours)) + "</p>";
    h += "<p class=\"d\">Top video " + (href || (row && row.best_post) ? linkOr(href, row.best_post || row.video_id || "video") : miss()) + "</p>";
    var tops = row && Array.isArray(row.top_videos) ? row.top_videos : [];
    if (!tops.length) h += "<p class=\"d\">Top 3 videos " + miss() + "</p>";
    else {
      h += "<ol>" + tops.slice(0, 3).map(function (v) {
        var u = v && v.link && /^https:\/\//.test(v.link) ? v.link : (v && v.video_id ? "https://www.youtube.com/watch?v=" + v.video_id : "");
        return "<li>" + linkOr(u, v && (v.title || v.video_id)) + " · " + num(v && v.views) + "</li>";
      }).join("") + "</ol>";
    }
    h += '<p class="d">Account status ' + (status && status.level !== "gap" ? esc(status.text) : miss()) + "</p>";
    h += '<p class="d">Studio · monetisation ' + (money && money.level !== "gap" ? esc(money.text) : miss()) + " · claims " + (claim.length ? esc(claim.map(function (s) { return s.text; }).join(" ")) : miss()) + "</p>";
    h += '<p class="sub">YouTube on Needs you uses Studio (claims, strikes, monetisation). Post engagement is not the health dot here.</p>';
    return h + "</section>";
  }
  function titleKey(s) {
    return String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  }
  function normLink(s) { return String(s || "").trim().toLowerCase().replace(/[?#].*$/, "").replace(/\/+$/, ""); }
  function samePost(a, b) {
    if (!a || !b) return false;
    var ida = String(a.id || ""), idb = String(b.id || "");
    if (ida && idb && (ida === idb || (ida.length >= 8 && idb.length >= 8 && (ida.slice(-idb.length) === idb || idb.slice(-ida.length) === ida)))) return true;
    var la = normLink(a.link), lb = normLink(b.link);
    if (la && lb) return la === lb;
    var ta = titleKey(a.hook || a.caption || ""), tb = titleKey(b.hook || b.caption || "");
    return !!(ta && tb && ta === tb);
  }
  function spendOk(paid) {
    if (!paid || paid.spend == null || paid.stale) return false;
    if (paid.scope !== "ad" && paid.scope !== "post" && paid.scope !== "title") return false;
    if (paid.started && paid.asOf && Number(paid.asOf) < Number(paid.started)) return false;
    return true;
  }
  function engOf(p) {
    if (!p) return null;
    var keys = ["likes", "comments", "saves", "shares"];
    for (var i = 0; i < keys.length; i++) if (p[keys[i]] == null || p[keys[i]] === "" || !isFinite(Number(p[keys[i]]))) return null;
    return Number(p.likes) + Number(p.comments) + Number(p.saves) + Number(p.shares);
  }
  function followsOf(p) {
    if (!p || p.follows == null || p.follows === "" || !isFinite(Number(p.follows))) return null;
    return Number(p.follows);
  }
  function rankList(ranking) {
    if (!ranking) return [];
    var too = Array.isArray(ranking.tooFew) ? ranking.tooFew : [];
    return [].concat(ranking.ranked || [], ranking.older || [], too);
  }
  function rankHit(post, ranking) {
    var hits = rankList(ranking).filter(function (r) { return r && samePost(post, { id: r.id, link: r.link, hook: r.caption }); });
    return hits[0] || null;
  }
  function latestCount(post, posts, read) {
    var hits = (posts || []).filter(function (p) { return samePost(post, p) && read(p) != null; });
    hits.sort(function (a, b) { return String(a.date || "") < String(b.date || "") ? 1 : -1; });
    return hits.length ? read(hits[0]) : null;
  }
  function boostedPosts(id, posts, ranking) {
    var list = (posts || []).filter(function (p) { return platId(p.platform) === id && p.boosted === true; });
    if (id !== "instagram") return list;
    rankList(ranking).forEach(function (r) {
      if (!r || (!r.boosted && !r.paid)) return;
      var row = { platform: "Instagram", id: r.id || "", link: r.link || "", hook: String(r.caption || "").split("\n")[0].slice(0, 160), date: String(r.at || "").slice(0, 10), boosted: true };
      if (r.engReported) { row.likes = r.likes; row.comments = r.comments; row.saves = r.saves; row.shares = r.shares; }
      if (r.follows != null) row.follows = r.follows;
      if (!list.some(function (p) { return samePost(p, row); })) list.push(row);
    });
    return list;
  }
  function loggedBoosts(rows, id) {
    var out = [];
    (rows || []).forEach(function (r) {
      if (!r || platId(r.platform) !== id || !Array.isArray(r.boosts)) return;
      r.boosts.forEach(function (b) {
        if (!b || !b.link) return;
        out.push({ platform: LABEL[id] || r.platform, hook: b.hook || r.best_post || "boost", link: b.link, date: r.date || "", boosted: true, spend: b.spend, currency: b.currency || "", status: b.status || "" });
      });
    });
    return out;
  }
  function bestPostBoosts(rows, ranking) {
    var out = [];
    (rows || []).forEach(function (r) {
      if (!r || platId(r.platform) !== "instagram" || (!r.best_post && !r.best_post_link)) return;
      var seed = { platform: "Instagram", hook: r.best_post || "", link: r.best_post_link || "", date: r.date || "" };
      var hit = rankHit(seed, ranking);
      if (!hit || (!hit.boosted && !hit.paid && hit.boost !== "boosted")) return;
      if (hit.engReported) { seed.likes = hit.likes; seed.comments = hit.comments; seed.saves = hit.saves; seed.shares = hit.shares; }
      if (hit.follows != null) seed.follows = hit.follows;
      out.push(seed);
    });
    return out;
  }
  function boosted(rows, posts, ranking) {
    var h = '<section class="gsec" id="boostBox"><h3>Boosted</h3>';
    ["tiktok", "instagram", "youtube"].forEach(function (id) {
      var row = latestRow(rows, id);
      var paidPosts = boostedPosts(id, posts, ranking);
      if (id === "instagram") bestPostBoosts(rows, ranking).forEach(function (p) {
        if (!paidPosts.some(function (x) { return samePost(x, p); })) paidPosts.push(p);
      });
      loggedBoosts(rows, id).forEach(function (p) {
        var have = paidPosts.filter(function (x) { return samePost(x, p); })[0];
        if (!have) paidPosts.push(p);
        else { if (have.spend == null && p.spend != null) have.spend = p.spend; if (!have.currency && p.currency) have.currency = p.currency; if (!have.status && p.status) have.status = p.status; }
      });
      h += '<article class="tile"><h3>' + esc(LABEL[id]) + "</h3>";
      h += "<p class=\"d\">Paid views " + num(row && row.paid_views) + " · organic views " + num(row && row.organic_views) + "</p>";
      if (!paidPosts.length) h += "<p class=\"d\">Spend " + miss() + " · cost per engagement " + miss() + " · cost per follow " + miss() + "</p>";
      paidPosts.forEach(function (p) {
        var hit = rankHit(p, ranking);
        var paid = hit && hit.paid;
        var spendNum = spendOk(paid) ? Number(paid.spend) : null;
        if (spendNum == null && p.spend != null && isFinite(Number(p.spend))) spendNum = Number(p.spend);
        if (spendNum != null && !isFinite(spendNum)) spendNum = null;
        var asOf = spendNum != null && paid && paid.asOf && spendOk(paid) && L.spStampOf ? L.spStampOf(paid.asOf) : "";
        var cur = (spendOk(paid) && paid && paid.currency ? paid.currency : p.currency) ? ((spendOk(paid) && paid && paid.currency) || p.currency) + " " : "";
        var eng = latestCount(p, posts, engOf);
        if (eng == null) eng = engOf(p);
        var fol = latestCount(p, posts, followsOf);
        if (fol == null) fol = followsOf(p);
        var costEng = spendNum != null && eng > 0 ? spendNum / eng : null;
        var costFol = spendNum != null && fol > 0 ? spendNum / fol : null;
        var spendText = spendNum == null ? "spend not read since boost started" : cur + spendNum.toFixed(2) + (asOf ? " as of " + asOf : "") + (p.status ? " · " + p.status : "");
        h += "<p class=\"d\">" + linkOr(videoHref(p), p.hook || "post") + " · Spend " + esc(spendText) + "</p>";
        h += "<p class=\"d\">Cost per engagement " + (costEng == null ? miss() : esc(costEng.toFixed(2))) + " · cost per follow " + (costFol == null ? miss() : esc(costFol.toFixed(2))) + "</p>";
      });
      h += "</article>";
    });
    var organic = posts.filter(function (p) { return p.boosted === false && epv(p) != null; });
    if (organic.length < 3) h += "<p class=\"d\">Boost candidate " + miss() + "</p>";
    else {
      var med = organic.map(epv).sort(function (a, b) { return a - b; });
      var mid = med.length % 2 ? med[(med.length - 1) / 2] : (med[med.length / 2 - 1] + med[med.length / 2]) / 2;
      var hits = organic.filter(function (p) { return epv(p) > mid; });
      h += "<p class=\"d\">Boost candidate " + (hits.length ? hits.map(function (p) { return linkOr(videoHref(p), (p.hook || p.platform) + " beat the median 24h engagement per view"); }).join("; ") : "none of the organic posts with a 24h count beat the median") + "</p>";
    }
    return h + "</section>";
  }
  function datedAvg(posts) {
    var dated = (posts || []).filter(function (p) { return p && /^\d{4}-\d{2}-\d{2}/.test(String(p.at || p.date || "")) && epvFromRank(p) != null; });
    if (dated.length < 2) return null;
    var newest = dated.map(function (p) { return String(p.at || p.date).slice(0, 10); }).sort().pop();
    var in14 = dated.filter(function (p) {
      var d = String(p.at || p.date).slice(0, 10);
      return d && newest && d <= newest && d >= addDays(newest, -14);
    });
    if (in14.length < 2) return null;
    var vals = in14.map(epvFromRank);
    return vals.reduce(function (s, n) { return s + n; }, 0) / vals.length;
  }
  function epvFromRank(p) {
    if (p.perView != null && isFinite(Number(p.perView))) return Number(p.perView);
    return epv(p);
  }
  function addDays(day, n) {
    var t = Date.parse(day + "T12:00:00Z");
    if (!isFinite(t)) return "";
    return new Date(t + n * 86400000).toISOString().slice(0, 10);
  }
  function ideasHtml(doc) {
    var d = doc && doc.reported != null ? doc : null;
    var ideas = d && d.ideas || [];
    var posts = d && d.posts || [];
    var avg = datedAvg(posts);
    var h = '<section class="gsec" id="sparkIdeas"><h3>Spark ideas</h3>';
    if (!d || !d.reported) return h + '<p class="d">' + esc((d && d.empty) || "No content ideas yet. Spark sends them once a day. Nothing is posted.") + "</p></section>";
    var songs = {};
    ideas.forEach(function (i) { if (i && i.song) songs[i.song.toLowerCase()] = (songs[i.song.toLowerCase()] || 0) + 1; });
    ideas.forEach(function (i) {
      var count = i.song ? songs[i.song.toLowerCase()] : null;
      var v = "";
      if (i.status === "posted") {
        var e = i.epv != null ? Number(i.epv) : null;
        var verdict = e == null || avg == null || avg === 0 ? null : (e / avg >= 1.1 ? "won" : e / avg <= 0.9 ? "lost" : "flat");
        v = "<p class=\"d\">Views " + num(i.views) + " · EPV " + (e == null ? miss() : pct(e)) + " · 14-day average " + (avg == null ? miss() : pct(avg)) + " · " + (verdict || miss()) + "</p>";
        if (i.why_won) v += "<p class=\"d\">Why it won · " + esc(i.why_won) + "</p>";
      }
      h += '<article class="idea-card"><p class="lbl">' + esc(i.platform || "") + " · " + esc(i.status || "idea") + (i.auto ? " · next idea" : "") + "</p>";
      h += "<p class=\"d\"><b>" + esc(i.hook || "") + "</b></p>";
      h += "<p class=\"d\">On screen · " + shown(i.text) + "</p>";
      h += "<p class=\"d\">Format · " + shown(i.format) + " · song " + shown(i.song) + " · market " + shown(i.market) + "</p>";
      h += "<p class=\"d\">Source " + (i.source ? linkOr(i.source, "link") : miss()) + " · score " + shown(i.score) + "</p>";
      h += "<p class=\"d\">" + esc(i.why || "") + "</p>" + v;
      h += "<p class=\"d\">Hooks for this song " + (count == null ? miss() : esc(count + " of 10")) + "</p></article>";
    });
    return h + "</section>";
  }
  function countdowns(releases) {
    var list = (releases || []).filter(function (r) { return r && r.date && r.daysToGo != null && r.daysToGo >= 0; });
    var h = '<section class="gsec"><h3>Releases</h3>';
    if (!list.length) return h + '<p class="d">No release dated.</p></section>';
    h += "<ul>" + list.map(function (r) {
      var when = r.daysToGo === 0 ? "out today" : "in " + r.daysToGo + " day" + (r.daysToGo === 1 ? "" : "s");
      return "<li>" + esc(r.song || r.title) + " · " + dayOf(r.date) + " · " + esc(when) + "</li>";
    }).join("") + "</ul></section>";
    return h;
  }
  function healthRow(health) {
    var h = '<section class="gsec"><h3>Accounts</h3><div class="trend-row">';
    ["tiktok", "instagram", "spotify"].forEach(function (id) {
      var acc = accountOf(health, id);
      var status = signal(acc, "status");
      var reach = signal(acc, "reach");
      h += '<article class="tile"><h3>' + esc(LABEL[id]) + "</h3>";
      h += "<p class=\"d\">Account status " + (status && status.level !== "gap" ? esc(status.text) : miss()) + "</p>";
      if (id === "spotify") h += "<p class=\"d\">Last check " + (acc && acc.checked ? dayOf(acc.checked) : miss()) + "</p>";
      h += "<p class=\"d\">" + dot(reach && reach.level, "Engagement") + "</p></article>";
    });
    h += '<article class="tile"><h3>YouTube</h3><p class="d">Account status is under the YouTube block. Engagement is not used for YouTube.</p></article>';
    return h + "</div></section>";
  }
  function growthHtml(input) {
    input = input || {};
    var rows = input.rows || [];
    var posts = collectPosts(rows, input.igPosts || []);
    var byId = {};
    (input.platforms || []).forEach(function (p) { if (p && p.platform) byId[platId(p.platform)] = p; });
    var order = ["tiktok", "instagram", "youtube"];
    (input.platforms || []).forEach(function (p) { var id = platId(p.platform); if (id && order.indexOf(id) < 0) order.push(id); });
    var pattern = "";
    rows.forEach(function (r) { if (r && r.pattern && (!pattern || (r.date || "") >= pattern.date)) pattern = r; });
    var heads = '<section class="gsec"><h3>Followers</h3><div class="trend-row">' + order.filter(function (id) { return id !== "spotify" || byId[id]; }).map(function (id) {
      var p = byId[id] || { platform: LABEL[id] || id, followers: null, day: null, d7: null, d28: null, gapDays: null };
      return headline(p, latestRow(rows, id));
    }).join("") + "</div><p class=\"sub\">YouTube says subscribers. A gap day is a day with no reading between the first log and the latest.</p></section>";
    var blocking = ((input.claims && input.claims.items) || []).filter(blocks);
    var badge = blocking.length ? '<p><a class="claimbadge" href="#rights">' + blocking.length + " Content ID claim" + (blocking.length === 1 ? "" : "s") + " blocking or muting a video</a></p>" : "";
    return heads + badge + weekCard(posts, pattern && pattern.pattern) +
      order.filter(function (id) { return LABEL[id] && id !== "spotify"; }).map(function (id) { return table(id, posts); }).join("") +
      tiktokBlock(latestRow(rows, "tiktok"), byId.tiktok) + youtubeBlock(latestRow(rows, "youtube"), input.health, byId.youtube) +
      healthRow(input.health) + boosted(rows, posts, input.ranking) + ideasHtml(input.ideas) + countdowns(input.releases);
  }
  function cell(label, html) { return '<td data-label="' + esc(label) + '">' + html + "</td>"; }
  function field(v) { return v != null && String(v).trim() !== "" ? String(v) : ""; }
  function claimsHtml(claims, today) {
    var items = !claims ? [] : (Array.isArray(claims) ? claims : (claims.items || []));
    var checked = claims && claims.checked && today ? claims.checked[today] : null;
    var h = "<!-- licence_queue stays with the Label bot, not on this table --><p class=\"d\">Checked " + (checked ? dayOf(today) : miss()) + "</p>";
    if (!items.length) return h + '<p class="d">No Content ID claim has been recorded.</p>';
    h += '<div class="scroll"><table class="posttable"><tr><th>Song</th><th>Claimant</th><th>Status</th><th>Action</th></tr>';
    items.forEach(function (c) {
      var title = field(c.song) || field(c.claim) || miss();
      var when = dayOf(c.first_seen) || dayOf(c.last_checked);
      var status = shown(c.status) + (when && when !== miss() ? " · " + when : "");
      h += "<tr>" + cell("Song", title) + cell("Claimant", shown(c.claimant)) + cell("Status", status) + cell("Action", shown(c.action)) + "</tr>";
    });
    return h + "</table></div>";
  }
  function tiktokFans(rows) {
    var out = [];
    (rows || []).forEach(function (r) {
      if (platId(r.platform) !== "tiktok" || !Array.isArray(r.fan_signals)) return;
      r.fan_signals.forEach(function (s) { if (s) out.push(Object.assign({ date: r.date }, s)); });
    });
    return out;
  }
  L.growthPosts = collectPosts;
  L.growthEpv = epv;
  L.growthHtml = growthHtml;
  L.claimsHtml = claimsHtml;
  L.tiktokFans = tiktokFans;
  L.claimBlocks = blocks;
})(typeof globalThis !== "undefined" ? globalThis : this);
