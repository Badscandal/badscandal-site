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

**Site shape since 2 Nov 2026 (supersedes the paragraph below):** the
LISTEN page IS the homepage — listen.html was moved to `index.html` (the old
CRT-wordmark landing is gone; it's in git history). `/listen` and
`/listen.html` 302! to `/` (since 10 Nov 2026). **Feature.fm is cancelled and
its subdomain music.badscandal.com is deleted (10 Nov 2026): never link to
Feature.fm / ffm.to again. NO PRE-SAVE LINKS ANYWHERE, EVER (team rule since 10
Nov 2026).** Release pages are our own: badscandal.com/<slug>, one per song, from
`songs.json` (see "Song pages" below). The clothing store is HIDDEN: `/store` and
`/store.html` 302! to `/` (store.html still exists; delete the two
_redirects lines and re-add the nav link to bring it back). Nav on home is
just Home + Plugin store. Wherever this file says "listen.html" below, read
`index.html`.

**Site shape since the 24 Aug 2026 restructure (historical):** badscandal.com is a
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

    git add <files by name> && git commit -m "..." && git push

**Never `git add -A` / `git add .`** — the folder holds large untracked
.mov/.mp4 files and zips. Stage files by name. Never `netlify deploy --dir .`
from here either (it uploads untracked files). Deploy = push tracked files.

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

`npm test` (= `node --test tests/*.test.mjs`) covers the server side: the
counter keys, the Conversions API payload, the admin login/session and the
portal's numbers. No dependencies needed to run it. For the pages, verify by:

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
* **Live since 6 Sep 2026.** Shopify product `cleanslate` (id
  15713438040390) is ACTIVE, EUR 25 with compare-at EUR 50 (launch 50%
  off), published ONLY to the **Badscandal** (headless) channel — never to
  Online Store / Shop / POS, so it stays out of the clothing store.
  plugin.js reads `compareAtPrice` and renders `<s>old</s> new -50%`.
  **Priced in USD for everyone (6 Sep 2026):** plugin.js queries and creates
  the cart `@inContext(country: US)` with `buyerIdentity.countryCode = US`,
  so the page shows the United States market price and checkout runs in
  USD. CLEANSLATE has a FIXED $25 / $50 there: Shopify catalog "United
  States" (MarketCatalog 172862603590, price list 32378880326, all products
  included + auto-include new ones, 0% adjustment, so the clothing keeps its
  converted USD prices). Lesson: a catalog created via the API contains only
  what is published to it and briefly hid all 80 clothing products from US
  visitors — create catalogs in the admin UI (it includes everything).
  Installer links (Shopify CDN) sit under the BUY perks (`.buy-dl`) and in
  a fifth FAQ item, each `<a data-dl="mac|win">`; plugin.js rewrites their
  hrefs from `cleanslate-version.json` (below), the hard-coded hrefs are the
  no-JS fallback. The key email carries the same two links (server repo,
  wrangler.toml).
* Still open: ES/PT copy for the rest of the page body (nav labels, hero
  line and the key lines are translated).

## Licence + update pages (activate.html 8 Sep 2026, updatecleanslate.html 8 Sep 2026)

Two utility pages for people who already own CLEANSLATE, plus the one file
that every version number on the site comes from.

* **`cleanslate-version.json` — the version manifest, repo ROOT.** Read by
  the plug-in's CHECK FOR UPDATE (Source/Licensing/UpdateChecker.cpp in the
  plugin repo, once a day silently + on click) and by js/update.js and
  js/plugin.js. Shape: `{product, latest, released, page, downloads:{mac,win}}`.
  Root files are `no-store`, and `_headers` pins the type explicitly — it
  must NEVER move under assets/ (immutable for a year = a stale update
  notice on every machine). **A release = edit this file** (latest, released,
  the two CDN URLs) + a card and a history row on updatecleanslate.html.
  Publish it LAST: the moment `latest` goes up every installed plug-in
  advertises it, so both installers must already be on the CDN and the key
  email (wrangler.toml) already redeployed.
