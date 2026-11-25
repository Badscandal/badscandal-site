/* HQ home screen (18 Nov 2026): one content hash on every HQ script, the service worker caches
   that full url and gives up after 8s, and a page that never paints shows Try again / Reset app. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const HQ_SCRIPTS = ["js/crt.js", "js/hq-lib.js", "js/hq-chart.js", "js/hq-growth.js", "js/hq-look.js", "js/hq.js", "js/hq-staff.js", "js/hq-phone.js", "js/hq-shell.js", "js/hq-workspaces.js", "js/hq-edits.js", "js/hq-app.js", "js/hq-cmd.js", "js/hq-pages.js"];

function contentVersion() {
  const h = createHash("sha256");
  for (const f of [...HQ_SCRIPTS].sort()) {
    h.update(f); h.update("\0"); h.update(readFileSync(new URL("../" + f, import.meta.url))); h.update("\0");
  }
  return h.digest("hex").slice(0, 12);
}

test("every HQ script url carries the same content hash, and the service worker caches that full url", () => {
  const page = readFileSync(new URL("../hq.html", import.meta.url), "utf8");
  const sw = readFileSync(new URL("../hq-sw.js", import.meta.url), "utf8");
  const v = contentVersion();
  const scripts = [...page.matchAll(/<script src="(js\/[^"]+)" defer><\/script>/g)].map((m) => m[1]);
  assert.deepEqual(scripts, HQ_SCRIPTS.map((s) => s + "?v=" + v));
  assert.match(sw, new RegExp('var V = "' + v + '"'));
  assert.match(sw, /var CACHE = "bs-hq-v19"/); /* v19, 25 Nov 2026: a new file, js/hq-edits.js (Social Farm › Edits). v18: Needs you cards. */
  assert.match(sw, /var FETCH_MS = 8000/);
  for (const s of HQ_SCRIPTS) assert.match(sw, new RegExp('"\\/' + s.replace(/\./g, "\\.") + '\\?v=" \\+ V'));
  for (const tag of page.matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)) {
    const href = (tag[0].match(/href="([^"]+)"/) || [])[1] || "";
    if (/^https?:/.test(href)) continue;
    assert.match(href, new RegExp("\\?v=" + v + "$"), href);
  }
  const bootAt = page.indexOf('<script id="hq-boot">');
  const firstSrc = page.indexOf("<script src=");
  assert.ok(bootAt >= 0 && bootAt < firstSrc, "the guard is inline and runs before the other scripts");
  const boot = page.slice(bootAt, firstSrc);
  assert.match(boot, /HQ didn't finish loading/);
  assert.match(boot, /Try again/);
  assert.match(boot, /Reset app/);
  assert.match(boot, /window\.onerror/);
  assert.match(boot, /unhandledrejection/);
  assert.match(boot, /setTimeout\(fail, 6000\)/);
  assert.match(boot, /getRegistrations/);
  assert.match(boot, /unregister/);
  assert.match(boot, /bs-hq-/);
});

