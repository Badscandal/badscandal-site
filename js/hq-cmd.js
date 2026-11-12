/* BADSCANDAL HQ · Search (the HQ redesign, 12 Nov 2026). One bar that jumps anywhere: a tab, a song, a
   bot, a release, a message waiting on Luke, or an action (New song, Refresh, Data health, Copy today's
   summary). Open it with ⌘K / Ctrl+K, "/" (when not typing), or the magnifier in the header. Built only
   from what the page already loaded (HQStaff.board(), HQ.songIndex()); it never asks the server. The
   rules (what is listed, what matches) are js/hq-lib.js cmdIndex / cmdResults, tested in
   tests/hq-cmd.test.mjs. Arrow keys move, Enter opens, Escape closes; focus goes back where it was. */
(function () {
  "use strict";
  var HQ = window.HQ, L = window.HQLib;
  var $ = function (id) { return document.getElementById(id); };
  var box = $("cmdBox"), input = $("cmdInput"), list = $("cmdList"), scrim = $("cmdScrim"), btn = $("cmdBtn");
  if (!HQ || !L || !box || !input || !list) return;
  var esc = HQ.esc, items = [], shown = [], active = 0, back = null;
  var ICON = { tab: "#", action: "→", message: "!", song: "♪", release: "◷", bot: "@" };

  function draw() {
    shown = L.cmdResults(items, input.value, 8);
    if (active >= shown.length) active = 0;
    list.innerHTML = shown.length ? shown.map(function (x, i) {
      return '<li id="cmd-o' + i + '" role="option" data-i="' + i + '" class="cmd-o k-' + esc(x.kind) + '" aria-selected="' + (i === active) + '"><span class="cmd-k" aria-hidden="true">' + esc(ICON[x.kind] || "·") +
        '</span><span class="cmd-l">' + esc(x.label) + '</span><span class="cmd-h">' + esc(x.hint || "") + "</span></li>";
    }).join("") : '<li class="cmd-none" role="option" aria-disabled="true">Nothing found. Try a song, a bot or a tab.</li>';
    input.setAttribute("aria-activedescendant", shown.length ? "cmd-o" + active : "");
    var on = $("cmd-o" + active); if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest" });
  }
  function open() {
    if ($("shell") && $("shell").hidden) return; /* only once logged in */
    back = document.activeElement;
    items = L.cmdIndex({ board: window.HQStaff ? window.HQStaff.board() : null, songs: HQ.songIndex ? HQ.songIndex() : [] });
    input.value = ""; active = 0;
    box.hidden = false; if (scrim) scrim.hidden = false;
    if (btn) btn.setAttribute("aria-expanded", "true");
    draw();
    input.focus();
  }
  function close(keepFocus) {
    if (box.hidden) return;
    box.hidden = true; if (scrim) scrim.hidden = true;
    if (btn) btn.setAttribute("aria-expanded", "false");
    if (!keepFocus && back && back.focus) back.focus();
  }
  function choose(x) {
    if (!x) return;
    close(true);
    if (x.href) {
      if (location.hash === x.href) window.dispatchEvent(new HashChangeEvent("hashchange")); else location.hash = x.href;
      return;
    }
    var target = { refresh: "refresh", health: "healthBtn", copy: "copySummary" }[x.action];
    if (target && $(target)) $(target).click();
  }

  input.addEventListener("input", function () { active = 0; draw(); });
  input.addEventListener("keydown", function (ev) {
    if (ev.key === "ArrowDown") { ev.preventDefault(); if (shown.length) { active = (active + 1) % shown.length; draw(); } }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); if (shown.length) { active = (active - 1 + shown.length) % shown.length; draw(); } }
    else if (ev.key === "Enter") { ev.preventDefault(); choose(shown[active]); }
    else if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); close(); }
  });
  list.addEventListener("mousemove", function (ev) {
    var li = ev.target.closest && ev.target.closest("[data-i]");
    if (li && Number(li.getAttribute("data-i")) !== active) { active = Number(li.getAttribute("data-i")); draw(); }
  });
  list.addEventListener("click", function (ev) { var li = ev.target.closest && ev.target.closest("[data-i]"); if (li) choose(shown[Number(li.getAttribute("data-i"))]); });
  if (scrim) scrim.addEventListener("click", function () { close(); });
  if (btn) btn.addEventListener("click", function () { if (box.hidden) open(); else close(); });
  document.addEventListener("keydown", function (ev) {
    var k = (ev.key || "").toLowerCase();
    if ((ev.metaKey || ev.ctrlKey) && k === "k") { ev.preventDefault(); if (box.hidden) open(); else close(); return; }
    var t = ev.target, typing = t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName || ""));
    if (k === "/" && !typing && box.hidden && !ev.metaKey && !ev.ctrlKey && !ev.altKey) { ev.preventDefault(); open(); }
  });
  window.HQCmd = { open: open, close: close };
})();