* **`/updatecleanslate`** (pretty URL of updatecleanslate.html; the plug-in
  opens it as `?v=<installed>&os=<mac|win>`). js/update.js fetches the
  manifest and writes the headline: behind -> "Update to *X* now." + "YOU ARE
  ON VERSION Y"; current -> "You're on the *latest* version."; no `?v` ->
  "CLEANSLATE *X*". The visitor's OS (`?os=`, else UA) gets the white
  `.buy-btn`, the other OS the outline `.cta-btn`; labels are static because
  `.roll` rebuilds its text at load. Then the "What's new" `.mod-grid` —
  cards ONLY for the modules/areas a release touched (`plugin-ui-activation-v1`,
  `plugin-ui-update-v1` are UI screenshots, 3:2 like the module cards) —
  a `.spec-list` release history, a four-item FAQ, the plugin footer. CSS
  block "UPDATE PAGE" at the end of site.css. Runtime strings go through
  `BS_T` and live in i18n TEXT (ES/PT); three headlines in HTML.
* **`/activate`** (activate.html) is deliberately stand-alone — no site
  CSS/JS, must work from any browser on any machine: key + machine code
  -> POST `/api/licence/activate` -> licence text to paste into the plug-in.
  `_redirects` proxies `/api/licence/*` to the Cloudflare Worker (200
  rewrite) so machines that cannot reach workers.dev still activate.
* Test: `node --check js/*.js`, `python3 -m http.server`, open
  `/updatecleanslate.html?v=1.0.0&os=mac` (behind), `?v=<latest>` (current)
  and no params; `curl -sI badscandal.com/cleanslate-version.json` must say
  `no-store`.

## Language follows the device (25 Oct 2026)

js/i18n.js picks the language once per page load: a tapped EN/ES/PT
(`localStorage.bs_lang`) always wins; otherwise the first supported entry
of `navigator.languages` — the phone's system language order (iPhone
Settings -> Language & Region; the Instagram/TikTok in-app browsers report
the same list). pt-BR/pt-PT -> PT, es-ES/es-MX/... -> ES, anything else ->
EN. The detected language is NOT stored, so it tracks the device. Sitewide:
every page loads i18n.js. Tested in headless Chrome with `--accept-lang`
pt-BR / es-ES / en-IE at a 390px frame.

## Story page TAKEN DOWN (24 Oct 2026)

us.html (Luke & Lilian, married in Gibraltar) is offline but NOT deleted:
`_redirects` 302s `/us` + `/us.html` to `/` (forced with `!`), every Story
link is out of the nav/menus/footers of index, store and listen, and the
store's story strip is removed. `/lukepower` now 301s to `/listen`. To bring
it back: delete the two `/us` redirect lines and restore the links + strip
from the commit before this one.

## Listen page (listen.html, added 17 Sep 2026)

The bio-link page — **badscandal.com/listen** is what goes in the Instagram
bio. One centred column over the fixed brand film: CRT
wordmark (no tagline, removed 17 Sep) -> latest-release card (cover, kicker,
title, one white LISTEN button, small Apple/Deezer/Amazon links) -> STREAM
rows (Spotify, Apple Music, YouTube, SoundCloud) -> FOLLOW rows (Instagram,
TikTok, Email) -> THE NUMBER (combined streams, main.js's `.stat-count`
count-up) -> slim footer. Rows are text only: no platform logos, the cover
and the film carry the colour. `<body class="plug listen">` (`.plug` keeps
the nav links visible on phones; there is no burger). CSS block "LISTEN
PAGE" at the end of site.css. Scripts: i18n -> main -> crt -> `js/listen.js`.

* **`listen.json` (repo ROOT, no-store, pinned in `_headers`) is the single
  source of truth** for every href, the release card and the stream total.
  js/listen.js fetches it and overwrites the DOM; the HTML carries the same
  values hard-coded as the no-JS / failed-fetch fallback — keep them in step.
  Never move it under assets/ (immutable for a year).
* **Updating the counter = edit `streams.total` + `streams.asOf`, push.** The
  number is read off Songstats (artist Overview -> Streams) by hand for now.
  Full digits on purpose: 450,000,000+ reads bigger than 450M.
* **Upcoming single = `release.mode: "upcoming"`** + `title`, `kicker`,
  `date`, `cover` (NEW `-vN` asset). listen.js adds `body.upcoming` (store
  links hidden) and the button is FOLLOW ON SPOTIFY -> `cta` (the artist
  profile). Release day: `mode: "out"`, `cta` = the Spotify track, `links` =
  the other stores. Kicker strings are looked up in i18n TEXT, so a new kicker
  needs an entry there to translate. **No pre-save mode and no pre-save links:
  removed 10 Nov 2026, never add them back.**