function boot() {
  const page = readFileSync(new URL("../hq.html", import.meta.url), "utf8");
  const src = page.slice(page.indexOf('<script id="hq-boot">') + '<script id="hq-boot">'.length, page.indexOf("<script src=")).replace(/<\/script>\s*$/, "");
  const timers = [];
  const nodes = {
    shell: { id: "shell", hidden: true, children: [] },
    login: { id: "login", hidden: true, children: [] },
    boot: { id: "boot", hidden: true, children: [] },
  };
  const body = {
    children: [],
    appendChild(n) { n.parentNode = body; body.children.push(n); return n; },
    removeChild(n) { body.children = body.children.filter((c) => c !== n); n.parentNode = null; },
  };
  function walk(node, id) {
    if (!node) return null;
    if (node.id === id) return node;
    for (const c of node.children || []) { const hit = walk(c, id); if (hit) return hit; }
    return null;
  }
  const deleted = [];
  const unregistered = [];
  let reloads = 0;
  const regs = [
    { scope: "https://badscandal.com/hq", unregister() { unregistered.push(this.scope); return Promise.resolve(true); } },
    { scope: "https://badscandal.com/", unregister() { unregistered.push(this.scope); return Promise.resolve(true); } },
  ];
  const listeners = {};
  const sandbox = {
    document: {
      getElementById(id) { return nodes[id] || walk(body, id); },
      createElement() {
        return {
          children: [], style: {}, attrs: {},
          setAttribute(k, v) { this.attrs[k] = v; },
          appendChild(ch) { ch.parentNode = this; this.children.push(ch); return ch; },
          addEventListener(type, fn) { this.listeners = this.listeners || {}; this.listeners[type] = fn; },
        };
      },
      body,
      documentElement: body,
    },
    location: { reload() { reloads++; } },
    navigator: { serviceWorker: { getRegistrations() { return Promise.resolve(regs); } } },
    caches: {
      keys: async () => ["bs-hq-v5", "bs-hq-v6", "bs-hq-v7", "meta-cache"],
      delete: async (k) => { deleted.push(k); return true; },
    },
    Promise,
    setTimeout(fn, ms) { const t = { fn, ms, kind: "timeout" }; timers.push(t); return t; },
    clearTimeout(t) { if (t) t.cleared = true; },
    setInterval(fn, ms) { const t = { fn, ms, kind: "interval" }; timers.push(t); return t; },
    clearInterval(t) { if (t) t.cleared = true; },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
  };
  sandbox.window = sandbox;
  sandbox.caches = sandbox.caches;
  vm.runInNewContext(src, sandbox);
  return { sandbox, timers, listeners, nodes, body, deleted, unregistered, reloads: () => reloads, screen: () => body.children[0] || null };
}

async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }

test("boot guard: a thrown error or the 6s timer shows the screen, and a painted app takes it down", () => {
  const b = boot();
  assert.equal(b.screen(), null, "nothing is shown while the app can still load");
  assert.equal(b.timers.filter((t) => t.kind === "timeout" && t.ms === 6000).length, 1);
  b.sandbox.onerror();
  const el = b.screen();
  assert.equal(el.attrs.role, "alert");
  assert.equal(el.children[0].textContent, "HQ didn't finish loading");
  assert.deepEqual(el.children.slice(1).map((c) => c.textContent), ["Try again", "Reset app"]);
  b.sandbox.onerror();
  assert.equal(b.body.children.length, 1, "a second error does not stack another screen");
  const again = boot();
  again.nodes.shell.hidden = false;
  again.sandbox.onerror();
  (again.listeners.unhandledrejection || []).forEach((fn) => fn());
  assert.equal(again.screen(), null, "once the shell is up, an error leaves it up");
  const slow = boot();
  slow.timers.find((t) => t.ms === 6000).fn();
  assert.equal(slow.screen().children[0].textContent, "HQ didn't finish loading");
  slow.nodes.login.hidden = false;
  slow.timers.find((t) => t.kind === "interval").fn();
  assert.equal(slow.screen(), null, "the notice goes away when the app paints after it");
  const missed = boot();
  (missed.listeners.error || []).forEach((fn) => fn({ target: { tagName: "SCRIPT" } }));
  assert.ok(missed.screen(), "a script that failed to load shows the screen");
  const img = boot();
  (img.listeners.error || []).forEach((fn) => fn({ target: { tagName: "IMG" } }));
  assert.equal(img.screen(), null, "a missing image is not a failed boot");
});

test("boot guard: Try again reloads; Reset app unregisters the HQ worker, clears only bs-hq caches, then reloads", async () => {
  const again = boot();
  again.sandbox.onerror();
  again.screen().children[1].listeners.click();
  assert.equal(again.reloads(), 1);
  assert.deepEqual(again.unregistered, []);
  assert.deepEqual(again.deleted, []);
  const reset = boot();
  reset.sandbox.onerror();
  reset.screen().children[2].listeners.click();
  await flush();
  assert.deepEqual(reset.unregistered, ["https://badscandal.com/hq"]);
  assert.deepEqual(reset.deleted, ["bs-hq-v5", "bs-hq-v6", "bs-hq-v7"]);
  assert.equal(reset.reloads(), 1);
});

