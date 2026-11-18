# BADSCANDAL — badscandal.com

> **Start with `docs/HANDOFF.md`** (where we left off, what's in flight, what's next, and a prompt to paste into a
> new session). **Every push to `main` updates HANDOFF.md and STATUS.md in the same push** (Luke, 17 Nov 2026).
>
> **Read first (any Claude session, local or cloud):** `docs/WORKING-WITH-LUKE.md` (the rules and how a request
> goes: merge to main ONLY on Luke's "deploy"/"publish"; this repo is public, so no keys, money amounts, payer or
> account names, lyrics or private notes, not even in tests; test on Node 24 AND 22; end with a message for Nova),
> then `docs/STATUS.md` (where things stand) and `docs/HQ-ROADMAP.md` (the plan). Update both on every deploy.

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
the small wordmark + Plugin store (the Home link went on 11 Nov 2026). Wherever this file says "listen.html" below, read
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
portal's numbers. No dependencies needed to run it. **263 tests, all passing,
on branch `release-pipeline` (11 Nov 2026 evening; 153 on main before it).**
Since 9–11 Nov it also covers /hq's rules (`tests/hq-lib`, `hq-today`,
`hq-staff`: every `HQLib` function the page draws with, `bankLine` checked
case by case against the server's), the dashboard and feed, the staff desk
and its connector (`staff`, `mcp`: the handlers run against
`tests/fixtures/fake-blobs.mjs`), the release pipeline (`staff-releases`,
`staff-sightings`) and the Revolut reader (`bank`: a fake Enable Banking
with a throwaway key made in memory; no real bank is ever called). No test
reads this file. `tests/mcp.test.mjs`'s bank test seeds its own roster (Nova and Echo) since 18 Nov 2026,
so it no longer depends on the test before it. For the
pages, verify by:

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
* **Out (11 Nov 2026):** mode `"out"` keeps "Out now" (`.cd-date`) after the release week; KEEP `date`
  set. No "Released <date>" line on public pages (Luke: that wording is for /hq). At zero in `"upcoming"`
  mode LISTEN and the Out-now link go to the song's `spotifyTrack` from `/songs.json`, else to our own
  `/<slug>` (never just the artist profile); the card's song is matched by cover file, then title, then
  date; `body.upcoming` comes off. listen.js fetches `listen.json` + `songs.json` together.
* **"Out now" list** (`.outs` under the card): every song in `songs.json` whose day has come locally AND
  has `spotifyTrack`; rows link to `/<slug>` with `data-link="<slug>"`, so `js/count.js` records the tap.
  So pasting the track link into `songs.json` on release day also puts the song in this list.
* **Layout (11 Nov 2026):** phones (640px and narrower) size the cover from the viewport height
  (`100svh - 480px`, max 86%) so the button is on the first screen; if the card grows, retune that 480.
  Desktop (900px and wider) is two columns (`.rel-card` grid, `#latest` 960px). The cover sits in
  `.rel-art` (solid backing; keep the wrapper or the release-week light shows beside the cover).
* **Nav on home:** a small wordmark logo (`.nav-logo--mark`, hidden at 640px and narrower) + Plugin store
  + languages; no Home link any more. `.nav-logo` has a 44px tap area site-wide. "as of <Month YYYY>"
  and the footer clock weekday follow the page language.
* **`404.html` (11 Nov 2026):** branded not-found page, stand-alone, CSS-only film look, noindex, no
  counter; every URL in it must be absolute. Netlify serves it for unknown paths and for the `/404 404!`
  rules in `_redirects`.
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
* **A released song page stays exactly as /touchme looks: cover, title, the Spotify button.** No "Released"
  line on the public page (Luke, 11 Nov 2026: "it's perfect like that"; the released wording belongs in
  /hq, not here). Don't add one.
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
* **THE ONE DASHBOARD IS `/hq` (11 Nov 2026).** /admin's page (admin.html + js/admin.js) is GONE (in
  git history); `/admin`, `/admin.html`, `/stats` and `/stats.html` 301! to `/hq` (`_redirects`). The
  login is on /hq itself and uses the very same endpoint, password, cookie and lockout described here;
  every `/api/admin/*` endpoint is unchanged (plus `/api/admin/overview`, see the HQ entry below).
  Where this file says "/admin" for a feature, read "/hq" (Pages / Ads sections).
