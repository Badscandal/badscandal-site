# BADSCANDAL — badscandal.com

Static site (no build step, no framework, no dependencies). Plain HTML +
CSS + vanilla JS, auto-deployed to Netlify on every push to `main`.
Shop data comes live from Shopify's Storefront API at runtime.

BADSCANDAL is a **clothing brand** by Luke Power and Lilian — statement
tees and essentials. The site sells the clothes and tells their story:
they left their country to chase making things and travelling. There is
no music or live-shows content any more (removed Aug 2026); it lives in
git history if it is ever wanted back.

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

**Pure monochrome — there is no colour on this site by design.** The
clothing photography is the only colour on the page. The var names are
kept from the old warm palette because the stylesheet is built on their
SEMANTICS, not their hue:

    --ink #050505   --ink-2 #0C0C0C  --ink-3 #1F1F1F   bg / surface / hairline
    --ink-rgb 5,5,5                                    channels, for scrims
    --paper #F2F2F2 --muted #8A8A8A  --silver #6E6E6E  text 1 / 2 / 3
    --uv #B4B4B4     resting border + small tracked labels
    --blaze #FFFFFF  active/hovered fill (text on top inverts to --ink)
    --ember #FFFFFF  emphasis: prices, link hover
    --maroon #7A7A7A destructive / muted

Two consequences worth knowing: `--blaze` and `--ember` are both white,
so any two states that were previously distinguished *only* by hue now
need a second signal (`.qa-size.added` uses a halo — see site.css). And
scrims must use `rgba(var(--ink-rgb),.x)`, never a hand-written
`rgba(5,5,5,.x)`, or they drift out of sync with the palette again.

Fonts: Space Grotesk (display), Inter Tight (body), Archivo Black
(wordmark only) — all from Google Fonts at runtime.

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
    css/site.css     ALL styling for every page, one file (~680 lines)
    js/main.js       Shared: loader, roll-up links, cursor, magnetic
                     buttons, scroll-scrubbed video engine, reveals,
                     menu, about modal, clock
    js/flow.js       WebGL liquid wordmark (ping-pong flowmap +
                     chromatic aberration). Self-contained, falls back
                     to static <h1> with no WebGL/reduced motion
    js/store.js      Shop engine: Shopify Storefront API, filtering,
                     product modal, cart, checkout
    assets/          ~38MB, mostly the two hero .mp4 films
    _headers         Netlify headers
    tools/           gen_tiles.py — regenerates the spare brand tiles

## The films (scroll = transport control)

Scrolling scrubs them; scrolling back rewinds. They can never "play" —
`makeScrub()` in js/main.js hard-pauses any playback. Files are fetched
as blobs so seeking is instant on iOS. Desktop gets 4K, phones get 1080
(iOS refuses inline 4K).

    hero:  graded-sexy-4k.mp4 / graded-sexy-1080.mp4

`makeScrub()` is generic and no-ops when its element is absent, so a
second scrubbed section is just one more call plus the markup.

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
taxonomy, so that can't drift.

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
encoding gotcha above).

## SEO / identity

`index.html` carries: title `BADSCANDAL` (Luke Power deliberately removed
from the title), a brand-voice meta description, favicons, and schema.org
**Organization** JSON-LD naming Luke Power as founder — the `jobTitle:
"Musician"` is gone. `us.html` carries **AboutPage + Person** JSON-LD.
The Person entry is kept deliberately: badscandal.com surfaces for "Luke
Power" searches, and dropping the schema would throw that away for
nothing. Lilian has no Person entry yet — needs her full name first.

`_redirects` 301s `/lukepower` → `/us` and `/live` → `/`, so the indexed
music-era URLs keep their equity instead of 404ing.

---

## Open tasks / next up

* **Shared BADSCANDAL socials.** Every social link across index/store/us
  still points at `@iguessimlukepower`, marked `>>> EDIT HERE <<<`. Swap
  in the brand accounts when they exist — also the Behold IG feed id on
  us.html, and the `sameAs` arrays in both JSON-LD blocks.
* `assets/store-hero.webp` — store.html already has the markup, scrim and
  CSS for a campaign photo behind "Wear the trouble."; the image file was
  never supplied. Ships gracefully hidden until it exists (`onerror`).
* No photography of Lilian anywhere yet; the About modal still uses
  `luke-bw.webp`. The story page is text-led until portraits exist.
* Favicons are **placeholders** (ink tile + orange "B") — and the orange
  now clashes with a fully monochrome site, so these want redoing.
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

    node --check js/store.js js/main.js js/flow.js
    python3 -m http.server 8000    # then open localhost:8000

The taxonomy is worth testing directly when you touch it — the resolvers
can be pulled out of js/store.js and run under node against live
Storefront data, which is how the productType-vs-image-slug ordering bug
was caught. Check the full family x garment matrix, not just one filter:
a wrong resolver shows up as one silently empty combination.

For Shopify data, query the Storefront API directly rather than guessing
at what the site sees — it's the fastest way to tell a data problem from
a code problem.