function basic(body) {
  const res = new Response(body, { status: 200 });
  Object.defineProperty(res, "type", { value: "basic" });
  return res;
}

function loadSW(fetchImpl, store) {
  const handlers = {};
  const timers = [];
  const puts = [];
  let skipped = false;
  const ctx = {
    self: {
      addEventListener(t, fn) { handlers[t] = fn; },
      skipWaiting() { skipped = true; return Promise.resolve(); },
      clients: { claim() { return Promise.resolve(); } },
    },
    location: { origin: "https://badscandal.com" },
    caches: {
      open: async () => ({ put: async (k, res) => { puts.push(k); store.set(k, res); } }),
      match: async (k) => store.get(k) || null,
      keys: async () => [],
      delete: async () => true,
    },
    fetch: fetchImpl,
    setTimeout(fn, ms) { const t = { fn, ms }; timers.push(t); return t; },
    clearTimeout(t) { if (t) t.cleared = true; },
    Response, URL, Promise,
  };
  ctx.self.location = ctx.location;
  vm.runInNewContext(readFileSync(new URL("../hq-sw.js", import.meta.url), "utf8"), ctx);
  return { handlers, timers, puts, skipped: () => skipped };
}

test("service worker: a hang falls back to the cached copy of that exact url, never another version", async () => {
  const sw = readFileSync(new URL("../hq-sw.js", import.meta.url), "utf8");
  const v = sw.match(/var V = "([0-9a-f]+)"/)[1];
  const key = "/js/hq.js?v=" + v;
  const other = "/js/hq.js?v=stale";
  const store = new Map([[key, basic("same-version")], [other, basic("other-version")], ["/hq", basic("cached-page")]]);
  let hung = 0;
  const { handlers, timers, puts } = loadSW(() => { hung++; return new Promise(() => {}); }, store);
  const ask = (url, mode = "no-cors") => {
    let promise = null, used = false;
    handlers.fetch({ request: { url, mode, method: "GET" }, respondWith(p) { used = true; promise = p; } });
    return { used, promise };
  };
  const hit = ask("https://badscandal.com" + key);
  assert.equal(hit.used, true);
  assert.equal(timers.filter((t) => t.ms === 8000 && !t.cleared).length, 1);
  timers.filter((t) => t.ms === 8000 && !t.cleared).forEach((t) => t.fn());
  assert.equal(await (await hit.promise).text(), "same-version");
  assert.deepEqual(puts, [], "a failed fetch does not replace the cached copy");
  const page = ask("https://badscandal.com/hq?sample=1", "navigate");
  timers.filter((t) => t.ms === 8000 && !t.cleared).forEach((t) => t.fn());
  assert.equal(await (await page.promise).text(), "cached-page", "a hung navigation falls back to the one cached page");
  assert.equal(ask("https://badscandal.com" + other).used, false, "a different hash is not served from this shell");
  assert.equal(hung >= 2, true);

  const fresh = new Map();
  const ok = loadSW(async () => basic("from-network"), fresh);
  let promise = null;
  ok.handlers.fetch({ request: { url: "https://badscandal.com" + key, mode: "no-cors", method: "GET" }, respondWith(p) { promise = p; } });
  assert.equal(await (await promise).text(), "from-network");
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.deepEqual(ok.puts, [key], "a good response is stored under the full url, query included");
});

test("service worker: install gives up after 8s and still takes control, so the old worker cannot keep mixing files", async () => {
  const { handlers, timers, skipped } = loadSW(() => new Promise(() => {}), new Map());
  let gate = null;
  handlers.install({ waitUntil(p) { gate = p; } });
  await flush();
  const pending = timers.filter((t) => t.ms === 8000 && !t.cleared);
  assert.ok(pending.length >= 9, "every shell file is fetched with the timeout");
  pending.forEach((t) => t.fn());
  await gate;
  assert.equal(skipped(), true);
});