* **Countdown (25 Oct 2026) = `release.date: "YYYY-MM-DD"`** with mode
  `upcoming`. The `.cd` block in the card (hidden in the HTML)
  counts DAYS / HOURS / MIN / SEC to **midnight in the visitor's own time
  zone** on that date — stores drop at local midnight per country, so each
  visitor hits zero when the track is live for them. Built from date parts,
  never `Date.parse` (bare ISO dates parse as UTC). At zero the page flips
  itself: grid hides, "Out now" in serif italic, button -> LISTEN -> `cta`. Release day
  is still a JSON edit (`mode: "out"`, track `cta`, store `links`) — the
  flip just covers the gap. CSS block "countdown" after `.rel-links` in
  site.css; strings Days/Hours/Min/Sec/Out/Out now in i18n TEXT, the date
  is `toLocaleDateString` in the page language.
* **Release week (25 Oct 2026):** for 7 days from `release.date` (any mode —
  so KEEP `date` set when flipping to `"out"`) listen.js adds `.is-out` to
  the card: an oversized conic square spins behind the children and shows
  only in the card's 1.5px padding (a white light circling the edge), a
  slow white glow breathes, the cover fades in through black, and OUT NOW
  is a shimmering link under the title (same href as the button). The
  cover fades via brightness, never opacity, and has a solid backing — a
  transparent cover lets the spinning light show through as a searchlight.
  Reduced motion: a still white edge, no glow/shine/fade. `RELEASE_WEEK`
  in listen.js sets the length. Headless Chrome screenshots fire at load,
  before CSS animations run: to see the settled state, hold the load event
  open (a slow 1px image in a parent frame).
* **Website bot guide:** Luke's website bot works from a PDF brief
  (Desktop/Claude Works/Website Bot/ — never inside this repo, the repo root is
  the public site; updated 10 Nov 2026 with the new-song flow). It may touch
  ONLY: listen.json `release`, new `assets/listen-<slug>-cover-vN.jpg` covers,
  the release-card fallback in index.html + its og:image lines, new i18n TEXT
  entries, and songs via `node tools/new-song.mjs` (+ `spotifyTrack` in
  songs.json then `--rebuild`). Keep that PDF in step if this flow changes.
* **Pre-saves: never (team rule, 10 Nov 2026).** Before release a song page and
  the home card say FOLLOW ON SPOTIFY (the artist profile) with a countdown.
* **Why the counter is manual:** no free live source exists. Songstats has
  the exact figure (`GET https://api.songstats.com/enterprise/v1/artists/stats
  ?spotify_artist_id=29kaubgb6Esvwu0idVndGy`, header `apikey`) but the API is
  enterprise / contact api@songstats.com, artist-scoped keys exist, price
  unknown. Spotify's Web API exposes no play counts at all; Apple none;
  YouTube channel views are free (Data API v3, key only, 10K units/day);
  SoundCloud needs Artist Pro to register an app; Soundcharts $50/mo is
  Spotify-only per-track sums; Chartmetric/Viberate ~$300–350/mo. When a key
  arrives: a GitHub Action cron (or the Cloudflare Worker) rewrites
  listen.json and commits — the page needs no change.
* Handles on this page are the artist accounts (`@badscandal` IG/TikTok,
  youtube.com/badscandal, soundcloud.com/badscandal); the rest of the site
  still points at `@iguessimlukepower`. JSON-LD here is the MusicGroup block
  (the e1fa86a shape + these profiles); index.html's is still the old one.
* Listen is in the nav/menu on index and in the menus + footers of store and
  us. Plugin pages stay minimal.
* Test: `node --check js/listen.js`, local server, open /listen.html: hrefs
  match listen.json, count-up lands on 450,000,000+, nothing scrolls
  sideways at 390px; rename listen.json -> page still whole; set a past
  `date` -> the countdown flips to OUT NOW + LISTEN. Python's http.server has no Range
  support so the film shows its poster locally — that's the server, not the
  page.

