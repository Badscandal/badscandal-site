# BADSCANDAL — badscandal.com

Static site (no build step, no framework, no dependencies). Plain HTML +
CSS + vanilla JS, auto-deployed to Netlify on every push to `main`.
Shop data comes live from Shopify's Storefront API at runtime.

**BADSCANDAL is Luke Power's electronic-music artist alias — the artist
IS the brand** (direction locked 24 Aug 2026; the model is Alok: one
alias built like a world act, with the clothing and the store orbiting
the music). The alias carries real equity from the 2021–2024 run:
~418K Spotify monthly listeners (artist id `29kaubgb6Esvwu0idVndGy`),
Apple Music, Discogs, Genius, Viberate. Run by Luke and Lilian. Under
the name sit:

* **The music** — EDM releases as BADSCANDAL. The income and the product.
* **The clothing line** — statement tees and essentials via Shopify;
  merch worn on camera. Store Instagram handle: `badscandal.store`.
* **Luke & Lilian** — the couples/travel content; parked as a side lane
  (us.html still tells that story), no longer the front of the brand.

**Site shape since the 24 Aug 2026 restructure:** badscandal.com is a
one-screen landing — the CRT wordmark over the red film, "Music that
doesn't *care*." — and the ENTIRE store-first page lives at /store.
See "Where the site is at" under Open tasks for the current state.

**THE ONE RULE: "BADSCANDAL is the ink, the world is the colour."**
All brand furniture — wordmark, titles, nav, labels, slates, footer,
buttons, stamps — is pure monochrome. Photography and footage carry ALL
the colour. No section may have a background colour: sections are
transparent over imagery. Flat colour is reserved for bars, buttons and
card bodies only — and ours are grey.

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

## Stale docs — do not trust

`README.txt` and `README-STORE.txt` are leftovers from the music-era
site and describe positioning and structure that no longer exist. Do not
take direction from them. **This file is the only current doc in the
repo.**

## Palette (CSS vars in css/site.css `:root`)

**Pure monochrome — brand furniture has no colour by design.** The
photography and footage are the only colour on the page (the one rule,
above). The var names are kept from the old warm palette because the
stylesheet is built on their SEMANTICS, not their hue:

    --ink #050505   --ink-2 #0C0C0C  --ink-3 #1F1F1F   bg / surface / hairline
    --ink-rgb 5,5,5                                    channels, for scrims
    --paper #F2F2F2 --muted #8A8A8A  --silver #6E6E6E  text 1 / 2 / 3
    --uv #B4B4B4     resting border + small tracked labels
    --blaze #FFFFFF  active/hovered fill (text on top inverts to --ink)
    --ember #FFFFFF  emphasis: prices, link hover
    --maroon #7A7A7A destructive / muted
    --maxw 1280px  --pad clamp(18px,4vw,56px)  --ease cubic-bezier(.22,.9,.24,1)

Two consequences worth knowing: `--blaze` and `--ember` are both white,
so any two states that were previously distinguished *only* by hue now
need a second signal (`.qa-size.added` uses a halo — see site.css). And
scrims must use `rgba(var(--ink-rgb),.x)`, never a hand-written
`rgba(5,5,5,.x)`, or they drift out of sync with the palette again.

## Type — "System A / Film Print" (locked)

Space Grotesk and Inter Tight are **OUT**. The system is:

    Archivo, font-variation-settings: "wdth" 125, "wght" 900
        -> wordmark + big display ONLY. Never body.
    Instrument Serif (regular + TRUE italic)
        -> title cards, section openers. Never small.
    Figtree 350/400/600/700
        -> everything you actually read.
    DM Mono 400, letter-spacing .12em, uppercase
        -> slates, locations, dates, small labels.

Rule of thumb: **"If it's information, it's typed. If it's a joke, it's
drawn."** Headline signature: exactly ONE word per headline is set in
Instrument Serif ITALIC — no more, no fewer.

One Google Fonts request, use verbatim (verified to return 200):

    https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=DM+Mono:wght@300;400;500&family=Figtree:wght@300..900&family=Instrument+Serif:ital@0;1&display=swap

