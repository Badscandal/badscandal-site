# Moving badscandal.com into Claude Code — start here

## What you've got

* `badscandal-updated-netlify.zip` — the current live-ready site
* `CLAUDE.md` — the project context file for Claude Code
* `badscandal-shopify-theme.zip` — tiny Shopify theme that redirects
  store.badscandal.com to badscandal.com/store (separate, optional)

## Setup (once, ~3 minutes)

```bash
# 1. unzip somewhere permanent, e.g. ~/Sites
cd ~/Sites
unzip ~/Downloads/badscandal-updated-netlify.zip
cd "www.badscandal.com (Main folder for netlify)"

# 2. drop CLAUDE.md in the root of that folder
mv ~/Downloads/CLAUDE.md .

# 3. version control — so you can always roll back a bad change
git init && git add -A && git commit -m "BADSCANDAL site — current state"

# 4. Netlify CLI, linked to your existing site
npm install -g netlify-cli
netlify login
netlify link          # pick the existing badscandal.com site

# 5. start Claude Code in that folder
claude
```

After that, deploying is one line — and you can tell Claude Code to run it:

```bash
netlify deploy --prod --dir .
```

## First message to paste into Claude Code

> This is badscandal.com — a hand-written static site (no frameworks, no
> build step) deployed to Netlify. Read CLAUDE.md first; it has the
> architecture, the brand rules, the Shopify setup and the known gotchas.
> The site is already live and working, so treat existing behaviour as
> intentional unless I say otherwise. When I ask for a change: make it,
> verify it (`node --check` for JS, serve locally and look at it), then
> deploy with `netlify deploy --prod --dir .` and tell me what changed.
> Ask me before doing anything destructive to assets/ — the six .mp4
> films in there are the site's whole visual identity and are encoded a
> specific way for scroll-scrubbing.

## Good first jobs to hand it

1. **Store hero image** — drop your campaign photo (the two models) into
   `assets/` and ask it to convert to `store-hero.webp` and wire it in.
   The markup, scrim and CSS are already there waiting.
2. **Real favicons** — give it the scratch logo file; current ones are
   placeholders. Ask for 48/180/192/512px, cropped so it reads at small
   sizes.
3. **Shopify housekeeping** — it can query your Storefront API directly
   to check which products the site can actually see.

## Two things worth knowing

**The films are fragile.** They're scroll-scrubbed, and they must start
at timestamp exactly 0.000 on a keyframe or a black frame flashes before
they appear. CLAUDE.md has the exact ffmpeg command. Don't let anything
re-encode them with a plain `-c copy` trim.

**The Shopify token in js/store.js is public by design** — it's the
Storefront API token, it can only read products and create carts, and it's
meant to be visible in client-side JS. Don't let anyone "fix" it by hiding
it in an env var; the site is static and has no server. (The *private*
`shpat_...` token is a different thing entirely and must never go in the
repo — rotate it in the Shopify Headless channel if it ever leaks.)

## Still outstanding on the Shopify side (not code)

* Pick a plan (trial can't take real orders)
* Enable payments, then test checkout with card `4242 4242 4242 4242`
* Publish new products to the **Headless** sales channel — Printful only
  publishes to "Online Store", which is why new shirts don't appear
* Tag products: `tshirt`|`hoodie` + `men`|`women`|`unisex`
* Rename the store from "My Store" (it shows at checkout)
* CNAME `store` → `shops.myshopify.com` at GoDaddy for store.badscandal.com
