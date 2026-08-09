# BADSCANDAL — badscandal.com

Static site (no build step, no framework, no dependencies). Plain HTML +
CSS + vanilla JS, deployed to Netlify by dragging/pushing the folder.
Shop data comes live from Shopify's Storefront API at runtime.

Owner: Luke Power — musician, and BADSCANDAL is the brand around it
(music + film + clothing). Dublin, Ireland.

---

## Golden rules

1. **No frameworks, no build tools, no npm dependencies.** Everything is
   hand-written and must run by opening the HTML file. Don't introduce
   React/Tailwind/bundlers — it would break the whole deploy model.
2. **No libraries in the browser either.** The WebGL wordmark, the scroll
   scrubbing, the cart — all hand-rolled on purpose. Keep it that way.
3. **Every animation respects `prefers-reduced-motion`.** Check the
   existing patterns before adding motion.
4. **Brand voice is blunt and a bit rude.** "Wear the trouble." /
   "Nothing in here yet. Fix that." Never corporate, never sanitised.
   Swearing on the site is deliberately assembled in JS (see `.bs-swear`)
   so the served HTML stays crawler-safe — keep that trick.
5. Files marked `>>> EDIT HERE <<<` are the intended tweak points.

## Palette (CSS vars in css/site.css `:root`)

    --ink #070503   --ink-2 #120C07  --ink-3 #1D140C   (near-black browns)
    --paper #F3E9DD --muted #A08C77  --silver #9A948C  (text)
    --blaze #FF4E1A --uv #F0791E     --ember #FFB454   (orange accents)
    --maroon #7A2620

Fonts: Space Grotesk (display), Inter Tight (body), Archivo Black
(wordmark only) — all from Google Fonts at runtime.

---

## Files

    index.html       Home: decode loader -> hero (scroll-scrubbed film
                     behind the liquid WebGL wordmark) -> Friendly music
                     section -> philosophy -> club -> process -> FAQ ->
                     marquee CTA -> footer. About modal lives here;
                     subpages open it via index.html?about=1
    store.html       The shop (see "Store" below)
    lukepower.html   Artist page — underwater film, socials, IG feed,
                     count-up stats, story
    live.html        Live shows — coming soon
    css/site.css     ALL styling for every page, one file (~800 lines)
    js/main.js       Shared: loader, roll-up links, cursor, magnetic
                     buttons, scroll-scrubbed video engine, reveals,
                     menu, about modal, clock
    js/flow.js       WebGL liquid wordmark (ping-pong flowmap +
                     chromatic aberration). Self-contained, falls back
                     to static <h1> with no WebGL/reduced motion
    js/store.js      Shop engine: Shopify Storefront API, filtering,
                     product modal, cart, checkout
    js/store-soon.js Legacy stickman/bomb "coming soon" gag — unused now
                     that the store is live, kept for reference
    assets/          ~97MB, mostly the six .mp4 films
    _headers         Netlify headers
    tools/           gen_tiles.py — regenerates the spare brand tiles

## The films (scroll = transport control)

Scrolling scrubs them; scrolling back rewinds. They can never "play" —
`makeScrub()` in js/main.js hard-pauses any playback. Files are fetched
as blobs so seeking is instant on iOS. Desktop gets 4K, phones get 1080
(iOS refuses inline 4K); the Friendly section serves a vertical cut on
phones so its on-screen writing stays in frame.

    hero:       graded-sexy-4k.mp4  / graded-sexy-1080.mp4
    friendly:   friendly-16x9-4k.mp4 / friendly-vertical.mp4
    lukepower:  underwater-4k.mp4   / underwater-1080.mp4

**Critical encoding gotcha:** these must start at exactly timestamp
0.000 with a keyframe, or browsers paint a black frame before the first
one. A plain `-ss N -c copy` trim leaves a ~0.066s offset and reintroduces
the bug. Re-encode instead, and keep the dense keyframes for smooth
scrubbing:

    ffmpeg -i in.mp4 -c:v libx264 -preset fast -crf 16 \
      -g 6 -keyint_min 6 -bf 0 -pix_fmt yuv420p -profile:v high \
      -movflags +faststart -an out.mp4
    # verify: ffprobe -select_streams v:0 -show_entries stream=start_time
    # then regenerate the poster from frame 1 of the new file

