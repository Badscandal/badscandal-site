BADSCANDAL — badscandal.com (final build)
=========================================

DEPLOY
  Drag this whole folder into Netlify. Done.
  Fonts (Space Grotesk + Inter Tight + Archivo Black) load from
  Google Fonts at runtime, so they appear once the site is live.

PAGES
  index.html      Loader (decode intro: random glyphs lock into
                  BADSCANDAL as the page loads, holds a beat, then
                  melts apart in chromatic channels) -> hero: the 4K film
                  scroll-scrubbed behind the liquid BADSCANDAL
                  wordmark -> philosophy (headline + paragraphs
                  slide in from up/left/right, reversible) ->
                  LATEST MUSIC: the Friendly film stage, copy
                  centered, actions stacked (Listen on Spotify /
                  Stream everything / Meet Luke Power) -> the club
                  -> how it goes -> what you should know (4) ->
                  marquee CTA -> footer.
                  About modal: manifesto, The name, Contact,
                  Principles. Subpages open it via index.html?about=1.
  lukepower.html  The Underwater film runs behind "Luke Power"
                  (same scroll mechanics) -> listen -> socials ->
                  live Instagram feed (Behold) -> info -> count-up
                  numbers (1M+ / 2B+) -> The story.
  store.html      THE LIVE STORE (H&M-style structure, brand skin):
                  Men / Women tabs + T-Shirts / Hoodies chips, hover
                  pop cards with quick-add, product modal, cart drawer,
                  Shopify Storefront API checkout. Runs in DEMO mode
                  until Shopify is connected -> see README-STORE.txt
                  (config lives at the top of js/store.js).
  live.html       Live shows — coming soon. The nav button on every
                  page points here.

THE FILMS (all scroll-scrubbed: scroll plays, scroll back rewinds)
  Desktop gets true 4K; phones get full-quality 1080-class encodes
  (iOS refuses inline 4K) — the Friendly section serves the
  VERTICAL cut on phones so its writing stays in frame. Files are
  fully buffered in the browser so seeking is instant on iOS, and
  a hard guard makes normal playback physically impossible — no
  play button can ever appear.
    hero:      graded-sexy-4k.mp4  / graded-sexy-1080.mp4
    friendly:  friendly-16x9-4k.mp4 / friendly-vertical.mp4
    lukepower: underwater-4k.mp4  / underwater-1080.mp4
  To swap any film: replace the pair (+ its poster jpg), keep the
  filenames, redeploy.

THE WORDMARK
  Liquid WebGL flowmap with chromatic fringing in brand colours.
  Runs in float precision (guaranteed clean return to crisp type),
  supersampled so the resting letters stay sharp. js/flow.js.

LOOK
  Film-grain plate over everything (opacity .1 in css/site.css).
  Progressive blur veil at the bottom of every page with a subtle
  chromatic tinge; it slides out of the way at the very bottom so
  footers stay readable. Footer clock shows each VISITOR's local
  day/time/city. Everything respects reduced-motion.

STILL MARKED >>> EDIT HERE <<< IN THE FILES
  Film swap points, music links, store notify link, socials.

SPARE ASSETS
  assets/work-*.webp, svc-*.webp, col-*.webp etc. are generated
  brand tiles from earlier layouts — unused right now, kept in
  case sections return. tools/gen_tiles.py regenerates them.