## Song pages (/touchme, /medaseubody, …) + Meta Pixel/CAPI + /admin portal (9–10 Nov 2026)

Our own release pages for the Meta ads and the bio (Feature.fm is cancelled).
Brief: `../TOUCHME-LANDING-BUILD-BRIEF.md` (outside the repo on purpose).

* **ONE SONG LIST: `songs.json` (repo root, served no-store; pinned in
  `_headers`).** Per song: `slug` (= the URL, badscandal.com/<slug>), `title`,
  `date` (YYYY-MM-DD, release day), `cover` (the big JPG), `coverWeb` (600 px
  webp for the page), `share` (1200x1200 JPG under 200 KB for link previews),
  `spotifyTrack` (empty until release day), `spotifyArtist`. Everything reads
  it: the pages (generated from it), `netlify/lib/songs.mjs` (server side:
  hit.mjs pages, capi.mjs content_name BY PAGE PATH, admin.mjs LINKS) and the
  edge function (its `config.path` must be a literal, so new-song.mjs rewrites
  it and `tests/songs.test.mjs` fails if it disagrees). The tests also fail if
  a page drifts from the list, an og:image isn't absolute, a share image is over
  200 KB, or any served file links to Feature.fm / a pre-save.
* **ADDING THE NEXT SONG (the whole flow):**
  1. Put the cover in `assets/` as `listen-<slug>-cover-v1.jpg` (square JPG,
     1000 px+; slug = lowercase letters/digits, no accents, e.g. `noitedj`).
  2. `node tools/new-song.mjs <slug> "<Title>" <YYYY-MM-DD>` (on the Mac: uses
     `sips` + Homebrew `cwebp`). It makes the 600 px webp + the share JPG (new
     -vN names, never overwrites), adds the song to songs.json, writes
     `<slug>.html` from `tools/song-template.html`, updates the edge path list,
     and prints the exact `git add` line.
  3. `npm test`, commit by file name, push. /admin, the counter and Meta pick
     the song up by themselves. Ads link to
     `/<slug>?utm_source=meta&utm_campaign=br&utm_content={{ad.name}}`.
  4. Release day: paste the track link (`https://open.spotify.com/track/<id>`,
     no `?si=`) into its `spotifyTrack`, run `node tools/new-song.mjs --rebuild`,
     `npm test`, commit, push. (Even if the rebuild is forgotten, the page re-
     reads songs.json and points the button at the track.)
  Edit the look of every song page = edit `tools/song-template.html`, then
  `--rebuild`. Never hand-edit a `<slug>.html` (the test catches it).
