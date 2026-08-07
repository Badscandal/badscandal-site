BADSCANDAL STORE — how to connect Shopify (one-time, ~5 minutes)
================================================================

The store page (store.html + js/store.js) runs in DEMO mode until you
give it two values. Once connected, products, prices, stock and sizes
all come straight from your Shopify admin — you never touch the site
again to manage products.

STEP 1 — GET YOUR STOREFRONT API TOKEN (2026 flow: Headless channel)
  NOTE: the old admin "Develop apps" custom-app flow was retired
  Jan 2026. The current way is Shopify's official Headless channel:
  1. Shopify admin -> Apps -> search the App Store for "Headless"
     (free, made by Shopify) -> Install.
     Direct link: https://apps.shopify.com/headless
  2. Open it under Sales channels -> Headless -> "Create storefront"
     -> name it badscandal.com.
  3. Copy the PUBLIC access token it shows you.
     (Public by design — safe to ship in the JS. It can only read
      products and create carts. IGNORE the private token; that one
      is server-side only and must never go in the site.)
  4. In the storefront's permissions, make sure product listings /
     inventory reading is enabled (it is by default).

STEP 2 — PUT THE TWO VALUES IN js/store.js
  Open js/store.js — the block at the very top marked >>> EDIT HERE <<<
    domain: "yourstore.myshopify.com"   <- Settings -> Domains
    token:  "paste the token here"
  Redeploy to Netlify. Done — demo products disappear, real ones load.

STEP 3 — TAG YOUR PRODUCTS (this is how the site sorts them)
  On each product in Shopify admin, add tags (lowercase):
    tshirt  or  hoodie      -> category chip
    men / women / unisex    -> department tab
  Rules:
    - Every hoodie: tag it  hoodie + unisex  (shows under Men AND Women)
    - Men's tees:   tshirt + men
    - Women's tees: tshirt + women
  Sizes: create them as VARIANTS on the product (S / M / L / XL...).
  Sold-out sizes grey out automatically.
  Images: first image = card front, second image = the hover swap.

CHECKOUT
  The cart lives on badscandal.com (drawer, right side). "Checkout"
  hands the visitor to Shopify's secure checkout (your payment methods,
  shipping rates and taxes as configured in Shopify). The cart survives
  page reloads (stored in the browser).

IF SOMETHING LOOKS WRONG
  - No products showing: check the two config values, then check tags.
  - Product missing: it needs the tshirt or hoodie tag (or clear ALL
    tags fallback: if NOTHING is tagged, the site shows every product).
  - Prices in wrong currency: set your store currency / markets in
    Shopify — the site displays whatever Shopify sends.