---

## Store (js/store.js)

Live via **Shopify Storefront API** — products, prices, stock, images and
variants all load at runtime, so new products appear with no redeploy.
Cart lives on badscandal.com; Checkout hands off to Shopify.

Config at the top of js/store.js:

    domain: "cdziaw-1i.myshopify.com"
    token:  "98b69d5eea492db921df63b35200ab10"   (PUBLIC Storefront token —
            safe in client JS, read-products + create-carts only)

If `domain`/`token` are blank the file falls back to DEMO mode with
placeholder products, so the page never looks broken.

**Sorting into Men / Women / T-Shirts / Hoodies**, in priority order:

1. Shopify **tags** (lowercase): `tshirt`|`hoodie` and `men`|`women`|`unisex`.
   Tags always win. `unisex` shows under BOTH Men and Women.
2. Fallback inference from `productType` + title + **image filename slugs**.
   Printful bakes the garment into filenames
   (`womens-cropped-hoodie-military-green-back-<hash>.jpg`), which is how
   the crop hoodie gets labelled correctly despite Printful setting its
   productType to "T-SHIRT" for everything.

Those same slugs drive two features — **don't break the parsing**:

* **Colour swap:** picking a colour finds `-<colour-slug>-` in the URL.
* **Front / Back / Left / Right** view buttons: matches `-front`, `-back`,
  `-left`, `-right`. Views follow the selected colour.

**Size guide:** Printful dumps GPSR compliance text + a size chart into the
product description. `openModal()` splits the description at the words
"size guide"; the prose stays in the modal, the chart goes behind a bold
**Size guide →** button that parses it into a table.

**Known Shopify-side issues (not code bugs):**
* New products don't appear until they're **published to the Headless
  sales channel** — Printful only publishes to "Online Store". Check with
  a Storefront API query before debugging the site.
* The store is still on a trial plan → no plan = no real checkout, and
  store.badscandal.com shows a password page.
* Store name in Shopify is still "My Store" (shows at checkout).
* Product descriptions still carry the raw Printful compliance dump.

---

## Deploying

Netlify, static publish of the whole folder. No build command, no
`netlify.toml` currently. `_headers` is the only Netlify config.

Given Netlify CLI + a linked site:

    netlify deploy --prod --dir .

Note assets/ is ~97MB of video — watch deploy times, and never re-encode
the films casually (see the encoding gotcha above).

## SEO / identity

`index.html` carries: title `BADSCANDAL` (Luke Power deliberately removed
from the title), a brand-voice meta description, favicons, and
schema.org **Organization** JSON-LD naming Luke Power as founder/musician
with `sameAs` socials. `lukepower.html` carries matching **Person**
JSON-LD. Goal: badscandal.com surfaces for "Luke Power" searches without
his name in the title.

---

## Open tasks / next up

* `assets/store-hero.webp` — store.html already has the markup, scrim and
  CSS for a campaign photo behind "Wear the trouble."; the image file was
  never supplied. Ships gracefully hidden until it exists (`onerror`).
* Favicons are **placeholders** (ink tile + orange "B"). Luke has a
  scratch-style wordmark logo to cut into 48/180/192/512px.
* Trim the Printful compliance text out of product descriptions in Shopify.
* Tag all products properly in Shopify (see sorting above).
* Not yet done in Shopify: pick a plan, enable payments, test checkout
  with test card 4242 4242 4242 4242, connect store.badscandal.com
  (CNAME `store` -> `shops.myshopify.com` at GoDaddy).
* A minimal branded Shopify theme exists separately
  (`badscandal-shopify-theme.zip`) that just redirects
  store.badscandal.com -> badscandal.com/store.

## Testing

No test suite. Verify by:

    node --check js/store.js       # syntax
    python3 -m http.server 8000    # then open localhost:8000

For Shopify data, query the Storefront API directly rather than guessing
at what the site sees — it's the fastest way to tell a data problem from
a code problem.
