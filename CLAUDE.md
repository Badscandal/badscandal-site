# BADSCANDAL — badscandal.com

Static site (no build step, no framework, no dependencies). Plain HTML +
CSS + vanilla JS, auto-deployed to Netlify on every push to `main`.
Shop data comes live from Shopify's Storefront API at runtime.

**BADSCANDAL is the umbrella brand** of Luke Power and Lilian — a couple
who left Ireland to travel and make things. Under the umbrella sit four
things, and the site has to hold all of them:

* **Luke & Lilian** — the couples/travel content, the story, the faces.
* **Luke Power** — the music. This is the actual income. Music is fully
  back in scope (an earlier revision of the site removed it — that
  framing is dead, see "Stale docs" below).
* **Goodscandal** — the counterpart project.
* **The clothing line** — statement tees and essentials, sold via Shopify.

The site sells the clothes and tells the story, but it is not "a clothing
brand's website" — it is the front door to everything the two of them make.

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

    index.html       Home: loader (0->100 counter + decoding wordmark)
                     -> hero (scroll-scrubbed film behind the liquid
                     WebGL wordmark) -> the drop (two store worlds)
                     -> four-thousand-weeks manifesto -> club -> process
                     -> FAQ -> marquee CTA -> footer. About modal lives
                     here; subpages open it via index.html?about=1
    store.html       The shop (see "Store" below)
    us.html          The story — Luke & Lilian, the arithmetic count-up,
                     socials, IG feed. Was lukepower.html
    _redirects       /lukepower -> /us, /live -> / (both were indexed)
    css/site.css     ALL styling for every page, one file
    js/main.js       Shared: loader, roll-up links, cursor, magnetic
                     buttons, scroll-scrubbed video engine, reveals,
                     menu, about modal, clock
    js/flow.js       WebGL liquid wordmark (ping-pong flowmap +
                     achromatic ghosting). Self-contained, falls back
                     to static <h1> with no WebGL/reduced motion.
                     Desktop: the cursor stirs it. Phones: scroll
                     sloshes it and a tap splashes it — see below
    js/crt.js        CRT treatment for the stamp/card sequence — see
                     "The stamp/card sequence" below
    js/store.js      Shop engine: Shopify Storefront API, filtering,
                     product modal, cart, checkout
    assets/          ~38MB, mostly the two hero .mp4 films — see the
                     immutable-cache warning under "Deploying" BEFORE
                     replacing anything in here
    _headers         Netlify headers — assets are cached IMMUTABLE,
                     see "Deploying"
    tools/           gen_tiles.py — regenerates the spare brand tiles
    README.txt, README-STORE.txt   STALE music-era docs. Ignore.

## The films (scroll = transport control)

Scrolling scrubs them; scrolling back rewinds. They can never "play" —
`makeScrub()` in js/main.js hard-pauses any playback. Files are fetched
as blobs so seeking is instant on iOS. Desktop gets 4K, phones get 1080
(iOS refuses inline 4K).

    hero:  graded-sexy-4k.mp4 / graded-sexy-1080.mp4

`makeScrub()` is generic and no-ops when its element is absent, so a
second scrubbed section is just one more call plus the markup.

**Scrub geometry is coupled:** the `.hero` height (240vh) and the sticky
stage inside it are one system — the scrub maps scroll progress across
that 240vh to the film's timeline. Change the hero height and you change
the scrub speed; change either without the other and the stage unpins
mid-film. Treat them as a pair.

## The liquid wordmark on phones

`#flow` carries `touch-action:pan-y`, so a vertical drag belongs to the
browser and only a horizontal swipe ever reached the canvas — meaning on
a phone the effect was alive but essentially undiscoverable. Scroll now
drives it, which is the same metaphor as the film scrub.

It responds to **acceleration, not velocity**: scrolling at a steady rate
settles, and only starting, stopping and reversing slosh — like liquid in
a glass you're carrying. A smoothed `containerV` chases the instantaneous
`scrollV`; the gap between them is what the liquid feels.

Three constants at the top of that block in js/flow.js are the only
things you should need to touch:

    SLOSH_GAIN   how hard scroll pushes it
    SLOSH_DIR    flip to 1 if it sloshes the wrong way
    SPLASH_GAIN  tap impulse strength

In the shader the scroll term is a **body force across the whole field**,
not the pointer's local stir, and it is sheared across x on purpose — a
flat push slides the wordmark rigidly and reads as a translate rather
than a liquid. Note the field accumulates (decay 0.9685/frame), so a
small per-frame injection builds into a large displacement over a flick;
that's why the per-frame value is clamped well below saturation.

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

## The stamp/card sequence (js/crt.js)

A scroll sequence where brand stamps and cards pass over the footage —
the clearest expression of the one rule on the whole site:

* **Stamps** (DM Mono slates, dates, locations, drawn marks) are brand
  furniture: pure monochrome ink over the imagery, never tinted, never
  given a background of their own.
* **Cards** are the only flat-colour surfaces in the sequence, and they
  are grey (`--ink-2`/`--ink-3` territory) — never a hue.
* The section behind them is **transparent** — the footage shows
  through. Do not "fix" a see-through section by giving it a background.

`js/crt.js` supplies the CRT treatment on the sequence. Like flow.js it
is self-contained and hand-rolled — no libraries — and it must degrade
to a clean static render under `prefers-reduced-motion` (golden rule 3).
If you touch the sequence's scroll maths, remember it lives in the same
document as the hero scrub: test both together, because they share the
scroll position.

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

1. Shopify **tags** (lowercase), which always win. All 15 products are
   tagged: 9 statement / 6 essential.
2. Fallback regex for anything untagged, checked against the **image
   filename slug first and `productType` second**. That order matters:
   Printful sets productType to "T-SHIRT" on everything it makes, so
   checking it first files `womens-cropped-hoodie` under Tees. Untagged
   products always land in `essential`, so new stock never claims to be a
   Statement piece by accident.

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

* **Shared BADSCANDAL socials.** Every social link across index/store/us
  still points at `@iguessimlukepower`, marked `>>> EDIT HERE <<<`. Swap
  in the brand accounts when they exist — also the Behold IG feed id on
  us.html, and the `sameAs` arrays in both JSON-LD blocks.
* Store hero photo: store.html currently reuses the homepage sunset
  poster (`assets/hero-sunset-poster-v1.jpg`) behind "Wear the trouble."
  A dedicated campaign shot would be better — when supplying one, give it
  a NEW versioned filename (immutable cache) and swap the `src`.
* No photography of Lilian anywhere yet; the About modal still uses
  `luke-bw.webp`. The story page is text-led until portraits exist.
* Favicons are **placeholders** (ink tile + orange "B") — and the orange
  clashes with a fully monochrome brand, so these want redoing.
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