* **The login + `/api/admin/*`** (formerly the /admin portal). Password = Netlify env `ADMIN_KEY` (STATS_KEY still accepted) ->
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
* **BADSCANDAL HQ, `/hq` = the one dashboard (11 Nov 2026).** `hq.html` (stand-alone: no site.css /
  main.js) + `js/hq.js` + `js/hq-pages.js`. Sections, in Luke's order, with the sticky chip nav:
  **Today · Songs · Ads · Pages · Growth · Fans · Releases · Money · Team** (Releases is shown as
  **Upcoming** since 11 Nov 2026 evening; its id, `#releases` and the tests stay `releases`; Messages
  joined as a tenth tab).
  - **Login** on the page (`#login`): POST `/api/admin/login`, same password / cookie / 5-tries lockout.
    Any 401 from any answer shows it; "Log out" in the header.
  - **Three answers, asked at once, each section drawn as its own answer lands (Today first):**
    `/api/hq/data` (the sheet: Today, Growth, Fans, Releases, Money, Team, the combined cap),
    `/api/admin/overview?range=` (NEW, same cookie, read-only: every song's visits / people / real
    Spotify taps for the range, yesterday across all songs (people, taps, Meta spend, cost per tap),
    Meta spend + cost per tap per ad / day / song, the Meta-only cap, Meta events health, the key
    line) -> Today's "Yesterday" tile, Songs, Ads; and `/api/admin/data` (unchanged) -> Pages.
    Overview + Pages refresh every 60 s, the sheet every 5 min.
  - **Today:** the cap (short; details in Ads), Yesterday · all songs, next release, needs Luke,
    "Today's duties: X of Y done", the Meta key line.
  - **Songs:** one card per song joining the sheet (streams, listeners, saves, momentum, royalties)
    with our page (visits, people, real taps for the range) and Meta (spend, cost per tap). Songs
    without a page of ours say "no song page for this one".
  - **Ads:** ONE cap card (the combined Meta + Google + TikTok USD 1,000 cap from the sheet, "sheet
    says X" lines, and the Meta-only account detail under it; the old separate /admin cap card is
    gone), cost per tap by ad (with its song) / by song / by day, the Meta key line, Meta events
    health + "Meta: sending OK" line.
  - **Pages:** everything else /admin had, unchanged in behaviour: page picker, range chips (+
    custom), Humans only / Show everyone, KPIs, funnel, chart, sources, places, in-app browser,
    devices, came from, speed, Meta can see, Bots & you with "Don't count this device", visit log +
    CSV (`/api/admin/csv`). The range is SHARED with Songs and Ads (the selects there and the chips
    here are one setting, `bs_admin_view` in localStorage).
  - **Team:** "Today's duties" per bot from Tasks rows whose id starts with `D-` (today's = deadline
    today or no date; done / todo / blocked + the blocker; `dutiesReport()` in netlify/lib/hq.mjs).
    D- rows are NOT ordinary tasks (never "late", not in the open count).
  - **Sheet errors are visible:** `sheetErrors()` finds cells like #REF!, #N/A, #ERROR!, #VALUE! per
    tab; each affected section says "<Tab> can't be read: the sheet shows an error (#REF!)" (or "Part
    of the tab…" when some rows still read) instead of looking empty. Tab -> section map is
    `TAB_SECTIONS` in js/hq.js (Income/Spend/Royalties -> Money, Tasks -> Team + Today, …).
  - **Sample:** `/hq?sample=1` = made-up numbers in EVERY section under the SAMPLE banner: the sheet
    from `hq-sample.mjs` (incl. D- duties), the page side from `netlify/lib/admin-sample.mjs`
    (`sampleEnv()`: an in-memory stats store with invented visit keys in the real key format + an
    in-memory meta-cache answering every Meta read; `?sample=1` on data / csv / overview). The sample
    still needs the login and never opens a real store or calls Meta (tested).
  - The old `?next=/hq` hand-back from /admin is gone with /admin.
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
  - **The finished feed file is cached an hour** too (`meta-cache`, `feed/file/<name>/<since>_<until>
    .json`): meta-ads.csv re-reads up to two months of visit records, so a sheet refresh within the
    hour costs nothing. Only good files are kept, never an error.
  - Tests for the one dashboard: `tests/dashboard.test.mjs` (redirects, unchanged login + lockout,
    overview auth + people-only, sample never touching real stores or Meta, sheet errors, duties,
    the cached feed file).
* **/hq new look + Stage 1: shell and navigation (11 Nov 2026).** Luke's brief: modernise /hq in stages
  (Step 0 look -> Stage 1 shell -> Stage 2 Today briefing -> Stage 3 charts/tables/deeper views ->
  Stage 4 polish), one branch per stage, preview + screenshots each time, merge only on "publish".
  - **Look:** black base, bigger calmer type, NOTHING under 13 px (enforced by the `#shell` size floors
    at the end of hq.html's CSS; the stage-1 browser check measures every tab). ONE red from the red
    film: `--red-deep #8D060C` (fill, white text on it 8.7:1) and `--red #FF3B45` (text/dots on black
    5.8:1), used ONLY for "needs attention" and the active tab. Green (`--spot`) = Spotify taps only.
    The CRT wordmark (js/crt.js) small in the header (`.crt-hq`; static text under reduced motion;
    Archivo loaded subset to the letters of BADSCANDAL). `showShell()` fires a resize so the canvas
    measures itself after the login screen.
  - **Tabs:** `js/hq-shell.js`. Each section is a `.view`, one shown at a time, address `#today`,
    `#songs`, … plus `#songs/<slug>` (scrolls to that song's card, `id="song-<slug>"`); the back
    button works; last tab in localStorage `bs_hq_tab`. Phone: bottom bar Today, Songs, Ads, Money,
    More (More = a sheet with Pages, Growth, Fans, Upcoming (was "Releases", id `releases`), Team,
    Messages, Log out). Desktop (>=900 px): left rail with all ten + Log out.
  - **One date range** in the header (`#rangeSel`: Today, 7 days, 30 days, This month, Custom with
    two date fields). "This month" is a custom range (1st .. today, São Paulo) under the hood. Every
    tab follows it; the per-section pickers are gone. Remembered (`bs_admin_view`: range + page),
    and "Humans only / Show everyone" too (`bs_hq_bots`).
  - **Refresh:** the header button, and by itself every 5 minutes while the page is on screen (one
    timer in js/hq.js; coming back after longer refreshes at once).
  - **Data health** (header button with one dot; panel `#healthSheet`): Sheet (read N min ago / tab
    errors / not connected), Meta (the key line now lives ONLY here), Page counter (last visit), Exchange
    rate (this month's ECB average + age). Rules in `js/hq-lib.js` `healthRows()` / `healthState()`
    (pure, tested in tests/hq-lib.test.mjs). New fields for it: `/api/hq/data` -> `health: { sheetAt,
    fx: {month, rate, days, at} }`; `/api/admin/overview` -> `lastEventAt`. Nothing else changed in
    the endpoints (the phone-app summary is untouched).
  - **Loading / failing / offline:** placeholders (`.ph`) instead of blank cards; a failed answer shows
    `#netBar` with Retry; the last good answers are kept on this device (localStorage
    `bs_hq_last_sheet`, `bs_hq_last_ov`, `bs_hq_last_pages`, never in sample mode; the visit log is cut
    to 400 rows there) and shown "as of <time>" when offline.
  - **Home screen:** `hq.webmanifest` ("BADSCANDAL HQ", standalone, scope `/hq`), icons
    `assets/hq-icon-{180,192,512}-v1.png` (white HQ over the red bar), Apple meta tags, and
    `hq-sw.js` (registered with scope `/hq` only): keeps a copy of the /hq PAGE and its SCRIPTS so the
    app opens without signal; never `/api/*`, never anything outside /hq (tested in a sandbox).
    Bump its `CACHE` name if the list of files changes.
  - `js/hq-lib.js` is the home for every rule the page shows from now on (Stage 2/3 add theirs).
* **/hq Stage 2: Today as a morning briefing (11 Nov 2026).** Every rule is in `js/hq-lib.js` and tested
  in `tests/hq-today.test.mjs`; js/hq.js only draws (`drawBriefing()`, `drawSince()`).
  - **Briefing** (`briefing()`): 3–5 sentences: yesterday's spend / real taps / cost per tap (or taps and
    people when nothing was spent), what's left of the cap (or the warn/stop/over line), the next
    release with its late steps in short words (`shortStep()`), the song rising/cooling most, and how
    many things need Luke.
  - **Needs attention** (`attention()`), each item linking to its tab (Meta key items open Data health
    via `data-health`): cap at 750/900/over; late release steps (not yet out); sheet tabs showing an
    error; Meta key expired/failing; a bot quiet for 3+ days (2 is normal: Spotify's numbers are 2 days
    late) and blocked duties; an ad with USD 10+ spent over the last 7 finished days and 0 real taps;
    yesterday spend USD 10+ with 0 taps, or cost per tap above 2x the median of the 7 days before (needs
    3+ such days); the sheet's Meta spend disagreeing with Meta.
  - **Since you last looked** (`snapshot()` / `changesSince()`): a picture of the numbers saved on this
    device (`bs_hq_seen`) when a visit ends (page hidden / closed), compared on the next visit: streams
    logged per song, followers per platform, ad spend this month, new fans, late steps, duties done, a
    new day closed. Drawn once both answers are back. Sample mode fakes "9 h ago".
  - **Headline tiles** (`tiles()`): ad spend, real taps (green), cost per tap for the header range vs
    the period before; Spotify streams (7 days vs the 7 before) and listeners (vs 7 days earlier); and
    followers per platform (7 days). Small trend lines; days without taps are gaps, never 0. No Meta ->
    no spend tiles at all (never "USD 0").
  - **Copy today's summary** (`summaryText()`): plain text for WhatsApp (clipboard, with a fallback).
  - New `/api/admin/overview` fields for it: `prev` (the period before; taps/people for the same
    stretch when the range ends today, spend in whole days), `series` (per day: taps, people, spend),
    `recent` (last 8 finished days + `ads7`: every ad over the last 7 with its taps and song). One Meta
    read covers it (cached an hour). The sheet model gains `songs[].listenersSeries`.
  - The sample has a made-up ad "TM EU - clip 3" that spends and brings nobody, so the warnings show.
* **Glass, the release panel, the bots' live log (11 Nov 2026, Luke's follow-up on Stage 2).**
  - **Glass** ("like me and Lilian's app", i.e. LDashboard's Liquid Glass): frosted panels (`--glass`,
    blur 22px, a light top edge) over a fixed wash taken from the red film (`body::before`: faint
    #8D060C glows + a soft white one). Panels stay >= .62 opaque and dark so every number keeps its
    contrast; nested tiles get lighter glass WITHOUT a second blur (phones stay fast). The desktop rail
    floats as a glass capsule. Reduced transparency or no blur support -> near-solid panels, no wash.
    The wash is atmosphere only: red as a MEANING is still just "needs attention" and the active tab.
  - **Release panel** (`#detailSheet`, `openRelease()` in js/hq.js, rule `releaseDetail()` in
    js/hq-lib.js): Today's "Next release" card is a button, and every sheet release card (Upcoming tab) has "See what's
    missing ›". It lists what's missing first (late on top, "late by N days" / "due in N days", owner,
    due date, the sheet cell's note e.g. "blocked: not in Spotify for Artists yet"), then what's done.
    Bottom sheet on phones, centred dialog on desktop; Escape / scrim / ✕ close it and focus returns.
  - **Live updates** (brief `briefs/2026-11-11-live-updates.md` in badscandal-hq, pushed 11 Nov; also
    in its STAFF-MANUAL.md): a new HQ sheet tab `Updates` (time | bot | status | message | link;
    status done/working/blocked/error/info; append-only; Nova creates it). `liveReport()` in
    netlify/lib/hq.mjs -> `team.live` { ready, feed (newest 40), bots (last update each), lastAt }. The
    tab is read with its OWN request (a missing tab makes Google answer 400 for the whole batch): no
    tab -> `ready:false` and Team says so; nothing else breaks. Duty rows may carry a time in
    `deadline` ("YYYY-MM-DD HH:MM", Nova writes it at 08:05): `dutiesReport(tasks, today, nowHM)`
    marks a duty `late` once that São Paulo time has passed. Team -> Live: one card per bot (duty,
    state Done/Working/Blocked/Late/To do, latest update + age) and the latest 20 updates; Today ->
    Needs attention lists late duties; Data health gains a "Bots" row. The sheet cache is now 2
    minutes (was 10) so updates show quickly. The sample has made-up updates timed relative to now.
* **90-day rule:** `netlify/functions/rollup.mjs` (daily 06:00 UTC, production
  only) folds raw keys older than 90 days into `daily/<day>.json` counts and
  deletes them; the portal merges those back for old ranges.
* `_redirects` 404s `/package*.json`, `/netlify/*`, `/tests/*`, `/tools/*`; robots.txt
  disallows /admin, /hq, /stats, /api/.

## The staff desk + the bots' connector (/mcp) (11 Nov 2026)

Luke's bots (Nova, Alfred, Ledger, Sheet, Steve, Kevin, Laura, Atlas, Drop, Verse, Webmaster, Forge) are
his staff. Until now they only wrote rows into Google Sheets and /hq only read them. The staff desk is
what the team, Claude and Luke share ON THE SITE, kept in the Netlify Blob store `staff` (the site can't
write the sheets and shouldn't). Nothing here can touch ads, posts, sheets or money.

* **Files:** `netlify/lib/staff.mjs` (the desk: every rule, pure, store + clock passed in),
  `netlify/lib/mcp.mjs` (the connector's protocol), `netlify/lib/staff-tools.mjs` (its eighteen tools
  since the evening of 11 Nov 2026: twelve, + five for the release pipeline, + `sort_payment`),
  `netlify/lib/staff-sample.mjs` (made-up desk for `?sample=1` + `memoryDesk()`, the in-memory store the
  tests use), `netlify/lib/hq-load.mjs` (the sheet/Meta/FX loader, moved out of functions/hq.mjs so the
  connector and the check read the same picture), `netlify/functions/staff.mjs` (`/mcp`, `/api/staff/*`),
  `netlify/functions/staffcheck.mjs` (scheduled). Tests: `tests/staff.test.mjs`, `tests/mcp.test.mjs`
  (handler tests swap `@netlify/blobs` for `tests/fixtures/fake-blobs.mjs`), and since 11 Nov evening
  `tests/staff-releases.test.mjs`, `tests/staff-sightings.test.mjs`, `tests/bank.test.mjs`. The release
  pipeline and the Revolut reader have their own sections below.
* **What is on the desk** (one JSON document per key; every write to a shared document goes through
  `mutate()`: read with its etag, write only if unchanged, retry; so two bots writing in the same second
  both land): `upd/<SP day>.json` updates · `msg/<UTC month>.json` messages · `inc/<month>.json` payments ·
  `chk/<month>.json` "I checked this account" · `roster.json` · `sources.json` · `cards.json` ·
  `seen/<bot>.json` · `config.json` · `guide.json`; since 11 Nov evening also `releases.json` (the
  release pipeline), `sightings.json` (what Spotify for Artists shows as upcoming) and `read/<name>.json`
  (the read markers, below). Deploy previews use their own throwaway store.
* **Who is calling:** Luke = the /hq login cookie (POSTs must come from our own origin). The bots =
  Netlify env `STAFF_BOT_KEY`: ONE key for the whole team, because the bots' app ("Grok Bot": Add a custom
  connector, Remote HTTPS, one HTTP header) shares one connector between all bots; so every call names
  its bot in the `bot` argument, checked against the roster (`whoIs()`). Claude = `STAFF_CLAUDE_KEY`,
  always acts as "Claude". Keys travel ONLY in `Authorization: Bearer …` (a bare key is accepted too),
  compared in constant time (`keyOk`), never logged, never in a URL. Both keys are also in the Mac's
  Keychain (`badscandal-staff-bots-key`, `badscandal-staff-claude-key`). Luke can switch the bots' key
  off at once from /hq (`config.json` `botsOn`), no Netlify needed. The bots' key opens `/mcp` only.
* **The connector, `POST /mcp`:** a hand-written Model Context Protocol server, no library, no session,
  no streaming: every answer is one JSON body. It answers the legacy handshake (2024-11-05 .. 2025-11-25:
  `initialize`, 202 for notifications, `ping`, `tools/list`, `tools/call`) AND the 2026-07-28 revision (no
  handshake, `server/discover`, version in `params._meta` + the `MCP-Protocol-Version` header,
  `resultType` on results). GET/DELETE 405, OPTIONS 204, a foreign `Origin` 403, no key 401 with
  `WWW-Authenticate: Bearer` (and the `/.well-known/oauth-*` paths stay 404 so clients don't try OAuth).
  A failure the bot can fix (wrong name, no amount) is a tool RESULT with `isError`, in a sentence that
  says what to do; only an unknown tool is a protocol error. Checked with the official inspector client:
  `npx @modelcontextprotocol/inspector --cli <url> --transport http --header "Authorization: Bearer …"
  --method tools/list`.
* **The tools (eighteen; the first twelve from the morning of 11 Nov 2026):** `my_day` (start of every
  run; since 11 Nov evening it also hands over `messages_for_you`, see "Read" below, and `release_steps`)
  · `post_update` (working/done/blocked/error/info;
  a `done` or `blocked` also finishes/blocks today's duty on /hq) · `send_message` / `read_messages` /
  `resolve_message` · `submit_income` (ONE payment per call; idempotent by account+reference, else
  date+payer+amount+currency; pending -> received updates in place; `transfer` is never income) ·
  `income_check` ("I looked at Wise today, 0 new": tells "nothing came in" from "nobody looked") ·
  `income_status` · `team_board` · `luke_briefing` (for Alfred's 10:00 message) · `set_my_card` ·
  `read_guide` · then `releases`, `release_pack`, `release_step`, `release_fill`, `spotify_upcoming` (the
  release pipeline section), `sort_payment` (the Revolut section), `task_update` and `record_luke_answer`
  (14 Nov 2026, below). Descriptions are written for bots that follow instructions literally.
  `tests/mcp.test.mjs` asserts the count (47 since 18 Nov 2026) in several places.
* **Guard rails in `staff.mjs`:** names only from the roster; every text cleaned and cut; links only
  `https://`; `secretIn()` refuses passwords, login codes, API keys, private keys, IBANs and card numbers
  (it must NOT refuse ISRCs, UPCs, 15-digit ad account ids or "token: expired": tested); an amount that
  can't be read is refused, never 0; currency = the three-letter code as paid, never converted; only
  Luke can settle a decision that waits on Luke.
* **Luke's reply settles what waits on him (11 Nov 2026, Luke: "when i reply to a message right now
  nothing happens").** In `sendMessage`, a message from Luke with `re` settles the message it answers
  whatever it needed (`resolved: {by:"Luke", note: <his pick> || "answered"}`); for everyone else only a
  `needs: reply` is settled by an answer. The answer is SAVED FIRST and the question closed in a second
  write (a full board must never close the question and lose the answer); the result carries `settled`.
  The page answers the message itself (`re: m.id`, never the thread's root) and a thread's Reply button
  answers the newest open question to Luke from that person (`HQLib.answerTarget`).
* **"Read", not "active" (11 Nov 2026, Luke: "i want to know when i've replied to a message and that
  reply has been read").** `read/<name>.json` {at} is written ONLY by what hands a reader its messages:
  `my_day`, `read_messages`, `luke_briefing` for Alfred, and `GET /api/staff/board` with Claude's key
  (`touchRead`; the old marker is read first with `lastRead`). `my_day` (bots and Claude) and Alfred's
  `luke_briefing` hand over `messages_for_you` = `S.messagesFor()`: everything to the reader, to all, or
  answering one of its own since its last read, newest 30, plus `more_messages` when more did not fit.
  `seen/<name>.json` stays "last used the desk". Every board message carries `seen`/`seenAt` from the
  read markers (`seenBy`; null for "all", Luke, HQ); a note to all carries `read: {by, of, names}`
  (`readCount`, the roster bots minus the sender). The page says "Read by Nova 17:10" / "Not read yet" /
  "Read by 7 of 12", never "Seen by". The markers started empty on deploy, so older messages read "Not
  read yet" until each bot's next `my_day`. Known gap: `read_messages` moves the marker while returning
  at most `limit` (20) messages.
* **How it meets the sheet:** `hqModel(sheets, today, fx, meta, nowHM, staff)`: the connector's updates
  and the sheet's `Updates` tab are ONE live log (`mergeUpdates`, no doubles), and `dutiesReport(…,
  overlay)` lets a connector `done`/`blocked` finish or block a `D-` duty the sheet still shows as to do
  (the sheet's `done` always wins; a bot with two duties must name the duty id; yesterday's word doesn't
  count). The Tasks tab stays Nova's; there is no second task board (a message with `needs: action` is
  the light version).
* **The site's own check** (`staffcheck.mjs`, three times a day since 11 Nov 2026: `35 0,12,18 * * *` UTC =
  09:35, 15:35 and 21:35 São Paulo, production only): `checkReport()` = facts only (duties done/late/blocked,
  bots that said nothing, bots that never connected, accounts not checked, overdue/blocked sources, new
  payers, payments nobody has sorted, messages nobody answered, the sheet, the Meta key, the cap, the next
  release, and the release pipeline's late/blocked steps, warnings and Spotify for Artists questions)
  posted as ONE message from "HQ" to Luke. Its title says morning / afternoon / evening (`dayPart()`:
  before 13:00 / before 19:00 / after). The text is at most 1500 characters cut by WHOLE lines
  (`reportText()`: "+N more on /hq", never mid-word). Alfred reads it through `luke_briefing`; Claude
  reads it on its own three rounds (09:40 / 15:40 / 21:40, five minutes after each check; a local launchd
  job on Luke's Mac, `com.badscandal.claude-rounds`, running `~/.badscandal-hq/claude-rounds.sh`, Claude
  Code with ONLY the desk's tools allowed).
* **`/api/staff/*`** (cookie = Luke, or Claude's key): `GET board` (everything /hq draws: `board()`),
  `POST message`, `POST resolve`, `POST config {botsOn}` (Luke only), `PUT seed {roster, sources, guide}`
  (the private roster notes, the list of income sources and the bots' guide live in the PRIVATE repo
  badscandal-hq under `staff-desk/` and are loaded onto the desk; this public repo carries only the
  built-in job cards in `DEFAULT_ROSTER` and made-up sample data). `?sample=1` = the made-up desk, needs
  the login, never opens a store, never writes. Since 11 Nov evening also `POST sort` and the
  `release*` / `sighting` routes (listed in their sections below). Claude's key reading `GET board`
  marks Claude's messages read. A `StaffError` answers 400 with its sentence (404 `not_found`, 503 `busy`).
* **/hq screens for the desk (11 Nov 2026):** `js/hq-staff.js` (loaded after js/hq.js, before
  js/hq-shell.js; `window.HQStaff`: `reload`, `clear`, `drawWorkers`, `board`, `problem`) holds the page's
  ONLY writes: Luke's messages / answers / "mark as done" (`POST /api/staff/message|resolve`) and the bots'
  key switch (`POST /api/staff/config`), all through `HQ.postJSON`, all switched off in `?sample=1`. The
  page still cannot change ads, posts, sheets or money.
  - **Team = the workers section:** a connector strip (on/off, how many bots have used it, last used, the
    "Switch the bots' key off" button with an inline confirm), then ONE CARD PER BOT ON THE ROSTER (also
    bots with no duty): one state pill (Blocked / Late / Quiet today / To do / Working / Done / No duty
    today / Paused), today's duties with their times, the latest update and its age, "Working on" /
    "Needs" from the bot's card, counts, "Last used the connector …", "Copy message for Nova" on blocked
    or late cards, and a "Why this bot" disclosure (why, daily times, what it writes, access, blockers).
    Deep link `#team/<bot lowercase>`. Then the merged live log, Open tasks, Tasks per person.
  - **Messages** (tenth tab, `#messages`, in the rail and the More sheet, AFTER the nine pinned by
    tests/dashboard.test.mjs; since 11 Nov evening an answer visibly lands: the button says "Sending…",
    the item leaves "Waiting on you" at once and a line takes its place for 10 minutes, "Sent to Kevin at
    17:42." (Claude's adds "Claude reads the desk at 09:40, 15:40 and 21:40.", `HQLib.CLAUDE_ROUNDS`); a
    "You answered" block lists `board.answered` (`answeredByLuke`: the last 10 in 48 h) with "Sent 17:03 ·
    Read by Ledger 17:10"; every message carries the Read mark; a reply that went out but didn't close
    the question says so in place): "Waiting on you" on top (a decision's options ask "Send this answer?"
    inline before sending: a mis-tap can't be undone; Reply; Mark as done), a compose box (To / What you
    need / text, 16px so iOS doesn't zoom, the draft is kept if sending fails), then the board as threads;
    the site's check is a calmer card that folds after 8 lines. Count badge on the nav item, red dot on
    the phone's More button. Deep link `#messages/<id>`.
  - **Today:** "Needs attention" gains messages waiting on Luke, income problems (3, then "+N more") and
    "the connector is switched off" (`HQLib.staffAttention`); one "Site check 09:35: 3 things to look at ›"
    line; "Needs you" is now "Your tasks".
  - **Money → "Money coming in"** above the monthly tables: account tiles, received / pending per
    currency (never added across currencies), problems, "Where money comes from", latest payments.
    Since 11 Nov evening: the Revolut tile and "To sort" (the Revolut section below).
  - **Data health:** Connector and Site check rows (`HQLib.staffHealth`; since the check runs three times
    a day a check older than 14 h is red, it was 26 h), and a Revolut row (`HQLib.bankHealth`).
  - New `HQLib` rules (all tested in tests/hq-staff.test.mjs): `workerLabel`, `sortWorkers`, `workerView`,
    `dutyWhen`, `workerCounts`, `seenLine`, `connectorLine`, `novaMessage`, `liveFeed`, `spWhen`,
    `waitLabel`, `needWords`, `reportParts`, `siteCheckLine`, `composeNames`, `threadRoot`,
    `staffAttention`, `staffHealth`, `curList`, `cadenceWord`, `accountLine`, `sourceState`, `payLine`,
    `incomeEmpty`, `incomeProblems`. `attention()` takes `o.board`; `healthRows()` adds the two rows only
    when a board is passed. New `window.HQ` members: `postJSON`, `copyText`, `link`, `stack`, `drawFeed`,
    `sheet()`, `boardChanged()`.
  - localStorage `bs_hq_last_staff` (never in sample mode); logout now clears every `bs_hq_last_*` and
    `bs_hq_seen`. `hq-sw.js`: `CACHE` is `bs-hq-v2`, `SHELL` includes `/js/hq-staff.js`.
  - Fixed on the way: a blank black page when the first answers failed; an older date range's answer
    overwriting a newer one; deep links not scrolling (no smooth scroll any more); desktop lines running
    1,500 px (`main` capped at 1180px); text reading through the header and phone bar (.96 opaque); bare
    tables (now in glass tiles); developer wording on Luke's page.
  - A board that fails never breaks the page: Team falls back to what the sheet gives, Messages says so
    with Retry.
  - **Released, said in /hq (Luke, 11 Nov 2026):** a song that is out carries a "Released" pill on its
    Songs card and a row "Released | Fri 30 Oct · 12 days ago" (before release: "Out in 13 days" /
    "Release day"); its release card said "Released" instead of "On time" / "N late" and "Released N days
    ago" (since the v2 pipeline a song whose day has come leaves the Upcoming tab for Songs, with one
    quiet "Out: …" line). Rule: `HQLib.releaseWords(date, today)` (the sheet's release date, else our song
    page's date).
    The PUBLIC song page never says Released: it stays cover, title, Spotify button.
* **Not served any more:** `/CLAUDE.md`, `/HANDOFF-README.md`, `/README.txt`, `/README-STORE.txt` now
  404 (`_redirects`): this file was readable at badscandal.com/CLAUDE.md. The repo itself is still public,
  so nothing private goes in here.
* **Also fixed while moving the loader:** a past month's exchange rate cached mid-month is re-read once
  the month has ended; a failed sheet read that falls back to the cached copy now says so
  (`staleBecause`).

## The release pipeline (11 Nov 2026)

Luke, 11 Nov: "when a new song is ready we want all the info every bot needs, high quality wav link,
artwork, lyrics, information for routenote everything, and that they auto schedule it and everything and
the pitch is handled later". The evening (v2): "the song pipeline can include releases … say where we're
at" · "it says spotify pitch sent [late] but it didn't get sent because the song hasn't shown in spotify
for artists yet" · "if it's self release or released with label; for instance touch me: [the label] own
50% of that" · "the word releases should be changed to upcoming" · "warnings about lateness on upcoming
releases" · "flag ones that haven't gone through the pipeline and ask me what it is". Built on branch
`release-pipeline` (specs v1 + v2 and two review rounds each; NOT merged, NOT deployed as of 11 Nov).
All the rules are pure functions in `netlify/lib/staff.mjs` (store + clock passed in), tested in
`tests/staff-releases.test.mjs` and `tests/staff-sightings.test.mjs` with `memoryDesk()`.

* **The release document:** `releases.json` on the desk (array, newest first, at most 60, written only
  through `mutate()`): `{ id, title, date, status, createdAt, createdBy, updatedAt, sentAt, tight,
  alreadyOut?, sentWithout?, pack: {…}, steps: [{ key, label, owner, due, status, note, link, at, by }],
  log: [{ at, by, what }] }`. `status` = `draft` (Luke still filling) | `scheduled` (sent; steps dated) |
  `cancelled`. "Released" is NEVER stored: scheduled + date <= today. `id` = `releaseId(title)` (the
  `songKey`: accents, case, spaces, signs out; "Me Dá Seu Body" -> `medaseubody`; a title with no Latin
  letter gets `"r" + base36 time`); a rename keeps the id. The log keeps the last 30 lines (it drops,
  never refuses); 60 releases refuse, and `removeRelease` takes off a cancelled one or one out more than
  90 days (no button on /hq: Luke asks Claude).
* **`PACK_FIELDS` is THE single list** of what a bot needs (the /hq form, the `missing` list, the refusal
  sentence and the connector's tools are all built from it; add a field in ONE place). Each field
  `{ key, label, short, kind: link|line|text|choice, group, required, requiredWhen, showWhen, neededBy,
  choices, hint, fill, max }`. Groups (the form's order): `deal` (kind, label, split, distributor, deal)
  · `files` (wav, artwork, folder) · `stores` (language, explicit, genre, subgenre, version, writers,
  producers, featuring, copyright) · `lyrics` · `pitch` (mood, instruments, story: "can wait") · `later`
  (isrc, upc, storeStatus, spotifyTrack, video, page: the team's) · `notes`.
  - `required`: kind, wav, artwork, language, explicit, genre, writers. `requiredWhen {field, equals}`:
    label and split only "With a label"; copyright only for a Self-release (it also has `neededBy:
    "upload"`, and `showWhen: null` so the form shows it whatever the kind). `requiredNow(f, pack)`.
  - `neededBy` = a step that needs it: shown as missing (with that step, its owner and due date) but not
    needed to send. lyrics -> `lyrics`; mood / instruments / story -> `pitch`. `video` is Laura's RESULT,
    not her input: no neededBy (review: it made her block every release).
  - `fill` = which bots may fill it through the connector: isrc/upc/storeStatus Drop; spotifyTrack Atlas
    or Webmaster; video Laura; page Webmaster. Nova may fill whatever any bot may; Luke and Claude fill
    everything. NOBODY but Luke and Claude fills the lyrics (`fill: []`).
  - Every value goes through `packValue()`: `clean`/`cleanText`, links https only (refused with a
    sentence), choices matched, then `packSecrets()` line by line (the refusal quotes the field and line
    number with the digits hidden). `FIELD` / `STEP` are null-prototype maps ("constructor" is unknown).
* **`RELEASE_STEPS` (ten), dated back from the release day** (`scheduleSteps(date, today, o)`):
  `upload` Uploaded to RouteNote with the release date (Drop, 21) · `approved` Approved by RouteNote
  (Drop, 16) · `spotify` Showing as upcoming in Spotify for Artists (Atlas, 15) · `pitch` Spotify pitch
  sent (Atlas, 14, `after: "spotify"`) · `lyrics` Lyrics live (Verse, 10) · `page` Song page live (Webmaster,
  7) · `video` Video scheduled on YouTube (Laura, 7) · `teasers` Teaser clips approved for posting (Luke, 3)
  · `ads` Ad drafts ready, inside the cap (Forge, 1) · `live` Release day: Spotify link on the song page
  and the home card (Webmaster, 0).
  - A due date already past becomes TODAY: a release sent late is compressed, never born late; `tight`
    = sent fewer than 21 days out (recomputed by `moveRelease`).
  - Step `status`: `STEP_STATUS` = todo | working | done | blocked | skipped. **Waiting**: a step whose
    `after` step isn't done or skipped (the pitch before the song shows in Spotify for Artists) has
    `waiting: true`, `waitingText` "waiting: the song is not in Spotify for Artists yet", is NEVER late,
    and the moment it is freed its due date is no earlier than today (`freeWaiting`). **Skipped**: a step
    that doesn't apply, with a note (`LABEL_NOTE` "The label delivers this one", `OUT_NOTE` "Already out
    when it was recorded", `PITCHED_NOTE` "The pitch was sent before this step existed"): never late,
    never open, not counted in `total`. Only Luke, Claude and Nova skip, always with a note.
  - A release sent before the spotify step existed gets it when Luke moves its date (skipped if its
    pitch already went out); it has no `after`, so its pitch never waits.
* **The operations and who may call them** (all in staff.mjs):
  - `saveRelease` (Luke/Claude): start a draft or change one; `pack` = only the keys being set, `""`
    clears one; unknown keys refused by name; a title clashing with another live release refused; the
    date of a SCHEDULED release can't change here ("use Change the date"); a deal change on a sent
    release re-applies the deal (`applyDeal`) and tells Drop ONCE from "HQ" (`dealNews`, needs action).
  - `sendRelease` (Luke/Claude): refuses with "Still missing: … Fill them in, then send again. Or send
    anyway: …" + `missing` keys + `canSendAnyway`; `anyway: true` sends with required fields missing
    (kept as `sentWithout`), never without a release day. Sets the steps, logs, and posts ONE note from
    "HQ" to all ("New release from Luke: …"). Sending twice does nothing. A release already showing in
    Atlas's last report gets its spotify step done at once, in Atlas's name.
  - `moveRelease` (Luke/Claude): open steps get new dates, done ones keep theirs; ONE note to all naming
    any step already done with the old date outside the desk (upload, video, page, live).
  - `cancelRelease` (Luke/Claude; the team is told only if it was sent) · `removeRelease` (Luke/Claude).
  - `fillRelease` (a bot fills ONE field it may fill; the refusal says who can).
  - `setStep` (the step's owner, Nova, Claude or Luke): blocked and skipped need a note; ONLY Luke marks
    his own step (teasers) done or skipped (his approval of public posts; Claude is refused too); no bot,
    Nova included, marks a WAITING step done (Luke and Claude may record what they know). A bot's mark
    also writes a live-log line through `postUpdate(…, {release: id})`, which `dutyOverlay` ignores (a
    release step never finishes a daily duty).
  - `releaseView(r, today, {sightings})` adds `dateWords`, `daysToGo`, `released`, `deal`, `missing`
    (required first), `packFilled`/`packTotal` (the deal and "later" groups not counted: "N of 17"),
    each step's `late`/`dueIn`/`waiting`/`skipped`, `counts {done, total, late, blocked, skipped,
    waiting}`, `next` (the first open step someone can work on now), `warnings`, `where`.
    `releaseActive(v)` = scheduled, not alreadyOut, not out for more than 14 days.
* **The deal: self-release or with a label** (group `deal`, first on the form under "Whose release is
  it"): `LABEL_KIND` "With a label" / `SELF_KIND` "Self-release". `distributorOf(pack)`: the pack's value,
  else `SELF_DISTRIBUTOR` (RouteNote + the account name) for a self-release, else the label's name.
  `labelDelivers(pack)` = a label release whose distributor isn't RouteNote: `upload` and `approved` are
  born `skipped`. `dealOf(r)` -> `{ kind, label, split, distributor, id }` (kind "" = a desk record from
  before the deal was asked). **Already out:** a release day in the past is allowed; sending it records the
  song for its deal only (every step skipped, no dates, nobody told; only the deal fields needed); a
  draft whose day has passed is recorded this way when sent (`where` says so first).
* **Spotify for Artists reports** (`sightings.json`): `{ at, sp, by, note, list: [{ key, title, date,
  shownAs, firstSeen }], answers: { <key>: { answer, label, id?, note, by, at, msg } } }`. key =
  `sightKey(title, date)` (songKey, or `"t"` + an FNV hash for a title with no Latin letter, so keys stay
  ASCII). Each report REPLACES the list (at most 20; `firstSeen` kept); answers kept 180 days, newest 200.
  - Reporters: `SIGHT_REPORTERS` Atlas, Nova (for him), Claude. An EMPTY list is a real report ("I looked;
    nothing is upcoming"); a bot that could not open Spotify for Artists must NOT report (post blocked).
  - Matching (`sightMatch`): the same song (`sameSong`: songKeys equal; titles with no Latin letter by
    their own words; empty never matches), not cancelled, not recorded-after-it-came-out, release day
    within ONE day of the date shown (a dateless draft matches on title), or the release Luke named
    ("It is …"). `sightNear` offers that fifth answer: the same song under a longer/shorter title, the same
    title on another day, else the ONE live not-yet-out release on that day.
  - A report that lists a song in the pipeline marks its spotify step done, once, by the reporter, with
    "Showing in Spotify for Artists [as "<title shown>"] since <day>"; the pitch opens.
  - `sightingsView(doc, releases, today, now)`: each item `state` pipeline | unknown | answered | retry,
    a `question` for unknown ones, `near`, plus `never`, `stale` (> 48 h), `unknown`, `retry`,
    `waitingOnLuke` (= unknown + retry), `choices`.
  - **The five answers** (`answerSighting`, Luke ONLY): `self` and `label` (asks the label's name) start a
    DRAFT in "In the pipeline" with the kind filled; `notmine` ("Not mine, or on the wrong account") and
    `mistake` record the answer and send ONE message from Luke to Nova, needs action ("'<title>' is
    upcoming in our Spotify for Artists for <day> (shown as: …). Luke says: … Find out who delivered it
    and from which account, say what has to be done, and report back on the desk."); `it` + `id` ("It is
    <song>") marks that release's spotify step done in Luke's name. The message to Nova is CLAIMED
    (`msg: "sending:<iso>"`) in the same write that records the answer, so two taps send it once; a
    claim older than a minute counts as failed, and a message that never went shows "Send it to Nova
    again" (state `retry`).
* **Warnings** (`warningsOf(v, sightings, today)` -> `[{kind, text}]`, most urgent first;
  `releaseWarnings` = the sentences; only on scheduled, not-already-out releases with a date). Kinds:
  `today` "Out today and the Spotify link is not on the song page yet" · `blocked` "<label> is blocked
  (<owner>): <note>" · `twice` "A label release, but <upload> is working/done (Drop): one song must not
  be delivered twice" · `late` "<label> is N days late (<owner>)" · `pitch` "Too late for a Spotify pitch:
  Spotify needs it 7 days before release" · `spotify` "Not showing in Spotify for Artists yet, N days
  before release: the pitch cannot be sent until it does" (14 days or fewer, pitch not done; no "until it
  does" once the pitch is too late) · `date` "Spotify for Artists shows <day>, the pack says <day>" ·
  `soon` "<fields> are missing and <step> is due <day>" (a step due within 3 days, not waiting) ·
  `without` "Sent without …: fill it in under Edit the details" (only from `sentWithout`) · `unrecorded`
  "Not recorded yet: self-release or label" (older releases; kept OUT of the site check) · `split` "A
  label release with no split recorded" · `tight` "Sent N days before release: the usual 21 days for the
  stores could not be kept". **`where`** (`whereWords`) is the one line "where it is at": "4 of 10 steps
  done · next: Lyrics live, Verse, Fri 14 Nov" (blocked before late; "waiting: not in Spotify for Artists
  yet"), "In the pipeline: 9 of 17 filled · still missing: …", "Already out (…): recorded for its deal",
  "Out since …".
* **The site check** (`checkReport`): per active release one line per blocked step, ONE line for its late
  steps ("Song: 3 steps late: upload (Drop, due …), …"; a late step a warning already explains is not
  repeated), the warnings of kind today/twice/pitch/spotify/date/without/split, and the `soon` fields; then
  one line per unknown song in Spotify for Artists ("… Luke has to say what it is") and one when Atlas's
  report is missing or older than 48 h while something is coming. A desk release's "Next release" line
  says "(listed above)" instead of repeating its steps.
* **The board's slim copy:** `board().releases` = `releaseOrder()` (coming soonest first, then out newest
  first, cancelled last), 20 at most, each through `slimRelease()`: no lyrics (`lyricsChars` instead), `log:
  []` + `logCount`, `slim: true` (20 releases with full lyrics made the board 235 KB, saved to localStorage
  on every refresh). `GET /api/staff/release?id=` returns ONE whole release (works with `?sample=1`): the
  page loads it before showing the details or opening a form, so a save can't wipe the lyrics. The board
  also carries `packFields` (`packFieldsOut()`), `releaseSteps` (`releaseStepsOut()`), `sightings`
  (`sightingsView`) and `answered`. `loadDesk` still reads all of releases.json on every tool call.
* **Desk releases meet the sheet's** (`netlify/lib/hq.mjs` `mergeReleases(sheetReleases, deskReleases,
  today, sightings, now)`, called in `hqModel`; `hq-load.mjs` `staffSide()` passes every non-cancelled
  `releaseView`, Atlas's report and `now`): a scheduled desk release is mapped to the sheet's shape `{ song,
  slug, date, status, daysToGo, weekday, steps: [{label, owner, due, done, late, note, skipped?, waiting?}],
  late, notes }` + `desk: true, id, missing, tight, deal, warnings, where`, so Today, the release panel,
  attention and the briefing work unchanged. A song in both (`sameSong`) is ONE entry: the desk's steps
  and dates, the sheet's status text; each desk release keeps its own slot by id. Skipped counts as done;
  waiting is never late. `songs[].deal` = the desk release of the same name (a sent one before a draft),
  null when the desk has none; the song's release date is the desk's first, then the sheet's.
  **The sheet-only pitch rule:** a sheet row's late "Spotify pitch sent" reads "waiting: not in Spotify for
  Artists yet" ONLY while a report exists, is under 48 h old, doesn't list the song (same title within a
  day) and the song is not out yet; with no report, an old one, or the song out, late is late.
* **The connector** (`netlify/lib/staff-tools.mjs`): `releases` (every active release + Claude sees
  drafts: where, deal, warnings, missing, YOUR steps, `all_steps` for Nova and Claude,
  `spotify_for_artists: {reported_at, stale?, unknown, waiting_on_luke}`) · `release_pack` (the whole pack
  with each field's state and who fills it, every step) · `release_step` (working/done/blocked/todo,
  skipped for Nova and Claude only; the description says what "done" means and that the spotify step is done by the
  report, not by this tool) · `release_fill` (its `field` enum lists only bot-fillable fields) ·
  `spotify_upcoming` (the report; returns in_the_pipeline / not_in_the_pipeline / answered_by_luke /
  steps_done). `my_day` gains `release_steps` (state words: to do, working, late, blocked, waiting,
  skipped; the spotify step carries `how`), and its `next` sentence names the soonest step you can work on
  (or tells Atlas to report); Claude's `my_day` gains `releases` lines and `unknown_in_spotify`.
  `team_board` gains `releases` (done/total, late, blocked, `late_steps`, warnings) and
  `spotify_for_artists`. `luke_briefing` gains `unknown_in_spotify`, and its `next_release` uses the merged
  list; with the sheet unread it gives the desk's next release with `source: "the desk only: …"`, or "not
  read", and says "none planned" only when the sheet WAS read. `INSTRUCTIONS` has a line about releases and
  one telling Atlas to report every day (Spotify for Artists -> Music -> Upcoming, after his Songs rows;
  the routine is spelled out in the bots' guide, private repo badscandal-hq `staff-desk/GUIDE.md`, loaded
  with `PUT seed`).
* **`/api/staff` routes added** (Luke's cookie or Claude's key; bots 403; `?sample=1` never writes):
  `POST release` {id?, title, date, pack} · `POST release/send` {id, anyway?} -> `{ok, release, already,
  told, alreadyOut, sentWithout}` · `POST release/date` {id, date} · `POST release/cancel` {id} · `POST
  release/remove` {id} · `POST release/step` {id, step, status, note, link} · `GET release?id=` · `POST
  sighting` {key, answer, label?, note?, id?} (Luke ONLY: Claude's key gets 403). Every answer carries
  `release: releaseView`; a refusal is 400 `{error}` in a plain sentence (an unknown release id on a
  POST is 400, not 404; `GET release?id=` and a song no longer in the report are 404).
* **The page** (`hq.html`, `js/hq-staff.js` `drawReleases`, rules in `js/hq-lib.js`):
  - **Upcoming** (the tab once called Releases; id `releases`) in three parts: **In the pipeline**
    (`#relPipe`: "New song" + the drafts: whose release, "N of 17 filled", what's missing, "Finish and
    send", "Cancel the draft") · **Upcoming** (`#relDesk`, then the sheet-only cards `#relList` via
    `HQ.sheetReleaseCard` for songs the desk doesn't have: the `where` line, a red warnings box, the steps,
    "See the files and details"; the pill counts warnings) · **In Spotify for Artists** (`#relSpot`, deep
    link `#releases/spotify`: when Atlas looked, each unknown song as a question with the four answers plus
    "It is <song>" when `near`, inline confirms, answered ones listed quietly). A song whose day has come
    leaves Upcoming (`#relOut`: "Out: Touch Me (30 Oct). See Songs", 6 at most), except one out at most 14
    days with a step still open ("Out, with a step still open"); cancelled ones fold.
  - **The form** is built from `board.packFields` (`HQLib.formGroups`, `fieldShown`, `fieldRequired`,
    `needWord`): "Whose release is it" first (label and split appear and are "needed to send" only with a
    label), inputs 16px, 44px targets; "later" fields read-only until "Change these yourself". A past day
    switches the button to "Record it as already out" (`sendButton`). "Send to the team" saves first, then
    asks inline ("Send X to the team for Fri 11 Dec? Every bot gets its steps and dates."); a refusal shows
    the server's sentence, marks the fields, and offers "Send anyway" / "Not yet" (never without a day).
    The page never says "pack": "Files and details", "Edit the details".
  - **Steps:** state in words (`stepState`: "Done 12 Nov by Drop", "Late by 2 days", "Blocked: …",
    "waiting: the song is not in Spotify for Artists yet" never red, "not ours: the label delivers it");
    Luke's own step has "Mark as done", others a small "Mark done" / "Reopen" (`stepButton`: none on a
    waiting or skipped step, and they stay after release day). "Change the date" asks "Move X from … to
    …? Every step that isn't done moves with it, and the team is told."
  - **Songs** says whose song it is under each title (`dealWords`, `songDeal`: "Self-release" or "With
    <label> · <split>"), or "Not recorded yet: self-release or label?" with "Add its details"
    (`HQStaff.addDetails`, opens the form in Upcoming with the title and day). Songs redraw when the board
    arrives.
  - **Team** cards list each bot's "Release steps"; "Copy message for Nova" adds the late/blocked ones.
    **Today**'s Needs attention lists release warnings ("<title>: <warning>", 4 then "+N more", linking to
    `#releases/<id>`, right after the cap; `releaseAttention`) and the Spotify question with the messages
    in the first group; desk releases' bare late steps are not listed twice.
  - **localStorage:** `bs_hq_last_relform:<id|new>` (`HQLib.formKey`: one unsaved form per release, never
    in sample mode; logout's `bs_hq_last_*` sweep clears it). `hq-sw.js` unchanged (no new file).
  - **New `HQLib` functions:** `spStampOf`, `seenWords`, `sentLine`, `answeredList`, `CLAUDE_ROUNDS`,
    `answerTarget`, `formGroups`, `releaseDayNote`, `releaseWhen`, `stepState`, `stepButton`, `formKey`,
    `missingWords`, `packLine`, `missingSentence`, `canSendAnyway`, `packChanges`, `fillWho`, `relPill`,
    `releaseLists`, `stepsSummary`, `sendQuestion`, `sendButton`, `moveQuestion`, `cancelQuestion`,
    `titleKey`, `outLine`, `dealWords`, `songDeal`, `fieldShown`, `fieldRequired`, `needWord`,
    `upcomingPill`, `whereLine`, `releaseAttention`, `sentNote`, `sightingsHead`, `sightRow`,
    `sightQuestion`, `sightConfirm`, `sightDone`; changed: `shortStep` (the ten labels), `novaMessage`,
    `staffHealth`, `staffAttention`, `attention`, `releaseDetail`. New `window.HQ`: `sheetReleaseCard`,
    `releasesBroken`; `window.HQStaff`: `drawReleases`, `addDetails`. Tests in `tests/hq-staff.test.mjs`
    (`missingSentence` is checked against the server's own refusal through `S.sendRelease`).
  - **Sample** (`staff-sample.mjs` `sampleReleases()` / `sampleSightings()`, all made up, links on
    example.com): Survivors (a draft), Me Dá Seu Body (self-release 13 days out with a blocked step, no
    lyrics, a waiting pitch), Slow Burn (an invented label release the label delivers, in the report), Touch
    Me (out 12 days ago, with an invented deal), and an unknown "Velvet Night" in the report.
* **Rules paid for in review (11 Nov 2026):** the reply is saved BEFORE the question is closed, and a
  failed close never throws (the sender would send twice) · the page answers the message itself, never the
  thread's root (it closed an unrelated request) · only Luke marks his own step done (Nova could "approve"
  his teasers) · lyrics only by Luke or Claude (the tools invited Verse to write them) · team notes come
  from "HQ" naming who acted, not in Luke's name · the secrets guard in lyrics wants a made-up-secret shape
  (letters AND digits, 6+, no "/", not 2night/4ever: "the password is 2night" is a lyric) and its refusal
  quotes the line with digits hidden · two live releases can't share a name · the board carries no lyrics
  or logs · the check is cut by whole lines · `luke_briefing` never says "none planned" without the sheet
  · a waiting step is never late and is never shown a "Mark done" · `sightMatch` needs the date within a
  day (another artist's "Love You" is not ours) · the message to Nova is claimed in the same write ·
  "Sent without" only from `sentWithout` · a reopened or freed step is never born late · "Read" means
  handed over (`messages_for_you`), and Claude's board read marks read.
* **Outside the repo** (done 11 Nov): the bots' guide (badscandal-hq `staff-desk/GUIDE.md`, re-seeded with
  `build-seed`, not committed there at the time of writing) and Nova's PDF ("Staff Desk/BADSCANDAL HQ -
  Staff Desk Guide for Nova (v2, 11 Nov 2026).pdf") describe the steps, `spotify_upcoming` and
  `messages_for_you`; Claude's rounds run at 09:40, 15:40 and 21:40. Screenshots: "HQ release pipeline -
  screenshots/" next to the repo.

## The Revolut reader (11 Nov 2026)

Why: income can land in Luke's PERSONAL Revolut, and Revolut has no API for personal accounts, so nothing
that landed there was seen (the bots log Wise, PayPal and statement emails; a statement paid into Revolut
stayed "pending", and the desk's Revolut account source was "blocked"). The site now
reads it by itself once a day and puts every incoming payment on the staff desk. Luke, 11 Nov 2026, on
who sees it: "let them see my full revolut personal income to be able to actually see the income".
Built on branch `bank-reader` (worktree `.claude/worktrees/bank-reader`), two reviews (money, security),
merged into `release-pipeline` (`fe3ab68`), the page in `5f5b444`. NOT deployed, and it has NEVER talked
to the real bank (see the end).

* **How:** PSD2 open banking through **Enable Banking** (a licensed reader; its free "own accounts" mode,
  `services: ["AIS"]` = account information only). NOTHING here can move money: every call is a read,
  except `POST /auth` + `POST /sessions` (asking for and finishing Luke's read-only approval) and `DELETE
  /sessions/{id}` (giving it back). Every request carries a fresh RS256 JWT signed with `node:crypto`
  (`signJwt`: header `{typ, alg: RS256, kid: <application id>}`, iss `enablebanking.com`, aud
  `api.enablebanking.com`, one hour); there is no token to store or refresh. What expires is Luke's
  APPROVAL ("consent"), at most 180 days (`consentUntil`: the bank's maximum minus an hour), and only Luke
  renews it, in Revolut. The redirect registered with Enable Banking must be exactly
  `https://badscandal.com/api/bank/callback` (`REDIRECT_URL`), so connecting works ONLY on the live site
  (a preview answers 409 `SAY.preview`).
* **Files:** `netlify/lib/bank.mjs` (everything, with stores, env, clock and fetch passed in),
  `netlify/functions/bank.mjs` (`/api/bank/*`), `netlify/functions/banksync.mjs` (scheduled),
  `tests/bank.test.mjs` (a fake Enable Banking with a throwaway key made in memory). Sorting lives on the
  desk (`netlify/lib/staff.mjs` `sortIncome`, `SORTERS`).
* **Netlify env (names only; Luke sets them):** `ENABLE_BANKING_APPLICATION_ID`, `ENABLE_BANKING_PRIVATE_KEY`
  (the PEM, raw, base64 on one line, or with its line breaks pasted as `\n`: `decodePem`), optional
  `ENABLE_BANKING_ASPSP_NAME` / `ENABLE_BANKING_ASPSP_COUNTRY` (default Revolut / IE), optional
  `BANK_OWN_NAMES` (Luke's name as other banks write it, comma-separated: money from those names is his
  own transfer). `readConfig(env)`.
* **Blob store `bank`** (strong consistency; previews get a throwaway deploy store):
  `conn.json` {sessionId, validUntil, aspsp, connectedAt, accounts: [{uid, name, currency, idHash,
  holder}], gone?} · `state/<nonce>.json` {at, validUntil, used?} (one Connect press, single use, 10
  minutes; stored BEFORE the browser leaves; unfinished ones pruned) · `sync.json` {lastRunAt, lastOkAt,
  lastError, perAccount: {<idHash>: {lastDate, cursor?: {key, dateFrom}}}, lastAdded, totals, last,
  connectedAt}. The session id is never answered by any endpoint and never logged; logs carry only
  `logLine(e)` (kind, HTTP status, the reader's error word). **Never stored:** IBANs or account numbers
  (`noNumbers` strips IBAN-shaped text in any case and runs of 6+ digits from labels and payer names),
  balances (never even asked for). `holder` (the account holder's name, for the own-name rule) is kept.
* **The endpoints** (`netlify/functions/bank.mjs`; Luke = the /hq cookie with the Origin check on POSTs,
  Claude = `STAFF_CLAUDE_KEY`; the bots' key gets 403 everywhere here):
  `POST /api/bank/connect` (Luke only) -> `{url}` of Revolut's approval page (503 settings missing / key
  unreadable, 409 on a preview, 502 when Enable Banking refuses the key or doesn't list the bank; a
  settings failure answers `{error, kind: key|refused|no_bank}`) ·
  `GET /api/bank/callback` (public; the lock is below) -> 302 `/hq?bank=connected|device|failed#money` ·
  `GET /api/bank/status` (Luke or Claude; `?sample=1` = `sampleBankStatus()`, no store opened) ·
  `POST /api/bank/sync` (Luke or Claude; one read now with an 8 s budget; always HTTP 200, check `ok` /
  `error`) · `POST /api/bank/disconnect` (Luke only: gives the approval back, forgets it and every
  account's place; the payments already read stay on the desk).
* **The callback's lock** (`finishCallback`): the `state` nonce must exist, be unused and under 10 minutes
  old (else nothing is read, written or called), AND the browser must carry the cookie Connect set:
  `__Host-bs_bank_state=<sha of the state>; Max-Age=600; Path=/; Secure; HttpOnly; SameSite=Lax` (Lax: the
  bank comes back with a top-level GET), checked in constant time (`bindingOk`). Without it, whoever
  opened Luke's approval link could approve THEIR account onto his dashboard. Another browser -> `device`,
  nothing touched, the nonce left for Luke's browser (finishing on a phone via a QR code lands there too).
  The nonce is claimed with a write-if-unchanged (two copies can't both go on) and always deleted; the
  cookie is always cleared. The whole callback keeps inside 8 s (`callbackMs`; `POST /sessions` 5 s, the
  account details fetched together); a session that can't be stored is given back at once (`DELETE`). A
  reconnect gives the previous session back.
* **Status** (`bankStatus`): `{configured, connected, needsApproval, aspsp, validUntil, daysLeft,
  expiring (<= 14 days), accounts: [{name, currency}], lastRunAt, lastOkAt, lastError, errorKind,
  connectedAt, lastAdded, partial, canConnectHere (production only)}`. `errorKind` (`errorKind(sentence)`:
  key | refused | no_bank | "") is how the page knows a failure is about the Netlify settings; the sync
  summary carries it too when it isn't empty. `needsApproval` = a stored approval that ended or was
  marked gone. Only a reader answer that SAYS the session ended (`GONE_WORDS`) means "approve again"; a
  bare 401/403 is kind `refused` (the site's key or application), said as `SAY.keyRefused`, and the
  connection is NOT marked gone.
* **The daily read** (`banksync.mjs`, `50 9 * * *` UTC = 06:50 São Paulo, published site only: before
  Ledger 07:30, the site check 09:35 and Alfred 10:00) = `syncBank()`:
  - Each account from its saved `lastDate` minus 7 days (`overlapDays`: banks backdate bookings; the desk
    never counts a payment twice). An account with nothing saved (first run, new account, a new approval)
    starts at the EARLIER of the 1st of last month and a week before the last full read, so a lapsed
    approval or Disconnect-then-Connect leaves no gap. Places are kept by the account's identification
    hash (`idHash`), because the uid changes with every approval.
  - Caps: 12 pages per account per run; no new read starts after 60% of the budget and none is still
    running after 75% (`readShare`; the rest is the desk's); budget 20 s scheduled, 8 s for `POST sync`.
    A cap saves `cursor {key, dateFrom}` and the next run carries on (`more: true`); a continuation key the
    reader no longer knows restarts that account; our own deadline counts as the cap, not an error.
  - Only BOOKED credits (`readTx`: no status, or not pending/cancelled/rejected/on hold/scheduled/INFO/
    OTHR). The same id twice in one read is one payment; rows without an id are never merged (equal
    look-alikes are numbered in the bank's order).
  - Each goes on the desk through `submitIncome` as bot `HQ`, account `Revolut`, note "Read from Revolut",
    reference = the transaction id (else entry reference, else a hash of date|amount|currency|payer|text +
    idHash + its look-alike number; an id over 80 characters is hashed, never cut). Already there =
    `findKnown`: account Revolut and the same reference or `bankRef`. One odd row (a StaffError other than
    busy) is skipped and counted; the run goes on.
  - **Pending-statement upgrade** (`pendingFor`): an income credit from a known source finds the OLDEST
    pending entry of that source with the same amount and currency, dated on or before it, in its month or
    the three before, and upgrades THAT one (`pending_id`) under its payer name; the statement keeps its
    reference and the bank's id is kept beside it as `bankRef` (two equal same-day payments stay two).
  - `incomeCheck` ("Revolut: checked today", note "Read from Revolut: N new, N to sort, …") ONLY when
    every account was read to the end. `lastOkAt` only after a full read with no error; a capped run is
    `partial` and "N payments in" adds up across it and the run that finishes it.
  - The reader upgrades a statement only for a KNOWN source. A credit from a payer it can't place
    ("NLR Payments BV" for Northlight's statement) lands as unsorted; sorting it with `pending_id` (below)
    does the same upgrade by hand.
* **`classify(tx, ctx)`, in this order:** (1) **own name** -> transfer: the payer is an account holder
  (`ownName`: the full name in any order, accents/case/dots/titles ignored, or first + last name with at
  most one extra word and no company word like Ltd/Music/Records; never one word) or in `BANK_OWN_NAMES` ·
  (2) **Revolut's own wording** -> transfer (`OWN_MOVES`, line by line from the line's start, so "Payment
  from Savings & Co" is not a savings move): `^exchanged? (to|from) XXX`, `^(to|from) (pocket|vault|
  savings)`, `^(pocket|vault|savings) (withdrawal|top-up|transfer)`, `^withdrawing savings`, `top-up by
  *dddd`, `^(apple|google) pay (top-up|deposit)` · (3) **refund** -> left out, counted (`REFUND`: refund(ed|s),
  reversal, reversed, reverted, chargeback, cashback, also inside CARD_REFUND / REFUND-0042) · (4) **known
  source** -> income, `received` with that source's category (`sourceFor`: the source's name or match
  words as WHOLE words of the payer, never its id; payer sources only) · (5) **the pair** -> transfer: a
  booked debit in ANOTHER of his accounts, same currency and amount, within 3 days, used once, and only for
  a credit that names nobody (no payer, "Revolut…", or one of his accounts' own labels: a friend's 50 is
  never hidden by a 50 he paid elsewhere) · (6) anything else -> **`unsorted`**. A known source is checked
  BEFORE the pair on purpose. "Payment from X" and "Top-up" alone are deliberately NOT transfers (money
  moved in from PayPal or Wise lands as unsorted, or as income if listed as a source).
* **"unsorted"** (`INCOME_STATUS`): in the account, nobody has said what it is: in NO total (received,
  pending, a source's month), not in "new payers", listed apart (`incomeReport().unsorted` newest 40 +
  `unsortedCount`) with one problems line "N payments in Revolut that nobody has sorted yet". Only the
  reader (`HQ`) files a payment as unsorted; a later unsorted never overwrites a decided status.
  - **A year, not four months (review 12 Nov 2026):** `incomeState` reads this month and the 11 before
    (`UNSORTED_MONTHS` = 12) but passes only the first four as `entries`; the rest go in as
    `incomeReport(…, today, older)` and are used ONLY for `unsorted` / `unsortedCount` (and their
    statements). What is still unsorted in the oldest month read adds a problems line: "N unsorted
    payment(s) from Dec 2025 drop(s) off "To sort" when this month ends: sort it/them before then".
    `sortIncome` without a month looks through the same 12 months.
  - **The statement it may be:** each row of `unsorted` carries `pendingMatch {id, payer, amount, currency,
    date}` when pending statements with its amount and currency, dated on or before it, in its month or
    the three before, exist and are all ONE payer's (the oldest is offered). `income_status` shows it as
    `pending_match {id, line}`.
  - **Who sees it:** the bots see EVERYTHING the reader puts on the desk, unsorted rows and own transfers
    included (`income_status`, with `unsorted: [{id, month, line}]`). Luke's decision of 11 Nov 2026
    (commit `e8c8b6e`); it reverses the review fix that had hidden personal rows from the bots.
  - **Who sorts:** `SORTERS` = Luke, Claude, Ledger, Sheet, Nova. `sortIncome(store, now, roster, {by, id,
    month, status: "received" (+ category, one of the six CATEGORIES) | "transfer" (not income),
    pending_id?})`: only an unsorted entry, or one whose last decision was the reader's own (HQ); never a
    pending one; what a person or a bot decided stays. **`pending_id`** (with received, no category
    needed): the payment is THAT pending statement's money (`mergePending`): the statement turns received
    with `arrived` = the credit's day, `account` = the credit's, the credit's id as its `reference` (or
    `bankRef` when it has its own), history `{from: pending, to: received, merged: <the row's id>}`, and
    the unsorted row is REMOVED (same file: one write; otherwise the statement first, then the row, and a
    second press after a cut-off finishes the removal). The result is the statement. Refused: with
    transfer; a statement that isn't pending any more; one whose amount, currency or day doesn't fit.
    Without it, the same money showed in Received AND Pending and later raised a false "pending older
    than 30 days". `submitIncome` refuses to move an unsorted entry to a decided status for anyone
    else. The connector tool `sort_payment` (listed for every bot, refused for anyone not in `SORTERS`; its description: sort ONLY when the
    payer makes it clear, else ONE `send_message` to Luke, needs decision; never guess) and `POST
    /api/staff/sort` {id, month, status, category, pending_id?} (Luke's cookie or Claude's key); `sort_payment`
    takes `pending_id` too. `CLAUDE_TOOLS` is now
    empty: nothing is Claude-only.
* **The sentences:** `SAY` in bank.mjs (again = "Revolut has to be approved again: press Approve again",
  missing, notConnected, preview, keyBad, keyRefused, noBank, readerDown, unreachable, someAccounts, desk;
  keyBad / keyRefused / noBank name the Netlify settings: they are for Claude and the logs, and the page
  shows "Revolut's settings on Netlify need fixing: ask Claude." instead, `HQLib.bankSays(kind, text)`,
  in the tile, Data health, Read now and Connect; a sentence naming ENABLE_BANKING_ / PEM / base64 /
  redeploy is caught even without its kind) and `bankLine(status, now)`, the one line: "Revolut: read today at 06:50 · 2 payments in ·
  approval ends in 86 days" / "… the last read failed …" / "… the last read stopped part way, the rest
  comes at the next read …" / "Revolut is not connected" / "Revolut has to be approved again" / "The
  site is missing its Revolut settings". `HQLib.bankLine` is the same function, tested case by case
  against the server's.
* **The page** (`js/hq-staff.js`, rules in `js/hq-lib.js`): `GET /api/bank/status` is asked with the board
  and refreshed with it; its state is kept in memory only (no localStorage key; offline the tile says it
  couldn't be read). Money -> "Money coming in":
  - **The Revolut tile** among the account tiles (the desk's own "Revolut" account tile is dropped, one
    tile per account): `bankLine` word for word without its "Revolut: " (the tile is headed Revolut:
    "Read today at 06:50 · …"), "Reads Current · EUR, … Read only: it can never move
    money.", and the buttons `bankView` picks: Read now + Disconnect when connected (Approve again first and
    a red border with 14 days or fewer); Approve again + Disconnect when the approval is gone (red); Connect
    Revolut when not connected; on a preview no Connect, just `SAY.preview`; not configured: "Connecting
    needs the Revolut settings on Netlify first." A failed read shows the reader's sentence; a status that
    can't be read says "Couldn't read Revolut's state just now. The rest of Money is fine." + Try again.
    Read now -> "Reading…" -> "Read at HH:MM: N new payments came in." and everything reloads. Connect goes
    to the returned address only if it starts with https://. Disconnect asks inline first.
  - **`?bank=` flags** (`bankFlag`): connected / failed / device say their line in the tile and are taken
    out of the address with `history.replaceState`. Once the status is in, `bankFlagAfter(flag, status,
    now)` decides: "connected" stays only while Revolut IS connected, and runs ONE automatic Read now only
    when `connectedAt` is under 10 minutes old (an old link, a bookmark or the address bar's memory never
    starts a read; never in the sample). failed / device say "the Revolut button below" (it may be
    Connect Revolut or Approve again).
  - **Back from Revolut** without approving: a `pageshow` from the back-forward cache clears "Opening
    Revolut…" so the buttons work again.
  - **Fresh after a write:** `reload(true)` after a sort, a Read now and a Disconnect: a board or status
    request already in flight (the 5-minute refresh) is waited for, then asked again, so the page never
    keeps an answer from before the write.
  - **To sort · N** below Received / Pending: "It's income" asks which of the six kinds (`SORT_TYPES`) then
    confirms (when the row has `pendingMatch`, the FIRST answer is "It's the pending Northlight Records
    statement (EUR 112.01, Mon 2 Nov)" (`pendingAnswer`), asked as `pendingQuestion`, sent with
    `pending_id`, and its line is "Sorted as the Northlight Records statement: received"); otherwise it asks
    ("Sort X's EUR 60.00 (Wed 11 Nov) as income (Production)? … can't be changed here."); "Not
    income" asks once; afterwards "Sorted as income (Production)" takes the row's place for 10 minutes,
    focus moves to it, and the totals are read again. Off in the sample.
  - **Latest payments** say "To sort", "Your own transfer" or "Not income" (`payStatus`), amounts greyed.
    "Your own transfer" only for a transfer the reader filed (by HQ) that nobody changed since; every
    other transfer (sorted as not income, a bot's refund or gift) is "Not income".
  - **Today:** "N payments in Revolut to sort", "Revolut has to be approved again", "Revolut's approval ends
    in N days", all to `#money` (`bankAttention`); the desk's "…nobody has sorted yet" line is not repeated
    as an income problem, and once the reader is configured `incomeProblems(inc, bank)` drops the desk's
    own "Revolut: …" lines ("Revolut: blocked. …" from the seed's Revolut account source, "Revolut: not
    checked today"): the tile, `bankAttention` and Data health say Revolut's state. `staffAttention(board,
    bank)`. **Data health:** a "Revolut" row (`bankHealth`), red after 26 h without a full read.
  - New `HQLib`: `bankLine`, `bankView`, `bankButton`, `bankFlag`, `syncWords`, `payStatus`, `sortQuestion`,
    `sortedLine`, `toSortWords`, `bankAttention`, `bankHealth`, `SORT_TYPES`, and after the review of 12 Nov
    2026 `bankSays`, `bankFlagAfter`, `pendingAnswer`, `pendingQuestion`, `pendingSorted`; `attention()` takes `o.bank`,
    `healthRows()` adds the row when `bank` is passed; `window.HQStaff` gains `bank()`, `bankProblem()`.
    Fixed on the way: the red line on an attention account tile never matched (`:first-of-type`).
  - **Sample:** `sampleBankStatus()` (connected, read 06:50, 2 in, 86 days), a made-up Revolut account
    source checked by HQ, two made-up rows to sort and one own transfer, none in the totals. The sample's
    old blocked "Bank" account is gone (it showed a broken bank beside the connected Revolut).
* **To switch it on (Luke, once):** add `https://badscandal.com/api/bank/callback` to the Enable Banking
  application's redirect URLs (the old one pointed at the bookkeeping app); put the two env values on
  Netlify with the helper OUTSIDE this repo, "Staff Desk/4 - Put the Revolut reader's settings on the site
  (run once).command" (next to the repo's folder), then redeploy; in the private seed (badscandal-hq
  `staff-desk/`) set the Revolut account source from blocked to active; merge and deploy; press Connect
  Revolut on /hq (on badscandal.com, in the browser he will finish in).
* **NOT proven yet (no real bank call has ever been made):** Revolut's actual wording for exchanges,
  pockets and top-ups in this feed (the patterns come from an older CSV importer's tests); whether
  `/accounts/{uid}/details` `name` really is the holder (if not, the own-name rule never fires: the safe
  direction); what an ended or revoked approval looks like (if it is a bare 401, Luke sees "Revolut's settings on
  Netlify need fixing: ask Claude.", though the expiry date still says "approve again"); whether a continuation key works the next
  day; whether `POST /sessions` gives `accounts` as strings or objects (both handled); whether the daily
  read fits the scheduled function's time on a long history.

## The HQ apps and push alerts (12 Nov 2026)

Luke wanted two things: to start a song release fast ("New release" in one step), and to be told when
something is waiting on him. So /hq now runs inside two small native apps, "HQ" on his iPhone
(`com.badscandal.hq`) and "HQ" on his Mac (`com.badscandal.hq.mac`), team `6YA63R2878`. **The app code
lives in the PRIVATE repo `Badscandal/badscandal-hq-app` (folder `Desktop/Claude Works/BADSCANDAL/HQ-App`),
never here: this repo is public and published whole.** The apps load the live `https://badscandal.com/hq`
(or a deploy preview in a test build), so every change here reaches them without a rebuild. Built on
branch `hq-app` (spec + plan in HQ-App `docs/superpowers/`).

**Where it stands (12 Nov 2026, evening):**
* **LIVE.** PR #18 published on Luke's word ("can't you publish now"), squash-merged as `d003a25` at
  15:42 São Paulo, after a fresh review whose 7 defects were fixed first. The same evening Luke had Today's
  big "New release" button taken off ("it lives in the upcoming section"; PR #19): the hold-the-icon /
  ⌘N address `#releases/new` and the waiting line stay.
* **The apps are installed** on Luke's iPhone (by cable, development build, sandbox push) and his Mac
  (/Applications + Dock). Their code, READMEs and the push-key helper are in HQ-App; its `README.md` is the
  status page for the apps.
* **Still to do, Luke with Claude:** create the Apple push key (.p8, a Sandbox key is right for these
  installs) and run `HQ-App/helpers/1 - Put the push key on the site.command`, then send one test alert
  (`POST /api/hq/push/test` from his logged-in HQ; `reasons` says what Apple answered). Until then nothing
  buzzes and nothing breaks.
* **Next, after alerts work: the HQ redesign** (Luke, 12 Nov 2026: "overhaul the dashboard and improve
  QOL … far more modern … be creative, make it nice to look at and easy to use and understand"; "do
  research on what's most visually pleasing" for colours). **His colour decision: badscandal.com (what
  customers see) stays exactly as it is, in the brand's monochrome; /hq is only his, so it is free of the
  brand rule** ("the HQ is just a way to watch everything so that can be updated fully"). His nine
  reference images are in HQ-App `docs/references/2026-11-12-dashboard/` (frosted glass on dark grey or
  black, bento tiles, pill navigation, a "Search or Ask" bar, soft single-line charts). Plan: a short
  colour research pass, two or three palettes shown on a mock of Today for Luke to pick, then the redesign
  on a branch with a preview, live only on his "publish".

* **New release, in one step:** the address `#releases/new` (the iPhone's hold-the-icon "New release", the
  Mac's ⌘N / Dock menu / menu-bar item, or a bookmark; Today's own button was removed on Luke's word, the
  form's button is "New song" in Upcoming) opens Upcoming with the empty song form and the title focused, then puts
  `#releases` back in the address (`HQLib.newReleaseRoute`), so the same address works again next time.
  A new form already open with typing in it is scrolled to, never wiped. The form no longer waits for the
  board: it opens from `GET /api/staff/fields` (`{today, packFields, releaseSteps}`, Luke's cookie or
  Claude's key, reads no desk), as soon as either the fields or the board lands; only Save and Send wait
  for the board, with "Loading the team…" under them. "The form needs the team's desk" shows only when
  BOTH loads failed (a new try of the fields clears an old failure while it is on its way).
* **The waiting line:** at the top of Today, "3 things waiting on you" (`HQLib.waitWords`) -> `#messages`,
  in the browser too. Same count as the app badge. The Messages counters still count messages only.
* **The waiting rule, ONE function:** `S.waitingOnLuke(desk, today, now?)` in `netlify/lib/staff.mjs` ->
  `[{key, kind, id, text, href, at}]`, oldest first: `message` (open decision / reply / action to Luke;
  key `m:<id>`, `#messages/<id>`, "Nova asked you to decide something" / "… is waiting for your reply" /
  "… needs you to do something"), `spotify` (a song in Spotify for Artists in state unknown or retry; key
  `s:<sightKey>`, `#releases`, "<title> is in Spotify for Artists: say what it is"), `step` (Luke's own
  `teasers` step on an active release, due today or late; key `t:<release id>`, `#releases/<id>`, "<title>:
  your teaser clips are due / are late"). The text shows on a lock screen: it NEVER carries the message
  itself (no amounts, payers, account names or lyrics; tested). `luke_briefing` is unchanged.
* **The bridge (the contract the two apps are built to):** the app sets `window.HQApp = {platform: ios|mac,
  env: sandbox|production, app, version, tz}` before the page runs, only on badscandal.com and our deploy
  previews. The page (`js/hq-app.js`, after js/hq-shell.js; does nothing native without `window.HQApp`)
  posts to `webkit.messageHandlers.hqApp`: `{type:"ready", loggedIn:true}` once HQ's OWN data answered
  with a good login (js/hq.js fires `hq:refreshed` with `{loggedIn, startedAt}`: the sheet or the overview
  came back 200 during that refresh and the login form isn't showing; `/api/hq/push/waiting` only ever
  supplies the count), then the app asks for alert permission and hands over its token; `{type:"ready",
  loggedIn:false}` on the login form (`hq:login`); `{type:"waiting", count}` (the badge) after every
  logged-in refresh and when the page comes back on screen; `{type:"loggedOut"}` after Log out. The app
  hands its token over as `window.dispatchEvent(new CustomEvent("hqapp", {detail: {type: "token",
  token}}))`; the page registers it once per token per page load, only while logged in, and again when
  the zone has changed on coming back to the page (`window.HQApp.tz`, which the apps update when they
  come to the front; else the device's own `Intl` zone), so quiet hours follow Luke. Log out: a
  registration on its way finishes, then the device is unregistered, then `loggedOut` (js/hq.js waits for
  `HQAppPage.beforeLogout()`, at most 3 s); anything that started before Log out and answers after it is
  dropped (a session counter), so a device can't register again. The app's offline page posts
  `{type:"retry"}`. To open an address the app sets `location.hash` when it is already on /hq, else loads
  `/hq<hash>`. `hq-sw.js` cache is `bs-hq-v3`.
* **The endpoints** (`netlify/lib/push-api.mjs`, routed by `netlify/functions/hq.mjs` after its login
  check: the /hq cookie only; every POST must come from our own Origin; `?sample=1` never writes):
  `POST /api/hq/push/register {token, platform, env, app, tz}` -> `{ok:true}` · `POST
  /api/hq/push/unregister {token}` -> `{ok:true}` · `GET /api/hq/push/waiting` -> `{count, items:[{key,
  kind, id, text, href}]}` (`?sample=1` = the made-up desk) · `POST /api/hq/push/test` -> `{ok, sent,
  skipped?, reasons?}` ("Test from HQ: alerts work." to every device; `reasons` counts Apple's other
  answers, e.g. `{"403 InvalidProviderToken": 2}`, so a wrong key or environment shows) · `POST /api/hq/push/key {key, keyId}` ->
  `{ok:true}`, WRITE-ONLY (no GET; checked by importing it with WebCrypto; nothing ever answers with it).
* **Devices** (`netlify/lib/push.mjs`, Blob `push/devices.json` on the `staff` store): token 64–200 hex,
  platform ios|mac, env sandbox|production, app one of the two bundle ids, tz an IANA zone (else São
  Paulo); the same token is one device (its zone and seenAt updated); the newest 10 by seenAt are kept.
  Every write replaces the list (`mutate()` takes `{replace: doc}`), so a stored value that isn't a list
  is replaced, never written back.
* **Sending** (`netlify/lib/apns.mjs`, no dependencies: `node:http2` + WebCrypto): an ES256 provider
  token (`{alg:"ES256", kid}` . `{iss: team, iat}`, iat rounded DOWN to a 30-minute boundary so every
  running copy of the functions signs with the same one; Apple refuses a token that changes more often
  than every 20 minutes; a 403 ExpiredProviderToken / InvalidProviderToken drops the cached one), sandbox devices to
  `api.sandbox.push.apple.com`, production to `api.push.apple.com`, `apns-topic` = the device's app,
  `apns-push-type: alert`, priority 10 (5 for a silent badge update), 10 s timeout. Payload `{aps: {alert:
  {title: "HQ", body}, badge, sound: "default", "thread-id": "hq-waiting"}, href}`; silent = `{aps:
  {badge}}`. Apple saying 410 / BadDeviceToken / Unregistered / DeviceTokenNotForTopic removes THAT device
  only. Apple's other answers are logged as counts ("push sweep: 403 InvalidProviderToken x2; 0 accepted"),
  never a token or the key. Luke's key is a Sandbox key: right for the cable / development installs.
* **When it buzzes** (`sweep()`, state in Blob `push/alerted.json` `{keys: {<key>: first alerted}, lastBuzz,
  overnight: {<token>: [keys]}}`): each waiting item alerts ONCE (recorded before sending, so two sweeps at
  once send once; keys no longer waiting are forgotten after 30 days). **A refused setup burns nothing:**
  when NO device accepted and none was dead (Apple refused the key, a timeout, no network), this sweep's
  keys are taken back (only where the stored time is still this sweep's) and lastBuzz goes back, so the
  next sweep tries again. One new item buzzes with its text and
  `href`; several at once say "<n> new things are waiting on you" -> `#messages`; the badge is always the
  full count. **Flood guard:** at most one buzz per 10 minutes; anything new inside that window is a silent
  badge update (8 questions in a minute = 1 buzz + 7 silent, badge 8). **Quiet hours 23:00–08:00 on each
  device's own zone** (the one it last registered with; Luke moves between São Paulo and Dublin): silent,
  each item kept by key for that device; `morning()` sends it ONE "<n> things are waiting on you" at its
  local 08:xx, n = those overnight items still waiting ("1 thing is waiting on you"; nothing when none is),
  then forgets them. It keeps to the 10-minute rule: after a buzz in the last 10 minutes (the hourly job
  runs its sweep first) the summary is dropped, and when it buzzes it sets lastBuzz. **No key, a broken key or no device:** nothing
  is sent, nothing is recorded (`{skipped}`), nothing throws.
* **What runs a sweep:** a bot's `send_message` to Luke that needs him, any `spotify_upcoming` report, and
  Claude's `POST /api/staff/message` to Luke that needs him (`netlify/functions/staff.mjs` `pushAfter`:
  `context.waitUntil` when Netlify offers it, else awaited; it can never fail the call: tested). Plus
  **`netlify/functions/pushhourly.mjs`** (`5 * * * *`, published site only): `sweep` then `morning`. The
  tool count stays 18.
* **The push key (Luke's step):** an Apple "APNs" key (.p8) from developer.apple.com, put on the site by
  the helper in HQ-App (`helpers/1 - Put the push key on the site.command`). Netlify env names:
  `APNS_KEY` (base64 of the .p8's PKCS#8 body), `APNS_KEY_ID`, `APNS_TEAM_ID` (defaults to `6YA63R2878`).
  If the site's env is too full (AWS's 4 KB limit), the fallback is the Blob `push/key.json` `{keyB64,
  keyId, teamId}` written once through `POST /api/hq/push/key`. The sender reads the env first, then the
  Blob. The key is never in this repo, never logged, never printed.
* **Tests:** `tests/staff-waiting.test.mjs` (the rule), `tests/apns.test.mjs` (JWT verified with a key made
  in memory, the request, a fake http2), `tests/push.test.mjs` (once, flood, quiet hours by zone, the 08:00
  summary, dead tokens, no key, register limits), `tests/push-api.test.mjs` (login, Origin, round trip, the
  key never answered, `/api/staff/fields`), `tests/mcp.test.mjs` (a sweep that throws never fails
  `send_message`), `tests/hq-lib.test.mjs` (`newReleaseRoute`, `waitWords`, `appRegisterBody`), and after
  the review of 12 Nov 2026 `tests/hq-app.test.mjs` (js/hq-app.js in a sandbox: logged in only from HQ's
  refresh, the zone following Luke, Log out winning over late answers) and `tests/hq-newrelease.test.mjs`
  (js/hq-staff.js in a sandbox: the form opens from the fields, an old failed try doesn't count). 306
  tests after the button came off. Apple is never called by a test.
* **Not done here:** the site check does not mention "push not set up" (it would change the report Alfred
  reads); `send_message`'s note to bots still says Luke is not told on his phone straight away.

## The HQ redesign, v2 look (12 Nov 2026, LIVE: PR #20, `d4472d1`)

Luke: "i want you to decide just make a full overhaul i'll review later", then "deploy it" (merged the
same evening; his review comes on the live page). Design (Claude's calls):
HQ-App `docs/superpowers/specs/2026-11-12-hq-redesign-design.md`. **Only /hq changes: badscandal.com keeps
the brand's black and white** (Luke: "the HQ is just a way to watch everything so that can be updated
fully"). Every id, address and tab stays, so the apps, bookmarks and tests keep working.

* **The look is ONE layer at the end of hq.html's `<style>`** ("HQ v2: the redesign"): it redefines the
  tokens and restyles; the layers above it are history. Colour (Material's dark theme + Apple's dark-mode
  guidance): blue-black base `#0B0D12`, tiles `#151925`, raised `#1D2231`, hairline `#262C3B`; text
  `#F3F5F9` / `#AEB6C7` / `#848DA0` (16:1 / 8.6:1 / 5.3:1); ONE accent, periwinkle `--accent #A5B4FC`
  (where you are, the main buttons, links, focus, chart lines); `--red #FF7A7A` (fill `#B4232C`) = needs
  you, ONLY; `--amber #FBBF24` = warning (the cap at 750); `--spot #1ED760` = Spotify taps. Soft indigo,
  violet and teal glows behind the glass; the red wash is gone. Radii 26 px tiles, pills everywhere.
  SVG chart lines are recoloured from CSS (`.htile svg path[stroke="#B4B4B4"]`, `.spark polyline`).
* **Today, needs-you first:** `.today-grid` = `.today-side` (the waiting line, Needs attention, Since you
  last looked, the site check) + `.today-main` (the briefing in a glass card, Copy today's summary, the
  headline tiles, the cap / next release / tasks / duties). From 1100 px they sit side by side (the side
  column sticky); below that one column in glance order (`display: contents` + `order`): waiting line,
  briefing, the full attention list, then the tiles.
* **Navigation:** the phone bar floats as a glass pill; the desktop rail is a glass capsule; where you are
  = a soft accent pill (no more red bar).
* **Search (⌘K / Ctrl+K, "/", or the magnifier; "Search ⌘K" pill on desktop):** `js/hq-cmd.js` +
  `#cmdBox`. Jumps to any tab, song (`HQ.songIndex()`, the ids Songs gives its cards), bot, release or
  message waiting on Luke, or runs New song / Refresh / Data health / Copy today's summary. Built only from
  what the page loaded; rules `HQLib.cmdIndex` / `cmdResults` (tests/hq-cmd.test.mjs: nothing typed =
  what waits on you first; accents and capitals ignored; a match at the start beats one inside, then the
  shorter name). `hq-sw.js` cache `bs-hq-v5` (18 Nov 2026: js/hq-phone.js).
* The login card, buttons, pills and fields follow the same glass and accent. Reduced transparency and no
  blur support fall back to near-solid panels; nothing new animates beyond short colour transitions.
* **Not changed yet:** the native apps' own background and offline page are still `#050505` black (a
  rebuild in HQ-App changes them).
* **Growth & Fans, one page (12 Nov 2026, Luke: "growth and fans can be on the same page"):** the Fans
  tab is gone; its part (`#growth-fans`: "Fans forming", `#fansSub`, `#errFans`, `#fanTable`, same ids)
  sits under the followers in the `growth` view, titled "Growth & Fans" in the rail and the More sheet.
  `js/hq-shell.js` `TABS` / `MORE` lost `fans`; `ALIAS = { fans: "growth/fans" }` sends an old `#fans` link
  or bookmark there; `TAB_HREF.Fans` and Search's "Fans" go to `#growth/fans`. Nine tabs now (the tests
  that pinned ten say so). Also: a deep link opened from scratch jumps again once HQ's first load is in
  (it used to be pushed out of view by the numbers loading above it).

## Team, simpler (13 Nov 2026)

Luke: "the team section … making more sense being simpler and better" (then "yes": Claude decides).
* **Three numbers on top** (`#teamSum`): Stuck (blocked or late; red), Haven't checked in (quiet; amber),
  On track (green). Rules `HQLib.teamGroups` / `teamCounts` (tests/hq-team.test.mjs).
* **Stuck** bots get a short card (`.stuckcard`) with ONLY what is wrong (`HQLib.botProblems`: blocked duties
  and steps first, then late ones, "Late (due 00:30)" / "<song> · late by 2 days"; a waiting step is never a
  problem; a blocked bot with nothing listed shows its own last word), "Needs …" from its card, "Copy
  message for Nova", and "Everything about <bot>" folded. Nobody stuck -> "Nobody is stuck right now."
* **Everyone else** is ONE line (`.botrow`, a `<details>`): dot, name, job, `HQLib.botNext` ("Next: Lyrics
  live · Me Dá Seu Body · Sun 15 Nov", "Working on: …", "All done today", "No update today", "Nothing to do
  today"), the state pill; it opens to `botDetail()` (duties, release steps, latest update, working on,
  needs, counts, connector last used, why this bot). Deep link `#team/<bot>` opens the line (js/hq-shell.js
  opens a `<details>` it jumps to). The "Why this bot" text sits inside the detail (no nested folds).
* **The bots' connector switch** moved to the bottom, folded (`#connFold`, "Bots' connector: on"); it opens
  by itself when the key is OFF. Latest updates, Open tasks and Tasks per person stay as they were.
* Fixed: a long step state ("waiting: the song is not in Spotify for Artists yet") squeezed the step's name
  to one letter per line; it now wraps under it.

## The release form: label questions only with a label (14 Nov 2026)

Luke: "that label part should only appear to write if we don't check self release". `PACK_FIELDS`
`distributor` ("Who delivers it to the stores") and `deal` ("The deal in a few words") now carry `showWhen:
WITH_LABEL`, like `label` and `split`: none of the four shows for a self-release or before the kind is
picked. `distributorOf()` treats a self-release as RouteNote whatever is stored, so a label's name typed
before switching to self-release can't make it look delivered by a label (tested in tests/hq-staff.test.mjs).

## Planning releases: the calendar, the team's rule, suggested days (14 Nov 2026)

Luke: "a calender with team reccomendations for next release timelines on how long it takes for things to
get to the store from routenote etc, and delays issues etc … scheduled correctly well in advance drop should
handle that area … when i upload it should suggest dates", plus who does what (below); "yes do everything …
build it and piblish it don't forget about suvivors".

* **The team's rule** (from RouteNote's and Spotify's own guidance: RouteNote checks a release in 2–3 working
  days, Spotify and Apple have it 2–5 days after approval, other stores up to 2–4 weeks, the pitch must be in
  7+ days before release and 2+ weeks is better, the holidays are slower): **send to RouteNote 4 weeks
  before the release day (3 at the very least), songs come out on Fridays, 2 weeks between two songs** (a
  week as Out now, a week as the next one). `HQLib.PLAN_RULE` {recommend 28, minimum 21, gap 14} and
  `PLAN_TIMELINE` (the "How long things take" list). Holiday weeks = 15 Dec to 8 Jan.
* **Upcoming opens on the plan** (`#relPlan`, `drawPlan()` in js/hq-staff.js): "Next good release days"
  (`HQLib.suggestDates(today, releases, {except, n})`: Fridays from today + 28, none within 14 days of a song
  that holds a day (sent or drafted, not cancelled); tapping one opens a new song on that day); the
  calendar (`HQLib.calendarMonth(ym, releases, today)`: Monday-first weeks, release days (drafts in italics)
  and every open step on its due day, late ones red; a waiting step has no day; tap a day for its list,
  each line linking to its release); "How long things take, and the team's rule" folded.
* **Suggested days where they're needed** (`HQLib.planAdvice(date, today, releases, {except})`: too close
  (under 21 days: red; under 28: a note), another song within 2 weeks (red), not a Friday (with the
  nearest), holiday weeks): under the form's release day (with "Suggested days" / "Better days" to tap) and
  on each draft's card (in the made-up sample, Survivors' Mon 14 Dec is 6 days after Slow Burn and not a
  Friday, so its card offers better days; a tap opens its form with that day). A draft with no day yet gets
  "<song> has no release day yet. Use Fri … for <song>" in the plan.
* **Who does what** (Luke's words, in the connector's `INSTRUCTIONS`, which every bot gets on connecting,
  and in their my_day steps): Drop submits everything to RouteNote and keeps the schedule; Atlas sends the
  pitch the SAME DAY the song shows in Spotify for Artists and improves Luke's words first; Laura uploads the
  **visualiser** (pack field `visualiser`, Luke's link; OPTIONAL and never "missing" since 14 Nov 2026) and writes its
  description like the other visualisers; Webmaster makes each song page in release order, a week after the
  previous song's release day (its Out now week), and the home page switches 7 days after a release; Verse
  the lyrics.
* **Server rules (netlify/lib/staff.mjs):** `freeWaiting` makes a freed step (the pitch) due the day it is
  freed; `pageDue(date, prevDate, today)` + `prevReleaseDate(list, id, date)`: the page step is due a week
  after the previous release, never later than the day before its own, never in the past; send, move and
  cancel re-order every page step not started yet (`reorderPages`). `releaseView().missing`: after the
  required fields, the most urgent first (a waiting step's fields last); a field whose step is finished is
  no longer missing. The pack has 29 fields now ("N of 18 filled").
* **Not done here:** the bots' written guide (private repo badscandal-hq `staff-desk/GUIDE.md`, re-seeded with
  `PUT /api/staff/seed` and Claude's key) still has the old wording: update it there. The home card's switch
  (Out now for 7 days, then the next song) is Webmaster's job in listen.json; the public page is unchanged.

## The bots' feedback, batch 1 of 5: the daily friction (14 Nov 2026, branch `hq-bots-batch1`)

Luke pasted the bots' feedback list and said to do it in 5 batches, reporting after each ("start with 1
then when you finish one step let me know when you're ready to move to 2 and we work our way to 5").
Batch 1 (tests: `tests/bots-batch1.test.mjs`, plus a late-pitch case in `staff-schedule.test.mjs`):
* **Every tool answer goes ONCE, compact** (`mcp.mjs toolResult`): it used to send indented JSON text AND
  the same object as `structuredContent`, so a ~35 KB answer was cut at the bots' 8 KB limit. The tools
  declare no outputSchema, so the text alone is the answer. `tests/mcp.test.mjs`'s `tool()` helper parses
  the text into `.data`.
* **read_messages filters:** `since` (a day or "YYYY-MM-DD HH:MM", São Paulo time: `S.spInstant`), `from`,
  `to`, `about` (from or to), `search` (every word, accents/capitals ignored), `unread: true` (only what came
  for the bot since its last read: `S.messagesFor`), `id` (ONE message, any age: `S.getMessage`) and
  `count_only: true` ("anything new?", no messages). The read marker moves only on an unfiltered read: a
  count, an id or a filtered search never hides messages from the next `unread` read.
* **`task_update` (tool 19):** a bot updates or closes its OWN T- task (Nova and Claude: anyone's):
  todo | working | blocked (note required) | done. Stored in the desk doc `tasks.json`
  (`S.setTaskStatus`, `S.getTaskOverlay`); the owner is checked against the sheet's open tasks as HQ reads
  them (`ctx.hq()`: refused, nothing saved, when the sheet can't be read); D- duties are refused with a
  pointer to post_update. `hq-load staffSide` passes `taskOverlay`; `hq.mjs teamReport(..., overlay)` shows
  it over the sheet's row: done = off the open list, blocked = the note is the blocker, todo/working clear
  an old blocker; the sheet's own "done" always wins. The HQ task table shows the bot's note; my_day's
  open_tasks has `your_note`. A line in INSTRUCTIONS tells the bots.
* **Cut-off text:** decision options keep 240 characters (were 80); a roster schedule's time keeps 60 (was
  20: "7 days before a rele").
* **Visualiser regression:** it no longer has `neededBy: "video"`, so a song with no visualiser never shows
  Laura's step as missing anything (Me Dá Seu Body).
* **The pitch** is due (not late) on the day the song shows in Spotify for Artists, late from the next day
  (already true through `freeWaiting`; now pinned by a test).
* **Still to do in batches 2-5:** decisions (2), release steps/statuses (3), money (4), tidy-ups (5). Data
  fixes that need Luke or Claude's key (not code): Love You's record, Me Dá Seu Body's pack, Laura's lyric
  video link, the income rows. The bots' GUIDE.md (private repo) should mention task_update and the new
  read_messages filters.

## The bots' feedback, batch 2 of 5: decisions and stale asks (14 Nov 2026, branch `hq-bots-batch2`)

Stacked on batch 1 (branch `hq-bots-batch2` starts from `hq-bots-batch1`). Tests: `tests/bots-batch2.test.mjs`.
* **Numbered questions:** `send_message` takes `questions` (2 to 6, 300 characters each; not with
  `options`, not to all; needs none becomes reply). Stored as `m.questions = [{q, answer, by, at, via?}]`.
  An answer is a reply with `answers` ({"1": "...", "3": "..."} or a list; `answersOf()`), saved on the
  answer message too (`m.answers`). In `sendMessage`'s settle step a message with questions is filled
  ONLY by answers and closes (`resolved.note` "all N answered") when every question has one: a plain
  reply (Luke's one-word "Correct") no longer closes it. Only the one it was sent to, or Luke, answers;
  a question number that doesn't exist and answers to a message without questions are refused. Luke's
  "Mark as done" still closes it. Tool results carry `still_open`.
* **`about`** (a roster bot) on `send_message`: the message and every answer to it (`about` is copied
  onto the answer) reach that bot: `S.messagesFor` counts `m.about === name`, so it shows in that bot's
  `messages_for_you` / `unread`. HQ shows "about Forge".
* **`record_luke_answer` (tool 20, Alfred only):** Luke's EXACT words from Alfred's chat, saved as a
  message from Luke with `via: "Alfred"` answering a message that waits on Luke; `option` (must be one of
  the listed options, becomes the settle note) and `answers` (numbered questions). HQ shows "Luke (via
  Alfred)".
* **Stale blockers and asks:** `set_my_card` takes `blockers` ("" clears): stored on the card
  (`blockers`, `blockersAt`) and it REPLACES the roster profile's blocker in `workers()`; left out, the
  last word stands. `working_on` is optional (18 Nov 2026): leave it out to keep the last one, so a bot
  can clear only a blocker. `my_day` shows `your_known_blockers` + how to clear it. A card blocker not
  said again for 48 hours is `blockersStale`: the page and `my_day` say "old, still true?" and it is not
  the headline (`your_known_blockers_old`). A card's `needs` not said again for 2 days is dropped from
  the card (`cardNow()`, kept as `oldNeeds`). The income sources' `needsLuke` lines (Ledger's old codes)
  are batch 4 (owner-editable sources).
* **my_day, 18 Nov 2026:** `connector` is `{tools, version, reconnect_needed, status, check}` and `reconnect`
  is the same sentence. Pass `tools_seen` (and optional `list_version`): a mismatch sets `reconnect_needed`
  and the sentence starts "reconnect needed". `questions_to_luke` is this bot's open questions to Luke with
  `waiting` ("3 h", "2 days"). For Ledger, Sheet, Nova and Alfred, `income_problems` appends each unsorted
  payment's id and date; `luke_briefing` keeps the short count. A duty whose text still says "monthly
  listeners in note" or "Salvation" is rewritten for Atlas: those numbers are `log_growth` fields. The
  live D-atlas-1 row is on the task board. A blocked step whose note says it is waiting for the release
  day is `state: "waiting"` (`blockIsWait`), not blocked, and it is not red on /hq.
* **HQ page:** `HQLib.questionLines(m)` / `questionsLeft(m)`; "Waiting on you" shows each question with
  its own answer box and one "Send answers" button (`data-act="qsend"`, posts `answers`); the board
  thread lists every question with its answer or "No answer yet". `/api/staff/message` passes
  `answers`, `questions`, `about`. The sample has a made-up Verse message with 3 questions (1 answered),
  so the sample now has 3 things waiting on Luke (pins in hq-cmd, mcp and staff tests updated).

## The bots' feedback, batch 3 of 5: releases (14 Nov 2026, branch `hq-bots-batch3`)

Tests: `tests/bots-batch3.test.mjs` (plus a route check in `tests/mcp.test.mjs`). The connector has 21 tools now.
* **Teaser posts:** three new `RELEASE_STEPS` after Luke's `teasers`: `teaser_tiktok` (Kevin), `teaser_instagram`
  (Steve), `teaser_youtube` (Laura), "Teaser posted on …", 3 days before release (21 Nov for a 24 Nov song),
  `after: "teasers"` (they WAIT for Luke's approval: "waiting: Luke has not approved the teaser clips yet") and
  `ownDay: true`: the owner or Nova sets the day with `release_step due` (today .. the release day; only these
  steps; sent alone it changes only the day). `freeWaiting` keeps an own-day step's later day (the pitch is still
  pulled to today). 13 steps in all.
* **Releases already sent get them:** `S.upgradeReleases(store, now)` adds the missing teaser posts (in their place,
  due on their day or today, never born late) to every scheduled release still to come; finished steps untouched;
  drafts, cancelled songs and songs already out get nothing; one log line from "HQ". It reads first and writes only
  when something is missing. Called before every tool call (`callTool`), before `GET /api/staff/board` and in the
  site check. `S.board()`/`loadDesk()` themselves never add a step.
* **`done_on`:** `release_step` (and `POST release/step`) take `done_on` (YYYY-MM-DD, only with done, not in the
  future), stored as the step's `doneOn` (dropped when reopened, kept when marked done again). HQ: "Done 9 Nov by
  Drop" (`HQLib.stepState`); tools: `done_on`.
* **Links everywhere:** a step's `link` is kept when a later mark has none, and shown in `release_pack`, `releases`,
  `my_day` (now also on open steps), the `release_step` answer and HQ's merged list (`mergeReleases` keeps `link`
  and `doneOn`). Webmaster's `live` step carries `spotify_track` (the pack's Spotify track link).
* **Approvals:** `r.approvals.pitch` / `.lyrics` = `{by: "Luke", via?, at, text, words?, msg?}`. Only Luke sets them:
  `S.approveRelease` (Luke only; the lyrics are approved as they are in the pack at that moment; `withdraw` takes
  one back), reached three ways: (1) a bot asks with `send_message approval {song, what, text}` (Atlas or Nova for
  the pitch, with the pitch's text; Verse or Nova for the lyrics; to Luke only): a decision with `APPROVE_OPTIONS`
  Approve / Not yet, `m.approval` on the message; when Luke picks Approve, `sendMessage` records it (`approved` in
  its result; a failure there never throws, the answer is already saved); (2) Alfred's `record_luke_answer` with
  option Approve, recorded "via Alfred" with Luke's words; (3) `POST /api/staff/release/approve {id, what, text?,
  withdraw?}` (Luke's cookie only, Claude's key 403): the "Approve the final lyrics" / "Take it back" buttons on the
  card. The view's lyrics approval has `current` (false once the pack's lyrics changed). `release_pack` gives Atlas
  and Verse `approvals` (approved, by, on, the pitch's text / matches_the_pack, or "changed since: ask Luke again").
  The board's slim copy carries the approved lyrics' length only (`textChars`).
* **The store status, with history (Drop's moderation log):** `S.STORE_STATUS` = not uploaded, uploaded, in
  moderation, rejected, resubmitted, approved, delivered, live. The pack field `storeStatus` is a `choice` of
  these now (free text refused); every change appends to `r.storeLog` (`{status, on, at, by, reason?, note?}`, 40
  kept) and mirrors the current status into `pack.storeStatus`, so the sheet merge and older readers still work.
  Written by the new tool **`store_status`** (tool 21: Drop, or Nova; Claude and Luke too) with `reason` (required
  with rejected: what RouteNote said), `note`, `on` (an earlier day); by `release_fill storeStatus` (not
  rejected: that needs the reason); and by Luke's form (`saveRelease`). The view's `store` = `{status, since, by,
  reason, note, legacy?, history (newest first)}`; an old free-text value shows as `legacy`. A rejected song has
  the warning "Rejected at the distributor: <reason> (Drop)" (kind `rejected`, also in the site check).
* **Ready to resubmit:** `store_status` with status rejected and `ready_to_resubmit: true` (only after a rejection)
  sends Luke ONE decision from Drop (`RESUBMIT_OPTIONS` Yes, resubmit / Not yet; `m.release`, `m.ask: "resubmit"`,
  set only by the desk); asked again while open, the same id comes back. Luke answers on the release card (Yes /
  Not yet with a confirm, `HQLib.resubmitAsk`) or in Waiting on you; the answer goes back to Drop like any answer
  and a line goes in the release's log ("Luke answered Drop: Yes, resubmit").
* **HQ page:** the release card shows the resubmit question, "At the distributor: …" with "What the distributor
  said (N)" folded (`HQLib.storeLine`, `storeHistory`), the teaser posts, and "Your approvals" (`HQLib.approvalLines`)
  under the steps. Waiting on you shows the pitch to approve in full (`.mpitch`) and tags "approval" / "ready to
  resubmit". `stepsSummary` says "3 teaser clips and the teaser posts". The sample: Me Dá Seu Body uploaded, in
  moderation, rejected (made-up reason) with Drop's resubmit question (4 things wait on Luke in the sample now);
  Touch Me has both approvals and its store history.
* **INSTRUCTIONS** gained four lines (the teaser posts, `done_on`/links, `store_status`, approvals). The bots'
  written guide (private repo) should say the same.

## The bots' feedback, batch 4 of 5: money (15 Nov 2026, branch `hq-bots-batch4`, stacked on batch 3)

Tests: `tests/bots-batch4.test.mjs`. The connector has 25 tools now (`fix_payment`, `income_source`, `record_spend`,
`log_growth`). `luke_briefing`'s shape is unchanged (its ad_spend numbers now come from the one figure below).
* **One ad spend figure** (`hq.mjs`): the cap's EUR (Google, TikTok) used to be converted at the ECB average of the
  month so far, which moves daily (473.40 / 473.47 / 473.83 in one day). Now `fixedRate(sheets.Rates)` reads the
  team's FIXED monthly rate from the sheet's optional tab **"Rates", B1 = USD per 1 EUR** (A1 = its label; read on
  its own like "Updates" in `hq-load.mjs`, so a missing tab breaks nothing; a value outside 0.9..1.6 is refused as
  "doesn't look like USD per 1 EUR"). `moneyReport(..., o = {fixed, notRead})`: `cap.rateUsed` `{value, from:
  "Rates!B1" | "ECB average", label, month}` (null when everything is USD), `cap.notRead` (the reads still
  missing: a sheet Spend row whose spend says "not read", or Forge's `not_read`, until a number for that platform
  and day exists), `cap.estimated` = anything missing (`cap.estimatedWhy`: no fixed rate, another currency at the
  ECB average, a missing rate, N reads missing). The months list (EUR estimates per month) is unchanged. The card
  says "Rate: 1.1 USD per EUR (Rates!B1, Nov 2026)", "Not read: …", "Estimated: …" (`HQLib.capRateLine`,
  `capMissingLine`). The sample sheet has a made-up Rates tab (1.08). **Assumption to confirm with Luke/Sheet:**
  that Rates!B1 in the HQ sheet is the USD-per-EUR rate.
* **`record_spend`** (Forge; Nova, Claude, Luke): ONE platform (Meta, Google, TikTok) and day, the account's own
  currency, `amount` (0 = no ads) or `not_read` (why). Desk doc `spend/<month>.json`, one row per platform +
  account + day (the same again: duplicate; a new amount: updated, `was` kept). `hq.mjs mergeDeskSpend` puts the
  desk's rows IN PLACE of the sheet's for that platform and day (never added to them); Meta's own read still wins
  for Meta days (`metaSpend` runs after). The tool answers `month_to_date` from `ctx.hq()` (read after the row is
  saved), or "not read just now" without the sheet.
* **"Done with gaps":** `post_update` takes `gaps` (only with done); `dutyOverlay` and `dutiesReport` carry it,
  the duty is done (never red) with `gaps`; the sheet's own status "done with gaps" counts as done (the blocker
  column = the gaps). HQ: "Done, with gaps: …" under the duty (`HQLib.dutyGapsLine`).
* **`log_growth`** (Steve, Atlas, Kevin, Laura; Nova, Claude): ONE platform (followers, views, best post) or song
  (streams, listeners, saves, playlist adds) for one day; counts as shown ("1,240" ok, "about 1k" refused); what
  couldn't be read goes in `gaps` {field: why}. Desk doc `grow/<month>.json`, key `g:<platform>` / `s:<songKey>`.
  `change` (followers) against the last reading before that day: the desk's, or the sheet's from `ctx.hq()`
  (`a.prev`) when later. The same numbers again: duplicate, nothing posted; a later call fills missing fields
  (their gaps close) or corrects one (`was`). Then it posts ONE `done` update (with `gaps`) for the duty
  (`duty` id when the bot has several). `hq.mjs mergeDeskGrowth`: a desk row fills only what the sheet's row of
  that day lacks; a day the sheet doesn't have is added (Growth and Songs).
* **Income sources the owner edits:** `income_source` / `S.editSource` (the source's owner, Ledger, Sheet, Nova,
  Claude, Luke): `accounts` (1-4; `lands` = them joined with " + "), `state` (blocked needs a reason; any other
  state clears the old blocker), `reason`, `category`, `needs_luke` ("" clears it: Ledger's old Tipalti /
  inGrooves / Symphonic asks). Kept in `srcedit.json` and laid over the seed in `getSources()`, so `PUT
  /api/staff/seed` never wipes them (`editedBy`, `editedAt`). Money's source table shows "Lands in … · updated by …".
* **`fix_payment`** / `S.fixIncome`: the bot that submitted a payment (or Ledger, Sheet, Nova, Claude, Luke)
  corrects date (same month), payer, amount, currency, status, category, account, reference, note, with a
  `reason`; `e.fixes` keeps `{at, by, reason, changed: {field: [old, new]}}` (10). Unsorted payments still go
  through `sort_payment`. `income_status` lists `your_payments` (id, month, line) for it.
* **New statuses:** `INCOME_STATUS` adds "statement only" (a statement under the payout line: in NO total) and
  "payable" (owed, ready to pay out: counted with pending as "owed to us", and in its own `payable` total).
  `OWED` = pending, payable, statement only: any of them turns received when the money lands (the same matching
  as pending). HQ greys "Statement only (not payable yet)".
* **Royalties only:** `incomeReport().royaltiesOnly` = received without the Salary category. Money shows four
  tiles (`HQLib.incomeTotals`): Received, Royalties (no salary), Owed to us, Statements only; `income_status`
  gives `royalties_only_this_month`, `payable_this_month`, `statement_only_this_month`.

## The bots' feedback, batch 5 of 5: tidy-ups (15 Nov 2026, branch `hq-bots-batch5`)

Tests: `tests/bots-batch5.test.mjs`. 26 tools (`tests/mcp.test.mjs` pins 26).

* **Each bot gets only its own tools at its own address.** The whole list was ~40 KB on every run, mostly
  income tools the social bots never use. `staff-tools.mjs` `TOOL_USERS` names the bots each special tool is
  for (any tool not in it is for everyone): Alfred `record_luke_answer`, `luke_briefing`, `luke_short_briefing`,
  `income_status`; Ledger + Sheet the income tools; Forge `record_spend`; Steve, Atlas, Kevin, Laura
  `log_growth`; Drop `store_status`; Atlas `spotify_upcoming`. `toolsFor(bot, roster)` gives the list (in the
  shared order); Nova, an empty name and a name not on the team get everything (a typo never hides a tool).
  `INSTRUCTION_LINES` tags each instruction line with its bots; `INSTRUCTIONS` (all lines, the same text as
  before plus three new lines) is still what `/mcp` sends, and `instructionsFor(bot, roster)` gives the shared
  lines plus the bot's own (Nova: all). **The address:** `POST /mcp/<bot>` (or `/mcp?bot=<bot>`, any case) with
  the same bots' key lists only that bot's tools and lines; a `tools/call` there without `bot` is filled in as
  that bot, another bot's name is refused ("This connector address is Kevin's …"), a tool that isn't his is
  "Unknown tool". Plain `/mcp`, a name not on the team and Claude's key keep everything, so a connector set up
  the old way is unchanged. Kevin's list is about half the size. Who may CALL a tool is still decided by the
  desk (`staff.mjs`), not by the list. To use it, each bot's connector URL becomes
  `https://badscandal.com/mcp/<its name>` (only if the bots' app allows a connector per bot; the shared one
  keeps working).
* **The duty reset.** Nova reset the duties at 08:05, after Ledger's 07:30 and Sheet's 08:00 runs, so they found
  no row. `DEFAULT_ROSTER`: Nova's reset is at 07:00 (her card's time too), before every other bot's time.
  `S.dutyResetTime(roster)` = the time of the "reset" line on Nova's card (so the seeded card decides);
  the site check says "(Nova resets them at <that time>)". A `done` posted before the rows exist already
  counted (the overlay is applied when the board is read: by duty id, or by bot when it has one duty), now
  pinned by a test; `my_day` before the reset (no duty rows for anyone yet) says "Today's duty rows are not on
  the board yet: Nova puts them there at 07:00. Do your daily duty now anyway and post_update with status done:
  it counts …" instead of "tell Nova the row is missing" (which stays for after the reset time).
* **Role text (`DEFAULT_ROSTER`):** Drop = "Where every release is at the distributor" (no royalties; upload 4
  weeks before, 3 at the latest; writes the timeline and each song's store status); Ledger's card says it owns
  the royalties (since 11 Nov) and its 5th-of-the-month report includes them; Forge logs Meta, Google and TikTok
  (`record_spend`); Webmaster's daily check no longer mentions pre-saves (the rule stays in RULES) and his page
  is due a week after the previous release; Webmaster's time is 09:20 only. **The private seed
  (badscandal-hq `staff-desk/`) replaces this roster on the live desk and needs the same changes at the next
  re-seed.** The site check adds "Times disagree: <bot>'s duty is due 09:10 on the board, 09:20 on the team
  card" when NONE of a bot's duty times is on its card (a second duty at another hour, like Forge's evening cap
  check, is fine).
* **Alfred's short briefing = a separate tool, `luke_short_briefing`** (read-only; listed for Alfred, Nova
  gets everything). `luke_briefing` is untouched (a test pins its keys and order). Answers `ad_spend` (one line:
  month, spent of cap, left, status, the rate used, "estimated: …" with why; "not read: …" without the sheet),
  `income` (received; owed to us; how many problems), `decisions` (the top 3 things waiting on Luke by deadline:
  an approval -> that step's due day, a "ready to resubmit" -> the release day; then the oldest without a
  deadline; options and "(by Fri 27 Nov)"), `more_decisions` ("N more …"), `needs_luke_sign_in` (ONE list,
  each line once: every bot's blockers, card needs, duty blockers and today's blocked/error updates, and the
  cap's missing reads, that mention signing in, logging in, 2FA, a phone/verification/security code or an
  expired session; "nothing" when empty). It hands over NO messages and doesn't move Alfred's read marker.

## Upcoming, overhauled (15 Nov 2026, branch `hq-upcoming-overhaul`)

Luke: "its too chaotic, improve it, make it more user friendly … one shot it without my opinion and deploy
immediately". The research it follows: what needs action goes first and top-left (dashboard eye-tracking:
attention starts there and fades down the page); progressive disclosure (the essentials on the card, the rest
one tap away, but status and date stay visible so no card has to be opened to know where it stands); each fact
said once; one main action per card. The sample page went from ~4,700 px to ~2,900 px on desktop.

* **Order** (`hq.html`, pinned by `tests/hq-upcoming.test.mjs`): `#relNow` **Needs you** · **Coming up** (the
  sent songs, `#relDesk`, the sheet-only cards `#relList`, the "Out: …" line `#relOut`; the New song button sits
  in this heading's row and opens the form here) · **In the pipeline** (drafts, `#relPipe`) · **Planning**
  (`#relPlan`: good days, calendar, how long things take) · **In Spotify for Artists** (`#relSpot`). `#relSub`
  is a fixed short sentence now (the steps' day counts are in "How long things take").
* **Needs you** (`HQLib.upcomingAsks(board, today)`, drawn by `drawNow()`): Drop's "ready to resubmit?", an
  approval a bot asked Luke for (open message with `approval`), a song in Spotify for Artists nobody sent (unknown or retry). Each is a button: a card opens that song's
  card UNFOLDED and scrolls to it (`jumpTo(id, true)`), an approval opens `#messages/<id>`, Spotify scrolls to
  its section. Nothing waiting: "Nothing on this tab needs you right now."
* **A sent song's card** (`relCard`): title, day, whose it is, the pill; a progress bar (`HQLib.relProgress`:
  done of the steps that count, `role=progressbar`); ONE status line (`HQLib.relStatus`: the desk's most urgent
  warning in red with "+N more", else "Blocked: …", "Late: … · N days", "Next: <short step> · <who|You> ·
  <day>", "Waiting: …", "All steps done"); Drop's resubmit question stays in sight. Everything else is in the
  fold **Steps and details** (`details.rfold`, `data-fold="card:<id>"`, remembered): all the warnings (when more
  than one), the distributor line + history, the steps as **Still to do (N)** (blocked first, then soonest:
  `HQLib.stepGroups`) and **Done or not ours (N)** folded, Luke's approvals, the files line, "See the files and
  details". Under it: Edit the details (button), Change the date and Cancel release (link buttons).
* **A draft's card** (`pipeCard`): the files on ONE line ("2 of 18 filled · still missing: Artwork, Language,
  … +5 more", red when a step needs one within 3 days), the notes on its day (red when wrong), better days as
  chips, Finish and send + Cancel the draft (link), then "See the files and details".
* CSS: the block "Upcoming, overhauled" at the end of hq.html's styles (`.relnow`, `.rprog`/`.rbar`, `.rstat`,
  `.rmore`, `.rfold`). Checked in headless Chrome at 1280 and 390 px, the Needs-you taps included; no errors.

## The release pipeline, tidied (15 Nov 2026)

Luke, 15 Nov 2026: remove the teaser clips fully (he builds a section for them later); the lyrics go on
Musixmatch only once the song is out (watched from release day); Forge comes after Webmaster, because the ads
run to the song page badscandal.com/<song> with the Meta pixel (HQ's Pages shows who clicked and the cost);
"badscandal should never be capatalised". Pinned by `tests/hq-pipeline-tidy.test.mjs`.

* **Steps** (`RELEASE_STEPS`, 9): upload, approved, spotify, pitch (`after: spotify`, `asap`), page, video,
  ads (`after: page`), live, lyrics ("Lyrics live on Musixmatch", Verse, `days: -7`, `fromRelease`). No teaser
  steps and no release step is Luke's, so `waitingOnLuke` and `HQLib.upcomingAsks` have no "step" kind any more.
* **Waiting** (`waitingFor(steps, s, date, today)`): an `after` step not finished, or (`fromRelease`) before the
  release day. Words in `WAIT_WORDS` (desk) and `WAIT_OTHER` (tools). A bot can't mark a waiting step done (Luke
  and Claude can). Freed: the pitch is due today (asap); any other step keeps its own day unless it has passed.
* **release_step** has no `due` any more (only the teaser posts had their own day) and `status` is required.
* **Releases already sent** (`upgradeReleases`, run by the tools, the board and the site's check): a release with
  a teaser step or the old "Lyrics live" label loses the teaser steps, gets the lyrics renamed and due a week
  after its day (today if that passed), a blocked lyrics step back to todo (it only waited for the song to be
  out), and its steps in the pipeline's order; one log line "HQ … (Luke, 15 Nov 2026)". Finished steps only renamed.
* **badscandal in lowercase** in everything the bots read (INSTRUCTIONS' first line and a rule line, the MCP
  server title, the split and copyright hints) and in the sample data. The public pages and the HQ logo still
  write BADSCANDAL: a separate change, only if Luke asks.
* A bot's note cut to fit a warning ends with "…" at a word (`cutNote`).
* The private seed's roster should get Verse's new duty line ("Lyrics on Musixmatch once each song is out")
  at the next re-seed.

## Bots' feedback, round 2 (15 Nov 2026), first part (branch hq-bots-round2)
The bots' combined review (all 11) is triaged in HQ-App/docs/BOTS-FEEDBACK-STATUS.md ("Round 2"). Built so far:
- **Nova's yes counts as Luke's** when Luke told Nova himself (Luke: "yes novas counts as long as i told him yes"): `record_luke_answer` now takes Nova too, saved as Luke's answer "via Nova". Never for money: a message from Ledger, Sheet or Forge is refused for Nova (`MONEY_ASKERS` in staff-tools.mjs). Alfred is unchanged.
- **Money counted once** (Luke: "merge the duplicate payers but money should be counted once"): `payerName()` drops punctuation and company endings (LLC, Ltd, Inc…): names that differ only by those are one payer. Two DIFFERENT names are never merged, even under one source (a label paying "via" another company stays its own payer: Luke said that pair "should be separate"). `submit_income` no longer adds the same payment twice under two spellings; `incomeReport` counts a payment already logged twice once (a decided status beats unsorted, else the first logged) and says so in "To look at".
- **Every account of a source** (Luke: "hq should show the second routenote account"): a source with several `accounts` gets `byAccount` (each account's last payment, or nothing logged yet; an account seen on a payment but not in the seed is added). Money shows it under the source's name (`HQLib.accountsLine`); `income_status` gives `by_account`.
- Real payer and account names never go in this repo: the tests use made-up ones.

## The bots propose releases, Luke confirms (16 Nov 2026, branch hq-bot-proposals)
Luke: "give the bots better controls they should be able to add edit and change upcoming songs and should always ask me if something is correct before making the addition". Nova had no tool to add Love You after Luke said yes, so it sat missing.
- Tool **`propose_release`** (27 tools now): any bot proposes a NEW song (title, date, pack fields) or CHANGES to one on the desk (song + new title / date / any pack field; "" clears), optionally `send: true` (send it to the team once confirmed; needs a day). `S.proposeRelease` checks everything first (unknown field, bad date or link, title clash, nothing would change, a past day for a scheduled song, one open proposal per bot and song) so Luke is never asked something that can't be applied.
- It becomes ONE message to Luke, needs decision, options `PROPOSE_OPTIONS` ["Yes, correct", "No"], carrying `proposal {action, id?, title, newTitle?, date?, pack, before, send, by, changes:[{label, from, to}]}` (only the desk sets it: no tool or route passes `proposal` through).
- Luke's "Yes, correct" (dashboard, or `record_luke_answer` by Alfred/Nova) runs `applyProposal` inside `sendMessage`'s settle hook, in Luke's name (saveRelease / moveRelease for a sent song / sendRelease anyway), logged "proposed by X" / "Luke said yes to X's changes (via Nova)". If any proposed field changed since the ask (`before`), nothing is overwritten. The asker always gets an HQ message: "Done: Luke said yes. …" or "Not done: …". "No" changes nothing.
- Page: the Messages card lists every change (`HQLib.proposalRows`, `.mprop`), tag "is this correct?", and the inline confirm says what Yes does (`HQLib.proposalConfirm`). The sample has one (Paper Moon, made up).
- `release_fill` (a bot's own fields: ISRC, UPC…) still writes directly, as before.
- **Song pages without Luke's Mac** (same day, Luke: "a tool that can allow webmaster to use this without my computer"; he chose "GitHub does it"). Tool **`song_page`** (Webmaster; Nova may ask for him; 28 tools): kind `new` (slug, title, date, cover https link) or `track` (slug + `https://open.spotify.com/track/<id>`). `S.proposeSongPage` checks it (slug rule and reserved paths from `netlify/lib/songs.mjs` `SLUG_RE`/`RESERVED`/`TRACK_RE`, an existing page for new, a known page for track) and asks Luke the same "is this correct?" (proposal action `page` / `track`). On "Yes, correct", `applyProposal` calls the dispatcher set by `S.useSongDispatch` (netlify/functions/staff.mjs, **production only**: a preview never publishes) = `netlify/lib/github.mjs` `dispatchSongJob`: ONE `POST /repos/Badscandal/badscandal-site/dispatches` (`event_type: "song-page"`), key Netlify env `GITHUB_SONG_TOKEN` (fine-grained, this repo only, Contents read+write) in the header only; refusals are plain sentences, never GitHub's text.
  - **`.github/workflows/song-page.yml`** (repository_dispatch only; `JOB` env = the payload, never in a shell line): ImageMagick + cwebp, `npm ci`, `node tools/song-job.mjs` (checks the job AGAIN; fetches the cover: https, ≤25 MB, a real JPG/PNG/WebP, Dropbox `dl=1`; square 1400 px `assets/listen-<slug>-cover-vN.jpg`; then `tools/new-song.mjs <slug> <title> <date>` or `--track <slug> <url>`, with `--files-out .song-files`; commit message in `.song-commit`), **`npm run test:song`** (only the song-page checks since 17 Nov 2026, A2), then `git add --pathspec-from-file=.song-files`, commit as github-actions[bot], push to main (Netlify deploys); then every other test, which only reports. A failing song-page check = nothing goes live. The last step always pushes a report (`tools/song-report.mjs`) to the `song-builds` branch as `builds/<desk message id>.json` (Netlify ignores that branch); the site reads it with no key (`readSongReport`) and `S.checkSongBuilds` (song_pages + the hourly job) tells the bot that asked "Not done: <why>" once, or tells Claude when other tests failed after a page went live.
  - `tools/new-song.mjs` now runs on Linux too (ImageMagick when there is no `sips`), and gained `--track` and `--files-out`. `tests/dashboard.test.mjs` reads the song list from songs.json (it pinned two songs, which would have failed every new page).
  - Luke's one-time step: make the GitHub key and run `Staff Desk/5 - Put the GitHub song-page key on the site (run once).command` (outside this repo; key typed hidden, set `--secret`, production only, then a rebuild). Repo checked 16 Nov: Actions on, main not protected.
  - Not yet proven: the ImageMagick step has never run (no ImageMagick on the Mac; a dispatch workflow only runs from main). First real run = Love You.

## Bots' feedback round 3 + Luke's rules (16 Nov 2026, branch hq-bots-round3)
- **Received only** (Luke: "we should never put pending income only what is received"): HQ Money shows Received + Royalties only (`HQLib.incomeTotals`); pending/payable rows say "(not received yet)", never counted (`payStatus`); the short briefing says "Received X this month" and names Ledger's problems; the site check says "Income received this month". `income_status`: `pending_this_month` = pending only (no payable twice), `not_income_yet`, `received_this_year` (per currency, 12 months read), `duplicates`. **`luke_briefing` is unchanged (hard rule): it still carries `income_this_month.pending`.**
- **One pitch in two weeks** (Luke): `pitchRule` (in `reorderPages`, so send/move/cancel, and in `upgradeReleases`): in release order a song out < 14 days (`PITCH_GAP_DAYS`) after the last pitched song has its todo pitch skipped (`rule: "one-pitch"`, note "Not pitched: X (out …) is the song pitched in these two weeks…"); it opens again when that stops being true. Never touches a working/blocked/done pitch.
- **Pitch tracker (L7, 18 Nov 2026, PR #63):** `pitchOf` on each release view: not pitched, pitched (with the day), or missed (deadline passed and not sent). A one-pitch skip is not pitched and not missed. Deadline = 7 days before release (`PITCH_DEADLINE_DAYS`). From 14 days out (`PITCH_WARN_DAYS`), while Atlas can still send it, the warning is "Still time to pitch" (the last day says so). Today and Upcoming show that warning. `pitchSlots` is the two-week calendar (the song that holds the slot, then the ones the rule left out), on the board and under Upcoming › Planning. Tool `pitch_log` (Atlas; Nova may record for him): `pitched_on` marks the pitch step done on that day; `playlist` + `added_on` records an editorial playlist once the song is out. HQ never pitches and never calls Spotify. 39 tools (live, PR #63).
- **Per-song profit (L4, 18 Nov 2026, PR #67):** Money › Per song, and one "Ad spend for this song" line on each Songs card. `songProfit` in `netlify/lib/hq.mjs` (words in `HQLib.songPLView`). Money in is royalties recorded for that song, per store. A received royalty payment (Self-releases, Label deals, Publishing, and only once it counts in Revolut) is money in for a song only when the payment names the song; if the song also has recorded royalties, the payment is listed beside them and not added. Ad spend counts only when the row's `song` is set. A campaign name is never a song. Anything without a song is "not linked to a song" and is not added into a song. One currency: money in minus that ad spend. Across currencies: an estimate at each row's month average rate, and only when every rate is there. A missing amount stays missing. No new tool (40). `income_status` returns `per_song`. Optional `song` (and `store` on a payment) on `record_spend`, `submit_income`, `fix_payment` and `sort_payment`. Ledger, Sheet, Forge and Nova refresh the tool list. HQ only reads and records.
- **Ads with Luke after the release** (Luke: "ads should not be made by forge himself … always after a release goes live"): step `ads` = "Ads made with Luke, after the release", days -2, `fromRelease` + `after: page`; waiting words "the ads are made with Luke once the song is out". Instructions: Forge never makes/launches ads alone; may copy them later only with Luke's videos; a lyric video is never an ad. **YouTube**: step `video` = "YouTube video scheduled for the release day"; Laura's line: public on release day, two uploads a month. Old releases are relabelled once (`healOne`).
- **Spotify for Artists waits for RouteNote** (`spotify.after = "approved"`, "waiting: RouteNote has not approved it yet"); a label release skips the approval, so never waits. The board's release steps now carry `waitingText` (the page's fallback said "not in Spotify for Artists" for every wait).
- **Song page due** = a week after the previous release, but never later than a week before its own day (`pageDue`).
- **log_growth**: `restitch()` recomputes every row's change from the previous saved day after each call (out-of-order days were +13/+13); a resend corrects it (`changes_fixed`).
- **store_status**: RouteNote's words (`STORE_ALIAS`: Pending Moderation / In review = in moderation, Action needed = rejected; also in `packValue`); history kept in day order (`storeEntry`), newest day = status now, so `on` back-fills work.
- Pitch done with no approval reads "sent <day> by Atlas" (`approvalsOf` `sentOnly`); a done page step's link fills `pack.page` (setStep + `healOne`); lyrics in a proposal Luke says yes to are recorded as approved.
- my_day `your_last_update` also looks in the desk's own updates (the shared log is 40 lines). `task_update` takes `title` (shown over the sheet's wording) and status `cancelled`. Short briefing sign-ins: one per account number (any bot) or per platform per bot; "signed in again" dropped. `read_guide` starts with the live tool count/list. Google Drive cover links → download link in `tools/song-job.mjs`. songs.json `_readme` points at song_page. New pack fields `primary` (stores) and `musixmatch` (later, Verse).

## Webmaster's three tools (16 Nov 2026, branch hq-webmaster-tools, stacked on hq-bots-round3)
Luke: "let's do webmasters 3 fixes". 30 tools now.
- **`upload_cover`** (Webmaster; Nova): the cover as `image_base64` or a `url` the site can open (Drive answered with a sign-in page). `S.uploadCover`: a real JPG/PNG/WebP (`pictureOf` reads the size from the PNG IHDR / JPEG SOF), ≥1000 px each side when readable, ≤4 MB; kept as `covers/<id>.json` {type, b64} (the desk store is text-only), list `covers.json`, newest 40. Public at **`GET /api/staff/cover/<id>.<ext>`** (before the login check in functions/staff.mjs, `S.coverResponse`: picture only, nosniff, CSP none, immutable cache) for song_page and GitHub.
- **`song_pages`** (read only): every page/track/card request of 2 months, newest first, with its state (waiting on Luke · Luke said no · not sent: why · sent to GitHub …: not live yet (+ a 15-minute warning) · live, judged against the deployed songs.json / listen.json). The outcome of Luke's yes is kept on the question (`proposalResult`). Plus `home_card` {now, should_show, why, to_do}.
- **Home card**: `song_page` kind **`card`** (a song with its page, not already on the card, one open card question at a time) → Luke's "Yes, correct" → GitHub job kind card → **`tools/home-card.mjs <slug>`** writes listen.json `release` (`cardRelease`: upcoming before the day, out from it with the track) and the home page's fallback (`cardHtml`: og:image, og:image:alt, twitter:image, the card's cover + alt, the title; each found exactly once), then every test, then publish. **The rule** (`homeCardSong` in netlify/lib/songs.mjs): a song out in the last 7 days (the newest: a new release takes over on its day); else the next one coming; else the newest out. Me Dá Seu Body (24 Nov) → Love You (27 Nov–3 Dec) → the next song. `homeCardNow()` = what the deployed listen.json shows.
## The Revolut reader, connecting it (16 Nov 2026, branch hq-revolut-connect)
The reader itself (above, "The Revolut reader") was built 11 Nov and is in the live code; it never connected because its settings were never on Netlify. 16 Nov: Claude in Chrome made a NEW Enable Banking app "BADSCANDAL HQ" (id `0b51e294-0d8d-4eb5-baa8-627f21d9dbcf`, Production, account information only, redirect `https://badscandal.com/api/bank/callback`, Luke's Revolut Ireland linked).
- **Which account, last 4 only** (Luke's spec): `accountInfo()` reads the account's number (`account_id.iban` / `.other.identification` / `all_account_ids[].identification`) and keeps ONLY `last4`; status `accounts[].last4`; the tile says "Current · EUR ••5678" (`HQLib.bankView`); each payment's note "Read from Revolut ••5678". The whole number is never stored (tests check the store for it).
- **Helper:** `Staff Desk/6 - Put the Revolut reader's key on the site (run once).command` (outside the repo): uses ONLY `~/Downloads/0b51e294….pem` (Downloads also holds the old app's and another .pem), sets `ENABLE_BANKING_APPLICATION_ID` + `ENABLE_BANKING_PRIVATE_KEY` (secret, production), moves the key to `~/Documents/BADSCANDAL keys (never share)/` (700/600), rebuilds the site. Stops if the file is missing.
- After deploy + helper: Luke presses **Connect Revolut** on badscandal.com/hq → Money, approves in the Revolut app. Then remove the old "Badscandal Books" access in Revolut.
- **Request size (16 Nov 2026, Webmaster: every upload_cover answered "Too large"):** /mcp refuses a body over 64 KB (`MAX_BODY`, checked before the tool) EXCEPT one `tools/call` of `upload_cover`, which may be up to 5.8 MB (`MAX_UPLOAD_BODY`: a 4 MB picture in base64, under Netlify's 6 MB request limit). The 413 now says the limits.

## Money, simpler (16 Nov 2026, branch hq-money-simple)
Luke: "better to just have one received in november ... an option check other months ... at the beginning of every month they should not be highlighted ... when we receive them they should change to green if we don't receive change it to red ... revolut is my main bank account, paypal and wise money goes there ... month by month should be updated to just show the month and amount".
- **One total:** "Received in <Month>" (`HQLib.incomeTotals` = Received only; the royalties tile is gone) with ‹ › for the months before (`HQLib.receivedMonths` over `incomeReport().receivedByMonth`: received only, every month read (12), each payment once).
- **Main sources, this month** (`incomeReport` → each source's `thisMonth` {state, amount, date, dueDay}): `received` (green: amount + day) · `late` (red: a MONTHLY source past its `dueDay` with nothing received) · `waiting` (neutral, as every month starts). `HQLib.mainSources` / `sourceMonthLine`; the rest fold into "Other sources". **Which sources are main and their day are desk data, never in this repo (payer names):** `income_source` takes `main`, `due_day` (1–31) and `create: true` (a source the seed lacks, kept in srcedit.json).
- `sort_payment` takes `source` (ties a Revolut row to its source so it turns green) and `note`. Ledger's instructions: Revolut is the main bank; each Revolut credit from Wise/PayPal is cross-checked by name + amount (already on the desk = sort as transfer with a note; else received with its source); the wage Luke moves in from another bank of his = received, Salary, with its source.
- **Month by month** (the sheet): Month | Received only (`HQLib.monthRows`); the detail tiles are gone.
- **90 days back, once (16 Nov 2026, Luke: "90 days is fine", "we can store on our HQ"):** each account without the mark `back` reads from today − 89 days (`LIMITS.backDays`), however it was read before; when that read is finished the account is marked `back: true` in sync.json `perAccount` and reads daily again (lastDate − 7). A read cut by a cap carries on from its saved place. Everything read stays on the desk; nothing is added twice. Disconnect + Connect forgets the marks, so it looks back again (harmless).

## Ledger's payments (16 Nov 2026, branch hq-ledger-payments)
Ledger (via Nova): income_status showed the 15 newest payments, no ids for HQ's Revolut rows, so they could never be sorted, fixed or tied to a source; Revolut still said "blocked"; PAYPAL was a "new payer". 31 tools.
- **`payments`** (Ledger, Sheet; Nova): `S.listPayments`: ONE month (default this one), every payment with id, date, payer, amount, currency, status, category, source, account, added_by; filters account / source (tied to it, or payer matches it) / payer words / status; limit 1–200 (100); `total` + `more` when cut. `income_status`'s newest 15 carry "(id …)" and `more_payments` says how many more.
- **`fix_payment` takes `source`** (FIX_FIELDS): any payment, HQ's included, tied to its source (its card then shows it).
- **`S.afterBankRead`** (called by `syncBank` after a full read, with the "checked today"): the Revolut account source becomes active (no blocker, no needs-Luke), and a payer source blocked only "for Revolut" (blocker mentions Revolut) too, in srcedit.json by HQ, once.
- An account source's name (PayPal, Wise…) is never a "new payer".
- **Royalties = the music's own money** (Ledger, 16 Nov 2026): `royaltiesOnly` counts received Self-releases, Label deals and Publishing only (`ROYALTY_CATS`), never Production (a buyout) or Salary.
- **`fix_payment paid_by`** (Ledger): on a statement (pending / payable / statement only), the id of the RECEIVED payment that paid it (searched over 12 months), whatever its amount or currency. The statement (`paidBy`) then counts nowhere (no pending/payable totals, no "older than 30 days", never offered as a pending match); the money counts once, as received. `payments` shows `paid_by`; the page says "Paid (see the received payment)".
- Tool schemas: `income_source` (main, due_day, create) and `fix_payment` (source, paid_by) ARE in tools/list; a bots' app that kept an old list must reconnect. A second RouteNote source is data: `income_source create` (no code).
- **17 Nov 2026 (Nova):** a payment tied to a source (`e.source`) counts for that source only; the payer-name match applies only to a payment tied to none (a CREATE payment kept showing under the payout service its payer is named after). `afterBankRead` now runs after ANY read that worked (also one that stops part way, like the 90-day read), not only a complete one.
- **Tool list version (17 Nov 2026, Nova):** the bots' app keeps its own copy of tools/list (new options looked missing; the live list was checked and has them). `my_day` returns `connector {tools, version, check}`: `toolsVersion(TOOLS)` = an FNV fingerprint of every tool's name and option names; an instruction line says to refresh the tool list when the count is higher or the version new. `income_status` points to `payments` for a month or an account.
- **A payment counts in the month it ARRIVED (17 Nov 2026, Luke):** `fix_payment date` may be any day up to today: a payment whose real day is in another month MOVES there (written to the new month first, then taken out of the old one; same id; the new month skips an id it already has). A statement already paid by merging keeps its filing and gets `arrived` instead. Ledger/Sheet instruction: when unsure what a payment in the money account is, ask Luke (ONE send_message, needs decision, payer + day + amount); never guess.

## One entry per payment: Revolut (17 Nov 2026, same branch hq-tools-version)
Luke: "money is not double counted so if something comes to paypal and i send it to revolut its not double counted ... wise and paypal are only mainly used to confirm and check revolut is the main entry from the first day to last day of month income is checked"; "paypal usually autoconverts to euro". 33 tools.
- **Income counts once, when it lands in Revolut, in the month it lands.** `isMainAccount` (= /revolut/). `holdingOf(sources)`: a RECEIVED payment in another of Luke's own accounts (an account source: Wise, PayPal) is HOLDING: `incomeReport` puts it in `holding` (and `holdingList`), never in received / royalties / byCategory / a source's month / receivedByMonth / receivedYear; entries carry `holding: true`; the page says "In PayPal: counts when it reaches Revolut".
- **`link_transfer`** (Ledger, Sheet; Nova): `S.linkTransfer` ties a Revolut payment (received / unsorted / transfer, not linked yet) to the holding payment(s) it carried (`from`, 1–20, searched over 12 months): those get `movedTo` (counted nowhere; "Moved to Revolut"), the Revolut row becomes received with `from`, the first one's source and category, and a note. Amounts and currencies may differ (PayPal converts to EUR; fees): the Revolut amount counts.
- **`month_check`** (Ledger, Sheet; Nova): `S.monthCheck`: a month's received (Revolut only), what is to sort (marked "from your own PayPal: link it" when the payer is one of Luke's accounts), what is waiting in Wise/PayPal, HQ's own-transfer rows to check; `ready` when nothing is to sort or waiting. Ledger runs it on the 1st for the month before; Nova sees it through to ready; anything unclear goes to Luke.
- `income_status`: `in_wise_or_paypal_not_counted`, `waiting_in_wise_or_paypal` (ids). The sample's publishing payment now lands in Revolut (its PayPal one shows as holding).
- **Node 22 vs 24 (17 Nov 2026):** GitHub's song-page build (Node 22) cancelled 12 bank tests ("Promise resolution is still pending but the event loop has already resolved") and stopped /loveyou: `AbortSignal.timeout`'s timer doesn't keep Node running, so a test whose fake bank never answers ended before the timeout fired (Node 24 on the Mac passed). `ebCall` now uses its own AbortController + setTimeout, always cleared; same "timeout" error. Check with `npx -y node@22 --test tests/*.test.mjs` (453 pass, 0 cancelled).

## Release page and Nova's list of 17 Nov 2026 (branch hq-release-page)
- **Release page** (Upcoming → "Release page" on each song card; `#relPage`, `HQLib.releasePage`): a checklist (files, every step that applies with its state, final lyrics (not for a pre-HQ song), the ad plan) with "N of M ready" / "Ready"; the ad plan; the song's numbers after release (Songs row); every field with its state (filled / missing / needed later / optional / not needed).
- New pack fields: **`canvas`** (Spotify Canvas link, Luke's) → Atlas's step **`canvas`** "Spotify Canvas uploaded" (days −7, after spotify, `needs: "canvas"`: skipped with NEEDS_NOTE until the pack has a link; saveRelease reopens/skips it when the link is set/cleared). **`adplan`** (Luke's notes on the ads, notes group). **`prehq`** ("Yes" = released through the distributor before HQ: nothing missing, nobody chases; whereWords says so). adplan and prehq are not counted in "N of M filled".
- `healOne` adds a step of the pipeline a release is missing (only songs not out yet; never the spotify step, which old releases get when moved), dated as if sent with it.
- `afterBankRead` runs when any account was read (one failing pocket no longer keeps Revolut "not connected").
- `log_growth`: `channel_views`, `shorts_views`. `ownerName()` in hq.mjs: "Kevin (TikTok)" on the sheet is Kevin (tasks, duties, the bot's own word).
- **`roster_card`** (Nova; Claude, Luke): fix a bot's duty / why / time / schedule / role on the desk (`rosteredit.json`, on top of the seed, kept across re-seeds). 34 tools.


## Luke's decisions inbox: recommendations (17 Nov 2026, A3, branch hq-decisions-inbox)
- A message waiting on Luke carries `recommendations: [{by, option, why, at}]` (one per person; a new one replaces that person's). The asker gives its own with `send_message recommend` (+ `recommend_option`, exactly one of the options); Nova (or Claude) adds hers with the tool **`recommend`** (35 tools; `S.recommendMessage`, `RECOMMENDERS`). Only on an open message to Luke that needs him; `why` 300 characters, secrets refused.
- HQ Messages › Waiting on you shows them above the options, Nova's first (`HQLib.recommendLines`), and marks the recommended option (`HQLib.recommendedOption`, `.copybtn.rec` + "recommended"). Alfred's `luke_short_briefing` decision lines end with "· Nova recommends: …"; `luke_briefing` is unchanged (no recommendation in it). Tests: `tests/decisions-inbox.test.mjs`.

## Automatic chasing (17 Nov 2026, A4)
- `S.chaseLate(store, now, roster, {hq, releases})`, run by `netlify/functions/pushhourly.mjs` (it now loads the sheet with `loadHq` and the desk's active release views). 07:00–22:00 São Paulo only; paused bots never. Each late duty (`hq.team.duties`, status todo) and late release step (not waiting / blocked / skipped / done) gets ONE reminder from HQ to its bot per day (needs none); still late 2 h later, ONE message from HQ to Nova, needs action (Nova's own goes to Luke). Claimed in `chase/<SP day>.json` before sending. Two INSTRUCTIONS lines tell the bots and Nova. Tests: `tests/auto-chase.test.mjs`.

## The next 6 weeks (17 Nov 2026, A5)
- `S.sixWeeks(views, today)` (server) and `HQLib.sixWeeks(today, releases)` (page) are the same rule, tested to agree: 6 Monday-first weeks from this one; release days (drafts marked `draft`), every open step on its due day (not done / skipped / waiting), late steps placed in THIS week with `late: true`; cancelled songs never. `S.sixWeekLines()` = plain lines. The `releases` tool gives Nova and Claude `six_weeks`; Upcoming › Planning draws "The next 6 weeks" (`.six-weeks`, each week a fold, the first two open, remembered as `six:<monday>`). Tests: `tests/six-weeks.test.mjs`.

## Pre-flight checks (17 Nov 2026, A6)
- In `netlify/lib/staff.mjs`: `artistProblems(text)` (exactly "badscandal": a near-miss like "Basdcandal" within 2 edits, "Bad Scandal" split, any capitals), `adLinkProblem(link, slug, own)` (https://badscandal.com/<a deployed song or this release's id>; Feature.fm / ffm.to / music.badscandal.com and any other host refused in words), `preflightOf(r)` (artist fields primary / featuring / producers / split / copyright, master not mp3/m4a/aac/ogg/opus, artwork not webp/gif/heic/…, the page link, every link in the ad plan) and `coverWarnings(w, h)`. Nothing is refused: `releaseView().preflight` (cards: an amber fold "Check before it goes to the stores: N things", `HQLib.preflightLine`), the tool **`preflight`** {song?, text?, link?} (Forge, Drop, Verse, Webmaster; Nova all; 36 tools), and `upload_cover` answers `warnings`. Tests: `tests/preflight.test.mjs`.
- **L8 asset checker (17 Nov 2026, branch hq-asset-checker):** `S.ASSETS` (cover, canvas, spotify_header, youtube_banner: each platform's published rule) + `S.assetProblems(kind, {width, height, seconds, format, mb})` (only what is given is checked; cover keeps `coverWarnings`' wording). `preflight` takes `asset` + width / height / seconds / format / size_mb and answers `rule`; Atlas and Laura get the tool; `preflightOf` flags a Canvas link whose file type isn't MP4/JPG. Tests: `tests/asset-check.test.mjs`.
- **L12 profiles (18 Nov 2026):** `S.PROFILE_SLOTS` + `profiles.json`. `recordProfile` writes the live image and the day it changed. `proposeProfile` runs `assetProblems` when the slot has a kind, then asks Luke "Yes, correct" / "No". `approveProfile` (on yes) stores the new link as waiting to be uploaded; the live image changes only when it is recorded. New `ASSETS` kinds: spotify_avatar, youtube_photo, apple_image, x_photo, x_header, soundcloud_photo, soundcloud_header, facebook_photo, facebook_cover, amazon_photo, amazon_background. Instagram, TikTok and Deezer have no kind: the list says "Rule not set". Owners: Atlas (DSPs), Laura (YouTube), Steve (Instagram, Facebook), Kevin (TikTok). X has no owner. Tool **`profiles`** (list / record / propose). HQ › Profiles draws `board.profiles` via `HQLib.profileBlocks`. No Meta or Instagram call. Tests: `tests/profiles.test.mjs`.

## The locked month close (17 Nov 2026, A7)
- `S.closeMonth` (tool **`close_month`**, Ledger, Sheet; Nova; Luke/Claude; 37 tools): only a finished month that `monthCheck` calls ready. Writes `close/<month>.json` {month, at, by, received, count, rows (id + `SNAP` fields of every payment counting in that month, `arrived` respected), evidence (https, ≤10)} once, and a line in `closes.json` (the board's `closes`). `monthCloseView` = the snapshot + `changes` (added / removed / changed with old → new, the latest fix's who and why); `closeChangeLines`, `closeLine`, `closeCsv` (`csvCell` neutralises = + - @). `month_check` answers `closed {line, evidence, changes_since}` or `close_it` when ready. `GET /api/staff/month-close.csv?month=` (Luke or Claude). Money › "Received in <Month>" shows "Closed by Ledger on …" + the CSV link (`HQLib.closedLine`). Tests: `tests/month-close.test.mjs`.

## Monthly listeners and Meta spend by itself (17 Nov 2026, A8 + B3)
- **A8:** `log_growth` platform Spotify takes `monthly_listeners` and `brazil_listeners` (`GROWTH_NUM`; Atlas). `mergeDeskGrowth` skips a desk row with none of the Growth tab's columns, so the artist numbers never make an empty Spotify card under Growth. `artistReport(rows)` in netlify/lib/hq.mjs -> `hqModel().artist` {monthly, lastDay, change, changeDays (7, or fewer when that is all there is), brazil, brazilShare %, series, brazilSeries}. Songs opens with "Spotify monthly listeners" (`#artistCard`, `HQLib.artistLines`, the trend via hq.js `spark`).
- **B3:** `S.recordMetaSpend(store, now, roster, rows, {since, until})`: Meta's account-level daily spend -> ONE desk Meta row per finished day by "HQ" (in `SPENDERS`), 0 when Meta lists nothing that day; a day with Forge's single Meta row updates that row (account kept, `was`), a day with two or more is skipped; no rows at all = unknown currency = nothing written. Run by `netlify/functions/pushhourly.mjs` from 07:00 São Paulo with `readMeta` (last 7 finished days, key `rec/<account>/<since>_<until>.json`, cached an hour). Tests: `tests/growth-meta.test.mjs`.

## The Instagram reader (17 Nov 2026, B4, branch hq-instagram)
- `netlify/lib/instagram.mjs`: Meta's **Instagram API with Instagram Login** (`graph.instagram.com`, `IG_VERSION`), READ-ONLY GETs for Luke's one professional account. Scopes Luke adds in the Meta app: `instagram_business_basic`, `instagram_business_manage_insights`, `instagram_business_manage_comments` (never publish or messages). The long-lived key (60 days) is pasted ONCE on /hq (Growth & Fans › Connect Instagram → `POST /api/hq/instagram/key`, write-only, published site only), checked against `/me` first (a personal account is refused), kept in the Blob store `instagram` (`key.json`), never answered or logged; `renewIfDue` calls `refresh_access_token` (grant_type `ig_refresh_token`) once it is a week old. Calls send the key as `Authorization: Bearer`; only if Instagram can't parse it there, once as `access_token` (remembered in `key.auth`).
- `syncInstagram` (hourly in `pushhourly.mjs`, and `POST /api/hq/instagram/sync` = Read now): `/me` followers → the desk's Instagram row (`log_growth` by "HQ", in `GROWERS`, marks no duty); `/me/media` (25); for posts ≤ 8 days old, `/{id}/insights` (`MEDIA_METRICS`: views, reach, likes, comments, saved→saves, shares, total_interactions; a 3-metric fallback) snapshotted at 6 h / 1 day / 1 week (`MARKS`) + the latest every 3 h; comments every 3 h (newest 300); `follower_demographics` by country daily. Store: `state.json`, `posts.json` (60), `comments.json`, `countries.json`. `GET /api/hq/instagram` = `igView` (never the key; `?sample=1` = `sampleView`). The tool **`instagram`** (Steve, Kevin; Nova; 38 tools; `ctx.ig`) gives followers, `postLine`s, new comments, countries. /hq Growth & Fans › Instagram (`#igBox`, `HQLib.igStatusLine`, `igPostNumbers`). Tests: `tests/instagram.test.mjs` (a fake graph.instagram.com; no real call).
- **Not proven yet:** no real Instagram call has been made (this session can't reach Meta). Whether the header works (else the address fallback), the exact insights answer per post type, and `follower_demographics`' shape are checked on the first real read.
- **The Facebook-login route (17 Nov 2026, branch hq-instagram-fb):** Meta blocked linking the Instagram-login app ("badscandal HQ Social", App ID 1624989918943866) to the business portfolio (a hidden "temporarily blocked" limit; Luke's profile, Page and portfolio show no issues). So `saveKey` also takes a Facebook USER key (anything not starting "IG"): `me/accounts` on `graph.facebook.com` (`FB_VERSION` = capi.mjs `GRAPH_VERSION`), the Page with `instagram_business_account`, then ONLY that Page's own key is kept (`key.route: "fb"`, `igId`, `page`; the user key is never stored). A Page key from a long-lived user key does not run out: `renewIfDue` skips it, `igStatus` gives `route`, `daysLeft: null`, `renews: false`, `page`. Reads use `/{igId}`, `/{igId}/media`, `/{igId}/insights` instead of `me…`. Refusals: `noPage` (no linked Instagram account on any Page), `noPerms` (the key lacks the Page permissions). Permissions for this route: `pages_show_list`, `pages_read_engagement`, `instagram_basic`, `instagram_manage_insights`, `instagram_manage_comments`.
- **The safety brake (17 Nov 2026, Luke: "our prime goal is not to get our account restricted or disabled, we need ads").** `igGet` sorts Meta's refusals: a rate limit (HTTP 429, codes 4/17/32/613/80001–80014, "request limit") is kind `limit` → every read paused for a day (`state.pausedUntil`); a block or restriction (code 368, "temporarily blocked", "restricted", "checkpoint", "disabled", "suspended") is kind `blocked` and a refused key `refused` → reading STOPS (`state.stopped`): no call at all, Read now included, until a new key is pasted (`liftBrake` in saveKey). `igStatus` gives `stopped` and `pausedUntil`; the page shows `SAY.limit` / `SAY.blocked`. A normal hour is ≤ 3 calls (tested). Never add retries, extra permissions or any write call to this reader.
- **The Page through the business portfolio (17 Nov 2026).** Luke reaches the BADSCANDAL Page through the business portfolio, not a direct Page role, so `/me/accounts` answers `{"data": []}` although every permission is granted. `saveFbKey`: (1) a Page with Instagram in `/me/accounts` (its own key if listed); else (2) the known Page `DEFAULT_PAGE_ID` (101630812698451, public; Netlify env `FB_PAGE_ID` overrides, `pageIdFrom`) read with the user key (`id,name,instagram_business_account`); then ONE try for its `access_token`. Got it → only the Page key is kept (`keyType: "page"`, never runs out); refused → the USER key is kept (`keyType: "user"`, `expiresAt` = paste + 60 days) and HQ says "Meta key: expires around <day>, make a new one before then" (`HQLib.igStatusLine`). "Not linked" (`noPage`) ONLY when the Page itself has no `instagram_business_account`; a Page the key can't open is `noPageAccess`. No key is ever printed, logged, put in an address or answered. A brake refusal during the swap still stops everything.

## Song page tiles (17 Nov 2026, L6, branch hq-song-tiles)
Webmaster's #15. The Pages tab opens with ONE tile per song page (`#songTiles`, `drawSongTiles()` in js/hq.js, rule `HQLib.songTile`): **Page** (live; "a change is waiting on your yes"; "Going live: …"; red "The last change didn't go live: …" from the newest song_page request for that slug, `board.pageBuilds` = `S.songPages()` + `slug`), **Button** (before the day: Follow on Spotify with the countdown; from it: Listen → the track, or red when the song is out with no track link), **Visitors** (people + Spotify taps + rate for the header's range), **Meta** (THIS page's sends in the range: "Receiving this page's events · last N min ago", red "Meta refused N of M sends (last: …)", or neutral "No Meta events in this range"), **Home card** (on it / should be on it now / on it but the rule says another song: `overview.homeCard {now: homeCardNow(), due: homeCardSong()}`). The tile's dot is the worst line's colour; tapping its title picks that page in the picker below.
- **Per-page Meta record:** `healthKey` adds a 10th part, the page's slug (`pageOf(body)` in capi.mjs, from the beacon's URL), only when there is one, so a record without a page is exactly as before; `parseHealthKey` reads 9 or 10 parts. `pageHealth(list, days)` (lib/admin.mjs) → per slug `{sends, errors, blocked, lastOk, lastError}`; records from before 17 Nov count for no page. Overview songs gain `track` (has a Spotify track link) and `health`. Tests: `tests/song-tiles.test.mjs`.

## What engages best: Instagram posts ranked per view, with their ads (17 Nov 2026, L2 adapted, branch hq-post-ranking)
Luke: "i spend 90 on one ad and it got 23k views but 1.6k likes … another i spend 300 dollars it got almost 300k views but only 3k likes so obviously the engagement on one was better … these signals help us shift our ads to the post performing the best … from our own followers before ad which had a good wow factor".
- `netlify/lib/postrank.mjs`: `rankPosts(posts, adDoc)` ranks every post with at least 1,000 views by **engagement per view** (the floor was 300 until PR #69, 18 Nov 2026) = (likes + comments + saves + shares) / views (Instagram's own numbers from instagram.mjs); newer posts are `tooFew`. Each boosted post carries `paid` = the ads' OWN spend, impressions and engagements (`actionsOf`: like or post_reaction, comment, onsite_conversion.post_save, post), their engagement rate and the **cost per engagement**; and `before` = the newest 6 h / 1 day / 1 week snapshot taken before its first ad started (its pull with our followers, unpaid). `rankLine(r)` = the plain sentence for the bots.
- **The ad side is read-only**: `fetchAdPosts` = ONE GET `act_<id>/ads?fields=name,effective_status,created_time,creative{effective_instagram_media_id},insights.date_preset(maximum){spend,impressions,reach,actions,account_currency}` with the existing `META_ADS_TOKEN` (ads_read) in the Authorization header, max 5 pages; only ads tied to an Instagram post are kept. `syncAdPosts` runs in `pushhourly.mjs` right after the Instagram read (only while Instagram is connected), stores `adposts.json` in the `instagram` store; a rate limit pauses it for a day (`adstate.json`), the last good read is kept. Nothing can create, change, start or pause an ad.
- `igView().ranking` {ranked (15), tooFew, adsAt, minViews}; HQ Growth & Fans › Instagram › **What engages best** (`HQLib.rankParts`, `.igrank`); the sample has a made-up boosted post. The `instagram` tool (now Steve, Kevin AND Forge) gives `ranking {how, best (5), worst (3), not_ranked_yet, ads_read}`; one INSTRUCTION line: every Monday Steve and Kevin say WHY the top 3 beat the bottom 3 (hook, format, length, sound, topic, time) in ONE update, then Forge sends Luke ONE decision with `recommend` naming the post that deserves the ad money next; the bots never change, start, pause or create ads. Tests: `tests/post-rank.test.mjs` (Luke's own example, made-up numbers).
- **Nova's review, same day (folded in before deploy):** posts are compared at the SAME age: `rankPosts` ranks by each post's **1-day snapshot** (`ranked`); a mark is only taken near its age (`MARK_GRACE`: 6 h +3 h, 1 day +12 h, 1 week +1 day), so a post first seen later has none; posts with no 1-day numbers go in `older` (lifetime / so far, a reference only); under 1,000 views (300 until PR #69) or younger than 36 h = `tooFew`. **Older posts** (past 8 days, never read) get their lifetime numbers ONCE, 4 per hourly run (`BACKFILL_PER_RUN`, `p.lifetime`). **Follows and profile visits** per post (`EXTRA_METRICS`, a second insights call only at a mark or a backfill; a type without them just has none): `follows`, `followRate`, `profileVisits`; **saves + shares per view** = `deep`. **Our own accounts' comments** don't count: the connected account + a list **Nova manages** (Luke, 17 Nov 2026: "Nova only; other bots can read"): the `instagram` tool's `our_accounts` list | add | remove with `handle` + `reason` (`IG.editOwn`, `OWN_EDITORS` Nova and Claude; anyone else is refused with "Only Nova…"); `own.json` {handles, log: [{at, by, action, handle, reason}]} (60 kept); the connected account can't be removed. HQ › Growth & Fans › Instagram shows the list and its changes (read-only: no write route). The handles are NOT in the code (public repo): Nova adds them on the live desk. Comments are flagged `own` at view time and subtracted per post (before the 1-day mark for the 1-day numbers); they leave the fans' list and needs_reply too. Comments now keep `repliedBy` (usernames from `replies{username}`); **`needsReply`** = a fan's question (`ASKS`) nobody of ours answered, last 14 days, 10 at most: HQ "Needs a reply" and the tool's `needs_reply` (replying is Luke's). The tool says how many are ranked and the INSTRUCTION line says to call the order unsettled under 10.
- **Not proven yet:** whether Instagram's post insights include the ad's views (if they do, engagement per view is the blended figure, which is what Luke compares; the ad's own numbers and "before the ad" are shown separately either way), and the exact action names Meta returns for Instagram-post ads.

## Fan inbox, part 1 (18 Nov 2026, L3, PR #66)

From the comments HQ already stores (`comments.json`). No new Instagram call: the hourly read stays at most 3 calls, and a rate limit or a block still stops the reader and does not retry.

- `fanInbox(comments, now)` and `askKind(text)` in `netlify/lib/instagram.mjs`. A question is the song's name or where to listen (English, Portuguese, Spanish), from the last 14 days. `needsReply` is true when nobody on the own-accounts list has replied. That flag is Luke's. A repeat fan is the same account on two or more posts. 15 of each, questions that need a reply first.
- `HIDDEN_HANDLES` is `liliancardos` and `liliancardosomakeup` (Luke, 18 Nov 2026). They are dropped from comments, the own-accounts list, its log and reply names, and a mention of either name in a comment is replaced. Adding one is refused, and the refusal does not repeat the name. Do not remove the list. Other own accounts stay on the desk.
- HQ › Growth & Fans › Instagram › **Fan inbox** (`#fanInbox`, `HQLib.FAN_INTRO` / `fanFlagWord`). "Needs your reply" on a question or a repeat fan. Nothing on the page replies, likes, hides or deletes.
- The `instagram` tool (still 40; Steve, Kevin, Forge) adds `fan_inbox` `{ note, questions: [{needs_reply, kind, when, user, text, on}], repeat_fans }`. The wider `needs_reply` list stays. Steve, Kevin and Forge refresh so the description matches. Tests: `tests/fan-inbox.test.mjs`. The phone HQ branch also changes the tool-list version (no new tool): every bot refreshes. Tests: `tests/hq-polish.test.mjs`.
- **Part 2, not built:** a fan's country (the reader only has the account's top countries, not each person's), and a ready reply Luke approves. HQ still never sends a reply.

## Connector bug fixes (18 Nov 2026, PR #69)

The bots' read-only test, items 1–33. No new tool (still 40). Ads are untouched. Stored money amounts and records are not rewritten; counting and labels changed.

- **Ranking** (`postrank.mjs`, `instagram.mjs`): a Meta spend row joins a post when the spend day is the post's day or the next day. The result carries the boost's spend, its engagements, cost per engagement, and the numbers from before the ad. Floor is 1,000 views (`under_1000`). A post older than 21 days is also listed under `older`. `ASKS` also matches "would it be", "okay to" and "use it".
- **Packs and the desk** (`staff.mjs`): an empty distributor on a self-release is RouteNote. badscandal moves to Primary only when the pack says so; otherwise it is flagged. A pitch that does not apply does not warn that mood, instruments and story are needed. A reply from Luke that looks like lyrics is offered for the pack and stays pending until he says yes. Stale duty text is dropped once the fact it described is no longer true (Meta logged by HQ, a currency that is not confirmed, a sign-in that has happened, Revolut readable).
- **Money, read-only:** a Wise or PayPal row already counted at Revolut has status "moved to Revolut" and `counted: false`, so `payments`, `income_status`, `month_check` and the briefings agree. A shadow copy of the same Revolut credit is hidden (`isShadow`). A payment can show the statement month and the landing month. Payable is not labelled pending. `hidePrivate` strips card digits, account digits and raw ad-account ids from tool output.
- **`read_guide`** matches the live tool list, `paid_by`, "counts once at Revolut", `link_transfer`, `month_check` and `close_month`.
- **Left for Luke:** the public stream line ("as of September 2026"), where "Plugin store" sits on the home page, and checking pack genre and language against RouteNote's list.
- Tests: `tests/connector-bugs.test.mjs`. 611 tests pass on Node 24 and Node 22.

## Expected money and payout-route cost (18 Nov 2026, L1 + L9, PR #71)

For Ledger and Sheet, on the phone Money screen (PR #70): received stays the Revolut line, payable and Wise/PayPal stay the smaller lines. No new tool (still 40). `luke_briefing` is unchanged: the new lines are not added to `income.problems`. A shadow credit (PR #69) is not a second expected row.

- **L1.** `S.moneyExpectations` (on `incomeReport`, so the board and `income_status` both have it). A statement — status statement only, payable or pending, or one later tied with `paid_by` or turned into the payment that arrived — is the expected row. The due date is the monthly source's `dueDay` when Ledger set one (the same day the main-source tile already uses; a quarterly source's day is not applied every month). Otherwise it is learned: the gap from statement to landing when two or more earlier gaps sit within 21 days, else the day of the month when three or more arrivals sit within 10 days. Fewer than that, or days too far apart, stays "Due date not known yet". Short = a recorded amount in the same currency came in below the statement. Late = the due day has passed and nothing has landed in Revolut. Missing = a monthly source's pay day has passed with no statement and nothing received (not tracked and blocked sources are skipped). The journey is statement → payable → paid → landed, with the days between steps only where both dates were recorded; a step that never happened says "not there yet", and one that was skipped says "not recorded".
- **L9.** `S.routeCosts`. A route is a source, via Wise or PayPal when that payment is what `link_transfer` or `paid_by` ties, into Revolut. The fee is sent minus landed, and only when both amounts are already on the desk in the same currency. Sent is the statement when one is tied, otherwise the Wise or PayPal amount. A different currency, or a missing payment, is "not enough data". No rate is stored or guessed. Money that landed for more than was sent is said as that, not as a negative fee.
- **Where it shows.** Money › Expected and Money › Exchange and fees (`HQLib.expectedJourney`, `expectedDue`, `expectedFlags`, `missingLine`, `learnedLine`, `routeLines`), under the received / payable / waiting lines. One "Expected money: …" line in Today's needs-attention, from the page only. `income_status` returns `expected_money` and `payout_routes` next to `per_song`. `my_day` for Ledger and Sheet returns the two summaries. Tests: `tests/expected-money.test.mjs`. The sample (made-up) has one same-currency fee, one currency change, and one missing source.

## Watchers (18 Nov 2026, L5)

Read-only. Nothing sends email, changes an ad, or writes to Instagram or Meta. No new connector tool (still 40). `log_growth` gains optional `claim`, `claimant` and `impact`, so its tool-list version changes: Laura, Steve, Atlas, Kevin and Nova refresh. `luke_briefing` is unchanged.

- **RouteNote mail is not connected.** The site has no mailbox. The Google key only reads the sheet. Meta, Instagram, Revolut and the desk keys are not a mailbox. `routeNoteMailSource()` always returns `{ connected: false, line: "not connected" }` and does not read env values. The release card says "RouteNote email: not connected". Drop's own `store_status` still shows. Phone Needs you shows the same line and the steps Luke has to do: sign the site into that inbox, read-only (Gmail readonly, or a forward into a mailbox the site is allowed to read). Until that sign-in exists, the hourly job does not invent a moderation result.
- **When messages are supplied** (tests, and later a real mailbox), `applyRouteNoteMail` matches a release by title, sets that release's store status from the email, and notes Drop once. A rejection also notes Luke (`ask: "routenote"`, needs action) and Needs you shows it. The drafted fix is the existing rule: change what RouteNote named, then `store_status` ready_to_resubmit. An email with no known phrase, or no matching song, does not change a card. A body that looks like a password is dropped and never stored. HQ does not email anyone.
- **Verse, on the release day** (São Paulo). `verseReleaseDay` sends one desk note to Verse to submit the approved lyrics on Musixmatch when the song shows there. A song not on Musixmatch yet is not a block. The pack's lyrics are not copied into the note. The same day does not send a second note. The day before and the day after do nothing. `my_day` for Verse gains `lyrics_duty` that day.
- **Content ID claims.** Laura records one with `log_growth` (`claim`, and `claimant` / `impact` when YouTube showed them, plus `date`). Steve, Atlas and Kevin are refused. A blank shows as "not reported". Growth & Fans shows only what was recorded. An empty list says "No Content ID claim has been recorded." The sample has one made-up claim marked "(sample)". Tests: `tests/watchers.test.mjs`.

## Handoff fixes (18 Nov 2026, PR #90)

The suspected bugs in `docs/HQ-FULL-HANDOFF.md` section 9, fixed. Tests: `tests/handoff-fixes.test.mjs`.
* **One "waiting on you" list.** `S.waitingOnLuke` on `needsDesk()` (`netlify/lib/needs.mjs`: the desk + Luke's open
  Yes/No/Edit cards + account health from the board's inputs) = messages to Luke needing a decision, reply or action,
  Spotify for Artists songs only he can name, his cards (held ones too), red accounts. It feeds the phone's pulse
  (`board.needs`, `C.needsCount`), Today's line and the app badge (`/api/hq/push/waiting`), the push alerts, and the
  `needs_you` tool. `HQLook.needTotal()` is the same rule offline. Alerts are "to check", never "need you"/"at risk".
  Lock-screen texts say who and what kind, never an amount or a payee.
* **Read-only means read-only.** A test calls every `readOnly` tool and diffs the desk. `profile_jobs` lists only
  (the hourly job asks Luke about a stuck job); `song_pages` peeks at build reports (`S.peekSongBuilds`); `instagram`
  is not `readOnly`. Opening /hq does not send the profile question either.
* **Read marker:** `read/<name>.json` = `{at, also, readAt}`. `callTool` → `settleRead` moves it only past what the
  answer handed over; `read_messages` says `still_unread`; `unread: true` hands over the oldest first.
* Spotify account health says tracks. `netlify.toml` names `song-geo.js` (tested). CI runs Node 22 and 24.
* Luke's screenshots, same day: Upcoming rows say dates in words (`HQLook.stampDay`), buttons spaced (`.racts-card`), the
  step is "Approved by RouteNote" (old ones renamed quietly in `healOne`); Money hides the bots' id list (`incomeProblems`);
  Needs you has no platform blocks (Growth cards carry the health dot + 7-day views) and no RouteNote email card
  (`phoneWatchers`); Instagram posts keep `thumb` from the same `/media` read, the Monday pick falls back to the song cover.
