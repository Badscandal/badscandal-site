/* ============================================================
   BADSCANDAL — store engine (no libraries)
   Products + cart via the Shopify Storefront API. Until Shopify
   is connected below, the page runs in DEMO mode with placeholder
   products so the design is fully browsable.

   >>> EDIT HERE — connect Shopify (2 lines): <<<
   1. domain: your store's *.myshopify.com address
   2. token:  Storefront API access token (public, safe in JS)
      Shopify admin -> Settings -> Apps and sales channels ->
      Develop apps -> Create app -> Configure Storefront API scopes
      (enable unauthenticated_read_product_listings +
       unauthenticated_write_checkouts + unauthenticated_read_checkouts)
      -> Install app -> API credentials -> Storefront API access token.

   HOW PRODUCTS SORT THEMSELVES (tags, set on each product in Shopify):
     "tshirt" or "hoodie"        -> category
     "men", "women" or "unisex"  -> department
   Unisex products (all hoodies) appear under BOTH Men and Women.
   Sizes come from the product's variants (S / M / L / XL ...).
   ============================================================ */
(function () {
  "use strict";

  /* >>> EDIT HERE <<< ---------------------------------------------------- */
  var CONFIG = {
    domain: "cdziaw-1i.myshopify.com",
    token: "98b69d5eea492db921df63b35200ab10",  /* public Storefront token */
    apiVersion: "2025-04"
  };
  /* ---------------------------------------------------------------------- */

  var grid = document.getElementById("product-grid");
  if (!grid) return;

  var LIVE = !!(CONFIG.domain && CONFIG.token);
  var API = "https://" + CONFIG.domain + "/api/" + CONFIG.apiVersion + "/graphql.json";

  /* ---------- demo products (placeholder mode) -------------------------- */
  var DEMO = [
    { id: "d1", title: "NO KINGS TEE", cat: "tshirt", dept: "men",
      price: 35, currency: "EUR", images: ["assets/col-1.webp", "assets/col-2.webp"],
      desc: "Heavyweight cotton. Printed front and back. Says what you were thinking.",
      variants: ["S", "M", "L", "XL"] },
    { id: "d2", title: "TROUBLE TEE", cat: "tshirt", dept: "men",
      price: 35, currency: "EUR", images: ["assets/col-2.webp", "assets/col-3.webp"],
      desc: "Boxy fit, soft hand-feel print. For people who mean it.",
      variants: ["S", "M", "L", "XL"] },
    { id: "d3", title: "SCANDAL BABY TEE", cat: "tshirt", dept: "women",
      price: 33, currency: "EUR", images: ["assets/col-3.webp", "assets/col-4.webp"],
      desc: "Fitted cut, cropped just enough. Loud on purpose.",
      variants: ["XS", "S", "M", "L"] },
    { id: "d4", title: "FOUR THOUSAND WEEKS TEE", cat: "tshirt", dept: "women",
      price: 33, currency: "EUR", images: ["assets/col-4.webp", "assets/col-1.webp"],
      desc: "Spend yours loudly. Fitted cut, heavyweight print.",
      variants: ["XS", "S", "M", "L"] },
    { id: "d5", title: "BADSCANDAL HOODIE", cat: "hoodie", dept: "unisex",
      price: 65, currency: "EUR", images: ["assets/cta-bg.webp", "assets/col-1.webp"],
      desc: "Unisex. 450gsm brushed fleece, oversized hood, embroidered wordmark.",
      variants: ["S", "M", "L", "XL", "XXL"] },
    { id: "d6", title: "NO GODS NO MASTERS HOODIE", cat: "hoodie", dept: "unisex",
      price: 68, currency: "EUR", images: ["assets/col-2.webp", "assets/cta-bg.webp"],
      desc: "Unisex. Heavy fleece, puff print across the chest. Wear it loud.",
      variants: ["S", "M", "L", "XL", "XXL"] }
  ];

  /* ---------- state ------------------------------------------------------ */
  var products = [];
  var dept = "all", cat = "all";
  var demoCart = [];              /* [{key, id, title, size, price, currency, img, qty}] */
  var cartId = null;              /* live Shopify cart id */
  var liveCart = null;            /* last cart payload from Shopify */
  var modalProduct = null, modalVariant = null;
  var modalColour = null, modalView = null, modalGuide = null;

  /* ---------- Printful image slugs: "...-military-green-front-hash.jpg" --- */
  var VIEWS = ["front", "back", "left", "right"];
  function slugColour(label) {
    return label ? String(label).toLowerCase().replace(/[^a-z0-9]+/g, "-") : null;
  }
  function imgFor(p, colourLabel, view) {
    var c = slugColour(colourLabel);
    for (var i = 0; i < p.images.length; i++) {
      var f = p.images[i].split("/").pop().toLowerCase();
      if (view && f.indexOf("-" + view) === -1) continue;
      if (c && f.indexOf("-" + c + "-") === -1) continue;
      return p.images[i];
    }
    return null;
  }
  function viewsFor(p, colourLabel) {
    var out = [];
    VIEWS.forEach(function (v) { if (imgFor(p, colourLabel, v)) out.push(v); });
    return out;
  }
  function modalSetImage() {
    var img = document.getElementById("pmodal-img");
    if (!img || !modalProduct) return;
    var u = null;
    if (modalView) u = imgFor(modalProduct, modalColour, modalView);
    if (!u && modalVariant && modalVariant.img) u = modalVariant.img;
    if (!u) u = imgFor(modalProduct, modalColour, null) || modalProduct.images[0];
    if (u && img.src !== u) img.src = u;
  }
  function modalRenderViews() {
    var wrap = document.getElementById("pmodal-views");
    if (!wrap || !modalProduct) return;
    wrap.innerHTML = "";
    var views = viewsFor(modalProduct, modalColour);
    if (views.length < 2) { wrap.hidden = true; modalView = views[0] || null; return; }
    wrap.hidden = false;
    if (!modalView || views.indexOf(modalView) === -1) modalView = views[0];
    views.forEach(function (v) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "pmodal-view" + (v === modalView ? " on" : "");
      b.textContent = v.charAt(0).toUpperCase() + v.slice(1);
      b.addEventListener("click", function () {
        modalView = v;
        modalRenderViews();
        modalSetImage();
      });
      wrap.appendChild(b);
    });
  }

  /* ---------- helpers ----------------------------------------------------- */
  function money(amount, currency) {
    try {
      return new Intl.NumberFormat("en-IE", { style: "currency", currency: currency || "EUR" })
        .format(amount);
    } catch (e) { return (currency || "EUR") + " " + Number(amount).toFixed(2); }
  }
  function note(msg) {
    var el = document.getElementById("store-note");
    if (!el) return;
    if (!msg) { el.hidden = true; return; }
    el.textContent = msg;
    el.hidden = false;
  }
  function catLabel(c) { return c === "hoodie" ? "Hoodie" : "T-Shirt"; }
  /* tags win; otherwise infer from Printful's product type + title */
  function catOf(tags, type, title) {
    if (tags.indexOf("hoodie") > -1) return "hoodie";
    if (tags.indexOf("tshirt") > -1) return "tshirt";
    var s = ((type || "") + " " + (title || "")).toLowerCase();
    if (/hoodie|sweatshirt|crewneck|sweater|fleece|jumper/.test(s)) return "hoodie";
    return "tshirt";
  }
  function deptOf(tags, type, title) {
    if (tags.indexOf("unisex") > -1) return "unisex";
    if (tags.indexOf("women") > -1) return "women";
    if (tags.indexOf("men") > -1) return "men";
    var s = ((type || "") + " " + (title || "")).toLowerCase();
    if (/women|woman|ladies|girls|femme|babydoll|baby tee|crop/.test(s)) return "women";
    if (/\bmen'?s?\b/.test(s)) return "men";
    return "unisex";
  }

  /* ---------- Storefront API ---------------------------------------------- */
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

  var CART_FIELDS =
    "fragment CartFields on Cart {" +
    "  id checkoutUrl totalQuantity" +
    "  cost { subtotalAmount { amount currencyCode } }" +
    "  lines(first: 50) { edges { node {" +
    "    id quantity" +
    "    merchandise { ... on ProductVariant {" +
    "      id title price { amount currencyCode }" +
    "      product { title featuredImage { url } }" +
    "    } }" +
    "  } } }" +
    "}";

  function mapProducts(data) {
    var edges = (((data || {}).data || {}).products || {}).edges || [];
    return edges.map(function (e) {
      var n = e.node;
      var tags = (n.tags || []).map(function (t) { return String(t).toLowerCase(); });
      var imgs = (n.images.edges || []).map(function (i) { return i.node.url; });
      /* Printful bakes the garment into image slugs ("womens-cropped-hoodie-
         black-front") — scan those too, so labels are right without tags */
      var hint = n.title + " " + imgs.slice(0, 4).map(function (u) {
        return u.split("/").pop();
      }).join(" ");
      return {
        id: n.id, title: n.title, desc: n.description || "",
        cat: catOf(tags, n.productType, hint),
        dept: deptOf(tags, n.productType, hint),
        price: parseFloat(n.priceRange.minVariantPrice.amount),
        currency: n.priceRange.minVariantPrice.currencyCode,
        images: imgs.length ? imgs : ["assets/cta-bg.webp"],
        variants: (n.variants.edges || []).map(function (v) {
          return { id: v.node.id, title: v.node.title,
                   available: v.node.availableForSale,
                   img: v.node.image ? v.node.image.url : null,
                   price: parseFloat(v.node.price.amount),
                   currency: v.node.price.currencyCode };
        })
      };
    });
  }

  function fetchProducts() {
    var q = "query P($q: String) { products(first: 60, query: $q) { edges { node {" +
      " id title handle description tags productType" +
      " images(first: 50) { edges { node { url altText } } }" +
      " priceRange { minVariantPrice { amount currencyCode } }" +
      " variants(first: 100) { edges { node { id title availableForSale image { url } price { amount currencyCode } } } }" +
      "} } } }";
    return gql(q, { q: "tag:tshirt OR tag:hoodie" }).then(function (d) {
      var list = mapProducts(d);
      if (list.length) return list;
      /* nothing tagged yet: show everything so the shop is never empty */
      return gql(q, { q: null }).then(mapProducts);
    });
  }

  /* ---------- grid rendering ----------------------------------------------- */
  function visible() {
    return products.filter(function (p) {
      var okDept = dept === "all" || p.dept === dept || p.dept === "unisex";
      var okCat = cat === "all" || p.cat === cat;
      return okDept && okCat;
    });
  }

  function render() {
    var list = visible();
    grid.innerHTML = "";
    if (!list.length) {
      grid.innerHTML = "<p class='grid-empty'>Nothing here yet — check another section.</p>";
      return;
    }
    list.forEach(function (p, idx) {
      var card = document.createElement("article");
      card.className = "pcard";
      card.style.transitionDelay = (Math.min(idx, 8) * 45) + "ms";
      var alt = p.images[1] ? "<img class='pcard-alt' loading='lazy' src='" + p.images[1] + "' alt=''>" : "";
      var sizeBtns = "";
      var vs = LIVE ? p.variants : p.variants.map(function (s) { return { id: p.id + "-" + s, title: s, available: true }; });
      /* Printful-style variants ("Black / S") have colour AND size:
         those get the full option picker in the modal instead */
      var multi = vs.some(function (v) { return v.title.indexOf(" / ") > -1; });
      if (multi) {
        sizeBtns = "<button type='button' class='qa-size qa-openopts'>Choose options</button>";
      } else {
        vs.forEach(function (v) {
          sizeBtns += "<button type='button' class='qa-size" + (v.available ? "" : " off") +
            "' data-vid='" + v.id + "' " + (v.available ? "" : "disabled") + ">" + v.title + "</button>";
        });
      }
      card.innerHTML =
        "<div class='pcard-media'>" +
          "<img loading='lazy' src='" + p.images[0] + "' alt='" + p.title.replace(/'/g, "&#39;") + "'>" + alt +
          "<span class='pcard-cat'>" + catLabel(p.cat) + (p.dept === "unisex" ? " · Unisex" : "") + "</span>" +
          "<div class='pcard-quick'><span class='qa-label'>Quick add</span>" +
            "<div class='qa-sizes'>" + sizeBtns + "</div>" +
          "</div>" +
        "</div>" +
        "<div class='pcard-meta'>" +
          "<h3 class='pcard-name'>" + p.title + "</h3>" +
          "<p class='pcard-price'>" + money(p.price, p.currency) + "</p>" +
        "</div>";
      /* quick add (single-option products only; multi-option opens the modal) */
      Array.prototype.forEach.call(card.querySelectorAll(".qa-size[data-vid]"), function (b) {
        b.addEventListener("click", function (ev) {
          ev.stopPropagation();
          addToCart(p, b.getAttribute("data-vid"), b.textContent);
          b.classList.add("added");
          setTimeout(function () { b.classList.remove("added"); }, 900);
        });
      });
      /* card opens the product modal */
      card.addEventListener("click", function () { openModal(p); });
      grid.appendChild(card);
      requestAnimationFrame(function () { card.classList.add("in"); });
    });
  }

  /* ---------- tabs + chips --------------------------------------------------- */
  Array.prototype.forEach.call(document.querySelectorAll(".store-tabs [data-dept]"), function (b) {
    b.addEventListener("click", function () {
      dept = b.getAttribute("data-dept");
      Array.prototype.forEach.call(document.querySelectorAll(".store-tabs [data-dept]"), function (x) {
        x.classList.toggle("on", x === b);
      });
      render();
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll(".store-chips [data-cat]"), function (b) {
    b.addEventListener("click", function () {
      cat = b.getAttribute("data-cat");
      Array.prototype.forEach.call(document.querySelectorAll(".store-chips [data-cat]"), function (x) {
        x.classList.toggle("on", x === b);
      });
      render();
    });
  });

  /* ---------- product modal --------------------------------------------------- */
  var pmodal = document.getElementById("pmodal");

  /* multi-option variants ("Black / S"): one button row per option group */
  function buildOptionGroups(wrap, vs) {
    var parts = vs.map(function (v) { return v.title.split(" / "); });
    var n = parts[0].length;
    var names = n === 2 ? ["Colour", "Size"]
      : parts[0].map(function (_, i) { return "Option " + (i + 1); });
    var sel = [];
    for (var s = 0; s < n; s++) sel.push(null);
    function resolve() {
      modalVariant = null;
      for (var i = 0; i < n; i++) if (sel[i] === null) return;
      var t = sel.join(" / ");
      var hit = vs.filter(function (v) { return v.title === t; })[0];
      if (hit && hit.available) modalVariant = hit;
    }
    var rows = [];
    for (var g = 0; g < n; g++) (function (g) {
      var label = document.createElement("p");
      label.className = "pmodal-sizes-label pmodal-opt-label";
      label.textContent = names[g];
      var row = document.createElement("div");
      row.className = "pmodal-optrow";
      var seen = [];
      parts.forEach(function (pp) {
        var val = pp[g];
        if (seen.indexOf(val) > -1) return;
        seen.push(val);
        var b = document.createElement("button");
        b.type = "button"; b.className = "qa-size"; b.textContent = val;
        b.addEventListener("click", function () {
          sel[g] = val;
          Array.prototype.forEach.call(row.children, function (x) { x.classList.toggle("sel", x === b); });
          if (names[g] === "Colour") modalColour = val;
          resolve();
          modalRenderViews();
          modalSetImage();
        });
        row.appendChild(b);
      });
      wrap.appendChild(label);
      wrap.appendChild(row);
      rows.push(row);
    })(g);
    /* preselect everything except the last group (usually size) */
    for (var g2 = 0; g2 < n - 1; g2++) {
      var first = rows[g2].querySelector("button");
      if (first) first.click();
    }
  }
  function openModal(p) {
    modalProduct = p; modalVariant = null;
    modalColour = null; modalView = null;
    document.getElementById("pmodal-img").src = p.images[0];
    document.getElementById("pmodal-cat").textContent =
      catLabel(p.cat) + (p.dept === "unisex" ? " · Unisex" : p.dept === "men" ? " · Men" : " · Women");
    document.getElementById("pmodal-title").textContent = p.title;
    document.getElementById("pmodal-price").textContent = money(p.price, p.currency);
    /* split the Printful size guide out of the description into its own
       overlay, opened by the bold "Size guide" button */
    var desc = p.desc || "";
    var sgIdx = desc.toLowerCase().indexOf("size guide");
    var sgBtn = document.getElementById("pmodal-sizeguide");
    document.getElementById("pmodal-desc").textContent =
      sgIdx > -1 ? desc.slice(0, sgIdx).trim() : desc;
    modalGuide = sgIdx > -1 ? desc.slice(sgIdx) : null;
    if (sgBtn) sgBtn.hidden = !modalGuide;
    var wrap = document.getElementById("pmodal-sizes");
    wrap.innerHTML = "";
    var vs = LIVE ? p.variants : p.variants.map(function (s) { return { id: p.id + "-" + s, title: s, available: true }; });
    var multi = vs.some(function (v) { return v.title.indexOf(" / ") > -1; });
    var staticLabel = document.querySelector(".pmodal-sizes-label");
    if (staticLabel) staticLabel.style.display = multi ? "none" : "";
    if (multi) {
      buildOptionGroups(wrap, vs);
    } else {
      vs.forEach(function (v) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "qa-size" + (v.available ? "" : " off");
        b.textContent = v.title; b.disabled = !v.available;
        b.addEventListener("click", function () {
          modalVariant = v;
          Array.prototype.forEach.call(wrap.children, function (x) { x.classList.toggle("sel", x === b); });
          modalSetImage();
        });
        wrap.appendChild(b);
      });
    }
    modalRenderViews();
    modalSetImage();
    pmodal.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeModal() {
    if (!pmodal || pmodal.hidden) return;
    pmodal.hidden = true;
    document.body.style.overflow = "";
  }
  document.getElementById("pmodal-close").addEventListener("click", closeModal);
  pmodal.addEventListener("click", function (e) { if (e.target === pmodal) closeModal(); });
  document.getElementById("pmodal-add").addEventListener("click", function () {
    if (!modalProduct) return;
    if (!modalVariant) {
      var w = document.getElementById("pmodal-sizes");
      w.classList.add("nudge");
      setTimeout(function () { w.classList.remove("nudge"); }, 500);
      return;
    }
    addToCart(modalProduct, modalVariant.id, modalVariant.title);
    closeModal();
    openCart();
  });

  /* ---------- size guide overlay (parsed from Printful's description) --------- */
  var sguide = document.getElementById("sguide");
  function buildGuideTable(txt) {
    var body = txt.replace(/^size guide/i, "").trim();
    var sizeRe = /\b(5XL|4XL|3XL|2XL|XXL|XL|XS|S|M|L)\b/g;
    var firstM = sizeRe.exec(body);
    if (!firstM) return null;
    var head = body.slice(0, firstM.index);
    var cols = [];
    head.replace(/([A-Za-z][A-Za-z ]*?)\s*\(([^)]+)\)/g, function (m, nm, unit) {
      cols.push(nm.trim() + " (" + unit.trim() + ")"); return m;
    });
    if (!cols.length) return null;
    var idxs = [];
    sizeRe.lastIndex = 0;
    var m;
    while ((m = sizeRe.exec(body))) idxs.push({ s: m[1], i: m.index, e: sizeRe.lastIndex });
    var rows = [];
    for (var i = 0; i < idxs.length; i++) {
      var seg = body.slice(idxs[i].e, i + 1 < idxs.length ? idxs[i + 1].i : body.length);
      var vals = seg.match(/\d+(?:[.,]\d+)?(?:\s*[⅛¼⅜½⅝¾⅞⅓⅔])?|[⅛¼⅜½⅝¾⅞⅓⅔]/g) || [];
      if (!vals.length) continue;
      rows.push([idxs[i].s].concat(vals.slice(0, cols.length)));
    }
    if (!rows.length) return null;
    var table = document.createElement("table");
    table.className = "sguide-table";
    var tr = document.createElement("tr");
    ["Size"].concat(cols).forEach(function (h) {
      var th = document.createElement("th"); th.textContent = h; tr.appendChild(th);
    });
    table.appendChild(tr);
    rows.forEach(function (r) {
      var trr = document.createElement("tr");
      r.forEach(function (c) {
        var td = document.createElement("td"); td.textContent = c; trr.appendChild(td);
      });
      table.appendChild(trr);
    });
    return table;
  }
  document.getElementById("pmodal-sizeguide").addEventListener("click", function () {
    if (!modalGuide || !sguide) return;
    var box = document.getElementById("sguide-body");
    box.innerHTML = "";
    var table = buildGuideTable(modalGuide);
    if (table) box.appendChild(table);
    else { var pr = document.createElement("p"); pr.className = "sguide-raw"; pr.textContent = modalGuide; box.appendChild(pr); }
    sguide.hidden = false;
  });
  document.getElementById("sguide-close").addEventListener("click", function () { sguide.hidden = true; });
  sguide.addEventListener("click", function (e) { if (e.target === sguide) sguide.hidden = true; });

  /* ---------- cart ------------------------------------------------------------- */
  var drawer = document.getElementById("cart-drawer");
  var scrim = document.getElementById("cart-scrim");
  function openCart() {
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    scrim.hidden = false;
  }
  function closeCart() {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    scrim.hidden = true;
  }
  document.getElementById("cart-open").addEventListener("click", openCart);
  document.getElementById("cart-close").addEventListener("click", closeCart);
  scrim.addEventListener("click", closeCart);
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (sguide && !sguide.hidden) { sguide.hidden = true; return; }
    closeCart(); closeModal();
  });

  function setCount(n) {
    var el = document.getElementById("cart-count");
    if (el) el.textContent = String(n);
    var btn = document.getElementById("cart-open");
    if (btn) { btn.classList.remove("bump"); void btn.offsetWidth; btn.classList.add("bump"); }
  }

  function addToCart(p, variantId, sizeLabel) {
    if (LIVE) {
      var lines = [{ merchandiseId: variantId, quantity: 1 }];
      var done = function (d, key) {
        var cart = (((d || {}).data || {})[key] || {}).cart;
        if (cart) { liveCart = cart; cartId = cart.id; localStorage.setItem("bs_cart_id", cartId); renderCart(); }
      };
      if (!cartId) {
        gql("mutation C($lines:[CartLineInput!]) { cartCreate(input:{lines:$lines}) { cart { ...CartFields } userErrors { message } } } " + CART_FIELDS,
          { lines: lines }).then(function (d) { done(d, "cartCreate"); });
      } else {
        gql("mutation A($cartId:ID!,$lines:[CartLineInput!]!) { cartLinesAdd(cartId:$cartId, lines:$lines) { cart { ...CartFields } userErrors { message } } } " + CART_FIELDS,
          { cartId: cartId, lines: lines }).then(function (d) { done(d, "cartLinesAdd"); });
      }
    } else {
      var key = p.id + "::" + sizeLabel;
      var hit = demoCart.filter(function (l) { return l.key === key; })[0];
      if (hit) hit.qty += 1;
      else demoCart.push({ key: key, id: p.id, title: p.title, size: sizeLabel,
                           price: p.price, currency: p.currency, img: p.images[0], qty: 1 });
      renderCart();
    }
  }

  function lineRow(img, title, sub, price, qty, onMinus, onPlus, onRemove) {
    var row = document.createElement("div");
    row.className = "cart-line";
    row.innerHTML =
      "<img src='" + img + "' alt=''>" +
      "<div class='cl-info'><p class='cl-title'>" + title + "</p>" +
      "<p class='cl-sub'>" + sub + "</p>" +
      "<div class='cl-qty'><button type='button' class='cl-minus' aria-label='Less'>−</button>" +
      "<span>" + qty + "</span>" +
      "<button type='button' class='cl-plus' aria-label='More'>+</button>" +
      "<button type='button' class='cl-remove'>Remove</button></div></div>" +
      "<p class='cl-price'>" + price + "</p>";
    row.querySelector(".cl-minus").addEventListener("click", onMinus);
    row.querySelector(".cl-plus").addEventListener("click", onPlus);
    row.querySelector(".cl-remove").addEventListener("click", onRemove);
    return row;
  }

  function renderCart() {
    var box = document.getElementById("cart-lines");
    var subEl = document.getElementById("cart-subtotal");
    box.innerHTML = "";
    if (LIVE && liveCart) {
      var edges = ((liveCart.lines || {}).edges) || [];
      if (!edges.length) box.innerHTML = "<p class='cart-empty'>Nothing in here yet. Fix that.</p>";
      edges.forEach(function (e) {
        var l = e.node, m = l.merchandise;
        var change = function (q) {
          var mut = q <= 0
            ? gql("mutation R($cartId:ID!,$ids:[ID!]!) { cartLinesRemove(cartId:$cartId, lineIds:$ids) { cart { ...CartFields } } } " + CART_FIELDS,
                  { cartId: cartId, ids: [l.id] })
            : gql("mutation U($cartId:ID!,$lines:[CartLineUpdateInput!]!) { cartLinesUpdate(cartId:$cartId, lines:$lines) { cart { ...CartFields } } } " + CART_FIELDS,
                  { cartId: cartId, lines: [{ id: l.id, quantity: q }] });
          mut.then(function (d) {
            var k = q <= 0 ? "cartLinesRemove" : "cartLinesUpdate";
            var cart = (((d || {}).data || {})[k] || {}).cart;
            if (cart) { liveCart = cart; renderCart(); }
          });
        };
        box.appendChild(lineRow(
          (m.product.featuredImage || {}).url || "assets/cta-bg.webp",
          m.product.title, m.title,
          money(parseFloat(m.price.amount) * l.quantity, m.price.currencyCode),
          l.quantity,
          function () { change(l.quantity - 1); },
          function () { change(l.quantity + 1); },
          function () { change(0); }
        ));
      });
      subEl.textContent = liveCart.cost
        ? money(parseFloat(liveCart.cost.subtotalAmount.amount), liveCart.cost.subtotalAmount.currencyCode)
        : "—";
      setCount(liveCart.totalQuantity || 0);
    } else {
      if (!demoCart.length) box.innerHTML = "<p class='cart-empty'>Nothing in here yet. Fix that.</p>";
      var sub = 0, count = 0, cur = "EUR";
      demoCart.forEach(function (l) {
        sub += l.price * l.qty; count += l.qty; cur = l.currency;
        box.appendChild(lineRow(
          l.img, l.title, "Size " + l.size, money(l.price * l.qty, l.currency), l.qty,
          function () { l.qty -= 1; if (l.qty <= 0) demoCart.splice(demoCart.indexOf(l), 1); renderCart(); },
          function () { l.qty += 1; renderCart(); },
          function () { demoCart.splice(demoCart.indexOf(l), 1); renderCart(); }
        ));
      });
      subEl.textContent = demoCart.length ? money(sub, cur) : "—";
      setCount(count);
    }
  }

  document.getElementById("cart-checkout").addEventListener("click", function () {
    if (LIVE && liveCart && liveCart.checkoutUrl) {
      window.location.href = liveCart.checkoutUrl;
    } else {
      note("Demo mode — connect your Shopify store in js/store.js (two lines at the top) to enable real checkout.");
      closeCart();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  /* ---------- boot -------------------------------------------------------------- */
  if (LIVE) {
    fetchProducts().then(function (list) {
      products = list;
      render();
    }).catch(function () {
      note("Couldn't reach the store right now — showing the lookbook instead.");
      products = DEMO; render();
    });
    /* restore an existing cart */
    cartId = localStorage.getItem("bs_cart_id");
    if (cartId) {
      gql("query G($id:ID!) { cart(id:$id) { ...CartFields } } " + CART_FIELDS, { id: cartId })
        .then(function (d) {
          var cart = ((d || {}).data || {}).cart;
          if (cart) { liveCart = cart; renderCart(); }
          else { cartId = null; localStorage.removeItem("bs_cart_id"); }
        });
    }
  } else {
    products = DEMO;
    render();
    note("Preview drop — demo products. Real stock lands when Shopify connects.");
  }
})();