* **Before / after release (each visitor's own time zone):** the inline script
  under the button builds local midnight of `date` from its parts (never
  Date.parse) BEFORE first paint: before it, "Follow on Spotify" (PT "Seguir no
  Spotify", ES "Seguir en Spotify", + de/fr/it/nl/pl/cs) -> the artist profile,
  with "OUT 24 NOVEMBER" and a d/h/m/s countdown; from midnight, "Listen on
  Spotify" -> the track (or the artist profile while `spotifyTrack` is empty).
  At zero the page flips itself (js/song.js) and shows "Out now". The Meta
  SpotifyClick carries `action: follow|listen`.
* **The home page counts too** (`js/count.js`, page `home`, /admin "Home page"):
  views, the people-only `act`, and taps on every music/social link (target =
  spotify/apple/youtube/soundcloud/instagram/tiktok/email). NO Meta on the home
  page (no Pixel, no consent bar needed). Its link preview points at the current
  release's `share-…-1200-vN.jpg` (change the two image lines in index.html on a
  new release).
* **Every og:image is absolute (https://badscandal.com/assets/…)**: Facebook and
  WhatsApp ignore relative ones; WhatsApp drops images over ~300 KB.
* **The song page** (`<slug>.html` + `js/song.js`, was touchme.html + js/touchme.js). One page for
  everyone (no cloaking): cover (`assets/touchme-cover-600-v1.webp`, 22 KB), title,
  ONE green Spotify button (Spotify's mark, the deliberate colour exception) and a
  one-line privacy notice. Spotify ONLY: the other store links were removed at Luke's
  request (9 Nov) — don't add them back. Speed rules: no web
  fonts, no site.css/main.js, CSS inline, the button paints before any JS. Measured
  locally (iPhone, 70 ms / 9 Mbit, 4x CPU): button 0.20 s after first byte, 21 KB +
  cover, 6 requests. Ads link to
  `/touchme?utm_source=meta&utm_campaign=br&utm_content={{ad.name}}`.
* **Opening Spotify:** Android -> `intent://` (web fallback); iPhone inside
  Instagram/Facebook/TikTok -> `spotify:` scheme, web player after 600 ms if the
  page is still visible (TUNE HERE in song.js); iPhone Safari -> plain https
  (universal link); desktop -> new tab. Only Luke's real phone inside the Instagram
  app proves this works.
  Inside Instagram on iPhone, Instagram shows its own "There was a problem
  loading this website" screen for a moment while it hands over to Spotify (and
  if you go back). That's Instagram's browser, not our page; counting and Meta
  are unaffected (they go out before the hand-off).
* **Meta:** ONE Pixel for every song, `1442285344656582` (dataset "Badscandal
  Touch Me"; never make another). content_name = the song's title from
  songs.json, looked up server-side by the page path (events from unknown pages
  are dropped). Loads after
  first paint; PageView + ViewContent on load, custom `SpotifyClick` on the tap.
  The same events go server-side via `/api/capi` (`netlify/functions/capi.mjs`,
  payload in `netlify/lib/capi.mjs`, Graph API version pinned there) with the SAME
  event_id -> Meta deduplicates. user_data = IP, UA, fbp, fbc (cookie, else built
  from fbclid), SHA-256 country. Nothing else, ever. Token: Netlify env
  `META_CAPI_TOKEN`. `META_TEST_EVENT_CODE` (optional) routes events to Events
  Manager -> Test events; deploy previews only send while it is set. Remove after
  testing. The live ads optimise on the OLD custom conversion (FeatureFM_click);
  ours needs a NEW custom conversion on `SpotifyClick` (Luke approves first).
* **Consent:** `netlify/edge-functions/song-geo.js` (every song path) stamps `<html data-geo
  data-eu>` from Netlify geo (EU + EEA + UK list in `netlify/lib/geo.mjs`); no edge
  -> phone time zone fallback. EU/UK: a small bar (same-size Allow / No), nothing
  to Meta before Allow, and capi.mjs refuses EU events without consent as a second
  lock. Elsewhere: on by default + notice; `/privacy` (privacy.html, EN + PT) has
  the opt-out (`bs_meta_off`). No `preconnect` to Facebook (it would leak the IP
  before consent).
* **Counting:** `/api/hit` (hit.mjs, the 11 Oct counter, merged 9 Nov) with pages
  `home`, `listen` (old keys) + every song slug. Blob keys grew from 9 to 21 parts (pv, campaign, ad, city,
  device/os/browser/app, referrer, ms, meta, returning), then 23 (bot, fb); old keys
  still parse. See the header of `netlify/lib/stats.mjs`. Deploy previews write to
  a throwaway store.
* **People only (the rule):** a page load counts as a PERSON only after a real
  touch, pointer, wheel/scroll or key press while the page is on screen (the `act`
  hit from `js/song.js` / `js/count.js`), a store tap or a consent answer, and nothing flags it.
  No event goes to Meta (Pixel or CAPI) before that: the Pixel script loads after
  first paint, but PageView/ViewContent fire on the first interaction, SpotifyClick
  on the tap. So Meta's "landing page views" only count people who touched the page.
  Everything else is stored but hidden in /admin (logic: `hardBot` / `classify` /
  `sessions` in `netlify/lib/admin.mjs`; labels `BOT_LABELS`):
  - `noact`: looked, never touched (scanners, speed tests, prefetches, and people
    who left without touching: indistinguishable). Pre-9-Nov keys can only prove a
    person by a tap.
  - hard flags, always hidden even with a touch: data-centre IP (`dc-meta|aws|
    google|azure|apple`, `netlify/lib/dc.mjs` + `dc-ranges.json`, also stamps
    `data-dc` via the edge function so the Pixel never loads), crawler UA (`ua`,
    list in `netlify/lib/ua.mjs`: facebookexternalhit, meta-externalagent, Facebot,
    WhatsApp/, TelegramBot, Slackbot, Twitterbot, Discordbot, Googlebot, bingbot,
    Lighthouse…), `webdriver`, `headless` (HeadlessChrome, zero screen, no
    languages), `notouch` (phone UA, no touch screen), `hidden` (never on screen),
    `fasttap` (<150 ms after the button), `synthetic` (script click), `me`, `test`
    (deploycheck), `dc-town` (small towns that are only data centres: Prineville,
    Luleå, Boardman, The Dalles, Forest City, Altoona, … list `DC_TOWNS`).
  - `dc-city`: big data-centre cities (Ashburn, Kansas City, Fort Worth, Mesa,
    Henrico, Huntsville, Odense…, `DC_CITIES`) only when there's NO interaction:
    real people live there.
  **Re-run `node tools/refresh-ip-ranges.mjs` about monthly** (and if "Show
  everyone (incl. bots)" shows a data-centre place counted as a person); commit the JSON by name. `npm
  test` fails once it's 120 days old, as a reminder. 9 Nov night (real keys, anonymised
  in `tests/fixtures/2026-11-09-keys.txt`): 10 visits -> 1 person (Luke, 2 loads),
  4 data-centre towns, 3 no-interaction (2 US iPhone speed tests + Luke's Mac), 1 test.
* **Visits = sessions:** reloads by the same browser within 30 min of its previous
  load are ONE visit (first load's ad/source and returning flag; ×N in the log),
  one tap per visit per store. Time-to-tap stored and shown capped at 10 min.
  "vs previous" compares the same stretch of time when the range ends today.
* **Not counting Luke:** /admin "Don't count this device" sets a server cookie
  `bs_nostat=1` (HttpOnly, ~400 days; Safari keeps server cookies) + localStorage
  `bs_nostat`; `?nostat=1` sets just the localStorage (still works). Each browser
  and each app's in-app browser has its own storage (open /admin on iPhone + Mac;
  `?nostat=1` inside Instagram once). Those visits still send Meta events (tests
  work) and are stored as bot `me`.
* **Source labels (`adOf` / `adLabel`):** utm_content -> the ad name; fbclid but
  no utm_content -> "Meta ad (untagged)" (Facebook adds fbclid to plain link clicks
  too); Instagram app/referrer without fbclid (or IG's own `utm_content=
  link_in_bio`) -> "Instagram (bio/DM/story)"; else "Direct". CSV columns: source,
  ad_name, came_from, reloads_within_30_min, interacted, bot, bot_reason.
* **Meta health:** capi.mjs logs one line per send ("capi: SpotifyClick -> Meta
  received 1") or Meta's refusal (scrubbed: no token, no IP), writes a key-only
  blob `mh/<day>/…` per call (counts; deleted after 90 days by rollup.mjs) and
  overwrites `health/last.json` (+ `health/last-error.json` on errors) with the
  last real send. /admin shows "Meta: sending OK, last event N min ago" or the
  error at the top, and a card with sent / accepted / errors / bots blocked; warns
  while `META_TEST_EVENT_CODE` is set. The token is never logged or stored. The
  browser Pixel copy is only visible in Events Manager. Netlify function logs are
  kept 24 h (project `profound-haupia-db7ffa`).
* **`/admin`** (admin.html + js/admin.js, stand-alone like activate.html; `/stats`
  301s here). Password = Netlify env `ADMIN_KEY` (STATS_KEY still accepted) ->
  `__Host-bs_admin` HMAC-signed cookie, HttpOnly/Secure/SameSite=Strict, 30 days;
  changing the password logs everyone out. 5 wrong tries per 10 min per hashed IP
  (Blob store `admin-auth`). API: `netlify/functions/admin.mjs` (`/api/admin/
  login|logout|data|csv`), numbers in `netlify/lib/admin.mjs` (São Paulo days).
  The link picker = every song in songs.json (newest first) + "Home page"; it
  opens on the newest song that is already out. The humans/bots switch reads
  "Humans only" / "Show everyone (incl. bots)".
* **Cost per tap (10 Nov 2026), READ-ONLY Meta reader** (`netlify/lib/
  metaspend.mjs`, via `metaread.mjs` since 11 Nov): Netlify env `META_ADS_TOKEN` (Luke adds it; an ads_read
  token) + `META_AD_ACCOUNT_ID` (default 230002830106369). ONE kind of call: GET
  Ads Insights, level=ad, daily (time_increment=1), fields ad_name, adset_name,
  campaign_name, spend, account_currency, Graph version = the one pinned in
  `netlify/lib/capi.mjs`; token in the Authorization header, never in a URL,
  never logged or stored. Cached an hour in the Blob store `meta-cache`. Matched
  to real (people-only) Spotify taps by ad name = utm_content (both sides through
  `adKey`: accents off, letters+digits only); an ad nobody visited from yet goes
  to the song whose title/slug is in its campaign/ad set/ad name, else "not
  matched". Shown per ad, per day, per song, all songs per day, in the account's
  own currency (never converted; Meta's days are the ad account's days). No token
  -> a quiet "Meta spend not connected" line. Nothing in the code can write to
  Meta.
* **Monthly ad cap card (11 Nov 2026)** at the top of /admin (every link): the WHOLE Meta ad
  account (`level=account`, so Instagram-app boosts count) from the 1st of the month to today
  (São Paulo), against `MONTHLY_CAP` in `netlify/lib/metaspend.mjs` (USD 1,000; warn 750; at 900
  every ad is switched off by the bots/Luke = README rule 12 in badscandal-hq). `capReport()`:
  spent, left, %, status ok|warn|stop|over|currency (a non-USD account is never converted, just
  flagged), and the pace (last 3 full calendar days, paused days = 0) with the day the 900 line
  would be reached. Same token, same read-only GET, cached an hour (`meta-cache`, key
  `cap/<account>/<day>.json`). DISPLAY ONLY: nothing on the site pauses or changes ads. Google and
  TikTok (EUR) live in the bots' Ads Tracker sheet, not here.
* **Monthly average exchange rates (11 Nov 2026)**, `netlify/lib/fx.mjs`: ECB daily reference
  rates via api.frankfurter.dev (free, no key, GET only); a month's rate = the plain average of its
  daily rates so far; `convert(amount, from, to, avg)`. Cached 12 h (`meta-cache`, `fx/<month>.json`).
  Luke asked for USD<->EUR at the month's average: converted figures are ESTIMATES shown NEXT TO the
  real amount and the rate used, never instead of it. The cap card shows the EUR estimate.
* **BADSCANDAL HQ, `/hq` (11 Nov 2026; on branch `hq-dashboard` until Luke has seen it):** `hq.html`
  + `js/hq.js`, stand-alone like admin.html, SAME login as /admin (no cookie -> sent to
  `/admin?next=/hq…`; after the login js/admin.js sends them straight back. `next` only accepts
  `/hq`, `/hq.html`, `?sample=1` and a `#section`, so it can't bounce anyone to another site).
  On phones (<720 px) the Fans, Money and Team tables turn into one card per row, each value
  labelled from the header row (`stack()` in js/hq.js + the `table.stack` CSS); desktop keeps tables.
  Server `netlify/functions/hq.mjs` (`/api/hq/data`, read-only). It reads the bots' Google Sheet
  "BADSCANDAL HQ" (tabs Growth, Songs, Fans, Releases, Tasks, Royalties, Spend, Income; exact
  columns in the header of `netlify/lib/hq.mjs`, spec in badscandal-hq
  `briefs/2026-11-11-hq-dashboard-spec.md`) through `netlify/lib/gsheets.mjs`: a Google service
  account, scope spreadsheets.readonly, no dependencies (JWT signed with node:crypto). Netlify env
  `GOOGLE_SA_KEY` (the JSON key, Luke pastes it) + `HQ_SHEET_ID`; the sheet is shared with the
  service account as Viewer. Sheet cached 10 min (`meta-cache`, `hq/sheets.json`; `?fresh=1`).
  `hqModel()` builds: Today (the COMBINED cap: Meta + Google + TikTok in USD, EUR at the month's
  average rate; next release; tasks for Luke), Songs (daily Spotify numbers; momentum = last 7 days
  vs the 7 before, only once both weeks have 4+ days, else "new"), Growth (followers per platform +
  the best days and their posts), Fans (repeat commenters, asked the song name, DMs; suggestions
  only), Releases (28/21/14/10/7-day timeline, late steps), Money (per month, every amount in its
  own currency + EUR estimates), Team (tasks per owner, who last logged). Missing numbers stay
  missing ("not read" is never 0). `/hq?sample=1` shows MADE-UP numbers (`hq-sample.mjs`) under a
  SAMPLE banner. The page only displays; nothing on it changes ads, posts, sheets or money.
* **Meta flows by itself (11 Nov 2026): one reader, the sheet feed, /hq from Meta, the key line.**
  READ-ONLY towards Meta everywhere: GET requests to Ads Insights only, nothing that can create,
  change or pause. Token `META_ADS_TOKEN` in the Authorization header, never in a URL, never logged.
  - **One reader:** `netlify/lib/metaread.mjs` `readMeta()` = the one-hour `meta-cache` Blob cache +
    `fetchInsights()`. /admin (cost per tap, cap), /hq and the feed all use it. Every REAL read (not a
    cache hit) overwrites `meta-key/health.json` {ok, at, code, error, lastOk}.
  - **Ad-level fields** now include impressions, reach, inline_link_clicks and actions (only
    `landing_page_view` is kept, as `lpv`). `songOf()` (exported from metaspend.mjs) is THE song
    matching, used by spendReport and the feed.
  - **Key health line** (`keyHealth()`): top of /admin (`#kstat`, next to the Meta status) and /hq Today
    (`#metaKey`): "Meta key: reading OK, last read N min ago"; Meta error code 190 -> "The Meta key has
    expired: make a new one". The token is a PERSONAL one and can expire after ~60 days: then make a new
    read-only (ads_read) token and replace META_ADS_TOKEN on Netlify (Luke does this).
  - **Sheet feed** (`netlify/functions/feed.mjs`, shapes in `netlify/lib/feed.mjs`) for the bots' Ads
    Tracker sheet, pulled with `=IMPORTDATA("https://badscandal.com/api/feed/<file>?key=…")`:
    `meta-daily.csv` (date,platform,campaign,spend,currency: one row per calendar day, whole ad
    account, "Meta", "ALL (account)", 0.00 for a day with no spend) and `meta-ads.csv` (date,campaign,
    ad_set,ad,song,spend,currency,impressions,reach,link_clicks,landing_page_views,spotify_taps,
    cost_per_tap: per ad per day; taps = people-only taps from our counter for that ad (adKey of
    utm_content) on that São Paulo day, as /admin counts a one-day range; cost_per_tap empty at 0 taps).
    Range: the 1st of last month .. YESTERDAY in Europe/Dublin (finished days only). Access: `?key=` =
    Netlify env `SHEET_FEED_KEY` (secret; IMPORTDATA can't send headers), hashed + constant-time
    compare; wrong/missing/unset -> plain 404. The query string is never logged. Meta error -> HTTP 502
    and one scrubbed line, never zeros for days that weren't read. Cache-Control no-store. The key is
    in the Mac's Keychain (service `badscandal-sheet-feed-key`); never print it on its own.
  - **/hq Meta from Meta:** `hqModel(sheets, today, fx, meta)` -> `metaSpend()`: when the read works
    (account level, the 1st of last month .. today), the sheet's Meta rows (platform Meta/Facebook/
    Instagram) inside that range are REPLACED by Meta's own daily totals, so the cap and Money use Meta;
    Google and TikTok stay from the sheet. A day where the sheet's Meta total differs by more than 1.00
    is listed under the cap as "<day>: Meta X · sheet says Y". Read failed -> the sheet's rows stay and
    the page says "Meta's own numbers couldn't be read, so Meta comes from the sheet" + the reason.
    `money.metaSource` carries it. `/hq?sample=1` uses a made-up Meta read (`sampleMeta()`).
  - Tests: `tests/feed.test.mjs` (CSV shapes, the 404 key check, the Dublin cut-off, the Meta-error
    path, people-only taps, key health, the /hq rule).
* **90-day rule:** `netlify/functions/rollup.mjs` (daily 06:00 UTC, production
  only) folds raw keys older than 90 days into `daily/<day>.json` counts and
  deletes them; the portal merges those back for old ranges.
* `_redirects` 404s `/package*.json`, `/netlify/*`, `/tests/*`, `/tools/*`; robots.txt
  disallows /admin, /stats, /api/.

