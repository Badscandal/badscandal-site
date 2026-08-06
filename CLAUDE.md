# BADSCANDAL — www.badscandal.com

Static site for Luke Power / BADSCANDAL. No build step, no framework, no dependencies.
Plain HTML + CSS + vanilla JS, deployed to Netlify.

## ⚠️ Read this before touching anything

**Never read, open, or scan files in `assets/`.** It holds 252 PNGs, 20 WebPs and 6 MP4s —
about 99MB. Reading even a handful of them burns enormous context for zero benefit. If you
need to know what an asset is, read its filename or the HTML that references it. Only touch
a file in `assets/` if I explicitly name it.

**The entire editable codebase is these 8 files (~110KB):**

| File | What it is |
|---|---|
| `index.html` | Homepage — preloader, hero, sections |
| `lukepower.html` | Luke Power artist page |
| `live.html` | Live / shows page |
| `store.html` | Store (currently "coming soon") |
| `css/site.css` | All styling — single stylesheet, ~28KB |
| `js/main.js` | Main site behaviour, ~21KB |
| `js/flow.js` | Scroll/animation logic, ~13KB |
| `js/store-soon.js` | Store placeholder behaviour, ~8KB |

Also present: `_headers` (Netlify headers), `README.txt`, `tools/gen_tiles.py` (asset helper,
not part of the site).

## Brand rules

- Accent/amber: `#F5A623`
- Type: Space Grotesk (headings), Inter Tight (body), Archivo Black (display) — loaded from Google Fonts
- Voice in any copy: lowercase, direct, a bit cocky. Never corporate.
- The brand is BADSCANDAL; the artist is Luke Power. Both appear — don't collapse them into one.

## Deploying

This repo is connected to Netlify for continuous deployment. **Pushing to `main` deploys the
live site.** There is no build command — Netlify publishes the repo root as-is.

After I approve a change:
1. `git add` the specific files you changed (never `git add -A` — it can sweep in .DS_Store or a stray zip)
2. Commit with a short, plain message describing the actual change
3. `git push`

Netlify picks it up in roughly 30 seconds. If I say "ship it" or "push it", do all three.

**Never** commit: `*.zip`, `.DS_Store`, anything over 10MB, or files from outside this folder.

## Working style

- Make the smallest change that solves the problem. This site has no tests and no build — a
  broken commit is a broken live site.
- Show me the diff before pushing unless I've said ship it.
- If a change touches more than two of the eight files, tell me why before starting.
- Don't refactor, reorganise or "tidy" anything I didn't ask about.
