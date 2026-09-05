/* ============================================================
   BADSCANDAL — plugin store (plugin.html), no libraries.

   ONE product, ONE job: make BUY NOW go straight to checkout.

   * Looks the product up on the Shopify Storefront API by HANDLE
     (CONFIG.handle) — same public token store.js uses.
   * Found -> every [data-buy] button shows the live price and a click
     creates a cart with the first available variant and sends the
     visitor to Shopify checkout.
   * Not found (product not created / not published to the Headless
     channel yet) -> the buttons keep the href written in the HTML
     (a mailto), and no price is shown. Nothing on the page breaks.
   * Also drives the thin progress bar under the scroll-played film
     (the scrub itself lives in js/main.js — makeScrub).

   >>> EDIT HERE <<< when the Shopify product exists:
     handle: the product's URL handle on store.badscandal.com
             (…/products/<handle>). Remember: Printful-style products
             only publish to "Online Store" — the plugin product must be
             published to the HEADLESS channel or this lookup returns
             null with no error (CLAUDE.md, "Known Shopify-side issues").
   ============================================================ */
(function () {
  "use strict";

  var CONFIG = {
    domain: "cdziaw-1i.myshopify.com",
    token: "98b69d5eea492db921df63b35200ab10",  /* public Storefront token */
    apiVersion: "2025-04",
    handle: "cleanslate"
  };

  var buttons = Array.prototype.slice.call(document.querySelectorAll("[data-buy]"));
  var prices = Array.prototype.slice.call(document.querySelectorAll("[data-price]"));

  /* ---------- scroll-film progress bar ---------------------------------- */
  (function bar() {
    var sec = document.querySelector("[data-scrub]");
    var fill = sec && sec.querySelector("[data-scrub-bar]");
    if (!sec || !fill) return;
    var raf = null;
    function upd() {
      raf = null;
      var r = sec.getBoundingClientRect();
      var total = r.height - window.innerHeight;
      var p = total <= 0 ? 0 : Math.min(1, Math.max(0, -r.top / total));
      fill.style.width = (p * 100).toFixed(2) + "%";
    }
    window.addEventListener("scroll", function () { if (!raf) raf = requestAnimationFrame(upd); }, { passive: true });
    window.addEventListener("resize", function () { if (!raf) raf = requestAnimationFrame(upd); });
    upd();
  })();


  /* ---------- module detail dialog ---------------------------------------
     Each .mod-card[data-module] opens #mmodal with the matching hidden
     .mdetail article cloned in (text stays in the HTML so i18n runs on it).
     Esc / backdrop / Close all close; focus returns to the card. --------- */
  (function modules() {
    var modal = document.getElementById("mmodal");
    var body = document.getElementById("mmodal-body");
    var img = document.getElementById("mmodal-img");
    var closeBtn = document.getElementById("mmodal-close");
    if (!modal || !body) return;
    var last = null;
    function open(card) {
      var key = card.getAttribute("data-module");
      var src = document.getElementById("md-" + key);
      if (!src) return;
      body.innerHTML = src.innerHTML;
      if (img) { img.src = src.getAttribute("data-img") || ""; img.alt = "CLEANSLATE " + key + " page"; }
      last = card;
      modal.hidden = false;
      modal.scrollTop = 0;
      document.body.style.overflow = "hidden";
      if (closeBtn) closeBtn.focus();
    }
    function close() {
      if (modal.hidden) return;
      modal.hidden = true;
      document.body.style.overflow = "";
      if (last && last.focus) last.focus();
    }
    Array.prototype.forEach.call(document.querySelectorAll(".mod-card[data-module]"), function (card) {
      card.addEventListener("click", function () { open(card); });
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(card); }
      });
    });
    if (closeBtn) closeBtn.addEventListener("click", close);
    modal.addEventListener("click", function (e) { if (e.target === modal) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  })();

  if (!buttons.length || !CONFIG.domain || !CONFIG.token) return;

  var API = "https://" + CONFIG.domain + "/api/" + CONFIG.apiVersion + "/graphql.json";

  function gql(query, variables) {
    return fetch(API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": CONFIG.token
      },
      body: JSON.stringify({ query: query, variables: variables || {} })
    }).then(function (r) { return r.json(); });
  }

  function money(amount, currency) {
    try {
      return new Intl.NumberFormat("en-IE", { style: "currency", currency: currency,
        minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(parseFloat(amount));
    } catch (e) {
      return currency + " " + amount;
    }
  }

  var PRODUCT_Q =
    "query($handle:String!){ product(handle:$handle){ id title availableForSale " +
    "variants(first:5){ nodes{ id availableForSale price{ amount currencyCode } } } } }";

  var CART_M =
    "mutation($lines:[CartLineInput!]!){ cartCreate(input:{lines:$lines}){ " +
    "cart{ checkoutUrl } userErrors{ message } } }";

  function setBusy(on) {
    buttons.forEach(function (b) {
      b.classList.toggle("busy", on);
      b.setAttribute("aria-busy", on ? "true" : "false");
    });
  }

  function wire(variant) {
    var label = money(variant.price.amount, variant.price.currencyCode);
    prices.forEach(function (p) { p.textContent = label; p.hidden = false; });
    buttons.forEach(function (b) {
      b.setAttribute("href", "#buy");
      b.addEventListener("click", function (e) {
        e.preventDefault();
        if (b.classList.contains("busy")) return;
        setBusy(true);
        gql(CART_M, { lines: [{ merchandiseId: variant.id, quantity: 1 }] })
          .then(function (res) {
            var cart = res && res.data && res.data.cartCreate && res.data.cartCreate.cart;
            if (cart && cart.checkoutUrl) { location.href = cart.checkoutUrl; return; }
            throw new Error("no checkout url");
          })
          .catch(function () {
            setBusy(false);
            /* last resort: the store's own product page */
            location.href = "https://store.badscandal.com/products/" + CONFIG.handle;
          });
      });
    });
  }

  gql(PRODUCT_Q, { handle: CONFIG.handle }).then(function (res) {
    var p = res && res.data && res.data.product;
    if (!p) return;                                   /* keep the mailto fallback */
    var v = (p.variants.nodes || []).filter(function (x) { return x.availableForSale; })[0]
         || p.variants.nodes[0];
    if (!v) return;
    wire(v);
  }).catch(function () { /* offline / blocked: fallback stays */ });
})();