**Changing fonts touches FIVE places** — miss one and part of the site
silently renders in a fallback:

1. `css/site.css` `:root` — `--font-display` / `--font-body` stacks.
2. All **three** HTML heads (`index.html`, `store.html`, `us.html`) —
   each carries its own `<link>` to Google Fonts.
3. `js/flow.js` — the `FONT` constant near the top **and** the
   `document.fonts.load('...')` call further down. The canvas draws the
   wordmark itself; if the load call names the wrong face, the WebGL
   texture is rasterised before the font arrives.
4. `css/site.css` `.flow-fallback` — the static `<h1>` shown when
   WebGL/motion is unavailable has its own hardcoded family.
5. `js/main.js` — the loader **burst** draws text onto a canvas with its
   own hardcoded `c2.font = ...` string.

---

## Files

    index.html       THE LANDING (restructured 24 Aug 2026): one full-
                     viewport screen, nothing else. The red-scanline film
                     as a muted looping <video> (phones pick the 1080
                     encode via <source media>; poster kept by reduced-
                     motion visitors — main.js cancels autoplay), the CRT
                     wordmark centred over it (.hero--full stretches the
                     shared hero slab to 100svh — declared at the END of
                     site.css so it beats the 640px media query), and the
                     tagline "Music that doesn't care." near the bottom.
                     The tagline is .music-line, NOT .hero-line — i18n.js
                     rewrites .hero-line innerHTML to the "Wear the
                     trouble." translations, which belong to /store;
                     .music-line has its own i18n entry. Nav is Home +
                     Store inline (desktop) plus the burger menu
                     (Home/Store/Story/Contact) — on phones .nav-links
                     hide, so the burger IS the mobile route to the
                     store. No cart, no footer, no store.js, no About.
    store.html       THE STORE-FIRST PAGE — everything index.html used to
                     be (20 Aug shape, modelled on saywaybrand.com): nav
                     carrying the shop categories -> compact FILM-LOOP
                     hero (~58vh/580px) with the CRT wordmark + "Wear the
                     trouble." + Shop-the-drop -> the full shop (filter
                     bar, grid, modal, cart — js/store.js) -> slim story
                     strip linking to /us -> marquee CTA -> footer with
                     the second CRT wordmark. First product card visible
                     without scrolling; KEEP IT THAT WAY (72vh hero was
                     tried + reverted, see css/site.css .hero comment).
                     Any new hero film follows the encoding rule below
                     and gets -vN filenames. NO preloader (machinery
                     survives in main.js, guarded on #loader). The ABOUT
                     MODAL IS GONE EVERYWHERE (24 Aug): briefly a
                     #about-sec section at the store's foot, removed the
                     same day — /us carries who-we-are now. The alias-of-
                     Luke-Power About copy (+ both IGs) is preserved in
                     git at commit 01441cb if it's ever wanted on /us.
    us.html          The story page — and since the restructure it also
                     holds everything that used to crowd the homepage:
                     story prose, the STAMP/CARD scroll sequence, the
                     four-thousand-weeks manifesto, the count-up, and
                     the club/process/FAQ sticky stack. Was lukepower.html
    favicon.ico      Root favicon (monochrome B). MUST exist: browsers
                     request it by default, and when it 404'd they kept
                     serving a cached ORANGE B from the old brand for
                     weeks. Root files are no-store, so this one updates
                     instantly — never move it into /assets/
    _redirects       /lukepower -> /us, /live -> / (both were indexed)
    css/site.css     ALL styling for every page, one file
    js/main.js       Shared: roll-up links, cursor, magnetic buttons,
                     nav shop-category links, makeScrub engine (kept,
                     currently UNINVOKED), reveals, menu, about modal,
                     clock, stamps flight, dormant loader machinery
    js/flow.js       DORMANT. The WebGL liquid wordmark. No page loads
                     it any more (the CRT wordmark replaced it) but the
                     module and its CSS block stay so re-adding it is
                     only markup + a script tag. Its lessons live below.
    js/crt.js        THE CRT WORDMARK (hero + footer). The site's
                     signature effect. See "The CRT wordmark" below and
                     read its own comments before touching anything —
                     every rule in there was paid for with a regression.
    js/store.js      Shop engine: Shopify Storefront API, filtering,
                     product modal, cart, checkout
    assets/          hero photo (hero-couple-v1.*; the AI-edited v2
                     set exists unreferenced as an alternate), the
                     re-encoded hero-sunset-*.mp4 films (currently
                     unreferenced except the store-hero poster), stamps,
                     grain, monochrome favicons. See the immutable-cache
                     warning under "Deploying" BEFORE touching anything
    _headers         Netlify headers — assets are cached IMMUTABLE,
                     see "Deploying"
    tools/           gen_tiles.py — regenerates the spare brand tiles
                     (OLD WARM PALETTE — off-brand, don't use as-is)
    README.txt, README-STORE.txt   STALE music-era docs. Ignore.

## The film-scrub engine (dormant) and the encoding gotcha

The homepage no longer scrubs film — the hero is a photo. But
`makeScrub()` stays in js/main.js because it is generic, battle-tested
and documented: it hard-pauses any playback, blob-fetches for instant
iOS seeking, serves 4K/1080 by viewport, and no-ops when its elements
are absent. To bring a scrubbed section back: markup + one call, plus a
tall section with a sticky stage (the scrub maps scroll progress across
the section height to the film timeline — height and stage are one
system).

The re-encoded films are still in assets/ (hero-sunset-4k-v1.mp4,
-1080-v1, -vert-v1 — short-GOP, keyframe every 6 frames, 86% smaller
than their predecessor).

**Critical encoding gotcha (applies to ANY video that ever ships):**
files must start at exactly timestamp 0.000 with a keyframe, or browsers
paint a black frame before the first one. A plain `-ss N -c copy` trim
leaves a ~0.066s offset and reintroduces the bug. Re-encode instead:

    ffmpeg -i in.mp4 -c:v libx264 -preset fast -crf 16 \
      -g 6 -keyint_min 6 -bf 0 -pix_fmt yuv420p -profile:v high \
      -movflags +faststart -an out.mp4
    # verify: ffprobe -select_streams v:0 -show_entries stream=start_time
    # then regenerate the poster from frame 1 of the new file

## The liquid wordmark (js/flow.js — dormant)

Replaced on-page by the CRT wordmark, kept on disk. If it ever returns:
its tunables are SLOSH_GAIN / SLOSH_DIR / SPLASH_GAIN; it responds to
scroll ACCELERATION, not velocity; the shader's scroll term is a sheared
body force (a flat push reads as a translate, not a liquid); the GLSL
hardcodes three greys whose names do NOT match the CSS vars they encode.

## The CRT wordmark (js/crt.js) — the signature effect

"BADSCANDAL" drawn from LIVE TEXT to a canvas (never a raster — it can't
misspell and stays sharp at every DPR), then put through a hand-rolled
CRT pass. Two instances (hero <h1>, footer <h2>), one shared loop.
All tunables sit in the >>> TUNE HERE <<< block.

How it behaves — this exact split is the product of many iterations and
is what the user signed off on:

* **At rest the GEOMETRY is completely still.** Fringe parked at CA_MIN,
  zero displacement (verified 0.07px max edge drift). Only TEXTURE moves:
  grain jumps at GRAIN_FPS, scanlines crawl slowly.
* **Every SWEEP_PERIOD a bar crosses in SWEEP_TRAVEL seconds.** The
  convergence wave, the tear and the fringe swell exist ONLY in rows
  near the bar, on a gaussian falloff. The bar DARKENS the glyphs
  (SWEEP_SHADE) — a white "lift" is invisible on ~252-value glyphs.
* While the bar is parked the composed picture blits in ONE drawImage.

RULES PAID FOR WITH REGRESSIONS — do not relearn these:

1. **Never displace rows randomly or steeply.** The original tear gave
   every row its own offset and scrambled the glyphs into venetian
   blinds. Displacement must be a smooth long-wavelength function,
   capped a few CSS px, with imageSmoothing ON during a pass (nearest-
   neighbour snapping turns "smooth" into 1px staircase notches).
2. **The green plate is always drawn whole.** It carries the readable
   core; only red/blue ever move. R/B strips are composed in their own
   buffers with OVERLAPPING columns drawn source-over — without the
   overlap a sub-pixel gap opens between strips and the white core
   shows through as a yellow hairline.
3. **Grain is tiled/windowed 1:1, never stretched.** Stretching a small
   noise plate across the canvas blows each texel into grey bricks that
   fill the letters. It is also generated ONCE and animated by offset —
   regenerating per frame froze the renderer.
4. **devicePixelRatio is read LIVE, never cached.** Browser zoom changes
   it without firing resize; a cached value leaves the backing store
   mismatched and the grain magnifies into heavy static. A resolution
   matchMedia watcher re-arms on every change.
5. **Throttle by skipping rAF frames, never by setTimeout** (detaches
   from the compositor and reads as stutter). Motion renders at FPS;
   grain jumps at GRAIN_FPS. Pinning both low reads as a broken GIF.
6. Scanlines: ONE dark row every SCAN_PERIOD device px (a 2-of-4 comb
   reads as banding). They are composed INTO the picture so they bend
   with it, and they stay source-atop the glyphs — the reference site's
   full-panel lines work on solid black; ours sit over a photograph.
7. Fallbacks: no canvas / no 2D / reduced-motion -> static .crt-fallback
   text. Never remove that ladder.

## The stamp/card sequence (us.html + js/main.js)

A scroll sequence where brand stamps and cards pass over the footage —
the clearest expression of the one rule on the whole site:

* **Stamps** (DM Mono slates, dates, locations, drawn marks) are brand
  furniture: pure monochrome ink over the imagery, never tinted, never
  given a background of their own.
* **Cards** are the only flat-colour surfaces in the sequence, and they
  are grey (`--ink-2`/`--ink-3` territory) — never a hue.
* The section behind them is **transparent** — the footage shows
  through. Do not "fix" a see-through section by giving it a background.

The sequence lives on us.html since the store-first restructure. Cards
fly ~2000px+ on a hand-written spring (duration .7, bounce .2), stamps
overhang the card corners with double rotation, z-stacked 2/3/4. Under
reduced motion (or no JS) `.stamps:not(.fly)` renders a separated static
column — two of the three cards were once unreadable because they
stacked coincident; don't reintroduce that.

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

### Categories — edit them in ONE place

`FAMILIES` and `GARMENTS` at the top of js/store.js are the single source
of truth. They drive the Storefront query, the resolvers, the labels, the
filter buttons and the demo data. **store.html does not list categories at
all** — both filter rows are rendered from these arrays. Adding a category
is one line there and nowhere else.

Two **independent** axes, ANDed in `visible()`:

    family   statement | essential      (the top row)
    garment  tee | hoodie | tank | other (the chips)

Because they're independent, a statement hoodie appears under Statements
*and* under Hoodies. Resolution order per axis:

1. Shopify **tags** (lowercase), which always win.
2. **Alt tags** (`alts` on a family) in a second pass — the Aug 2026
   catalogue shipped tagged `front-and-back`/`red-print`/`white-print`
   instead of `statement`, so `front-and-back` files as statement. The
   second pass matters: an explicit primary tag on ANY family beats an
   alt on an earlier one.
3. Fallback regex for anything untagged, checked against the **image
   filename slug first and `productType` second**. That order matters:
   Printful sets productType to "T-SHIRT" on everything it makes, so
   checking it first files `womens-cropped-hoodie` under Tees. Untagged
   products always land in `essential`, so new stock never claims to be a
   Statement piece by accident.

### Colourways — same statement, several products (added 21 Aug 2026)

The catalogue sells one statement as separate Shopify products per
ink/shirt combination ("NOT SORRY NEVER WAS" red-on-white and "NOT SORRY
NEVER WAS (BLACK)" white-on-black). `COLOURWAYS` in js/store.js (keyed
on the `red-print`/`white-print`/`black-print` tags) folds products
whose titles match after stripping a trailing colour parenthetical into
ONE card with "Red on white / White on black" chips; the modal gets a
matching Print row and the grid card follows modal switches. Solo
products with a known colourway show one passive chip. Titles display
suffix-stripped everywhere except the cart (raw title keeps the lines
distinguishable). Grouping requires: same base title + colour word in
parentheses + the print tag. Duplicate colourways in one group =
deliberately left ungrouped (data mistake guard).

### Statement display rules (paid for with feedback, keep them)

* Statement-family cards and modals lead with the **back** image — the
  statement is printed there; the front is the small logo. Leading with
  the front sold them as blank tees.
* Statement cards do NOT flip to the front on hover (`altSrc = null`)
  — hover is when Quick Add opens, and the flip hid the product at the
  exact moment of purchase intent. Front stays in the modal's view
  buttons.

The trap that was there before, in case it ever regresses: the fetch
query used to be a hardcoded `"tag:tshirt OR tag:hoodie"`. A product
tagged only `statement` was excluded from the fetch entirely and simply
never appeared — no console error, nothing. It is now built from the
taxonomy (a derived `tagQuery`), so that can't drift.

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
* Some titles misdescribe the garment — "MADE YOU LOOK (White)" is
  actually a women's cropped hoodie at EUR50, "Hate everyone equally" is
  a tank top. The tags are correct, so the site files them correctly;
  only the customer-facing title is wrong. Rename in Shopify when
  convenient.
* Two identical "Short-Sleeve T-Shirt" products exist (blank, no
  statement) — likely test products worth deleting.

---

## Deploying

**Push to `main` and it's live.** Netlify watches
`github.com/Badscandal/badscandal-site` and publishes the repo root as-is.
No build command, no CI. Measured push → live: ~10 seconds.

    git add -A && git commit -m "..." && git push

### READ THIS BEFORE TOUCHING assets/ — IMMUTABLE CACHING

**This is the single easiest way to ship a broken update.** `_headers`
caches everything under `/assets/*` with

    Cache-Control: public, max-age=31536000, immutable

`immutable` means returning browsers will not even revalidate — they
will serve the year-old cached copy and never ask the server. So:

* **Replacing the content of an existing asset filename does NOT ship.**
  Everyone who has ever visited keeps the old bytes for up to a year.
  The site will look updated on YOUR machine (fresh cache) and stale on
  everyone else's — the worst kind of broken, because it passes your
  own testing.
* **New or changed assets need NEW FILENAMES**, and every reference to
  them updated (HTML is `no-store`, so the reference change ships
  instantly). Rename, don't overwrite. Always.

HTML/CSS/JS at the root are `no-store, no-cache, must-revalidate`
(beats iPhone caching), so code changes ship instantly — it is only
`/assets/*` that bites.

Netlify project `profound-haupia-db7ffa`
(site id `41c9b6ee-3a12-4b2f-ba7c-8dac83281622`) →
https://app.netlify.com/projects/profound-haupia-db7ffa

Config: `netlify.toml` (publish `.`, empty build command) and `_headers`.
Netlify's own post-processing does the pretty-URL rewriting — the served
HTML has `href='/store'` where the source says `href="store.html"`, and
attribute quotes get normalised. That's expected; don't "fix" it.

Rolling back a bad deploy: either `git revert` and push, or use Netlify's
deploy list → "Publish deploy" on an earlier one.

Note assets/ is ~38MB of video — it's committed to the repo (largest file
28.9MB, so no Git LFS needed). Never re-encode the films casually (see the
encoding gotcha above), and remember: a re-encoded film is a changed
asset, so it needs a new filename too.

## SEO / identity

`index.html` carries: title `BADSCANDAL`, a brand-voice meta description,
favicons, and schema.org **Organization** JSON-LD naming Luke Power as
founder. `us.html` carries **AboutPage + Person** JSON-LD. The Person
entry matters: badscandal.com surfaces for "Luke Power" searches, and
dropping the schema would throw that away for nothing. Lilian has no
Person entry yet — needs her full name first.

The current JSON-LD dates from the no-music revision (no `jobTitle:
"Musician"`, Luke's name out of the title). With music back under the
umbrella — and it being the actual income — those choices are worth
revisiting rather than preserving.

`_redirects` 301s `/lukepower` → `/us` and `/live` → `/`, so the indexed
music-era URLs keep their equity instead of 404ing.

---

## Open tasks / next up

**WHERE THE SITE IS AT (26 Aug 2026):**

* **Live structure** (commits `01441cb` + `6db0519`, 24 Aug):
  badscandal.com = landing (wordmark + film + "Music that doesn't
  care."), /store = the full store-first page, /us = the story. The
  About modal is gone everywhere; About links were removed from every
  menu/footer, and us.html's "Read the whole thing" now anchors to its
  own #story-prose. i18n updated to match (.music-line entry; the
  .about-lead / .about-sec translation blocks are currently unused but
  kept). Verified live: zero console errors, shop fetches fine.
* **Direction:** BADSCANDAL = Luke's EDM artist alias (see the top of
  this file). A prepared-but-reverted SEO change — "musician and
  clothing" meta description + MusicGroup JSON-LD with all the artist-
  profile sameAs links — sits in git: commit `e1fa86a`, reverted in
  `6ed1bc5`; ship it later with `git revert 6ed1bc5 && git push`. The
  live JSON-LD still carries the OLD clothing-only framing and the
  unverified `@lukeandlilian` handles.
* **YouTube assets exist** (24 Aug, Higgsfield, matched to the site's
  CRT identity): banner + thumbnail in
  `~/Desktop/Claude Works/Badscandal - YouTube Assets/`.
* **Digital products are planned** (26 Aug discussion): DAW plugin with
  licence keys (likely Lemon Squeezy/Paddle as merchant of record) and
  sample packs via Shopify's Digital Downloads app. Site-side, a
  digital product needs ONE line — a `digital`/`samples` category in
  the FAMILIES/GARMENTS arrays in js/store.js — or the tag-derived
  fetch query never even requests it (the classic trap below).
* Lilian's Instagram handle is still unknown — needed if her IG ever
  goes on the site.
* Catalogue (from 21 Aug): 26 statement tees (18 red-on-white + 8
  white-on-black "(BLACK)" twins, 3 untagged blanks the site never
  fetches) live and filing correctly via the alt-tag + colourway
  systems above. Statement tagging in Shopify is still the right
  long-term fix (tags win over alts) — a tagsAdd write was
  permission-blocked on 21 Aug.
* Hero films: the RED scanlined film (hero-film-*-v6) on both index and
  store; B&W v7 deployed but unused (swap the refs to bring it back);
  v1–v5 remain in assets/; source .movs sit UNTRACKED at the repo root
  — move them out when settled. CRT: sweep 5.5s, crest fringe 4.6px;
  crt.js takes a per-instance word from the fallback element — us.html
  mounts "THE ROAD".
* **Shared BADSCANDAL socials.** The social links on store/us (index has
  none since the restructure) still point at `@iguessimlukepower`, marked
  `>>> EDIT HERE <<<`. Swap in the brand accounts when they exist — also
  the Behold IG feed id on us.html, and the `sameAs` arrays in both
  JSON-LD blocks (or ship the prepared e1fa86a schema, which already
  points Luke at the verified music profiles).
* Store hero photo: store.html currently reuses the homepage sunset
  poster (`assets/hero-sunset-poster-v1.jpg`) behind "Wear the trouble."
  A dedicated campaign shot would be better — when supplying one, give it
  a NEW versioned filename (immutable cache) and swap the `src`.
* Photography landed 21 Aug 2026: stills pulled from the Greece footage
  (`~/Desktop/July 2026/Content Daily/Greece/Videos`) now populate the
  About modal (`about-couple-v1.webp`), the three stamp cards
  (`us-card-*-v1.webp`, capped-height `.scard-photo` so the 100vh panel
  geometry survives) and the EVIDENCE grid on /us (`us-photo-*-v1.webp`).
  More frames can be pulled the same way (ffmpeg -ss … crop … webp) —
  always NEW versioned filenames.
* Trim the Printful compliance text out of product descriptions in Shopify.
* ~15 unreferenced images remain in assets/ (`svc-*`, `work-*`,
  `luke-portrait`, `about-loop`, …) — leftovers from the studio-era
  layouts, ~150KB total. Harmless; delete if you want the folder tidy.
* Not yet done in Shopify: pick a plan, enable payments, test checkout
  with test card 4242 4242 4242 4242, connect store.badscandal.com
  (CNAME `store` -> `shops.myshopify.com` at GoDaddy).
* A minimal branded Shopify theme exists separately
  (`badscandal-shopify-theme.zip`) that just redirects
  store.badscandal.com -> badscandal.com/store.

## Testing

No test suite. Verify by:

    node --check js/store.js js/main.js js/flow.js js/crt.js
    python3 -m http.server 8000    # then open localhost:8000

The taxonomy is worth testing directly when you touch it — the resolvers
can be pulled out of js/store.js and run under node against live
Storefront data, which is how the productType-vs-image-slug ordering bug
was caught. Check the full family x garment matrix, not just one filter:
a wrong resolver shows up as one silently empty combination.

For Shopify data, query the Storefront API directly rather than guessing
at what the site sees — it's the fastest way to tell a data problem from
a code problem.

## Plugin store (plugin.html, added 5 Sep 2026)

The dedicated CLEANSLATE page — one product, one job: BUY NOW. The nav
now reads **Clothing store** (store.html) / **Plugin store** (plugin.html)
/ Story on every page, menus and footers included; i18n carries both
labels. Structure: full-viewport hero (the signal-flow glass loop
`plugin-film-*-v1` + CRT "CLEANSLATE" — crt.js reads the word from the
fallback, like "THE ROAD") -> statement + facts -> **the scroll-played
film** -> the eight module cards (real UI pages, `plugin-ui-*-v1.webp`)
-> gallery of the glass renders (`plugin-still-*-1920-v1.webp`) -> specs
-> BUY block over the 4K hero still -> FAQ -> footer.

* **The scroll film is OUT (removed 5 Sep 2026, same day, at Luke's
  request).** The machinery stays: main.js mounts makeScrub on any
  `[data-scrub]` section (data-src / data-src-phone / data-poster /
  data-poster-phone) and the encodes `plugin-scrub-1440-v1`, `-1080-v1`
  and the portrait `plugin-scrub-vert-1080-v1` (house recipe: keyframe
  every 6 frames, start 0.000, no audio) are still in assets/. Restoring
  it is one `<section data-scrub>` with a sticky `.plug-stage` — the CSS
  block is still in site.css.
* **Gallery + specs are one section** (`.plug-gallery`): the wide render
  carries the "Made by engineers and vocalists…" headline, the 2x2 bed of
  darkened, vignetted, blurred renders carries "The boring bits" spec
  list on top. Copy is deliberately professional: no SM7B, no rented
  flat, no licence talk in the What-it-is facts (that lives in the specs
  and the BUY block).
* **Phones** get the 9:16 hero loop `plugin-film-vert-1080-v1.mp4` via the
  `<source media>` swap; Safari's start-playback glyph is hidden on every
  video site-wide and main.js retries hero autoplay on the first
  touch/scroll when the browser refused it (Low Power Mode).
* **BUY NOW = js/plugin.js.** Looks the product up on the Storefront API
  by handle `cleanslate` (>>> EDIT HERE <<< at the top); found -> live
  price + cartCreate -> Shopify checkout; not found -> the buttons keep
  their mailto href and no price shows. The product must be published to
  the **Headless** channel or the lookup returns null silently.
* Assets are all `-v1`; a re-render is a `-v2` (immutable cache).
* Still open: the Shopify product + price (nothing is hard-coded), the
  installer download links on the thank-you page, and ES/PT copy for the
  page body (nav labels, hero line and the key lines are translated).
