# BADSCANDAL HQ — full handoff

**Written:** 18 Nov 2026, from the tree at `9e447e2` (`Fix the 18 Nov night-test findings on the HQ connector. (#88)`), which is `origin/main` at the time this file was added.
**For:** the next agent (Claude, large context). Read this file before changing HQ. Then `docs/WORKING-WITH-LUKE.md`, `docs/HANDOFF.md`, `docs/STATUS.md` and `docs/HQ-ROADMAP.md`. If those shorter files disagree with this one, this file is the one that was checked against the code on 18 Nov 2026. `docs/HANDOFF.md` and `docs/STATUS.md` on `9e447e2` still say “through PR #84”, “40 tools” and “716 tests”. That is stale. Main is through PR #88, the connector has **47** tools, and `npm test` on this tree reported **745 pass, 0 fail, 0 cancelled** (Node v22.23.4, 18 Nov 2026).
**This pull request changes docs only.** It does not change behaviour. Do not merge it until Luke says deploy or publish.

The repository is public and is the website. This file names environment variables and email addresses that are already in the source. It does not contain passwords, tokens, bank details, payer names, money from the real accounts, or lyrics.

`/docs/*` is not served on badscandal.com. `_redirects` sends it to the 404 page. Read this file on GitHub.

---

## How this file was checked

Every claim below was taken from the source at `9e447e2`, from `git log` / `gh pr view` for the November pull requests, or from one public GET of `https://badscandal.com/hq-sw.js` at 06:23 UTC on 18 Nov 2026. The live file was byte-identical to `hq-sw.js` in this tree (`CACHE = "bs-hq-v8"`). That file was last changed in PR #87, and PR #88 did not touch it, so the identical file shows that production has published at least the #87 service worker. It does not, by itself, prove that the #88 function bundle is the one Netlify is running.

One fact is **not** in git and is labelled as such: the Netlify credits outage. Luke asked for it to be recorded here. A search of commit messages and GitHub issues on this repo found no “credits” note. PR #86 records a different deploy skip (see section 7).

`npm test` was run in this session (`node --test tests/*.test.mjs`). Node on that machine was v22.23.4. Node 24 was not installed here, so this session did not repeat the suite on Node 24. GitHub Actions (`.github/workflows/tests.yml`) runs the same command on Node 22 for every pull request to `main`. The project rule is still to run both Node 24 and Node 22 before a deploy (`docs/WORKING-WITH-LUKE.md`).

---

## 1. Overview

### What it is

BADSCANDAL HQ is Luke Power’s private dashboard and the staff desk for the official BADSCANDAL team. The public site is the music and the song pages. HQ is the place Luke looks, and the place the bots leave word.

- **Dashboard:** `https://badscandal.com/hq` (`hq.html` plus the `js/hq-*.js` scripts). Stand-alone: it does not load `css/site.css` or `js/main.js`.
- **Connector:** `POST /mcp` (and `POST /mcp/<Bot>`). A hand-written Model Context Protocol server. No library, no session, no streaming. One JSON body per answer. Implemented in `netlify/functions/staff.mjs`, `netlify/lib/mcp.mjs` and `netlify/lib/staff-tools.mjs`.
- **The desk** is not a Google Sheet. The sheet is one input. The desk is Netlify Blobs, store name `staff`. The bots cannot write the sheet from this repo, and HQ does not write ads, posts, or bank transfers.

The artist name in anything the bots or the stores see is `badscandal`, one word. Capitalisation does not matter for the check; the stored rule is the lowercase spelling (`docs/WORKING-WITH-LUKE.md`, and `preflight`).

### Who uses it

**Luke**, on the iPhone HQ app and the Mac HQ app, and in the browser. Login is the same cookie as the old `/admin` portal (`__Host-bs_admin`, HttpOnly, Secure, SameSite=Strict, 30 days). Password is the Netlify env `ADMIN_KEY` (`STATS_KEY` is still accepted). Five wrong tries in ten minutes per hashed IP, Blob store `admin-auth`, key `rl/<hash>`. Changing the password logs everyone out. `/admin`, `/admin.html`, `/stats` and `/stats.html` 301 to `/hq`.

**Claude** (this agent’s usual role on the desk) uses `STAFF_CLAUDE_KEY` as a bearer token. Claude can read the board and call the connector. Claude is not a row on `DEFAULT_ROSTER`. `luke_briefing`’s output must not change: Alfred depends on the shape (`docs/WORKING-WITH-LUKE.md`).

**The bots** share one key, `STAFF_BOT_KEY`, because their app has one connector. Every call names its bot in `bot`. The name is checked against the roster (`whoIs`). Luke can switch that key off from Team (`config.json` `botsOn`) without touching Netlify.

The built-in roster (`DEFAULT_ROSTER` in `netlify/lib/staff.mjs`, from line 52) is the fallback when `roster.json` is empty. The live roster can be replaced with `PUT /api/staff/seed` from the private `badscandal-hq` repo. The names and jobs in code:

| Name | Role in code | What they own |
|---|---|---|
| Nova | Chief of staff | Duties, the task board, chasing, recommendations. Sees every tool. |
| Alfred | Luke’s assistant | The 10:00 briefing. Does not log numbers. `luke_briefing` and `luke_short_briefing` are filtered to him. |
| Ledger | Income | Payments, sources, month close. Royalties since 11 Nov 2026. |
| Sheet | Income sheet | The same income tools as Ledger. |
| Steve | Instagram | Growth, ranking, account health for Instagram. |
| Kevin | TikTok | Growth, fan signals, account health for TikTok, TikTok profile jobs. |
| Laura | YouTube | Growth, videos, Content ID claims, YouTube profile jobs, account health. |
| Atlas | Spotify and stores | Song numbers, monthly listeners, Spotify for Artists upcoming, pitches, DSP profile jobs, account health for Spotify. |
| Drop | Distribution (RouteNote) | Upload, store status, moderation. Account health is on his filtered list too. |
| Verse | Lyrics | Musixmatch after release day. Pitch/lyrics approval is Luke’s. `preflight` is on his list. |
| Webmaster | Website | Song pages, the home card, `site_ok`. |
| Forge | Ads | Google and TikTok spend. Meta spend is recorded by HQ itself. Monday ad pick is a decision for Luke. Forge does not launch ads. |

Two more callers exist and are not in that table:

- **Licence.** Not on the BADSCANDAL roster. `toolsFor("Licence")` returns only `releases` and `release_step`, and only for a Label cover (`netlify/lib/staff-tools.mjs` around line 547).
- **HQ.** The site itself posts the three-times-a-day check, chase reminders, and some profile alerts, as the sender `HQ`.

Luke’s list for this handoff named Nova, Forge, Kevin, Steve, Laura, Webmaster, Atlas, Drop, Verse, Ledger and Sheet. Alfred, Licence, Claude and HQ are in the code as well. Use the table when a tool says who may call it.

### Architecture

```
Luke's phone/Mac  --cookie-->  /hq  -->  /api/hq/*  /api/admin/*  /api/staff/*  /api/bank/*
Bots / Claude     --bearer-->  POST /mcp  -->  callTool()  -->  staff Blob store
Song pages / home --none---->  POST /api/hit , POST /api/capi
Sheet IMPORTDATA  --?key---->  GET /api/feed/meta-daily.csv , meta-ads.csv
```

**Hosting.** Netlify project `profound-haupia-db7ffa`, site id `41c9b6ee-3a12-4b2f-ba7c-8dac83281622` (named in `CLAUDE.md`). `netlify.toml` publishes the repo root with an empty build command. HTML, CSS and JS at the root are `no-store`. `/assets/*` is immutable for a year: a changed asset needs a new filename. Functions live in `netlify/functions/` and are bundled with esbuild. `@netlify/blobs` is the only production dependency.

**Plan and credits (owner’s record, not in git).** Luke described the site as a credits-based Netlify Personal plan: production deploys pause when credits run out. On 18 Nov 2026 he bought 500 credits and deploys could run again. That sentence is his, for this handoff. It was not found in commit messages or GitHub issues. What *is* in git is PR #86, still open, which says Netlify created and then skipped the production builds of `41681e3` (#83) and `68eaced` (#84) in the same second, with the page text “This deploy didn't run because a new one was scheduled for the same branch.” That is a different skip reason from “credits ran out”. Deploy previews kept building. See section 7.

**How a deploy reaches badscandal.com.**

1. A pull request runs `.github/workflows/tests.yml` (Node 22, `npm ci`, `npm test`). It does not push.
2. Luke says deploy or publish. The branch is squash-merged to `main`.
3. Netlify watches `main` and publishes the repo root. The historical note in `CLAUDE.md` is about ten seconds when the build is not paused.
4. Scheduled functions run on the published production deploy only (the function files say so).
5. A song page is a second path: after Luke answers “Yes, correct”, production calls GitHub `repository_dispatch` type `song-page` with `GITHUB_SONG_TOKEN`. `.github/workflows/song-page.yml` checks out `main`, builds the page, runs `npm run test:song`, pushes the page to `main` (which deploys), then runs the full suite as a report. The report goes to the `song-builds` branch, which has a stub `netlify.toml` so that branch does not publish the site.

Preview URL shape, from `docs/WORKING-WITH-LUKE.md`: `https://deploy-preview-<PR>--profound-haupia-db7ffa.netlify.app/hq`. `?sample=1` shows made-up numbers after login and does not open a real store.

**Storage.** Five Blob stores (see section 5):

| Store | Consistency in code | Holds |
|---|---|---|
| `staff` | strong | The desk |
| `stats` | default | Visit keys, CAPI health |
| `meta-cache` | default | Sheet cache, Meta insights, FX, feed files, Meta key health |
| `admin-auth` | strong | Login rate limit |
| `bank` | strong | Revolut connection (`conn.json`, `state/`, `sync.json`) |
| `instagram` | strong | Instagram reader cache |

Deploy previews use `getDeployStore` for `staff`, `stats` and `meta-cache`. They do not write production.

**Auth, short version.**

| Caller | Proof | May |
|---|---|---|
| Luke | `__Host-bs_admin` | `/hq` and `/api/staff/*`, `/api/admin/*`, `/api/hq/*`, `/api/bank/*` except the public bank callback. POSTs must come from our origin. |
| Bots | `Authorization: Bearer` `STAFF_BOT_KEY` (a bare token is also accepted) | `POST /mcp` only. `/api/staff/*` returns 403. |
| Claude | Bearer `STAFF_CLAUDE_KEY` | `/mcp` and the staff/board/bank reads the code allows. |
| Sheet | `?key=` equals `SHEET_FEED_KEY` | The two CSV feeds. Wrong, missing, or unset → plain 404. The query string is not logged. |
| Public | none | `/api/hit`, `/api/capi`, `GET /api/staff/cover/*`, `GET /api/bank/callback`. |

If neither staff key is set, `/mcp` returns 503 “The connector's keys are not set on Netlify”.

**Service worker.** `hq-sw.js`.

- `CACHE = "bs-hq-v8"` (comment: 18 Nov 2026, profile masters and the button contrast fix).
- Content hash `V = "4ab434d19b82"` on every HQ script URL. Tests in `tests/hq-boot.test.mjs`, `tests/hq-staff.test.mjs` and `tests/profile-images.test.mjs` assert the cache name.
- Registered from `js/hq-shell.js` with scope `/hq` only.
- Precaches `/hq`, the HQ scripts, `hq.webmanifest`, and `assets/hq-icon-192-v1.png`.
- Network first, 8 second timeout, then the cached copy. `/api/*` is never cached.
- On activate it deletes other `bs-hq-*` caches.
- Bump `CACHE` when the shell file list changes. A new hash alone is a new cache key because the query string is part of the key.

**Phone boot.** `hq.html` has an inline boot guard. If the scripts never paint, the page shows Try again and Reset app (PR #83). That was the blank home-screen app: a bad connection mixed an old script with a new page.

---

## 2. Every page, section, tab and card

`hq.html` is the shell. Scripts, in the order the service worker lists them: `crt.js`, `hq-lib.js`, `hq-look.js`, `hq.js`, `hq-staff.js`, `hq-phone.js`, `hq-shell.js`, `hq-workspaces.js`, `hq-app.js`, `hq-cmd.js`, `hq-pages.js`.

`js/hq.js` `refresh()` asks, in parallel:

- `GET /api/hq/data` — the sheet model (Today numbers, songs, growth, fans, money, team, cap).
- `GET /api/admin/overview?range=` — page counters, Meta spend, yesterday, series.
- `GET /api/staff/board` — desk: messages, releases, income, profiles, account health, `auto` (the Needs you action cards).
- `GET /api/hq/instagram` — the Instagram reader.
- `js/hq-pages.js` → `GET /api/admin/data` — the Pages tab.

Overview and Pages refresh about every 60 seconds. The sheet is on the 5 minute timer in `js/hq.js`, and the header Refresh button runs the lot. Coming back to the page after a longer gap refreshes at once. Last good answers sit in `localStorage` (`bs_hq_last_sheet`, `bs_hq_last_ov`, `bs_hq_last_staff`, `bs_hq_last_pages`) and are shown “as of &lt;time&gt;” when offline. Sample mode (`?sample=1`) does not write those keys.

### Tabs

`TABS` in `js/hq-shell.js`. The hash is the address. The last tab is `bs_hq_tab`.

| Hash | Section id | Rail label | Phone |
|---|---|---|---|
| `#today` | `today` | **Needs you** (the old name Today is the section, not the label) | Bottom bar, first |
| `#songs` | `songs` | Songs | Inside More |
| `#ads` | `ads` | Ads | Inside More |
| `#pages` | `pages` | Pages | Inside More |
| `#growth` | `growth` | Growth & Fans | Inside More |
| `#profiles` | `profiles` | Profiles | Inside More |
| `#releases` | `releases` | **Upcoming** | Bottom bar |
| `#money` | `money` | Money | Bottom bar |
| `#team` | `team` | Team | Bottom bar |
| `#messages` | `messages` | Messages | Inside More |

`#fans` aliases to `#growth/fans`. Deep links: `#songs/<slug>`, `#team/<bot>`, `#messages/<id>`, `#releases/new`.

Desktop (900px and up): left rail, all ten tabs, Log out. Phone: bottom bar is Needs you, Upcoming, Team, Money, More. More opens `#moreSheet` (Pages, Growth, Fans, Profiles, Songs, Ads, Messages, Log out). The More button must not sit on top of Log out (that signed Luke out; fixed in PR #47).

### Chrome that is not a tab

| Piece | What it does | Empty / error |
|---|---|---|
| `#login` | `POST /api/admin/login`. | “Wrong password.”, “Couldn't log in.”, “No connection. Try again.” If `bs_hq_signout` is set, `HQLib.signoutWords()` says whether he pressed Log out or which API answered 401. |
| `#boot` | Shown until the first good paint. | Try again / Reset app if scripts never run. |
| `#sample` | `?sample=1`. | Banner. Writes are refused. |
| `#sheetOff` | Sheet not connected. | Button to `?sample=1`. |
| `#netBar` | A failed answer. | Retry. Last good copy stays. |
| `#rangeSel` | Today, 7 days, 30 days, This month, Custom. Shared by Songs, Ads and Pages. Stored in `bs_admin_view`. “This month” is the 1st through today, São Paulo. | |
| `#healthBtn` / `#healthSheet` | `HQLib.healthRows()`. Sheet age, Meta key, page counter, exchange rate, connector, site check, Revolut, bots. | Dot colour from `healthState()`. |
| `#quietBtn` | `bs_hq_quiet`. Filters the live feed on the device. This is **not** the 23:00–08:00 quiet hours. Those are server-side on action cards. | Label “Quiet on” / “Quiet off”. |
| `#refresh` | Full reload of the five answers. | |
| `#wsSwitch` | Workspace. See below. | |
| `#cmdBtn` | `js/hq-cmd.js`. Search over tabs, songs, bots. No server. | |
| `#detailSheet` | Release detail. `openRelease()` / `HQLib.releaseDetail()`. Missing steps first. Escape, scrim, or ✕ closes it. | |
| CRT wordmark | `js/crt.js`, class `.crt-hq`. Static text when reduced motion is on. | |

### Workspaces — BADSCANDAL, Social Farm, Label

`js/hq-workspaces.js`. Buttons `data-ws`: `badscandal`, `farm`, `label`. Last choice: `localStorage` `bs_hq_ws`.

BADSCANDAL is the normal ten tabs. Farm or Label sets `body.ws-on`, hides the main views, and shows `#workspace`.

`GET /api/staff/workspace?ws=farm|label` reads that workspace. `POST /api/staff/workspace` is the form (Luke or Claude).

Rules in `netlify/lib/workspaces.mjs` (PR #84, tests in `tests/workspaces.test.mjs`):

- Farm pages and Label covers, spend and payouts stay off the official numbers, the scoreboard, the USD 1,000 cap, and the official Instagram, TikTok and YouTube tools.
- A card with `workspace` `farm` or `label` is on that workspace’s Needs you. It is not on the BADSCANDAL list. The same header string is used (`needsHeader`). The Farm/Label screen falls back to `0 need you · nothing at risk` when there is no header (`js/hq-workspaces.js` around lines 71–73).
- Label is covers only. The genre list starts with UK garage. Each genre has a playlist placeholder, status “not set up”.
- A Label cover’s steps are licence (owner bot `Licence`), then upload, then pitch. Drop’s upload stays blocked until the licence status is `licensed`. Only `Licence` or Nova can mark the licence step. HQ does not pay a licence.
- Official BADSCANDAL releases have no licence step.
- `log_growth` with `workspace` `farm` (account or post) or `label`. `record_spend` with `workspace` `label` is not in the cap. `submit_income` with `workspace` `label` is a label payout.

### Needs you (`#today`) — read this before trusting the header

There are **two different sentences** that both contain the words “need you” and “at risk”. They are not the same count. This is the cause of the 18 Nov 03:20 São Paulo screen. The investigation is in section 9. The pieces:

**A. The pulse line** (`js/hq-look.js` `homePulse`, lines 46–51), drawn by `js/hq-phone.js` `drawHome` (lines 133–136) into `<p class="pulse-n">`.

- `need` = wallet cards from decisions waiting on Luke, plus `auto.needsYou` (action cards), plus red account-health rows.
- `risk` = **the length of `HQLib.attention(...)`**. That array is alerts: cap warn/stop/over, late release steps, sheet errors, a bot quiet for 3+ days, blocked or late duties, Meta key expired or failing, an ad with USD 10+ and 0 real taps over 7 days, yesterday’s spend with 0 taps or a cost per tap over 2× the median, Meta vs sheet mismatch, messages waiting, Spotify-for-Artists questions, income problems. It is **not** a sum of money.
- Both zero → “You're all caught up”.
- Otherwise → `"<need> need you · <risk> at risk"`, including when need is 1. The code comment says the words stay as written for 1 as well.

**B. The action-card subhead** (`<p class="dhead">`), the string `auto.header` from `needsHeader()` in `netlify/lib/action-cards.mjs` lines 145–154.

- Count = open action cards on the BADSCANDAL Needs you list (`action-cards.json`, waiting on Luke, not expired).
- “at risk” here is a **sum of `money_at_risk` amounts by currency** (EUR, then USD, then the rest). No such amounts → “nothing at risk”.
- So the text is `0 need you · nothing at risk` when there are no open action cards, even if a lyrics decision and eleven attention rows are on the same screen.

**C. Quiet hours** (23:00–08:00 São Paulo, `quietNow()`). 03:20 is inside that window. Non-money action cards move to `held`. The header is built from `needsYou` only, so it can still say `0 need you · nothing at risk`. Held cards, if any, get their own line: “Quiet hours until 08:00. These wait.” A lyrics **message** is not an action card, so quiet hours do not hide it.

**What the phone then draws, in order** (`drawHome`):

1. Pulse.
2. `dhead` plus Yes / No / Edit stacks for `auto.needsYou`. Yes/No/Edit → `POST /api/staff/card` `{id, choice, text?}`. Sample mode does not send.
3. Quiet-hours held cards, without the buttons counting as a proceed.
4. Wallet stack from `HQLook.decisionStack`. These are **messages** with `needs: "decision"` and options, addressed to Luke. A message whose `approval.what === "lyrics"` is the lyrics card: sender name (Verse), a diff when the pack text is there, button label “Yes, correct”. Answering uses the message id (`data-decide`), not the card endpoint.
5. Red account-health cards, link “Open” to `#growth`.
6. Account dots (green / watch / red).
7. “Waiting on others” from `auto.waitingOnOthers` (label, store, another bot).
8. If nothing in the need list and nothing held: “Nothing is waiting on you.”
9. Folded “Waiting on Luke (N)” for blocked/waiting `T-` tasks. These are parked. They are not in the pulse need count.
10. Watchers (`HQLib.phoneWatchers`): RouteNote mail, RouteNote messages.
11. Monday pick (Forge’s decision plus the Instagram ranking), when there is a ranking.
12. Release hero, milestones, platform KPIs.
13. Ad-spend gauge (`#adsGauge`). Missing cap → “Ad spend this month: not reported”. Marks at 750 and 900.

`#briefFold` (“The rest of today”) is the desktop briefing, still inside `#today`:

| Block | Source | Empty |
|---|---|---|
| `#waitLine` | Link to `#messages` when something waits | Hidden |
| `#attnList` | Same `attention()` array | “Nothing needs attention.” |
| `#sinceCard` | `changesSince()` vs `bs_hq_seen` | Hidden until two visits |
| `#siteCheck` | The HQ→Luke check message | |
| `#brief` | `briefing()` — 3 to 5 sentences. Can say “1 thing needs you below.” or “Nothing needs you today.” This is a third wording, not the pulse and not the card header. | |
| `#copySummary` | Plain text for WhatsApp | |
| `#tiles` | Range vs the period before: spend, real taps, cost per tap, streams, listeners, followers | No Meta → no spend tiles (never “USD 0”) |
| `#capTile` | Combined cap | |
| `#nextTile` | Next release. Opens the detail sheet. | |
| `#forLuke` | Sheet tasks for Luke. Label on the phone path is “Your tasks”. | |

`#todaySub` is only the sheet date.

**Snooze.** `bs_hq_later` hides a wallet or card for 6 hours on this device only. The server still has it. `needs_you` does not know about the snooze.

**Do not confuse `cards.json` with `action-cards.json`.** `cards.json` is “what I am working on” (`set_my_card`). `action-cards.json` is Luke’s Yes/No/Edit cards. The phone also reads `board.actionCards`, but `GET /api/staff/board` does not set that field. It sets `auto`. So the wallet is filled from messages, not from a second card array. `js/hq-phone.js` `lyricsCard()` (the markup “Verse · final lyrics”) is **never called**. The card Luke sees is `walletCard()`.

### Songs (`#songs`)

`#artistCard` — Spotify monthly listeners from the sheet (`HQLib.artistLines`): the number, the 7-day change, Brazil and its share, a trend. Missing stays missing.

`#songList` — one card per song, `id="song-<slug>"`. Sheet side: streams, listeners, saves, momentum (last 7 days vs the 7 before, only when both weeks have 4+ days, otherwise “new”), royalties. Our side, from overview for the header range: visits, people, real Spotify taps. Meta: spend and cost per tap when the ad matched the song. A song with no page of ours says “no song page for this one”. A released song gets a Released pill and “Released | &lt;day&gt;”. The public song page never says Released.

`#errSongs` — sheet tab errors (Songs, Royalties). The section says the tab cannot be read instead of looking empty.

Per-song profit line (PR #67): “Ad spend for this song”. A row counts only when it names the song. Anything else is “not linked to a song” and is not added in.

### Ads (`#ads`)

Read-only. Nothing on this page pauses an ad.

- `#adsPins` / `#adsGauge` — `HQLib.spendGauge` / `adsPins`. Cap USD 1,000, warn 750, stop 900 (`MONTHLY_CAP` in `netlify/lib/metaspend.mjs`). A non-USD account is flagged, not converted, on the Meta-only card. The EUR line is an estimate next to the real amount, at the month’s average ECB rate (`netlify/lib/fx.mjs`).
- `#capCard` — combined Meta + Google + TikTok from the sheet, with Meta’s own daily totals replacing the sheet’s Meta rows when the read works (`metaSpend()` in the HQ model). A day that differs by more than 1.00 is listed as “&lt;day&gt;: Meta X · sheet says Y”. If Meta cannot be read, the sheet’s rows stay and the page says so.
- `#spendCard` — cost per tap by ad (with its song), by song, by day. Match is `adKey` of the ad name to `utm_content`. An unmatched ad goes to the song whose title or slug is in the campaign, ad set, or ad name, else “not matched”.
- `#healthCard` — Meta events: sent / accepted / errors / bots blocked, and “Meta: sending OK” or the last error. Warns while `META_TEST_EVENT_CODE` is set.

Display only. The bots and Luke switch ads off. HQ does not.

### Pages (`#pages`)

`js/hq-pages.js`. `GET /api/admin/data`. CSV: `GET /api/admin/csv`. “Don’t count this device”: `POST /api/admin/exclude` (cookie `bs_nostat` plus `localStorage`).

- `#songTiles` — one tile per song page (PR #59): live or not, GitHub’s reason when a build failed, what the button does, people, Spotify taps, whether Meta is receiving that page’s events, and whether it is the home card. Meta health records only carry a page from 17 Nov 2026 onward.
- `#link` — page picker. Opens on the newest song that is already out. Songs from `songs.json`, newest first, plus Home.
- `#tHumans` / `#tBots` — `bs_hq_bots`. Humans only hides `noact`, data-centre, crawler, headless, webdriver, fasttap, synthetic, `me`, `test`, and the other flags in `netlify/lib/admin.mjs`. “Show everyone” includes them.
- KPIs, funnel, chart, sources, places, in-app browser, devices, came from, speed, Meta-can-see, bots, visit log. Phone uses `#mlog` cards. Desktop uses `#logBody`.

A person is counted only after a real touch, pointer, wheel, scroll, or key while the page is on screen (the `act` hit), or a store tap, or a consent answer. Meta PageView and ViewContent fire on that first interaction, not on load. Reloads inside 30 minutes are one visit.

### Growth and Fans (`#growth`)

- `#growthList` — followers per platform from the sheet, best days and the posts that went with them. Under a week of readings, the label is “in N days”, not “in 7 days” (PR #47).
- `#igBox` — Instagram reader. Connect / sync / disconnect: `POST /api/hq/instagram/key`, `/sync`, `/disconnect`. The key is pasted once. HQ exchanges it for the Page token and does not keep a browser login. A rate limit pauses reads for a day. A block or a refused key stops them until a new key is pasted. A normal hour is at most 3 read calls. The Page id in code is `101630812698451`; `FB_PAGE_ID` overrides it.
- Ranking (“What engages best”, PR #60, tightened in #69): engagement per view at the same age (the 1-day numbers). Floor 1,000 views. Our own accounts’ comments are left out. Saves+shares per view and follows per view. The ad that boosted the post (spend on the post’s day or the next day) shows its spend, its engagements, cost per engagement, and the numbers from before the ad. Fewer than 10 ranked posts: the order is “not settled yet”. Older than 21 days: the reference list, not the ranking.
- `#claimsBox` — Content ID claims Laura recorded with `log_growth`. A blank claimant or impact is “not reported”. An empty list means none has been recorded. HQ does not look Content ID up itself.
- `#fanTable` — sheet Fans tab (repeat commenters, the old sheet view).
- `#fanInbox` — part 1 of L3 (PR #66), drawn from comments already stored. Song-name questions, where-to-listen questions, and people who comment on more than one post. `needs_reply` true is “Needs your reply” for Luke. HQ never replies, likes, hides, or deletes. Two named accounts are never shown. No extra Instagram call. Part 2 (country, and a reply Luke approves) is not built.

### Profiles (`#profiles`)

PR #64 plus the master upload in PR #87.

- `#profPhoto` and `#profBanner` — Luke uploads one master photo and one master banner. `POST /api/staff/profile-master`. Only Luke. A shape that fits is resized in the browser. A shape that does not fit is **not cropped**. It becomes an open job.
- `#profList` — `HQLib.profileBlocks(board.profiles)`. Per platform: the image that is live and the day it changed, the size rule (or “Rule not set”), a proposal waiting for “Yes, correct”, and the owner who uploads it by hand.
- Jobs: `profile_jobs`, `profile_master`, `profile_rework`, `profile_uploaded` (section 3). A job open more than a day asks Luke once (`profileAlerts`).
- Owners in the tool text: Atlas (Spotify, Apple Music, SoundCloud, Deezer, Amazon Music, TIDAL), Laura (YouTube), Kevin (TikTok), Steve (Facebook). Instagram is Luke’s to upload. X has no owner: Luke uploads that one. Deezer is a square of at least 1200. TikTok’s help only requires 20 px; the file we prepare is 720. TIDAL is a square 1500.
- `GET /api/staff/profile-file/...` is not public. Luke’s cookie, Claude’s bearer, or the bot’s bearer on that path only.
- HQ never logs in and never sends a file to a platform.

### Upcoming (`#releases`)

The id stays `releases`. The label is Upcoming.

- `#relNow` — `upcomingAsks()`: lyrics approval, pitch approval, resubmit, a song in Spotify for Artists that only Luke can name. Empty: “Nothing on this tab needs you right now.” The count chip is “Needs you (N)”.
- `#relRows` / `#relDesk` — scheduled releases. A card shows the deal (self-release or with a label), missing pack fields, steps with late / waiting / skipped, the next step someone can work on, and warnings. Red is a failure. A step waiting on a date, on Luke, or on a decision he already made stays calm (PR #65). “Sent N days before release” is amber. A sent pitch is on the pitch line, not under Your approvals.
- `#relNew` / `#relForm` — `POST /api/staff/release`, then `release/send`, `release/date`, `release/cancel`, `release/step`, `release/remove`. `GET /api/staff/fields` builds the form even before the board arrives. `GET /api/staff/release?id=` is the one call that returns lyrics. The board copy does not.
- `#relPipe` — drafts.
- `#relPlan` — “The next 6 weeks” (`sixWeeks`), the pitch-slot calendar, the timeline.
- `#relSpot` — what Atlas last reported from Spotify for Artists. Luke answers `POST /api/staff/sighting` with `self`, `label`, `notmine`, or `mistake`.
- Preflight line on a card: “Check before it goes to the stores: N thing(s)” from `HQLib.preflightLine`.
- Pitch tracker (PR #63): not pitched, pitched with the day, or missed. Warns from 14 days out. Spotify wants the pitch 7 days before release. One pitch in 14 days: the later song’s pitch step is skipped and the card says why. Editorial playlists show when Atlas recorded them. HQ never pitches.

Release steps, dated back from the release day (`RELEASE_STEPS` in `netlify/lib/staff.mjs`): upload (Drop, 21 days), approved (Drop, 16), showing in Spotify for Artists (Atlas, 15), pitch (Atlas, 14, after the Spotify step), lyrics (Verse, 10, and it waits until release day for Musixmatch), song page (Webmaster, 7), video (Laura, 7), ads made with Luke after release (Forge, 1 — the step waits for release day), live (Webmaster, 0). There is no teaser step. A date already in the past becomes today when the release is sent late (`tight` if sent fewer than 21 days out). A waiting step is never late. Only Luke marks his own step done. No bot marks a waiting step done.

### Money (`#money`)

- “Money coming in” — `drawIncome()` from `board.income`. One received total per currency (PR #80). **Only money that has landed in Revolut counts.** Wise and PayPal confirm who paid. They show as waiting, or as “moved to Revolut” once `link_transfer` ties them, and they are not added into received.
- Main sources: green when that month’s money is received, red when `due_day` has passed without it (`income_source` `main` and `due_day`).
- Per song — `#songPL`. Same numbers as the `song_pl` tool.
- Monthly table from the sheet, each amount in its own currency plus an EUR estimate when the rate exists.
- Revolut tile — `GET /api/bank/status`, `POST /api/bank/connect|sync|disconnect`. Connect is Luke only and production only. The morning sync is the scheduled function (section 4). Unsorted payments are “To sort”: `POST /api/staff/sort`.
- Expected money (PR #71): each statement is an expected row. Due day is the one Ledger set, else learned, else not known. Short, late, and missing are flagged. Days between statement, payable, paid, and landed only where the dates were recorded.
- Payout route cost: fee only when the sent amount and the landed amount are the same currency. A currency change says “not enough data”. No rate is guessed.
- Month chip: Open / Ready / Closed. `close_month` needs `month_check` ready and at least one https evidence link. Later edits show old → new. CSV: `GET /api/staff/month-close.csv`.

### Team (`#team`)

- `#teamStrip` — phone dots, one per bot.
- `#teamSum` — stuck / quiet / on track.
- `#dutyList` — one card per roster bot, including a bot with no duty today. States: Blocked, Late, Quiet today, To do, Working, Done, No duty today, Paused. Today’s duties and times, latest update and age, working on / needs, last time they used the connector, “Copy message for Nova” when blocked or late, and a “Why this bot” disclosure.
- `#liveFeed` — sheet `Updates` tab merged with desk `upd/<day>.json`. No doubles. A connector `done` or `blocked` can finish a `D-` duty the sheet still shows as to do. The sheet’s own `done` wins.
- `#connFold` — bots’ key on/off. `POST /api/staff/config` `{botsOn}`. Luke only.
- `#autoCard` — “Taps count as Luke’s yes” (off until he switches it on) and one webhook box per bot. `POST /api/staff/auto`. The page shows the host only, never the full URL. Empty means off. See `docs/DESK-PUSH.md`.

If the board fails, Team falls back to the sheet duties. The page does not go blank.

### Messages (`#messages`)

- `#waitList` — waiting on Luke. A decision asks “Send this answer?” before it sends. Reply goes to the newest open question from that person (`HQLib.answerTarget`), `re` = that message’s id, not the thread root.
- `#answeredCard` — last answers, with “Sent … · Read by …”. The word is Read, not Seen.
- `#composeForm` — `POST /api/staff/message`. Draft kept if the send fails. 16px fields so iOS does not zoom.
- `#threadList` — threads. The site check folds after 8 lines.
- Badge on the nav item. Red dot on the phone More button.

A message from Luke with `re` settles the message it answers. For everyone else, only `needs: reply` is settled by an answer. The answer is saved first, then the question is closed, so a full board cannot lose the answer.

### States that show up everywhere

| State | What you see |
|---|---|
| Loading | `.ph` placeholders, `#boot`, `#pgLoading` |
| Sample | Banner, buttons disabled, `write()` refuses |
| Sheet error | The tab name and the error token (`#REF!`, `#N/A`, `#ERROR!`, `#VALUE!`). “Part of the tab…” when some rows still read |
| Staff failed | Team uses the sheet. Messages says so, with Retry |
| Offline | `#netBar` and the last good copy |
| Not logged in | `#login`. Any 401 from any answer shows it |
| Quiet hours | Action cards that are not money-at-risk are held until 08:00 São Paulo. Push uses the **device** timezone for 23:00–08:00, which can differ from São Paulo |
| Not reported | A missing number, a broken date, a blank Content ID field. Never `Invalid Date`, never a guessed 0 |

### Source pills

Small labels on numbers that say where the figure came from, so a made-up number cannot hide. Examples in the phone layout (`js/hq-look.js` and `js/hq-lib.js`):

- Milestones: “Spotify streams logged” plus the day.
- Account health signals: “posts the bot recorded”, “Instagram reads HQ already stored”, “recorded by &lt;bot&gt;”, “Atlas's log”. The Spotify wording is wrong for a DSP. See section 9.
- Cap gauge parts: Meta, Google, TikTok, each named on the segment.
- RouteNote: “RouteNote email: not connected” or “not reported” when a parsed mail has no status.
- Growth gaps: the bot’s own `not_read` / `gaps` text, or “not reported”.
- Money: “Only money that has landed in Revolut counts”, “moved to Revolut”, “not linked to a song”, “not enough data”.

---

## 3. The 47 connector tools

Counted from `export const TOOLS` in `netlify/lib/staff-tools.mjs` (the array ends just before `export const CLAUDE_TOOLS = []`). There are 47 names, all unique, and each has a `case` in `callTool`. `CLAUDE_TOOLS` is empty, so Claude gets the same 47.

The tests that assert `TOOLS.length === 47` include `tests/mcp.test.mjs`, `tests/money-links.test.mjs`, `tests/profile-images.test.mjs`, `tests/song-pl.test.mjs`, `tests/watchers.test.mjs`, `tests/workspaces.test.mjs`, `tests/account-health.test.mjs`, `tests/expected-money.test.mjs`, `tests/fan-inbox.test.mjs` and `tests/hq-auto.test.mjs`.

**Version.** `toolsVersion(tools)` is an FNV-1a hash of the sorted `name:prop` strings. It is `serverInfo.toolsVersion` on initialize / discover, and `connector.version` on `my_day`. `connectorStatus` asks for a reconnect only when `tools_seen` or `tool_names` differ. A version mismatch alone does not. PR #88 changed this. Older handoff text that says “reconnect when tools_version differs” is out of date.

**Filtered list vs who may call.** `TOOL_USERS` (around line 534) only hides tools on `POST /mcp/<Bot>` and `POST /mcp?bot=`. A tool not listed there is visible to everyone. Nova, and any name not on the roster, sees all 47 (a typo must not hide a tool). **Who may succeed** is still the handler in `staff.mjs`. Seeing a tool is not the same as being allowed to write.

`bot` is required on every tool. The tests assert that.

### Rules that apply to every tool

- `whoIs` rejects a name that is not on the roster (Licence is special-cased).
- `config.botsOn === false` refuses every bot. Claude and Luke are separate.
- `secretIn` / `noSecrets` refuse passwords, login codes, API keys, private keys, IBANs and card numbers. They must **not** refuse an ISRC, a UPC, a 15-digit ad account id, or the words “token: expired”.
- Text is cleaned and cut. Links must be `https://`.
- An amount that cannot be read is refused, never stored as 0.
- Currency is the three-letter code as paid. HQ does not convert it inside a write.
- Rate limits live in `LIMITS` in `staff.mjs` (updates, messages, payments per day).
- Every call updates `seen/<bot>.json` (`touchSeen`).
- A failure the bot can fix is a tool result with `isError` and a sentence that says what to do. An unknown tool name is a protocol error `-32602`.
- Quiet hours for **cards**: 23:00–08:00 São Paulo. Only `money_at_risk` (and every `payment`) may sit on Needs you then. Payments and signatures always say Luke does them himself. Ads and the Monday pick say HQ never changes an ad and never chooses an amount.
- “Taps count as Luke’s yes” is off until Luke switches it on. While it is off, a Yes is recorded and the bot still confirms with him. `my_day` `luke_tap` returns yes only when the switch is on **and** the choice, version, and action match. Drop must call `luke_tap` before distribute, resubmit, or a moderation reply.

### `my_day` — My day

- **Lines:** 137–145. **Marked read-only.** It does write `read/<name>.json` when it hands over messages.
- **Who:** everyone. Claude gets a shorter shape. Start every run here.
- **Parameters:** `bot` required. Optional `tools_seen` (integer), `tool_names` (array of strings), `list_version`, `tools_version`, `luke_tap` `{id?, dedupe_key?, version, action}`.
- **Reads:** the desk (duties, tasks, messages, releases, cards), `action-cards.json` for tap checks, Instagram state for blockers.
- **Writes:** the read marker only.
- **Returns:** duties with São Paulo deadlines, open `T-` tasks, `questions_to_luke`, `messages_for_you` (newest 30 since last read, plus `more_messages`), `card_answers`, release steps, the connector line (`tools` count and `version`), and `luke_tap` when you passed one.
- **Example:** `{"bot":"Nova","tools_seen":47,"tool_names":["my_day","post_update"]}`
- **A correct result:** `connector.tools` is 47, `reconnect_needed` is false when the count and the names match, and `luke_briefing` is not this tool.
- **Check:** `tests/mcp.test.mjs`, `tests/tools-version.test.mjs`.

### `post_update` — Post an update

- **Lines:** 146–157. **Write.** `idempotent: false`.
- **Who:** roster bots. Claude is refused.
- **Parameters:** `bot`, `status` (`working|done|blocked|error|info`), `message` required. Optional `duty` (`D-…`), `link` (https), `gaps` (only with `done`), `card` (`k…`), `proof_message`, `proof_ref`, `proof_link`.
- **Writes:** `upd/<São Paulo day>.json`. `done` or `blocked` can finish or block today’s `D-` duty. A `release` on the update does not finish a daily duty. Proof goes through `recordProof` on `action-cards.json` and the update is saved only after the proof is accepted.
- **Guards:** message ≤ 240 characters, secrets refused, one missing number is `gaps` on `done`, never `blocked`.
- **Example:** `{"bot":"Atlas","status":"done","message":"Spotify numbers logged for 2026-11-17","gaps":"saves: the page did not show them"}`
- **Check:** `tests/staff.test.mjs`, `tests/hq-auto.test.mjs`.

### `send_message` — Send a message

- **Lines:** 158–192. **Write.** Not marked read-only.
- **Who:** anyone on the roster, to Luke, Claude, a bot, or `all`.
- **Parameters:** `bot`, `to`, `text` required. Optional `needs` (`none|reply|action|decision`), `reply_to`, `options` (2–4, only with one decision), `questions` (2–6, not with options, not to all), `about`, `approval` `{song, what: pitch|lyrics, text?}`, `answers`, `recommend`, `recommend_option`, `card` (see the card object in the schema: `kind`, `text`, `dedupe_key`, `action`, `owner`, `recipient`, `amount`, `currency`, `link`, `preview`, `deadline`, `expires_at`, `waiting_on`, `money_at_risk`, `ticket`, `workspace`).
- **Writes:** `msg/<YYYY-MM>.json`, or `action-cards.json` when `card` is set. The same `dedupe_key` is never posted twice. A push sweep may follow a message that needs Luke. Desk push fires if that bot has a webhook (`docs/DESK-PUSH.md`): the POST body is `{desk, kind, bot, id, at}` only. No text, no amount, no link.
- **Guards:** quiet hours on cards; approval is only pitch (Atlas) or lyrics (Verse) and stores Luke’s exact text; money questions are not something Nova may answer later; `workspace` `farm` or `label` stays off the BADSCANDAL Needs you.
- **Example:** `{"bot":"Verse","to":"Luke","text":"Are these the final lyrics?","needs":"decision","approval":{"song":"Night Drive","what":"lyrics"}}`
- **Check:** `tests/staff.test.mjs`, `tests/decisions-inbox.test.mjs`, `tests/hq-auto.test.mjs`.

### `record_luke_answer` — Record Luke’s answer from chat

- **Lines:** 193–198. **Write.**
- **Who:** Alfred or Nova only. Nova is refused when the message is from Ledger, Sheet, or Forge (money).
- **Parameters:** `bot`, `reply_to`, `luke_said` required. Optional `option`, `answers`.
- **Writes:** a message saved as Luke, marked via Alfred or via Nova, which settles the question the way Luke’s own reply would. `luke_said` must be his words, not a summary.
- **Example:** `{"bot":"Alfred","reply_to":"m-example","luke_said":"Yes, correct","option":"Approve"}`
- **Check:** `tests/staff.test.mjs` (the via-Nova and the money refusal).

### `recommend` — Add a recommendation

- **Lines:** 199–203. **Write.** Idempotent (a second call replaces yours).
- **Who:** Nova and Claude (`RECOMMENDERS`). Does not answer the question.
- **Parameters:** `bot`, `message_id`, `why` required. Optional `option`.
- **Writes:** the recommendation fields on that message.
- **Example:** `{"bot":"Nova","message_id":"m-example","option":"Approve","why":"The text matches the pack."}`
- **Check:** `tests/decisions-inbox.test.mjs`.

### `preflight` — Check before it goes out

- **Lines:** 204–215. **Read-only.** Idempotent flag is set; the handler does not write.
- **Who:** described for Forge, Drop, Verse, Webmaster, Atlas, Laura, and Nova. The filtered list matches that (Nova sees all). The handler does not add a second bot gate.
- **Parameters:** `bot` required. Optional `song`, `text`, `link`, `mode`, `asset` (`cover|canvas|spotify_header|youtube_banner` or a profile kind), `width`, `height`, `seconds`, `format`, `size_mb`.
- **Reads:** `releases.json` when `song` is set. Checks are pure: artist spelling `badscandal`, links to `https://badscandal.com/<song>`, master WAV, artwork JPG or PNG 3000×3000, Canvas MP4 or JPG, and the asset rule for the width and duration you pass. A field you leave out is not checked. The answer includes the whole rule.
- **Example:** `{"bot":"Webmaster","asset":"youtube_banner","width":2560,"height":1440,"format":"png","size_mb":4}`
- **A correct result:** `ok: true` only when nothing you passed failed. `ok: false` lists the problems in words.
- **Check:** `tests/preflight.test.mjs`, `tests/asset-check.test.mjs`.

### `close_month` — Close a finished month

- **Lines:** 216–219. **Write.** Idempotent.
- **Who:** Ledger, Sheet, Nova, Claude, Luke (`CLOSERS`). The filtered list shows it to Ledger and Sheet.
- **Parameters:** `bot`, `month` (`YYYY-MM`), `evidence` (array of https links) required.
- **Writes:** the month snapshot (`close/<month>.json` and `closes.json`). Refuses unless `month_check` says ready.
- **Example:** `{"bot":"Ledger","month":"2026-10","evidence":["https://example.com/statement.pdf"]}`
- **Check:** `tests/month-close.test.mjs`.

### `instagram` — The Instagram account’s numbers

- **Lines:** 220–227. **Marked read-only.** Two actions write: Nova’s `our_accounts` add/remove, and Steve/Forge/Nova linking a post to a song.
- **Who:** Steve, Kevin, Forge on the filtered list. Nova sees it. Post→song: Steve, Forge, Nova. Our-accounts add/remove: Nova only.
- **Parameters:** `bot` required. Optional `our_accounts` (`list|add|remove`), `handle`, `reason`, `post`, `song`.
- **Reads:** the `instagram` store and, when a refresh is allowed, Meta (at most 3 calls an hour). Returns followers, posts at 6 hours / 1 day / 1 week, ranking, fan inbox, countries.
- **Example:** `{"bot":"Steve"}`
- **Check:** `tests/instagram.test.mjs`, `tests/post-rank.test.mjs`, `tests/fan-inbox.test.mjs`.

### `task_update` — Update one of my tasks

- **Lines:** 228–233. **Write.** Idempotent.
- **Who:** the task’s owner, or Nova, Claude, Luke.
- **Parameters:** `bot`, `task` (`T-…`), `status` required. Optional `note`, `title`.
- **Writes:** `tasks.json`. Daily `D-` duties do not use this tool. They use `post_update`.
- **Example:** `{"bot":"Webmaster","task":"T-42","status":"done","note":"Song page is live"}`
- **Check:** `tests/staff.test.mjs`.

### `read_messages` — Read messages

- **Lines:** 234–245. **Marked read-only.** A broad read moves `read/<name>.json`. A narrowed query (from, to, about, search, id, count) does not.
- **Parameters:** `bot` required. Optional `show`, `limit`, `since`, `unread`, `from`, `to`, `about`, `search`, `id`, `count_only`.
- **Known gap:** the marker moves even when `limit` returns only part of the inbox (the default limit is 20). Messages past the limit can look already read.
- **Example:** `{"bot":"Ledger","show":"open","limit":20}`
- **Check:** `tests/staff.test.mjs`.

### `resolve_message` — Mark a message handled

- **Lines:** 246–248. **Write.** Idempotent.
- **Who:** the recipient, the sender, or Luke. A decision addressed to Luke is Luke only.
- **Parameters:** `bot`, `id`, `note` required.
- **Writes:** `msg/<month>.json`.
- **Example:** `{"bot":"Ledger","id":"m-example","note":"Sorted on the desk"}`
- **Check:** `tests/staff.test.mjs`.

### `submit_income` — Submit one payment

- **Lines:** 249–266. **Write.** Idempotent by account+reference, else date+payer+amount+currency.
- **Who:** filtered to Ledger and Sheet. The handler also allows Nova, Claude, and Luke where `staff.mjs` says so. `workspace: "label"` goes to the Label payout path, not the official total.
- **Parameters:** `bot`, `date`, `payer`, `amount`, `currency`, `account` required. Optional `status` (`pending|received|transfer|…`), `category`, `reference`, `period`, `note`, `song`, `store`, `workspace`, `genre`, `alias`.
- **Writes:** `inc/<YYYY-MM>.json`. `transfer` is never income. `unsorted` is reserved for the bank reader. Do not submit an amount you did not see.
- **Example:** `{"bot":"Ledger","date":"2026-11-17","payer":"Sample Label","amount":"112.01","currency":"EUR","account":"Wise","status":"pending","reference":"SAMPLE-1"}`
- **Check:** `tests/ledger-payments.test.mjs`, `tests/money-one-entry.test.mjs`.

### `fix_payment` — Fix a payment already on the desk

- **Lines:** 268–278. **Write.**
- **Who:** the submitter, or Ledger, Sheet, Nova, Claude, Luke. Not for `unsorted` (use `sort_payment`).
- **Parameters:** `bot`, `id`, `month`, `reason` required. Optional field overrides, including `date` (a payment counts in the month it arrived; the date can move it), `song`, `store`, `paid_by`, `category`.
- **Writes:** `inc/<month>.json`. A closed month lists the change as old → new.
- **Example:** `{"bot":"Sheet","id":"i-example","month":"2026-11","reason":"The statement was for one song","song":"Night Drive"}`
- **Check:** `tests/ledger-payments.test.mjs`, `tests/month-close.test.mjs`.

### `income_source` — Update an income source

- **Lines:** 279–287. **Write.**
- **Who:** Ledger, Sheet, Nova, Claude, Luke, or the source’s owner.
- **Parameters:** `bot`, `source` required. Optional `accounts`, `state`, `reason`, `category`, `needs_luke`, `main`, `due_day`, `create`.
- **Writes:** `sources.json` / `srcedit.json`. `main: true` plus `due_day` is what turns the Money tile green or red.
- **Example:** `{"bot":"Ledger","source":"Sample Distro","main":true,"due_day":15,"state":"active"}`
- **Check:** `tests/ledger-statements.test.mjs`, `tests/money-simple.test.mjs`.

### `record_spend` — Record a day’s ad spend

- **Lines:** 288–297. **Write.**
- **Who:** Forge, Nova, Claude, Luke, HQ (`SPENDERS`). Filtered list: Forge. Label workspace is not in the USD 1,000 cap.
- **Parameters:** `bot`, `platform` required. Optional `account`, `date`, `amount`, `currency`, `not_read` (why you could not read it), `song` (only when that day’s amount is one song — never guess from a campaign name), `workspace`, `genre`, `alias`, `days` (a batch).
- **Writes:** `spend/<YYYY-MM>.json`. HQ’s own hourly job writes Meta rows. Forge records Google and TikTok, and Meta only when the dashboard says Meta could not be read or Luke asks. Do not record the same money twice.
- **Example:** `{"bot":"Forge","platform":"Google","date":"2026-11-16","amount":"12.40","currency":"EUR"}`
- **Check:** `tests/growth-meta.test.mjs`, `tests/workspaces.test.mjs`.

### `log_growth` — Log a day’s growth or song numbers

- **Lines:** 298–337. **Write.** This is the wide tool.
- **Who:** Steve, Atlas, Kevin, Laura, Nova, Claude, HQ (`GROWERS`). Filtered list: Steve, Atlas, Kevin, Laura. Content ID claims: Laura. Account-health fields: the platform’s owner (Atlas or Drop for an artificial-streams warning; Atlas for a moved track; Webmaster for `site_ok`).
- **Parameters:** `bot`, `date` required. Then whichever of these you actually saw: platform metrics (`followers`, `change`, `views`, `monthly_listeners`, `brazil_listeners`, `channel_views`, `shorts_views`, song streams), `gaps`, `workspace` (`farm` or `label`), `claim` / `claimant` / `impact` (Laura; leave claimant or impact out when YouTube did not show them), and the account-health set: `account_status` (`clear|restricted|strike|copyright|ineligible|age`), `status_note`, `visible` (`yes|no|unknown`), `visible_where`, `non_follower_share`, `recent_posts` (array of `{at, views|reach}`, 12 at most), `artificial_streams`, `track_moved`, `moved_to`, `site_ok`, `site_note`.
- **Writes:** `grow/<YYYY-MM>.json`, `claims.json` on the claim path, `health/checks.json` on an account check. May also post a duty line so the duty counts as done with gaps.
- **Guards:** a number must be the digits you saw (`1,240` is allowed, an estimate is not). `recent_posts` is refused for the site. It is **accepted for Spotify**, and that is why account health then talks about “posts”. See section 9.
- **Example:** `{"bot":"Atlas","date":"2026-11-17","platform":"Spotify","monthly_listeners":"418000","brazil_listeners":"120000"}`
- **Check:** `tests/account-health.test.mjs`, `tests/growth-meta.test.mjs`, `tests/watchers.test.mjs`.

### `income_check` — Say an account was checked

- **Lines:** 338–342. **Write.**
- **Who:** filtered to Ledger and Sheet.
- **Parameters:** `bot`, `account`, `new_payments` (a count, including 0) required. Optional `note`.
- **Writes:** `chk/<YYYY-MM>.json`. This is how “nothing came in” is different from “nobody looked”.
- **Example:** `{"bot":"Ledger","account":"Wise","new_payments":0}`
- **Check:** `tests/staff.test.mjs`.

### `link_transfer` — Tie a Revolut payment to what it carried

- **Lines:** 344–348. **Write.** Not idempotent.
- **Who:** Ledger, Sheet, Nova, Claude, Luke (`SORTERS`). Filtered list: Ledger and Sheet.
- **Parameters:** `bot`, `revolut_id`, `month`, `from` (array of Wise/PayPal payment ids) required. Optional `note`.
- **Writes:** the `inc/` rows. The Revolut amount is what counts. Currencies need not match (PayPal often converts). The Wise/PayPal rows then say moved and are not counted again.
- **Example:** `{"bot":"Ledger","revolut_id":"i-rev","month":"2026-11","from":["i-wise"]}`
- **Check:** `tests/money-links.test.mjs`, `tests/money-one-entry.test.mjs`.

### `month_check` — Is a month’s income right?

- **Lines:** 349–351. **Read-only.**
- **Who:** filtered to Ledger and Sheet. Nova uses it too.
- **Parameters:** `bot` required. Optional `month`.
- **Reads:** `inc/*`, close state. Returns what is still to sort, Revolut credits from Luke’s own accounts not yet linked, money still waiting in Wise or PayPal, and whether the month is ready to close. `ready` means nothing is in the way.
- **Example:** `{"bot":"Ledger","month":"2026-10"}`
- **Check:** `tests/month-close.test.mjs`, `tests/expected-money.test.mjs`.

### `payments` — Every payment of a month, with its id

- **Lines:** 353–356. **Read-only.**
- **Parameters:** `bot` required. Optional `month`, `account`, `source`, `payer`, `status`, `changed_since`, `limit`.
- **Reads:** `inc/<month>.json` via `listPayments`.
- **Example:** `{"bot":"Sheet","month":"2026-11","account":"Revolut","limit":50}`
- **Check:** `tests/ledger-payments.test.mjs`.

### `income_status` — Income so far and what is missing

- **Lines:** 357–359. **Read-only.**
- **Who:** filtered to Ledger, Sheet, and Alfred. The full `/mcp` list shows it to everyone, and the handler allows a valid bot.
- **Parameters:** `bot` only.
- **Reads:** income state, and the HQ model for `per_song` (same computation as `song_pl`). Includes unsorted ids, pending matches, expected money, and payout routes.
- **Example:** `{"bot":"Ledger"}`
- **Check:** `tests/song-pl.test.mjs`, `tests/expected-money.test.mjs`.

### `team_board` — The whole team right now

- **Lines:** 360–362. **Read-only.**
- **Parameters:** `bot` only.
- **Reads:** `board()` plus release views. Includes `decisions_waiting_on_luke`.
- **Example:** `{"bot":"Nova"}`
- **Check:** `tests/staff.test.mjs`, `tests/hq-staff.test.mjs`.

### `luke_briefing` — What Luke needs to hear

- **Lines:** 363–365. **Read-only** apart from Alfred’s read marker.
- **Who:** filtered to Alfred. **Do not change the output shape.** New facts go on other tools.
- **Parameters:** `bot` only.
- **Example:** `{"bot":"Alfred"}`
- **Check:** any test that snapshots the briefing. If you add a field, you have broken the rule.

### `luke_short_briefing` — Luke’s short briefing

- **Lines:** 367–369. **Read-only.**
- **Who:** Alfred.
- **Returns:** the cap, income, the top 3 decisions by deadline, and every sign-in Luke has to do. Not the full briefing.
- **Example:** `{"bot":"Alfred"}`
- **Check:** `tests/staff.test.mjs` / the short-briefing cases.

### `set_my_card` — Say what I am working on

- **Lines:** 370–373. **Write.** Idempotent.
- **Who:** bots. Claude is refused.
- **Parameters:** `bot` required. Optional `working_on`, `needs`, `blockers`. A blocker can be cleared without sending `working_on` (PR #70, from the unmerged #68).
- **Writes:** `cards.json` (the job card, not the action card). A blocker not restated for 48 hours shows as “old, still true?”.
- **Example:** `{"bot":"Drop","working_on":"RouteNote upload for Night Drive","blockers":""}`
- **Check:** `tests/hq-polish.test.mjs`, `tests/staff.test.mjs`.

### `releases` — Releases and my steps

- **Lines:** 374–376. **Read-only.**
- **Parameters:** `bot` required. Optional `workspace` (`label` returns Label covers).
- **Returns:** each release’s view, your steps, and `six_weeks` for Nova and Claude.
- **Example:** `{"bot":"Atlas"}`
- **Check:** `tests/staff-releases.test.mjs`, `tests/six-weeks.test.mjs`.

### `release_pack` — Everything about one release

- **Lines:** 377–379. **Read-only.**
- **Parameters:** `bot`, `song` (title or id) required.
- **Returns:** the pack, what is missing, approvals (the exact text Luke approved, and when), store status, pitch log. Lyrics are included here for the bots that may read the pack. Only Luke and Claude may **write** lyrics.
- **Example:** `{"bot":"Drop","song":"medaseubody"}`
- **Check:** `tests/staff-releases.test.mjs`.

### `release_step` — Mark one of my release steps

- **Lines:** 380–396. **Write.**
- **Parameters:** `bot`, `song`, `step`, `status` (`todo|working|done|blocked|skipped`) required. Optional `note` (required for blocked and skipped), `link`, `done_on` (`YYYY-MM-DD` when the work was done on an earlier day), `workspace`, and for a Label licence: `esl_order_number`, `licence_pdf_url`, `drive_folder_url`, `original_title`, `original_writers`, `original_publisher`, `status` on the licence (`todo|ordered_waiting_luke|paid|licensed|flagged`), `flag_reason`, `s4a`.
- **Who:** the step’s owner, Nova, Claude, or Luke. Luke’s own step: Luke only, for done or skipped. A waiting step: no bot, Nova included, may mark it done. Label `licence`: only `Licence` or Nova.
- **Writes:** `releases.json`, and a live-log line that does not close a daily duty.
- **Example:** `{"bot":"Drop","song":"Night Drive","step":"upload","status":"done","link":"https://example.com/routenote/night-drive","done_on":"2026-11-10"}`
- **Check:** `tests/staff-releases.test.mjs`, `tests/workspaces.test.mjs`.

### `release_fill` — Fill one field of a release pack

- **Lines:** 397–401. **Write.**
- **Parameters:** `bot`, `song`, `field`, `value` required. `""` clears a field where the desk allows it.
- **Who:** the field’s `fill` list, plus Nova, Luke, and Claude. Lyrics: Luke and Claude only (`fill: []`). ISRC/UPC/store status: Drop. Spotify track: Atlas or Webmaster. Video: Laura. Page: Webmaster.
- **Writes:** `releases.json` after `packValue` (https links, choice match, secret scan per line).
- **Example:** `{"bot":"Drop","song":"Night Drive","field":"isrc","value":"ZZZZZ0000000"}`
- **Check:** `tests/staff-releases.test.mjs`.

### `propose_release` — Propose a new song, or a change

- **Lines:** 404–412. **Write** (a question, not the release). Not idempotent.
- **Parameters:** `bot` required. Optional `song`, `title`, `date`, `pack`, `send`, `why`.
- **Effect:** nothing changes until Luke says yes. Do not tell him it is added before that. A yes applies the proposal. Sending to the team is a separate step.
- **Example:** `{"bot":"Nova","title":"Night Drive","date":"2026-12-05","why":"Luke named this Friday"}`
- **Check:** `tests/bots-proposals.test.mjs`, `tests/staff-releases.test.mjs`.

### `song_page` — Make a song page, or put the Spotify link on it

- **Lines:** 414–425. **Write** (a question). Not idempotent.
- **Who:** Webmaster and Nova (`SONG_PAGE_BOTS`).
- **Parameters:** `bot`, `kind` (`new|track|card`), `slug` required. For `new`: `title`, `date`, `cover` (an https link, usually from `upload_cover`). For `track`: `track` (the Spotify URL, no `?si=`). Optional `artists`, `isrc`, `why`.
- **Effect:** Luke confirms. Then GitHub builds the page. Never Luke’s Mac, never by hand. The home card (`kind: card`) also waits for his yes.
- **Example:** `{"bot":"Webmaster","kind":"new","slug":"nightdrive","title":"Night Drive","date":"2026-12-05","cover":"https://badscandal.com/api/staff/cover/c-example"}`
- **Check:** `tests/song-pages-desk.test.mjs`, `tests/webmaster-tools.test.mjs`, `tests/song-build.test.mjs`.

### `song_pages` — What happened to each song-page request

- **Lines:** 427–429. **Marked read-only.** It may call `checkSongBuilds` and it GETs the live song URLs (6 second timeout).
- **Parameters:** `bot` only.
- **Returns:** each request’s state (waiting on Luke, sent to GitHub, build failed with the reason, live), the live HTTP status, and which song the home card should show today versus what it shows.
- **Example:** `{"bot":"Webmaster"}`
- **Check:** `tests/song-pages-desk.test.mjs`.

### `upload_cover` — Put a cover on the desk

- **Lines:** 430–434. **Write.** Not idempotent. Body may be up to 5.8 MB (the picture in base64).
- **Who:** Webmaster and Nova.
- **Parameters:** `bot`, `song` required, plus `image_base64` or `url`.
- **Writes:** `covers/<id>.json`. The returned link is public (`GET /api/staff/cover/<id>`), because the song page will be public.
- **Warns** when the image is not square or under 3000 px. It still stores it.
- **Example:** `{"bot":"Webmaster","song":"Night Drive","url":"https://example.com/cover.jpg"}`
- **Check:** `tests/webmaster-tools.test.mjs`.

### `roster_card` — Fix a bot’s job card

- **Lines:** 436–440. **Write.** Not idempotent.
- **Who:** Nova only.
- **Parameters:** `bot`, `for` required. Optional `duty`, `why`, `time`, `role`, `schedule`.
- **Writes:** `rosteredit.json` (an overlay; the seed can still replace the base roster).
- **Example:** `{"bot":"Nova","for":"Steve","duty":"Instagram growth","time":"09:10"}`
- **Check:** `tests/staff.test.mjs`.

### `store_status` — Where a song is at the distributor

- **Lines:** 441–448. **Write.**
- **Who:** Drop, Nova, Claude, Luke.
- **Parameters:** `bot`, `song`, `status` required (`uploaded|in moderation|rejected|resubmitted|approved|delivered|live`, plus `ready_to_resubmit` which asks Luke). Optional `reason`, `note`, `on`.
- **Writes:** the release’s store status. A rejection keeps RouteNote’s reason. `ready_to_resubmit` does not resubmit; it asks Luke. Drop must see `luke_tap` yes before distributing, resubmitting, or replying to moderation.
- **Example:** `{"bot":"Drop","song":"Night Drive","status":"in moderation"}`
- **Check:** `tests/staff-releases.test.mjs`, `tests/watchers.test.mjs`.

### `spotify_upcoming` — Report Spotify for Artists

- **Lines:** 449–456. **Write.** Idempotent (replaces Atlas’s report).
- **Who:** Atlas, Nova, Claude (`SIGHT_REPORTERS`).
- **Parameters:** `bot`, `releases` required. Each item: `title`, `date`. Optional `shown_as`, `copy_uri`, `note`. An empty list is a real report (“nothing is listed”).
- **Writes:** `sightings.json`. A release that appears there gets its `spotify` step done in Atlas’s name. The pitch stays waiting until that happens.
- **Example:** `{"bot":"Atlas","releases":[{"title":"Night Drive","date":"2026-12-11","shown_as":"badscandal"}]}`
- **Check:** `tests/staff-sightings.test.mjs`.

### `pitch_log` — Record a pitch or an editorial playlist

- **Lines:** 457–462. **Write.** Idempotent.
- **Who:** Atlas, Nova, Claude, Luke (`PITCH_LOGGERS`).
- **Parameters:** `bot`, `song` required. Optional `pitched_on`, `playlist`, `added_on`. At least one of the optional fields is the point of the call.
- **Writes:** the pitch record on `releases.json`. HQ never sends the pitch. A song the 14-day rule skipped is not pitched: do not record one.
- **Example:** `{"bot":"Atlas","song":"Night Drive","pitched_on":"2026-11-27"}`
- **Check:** `tests/pitch-tracker.test.mjs`.

### `profiles` — Profile photos and banners

- **Lines:** 463–477. **Write** on `record` and `propose`. `list` reads.
- **Who:** the platform owner, plus Nova. X is Luke’s.
- **Parameters:** `bot` required. `action` `list|record|propose`. Then `platform`, `image`, `link`, `changed` / `changed_on`, `width`, `height`, `format`, `size_mb`, `why`, `platform_filter`.
- **Writes:** `profiles.json`, and a decision message on `propose`. Luke must say “Yes, correct” before anyone uploads. After he does, the bot uploads by hand and `record`s the new link.
- **Example:** `{"bot":"Laura","action":"list","platform_filter":"YouTube"}`
- **Check:** `tests/profiles.test.mjs`.

### `account_health` — Read account health

- **Lines:** 478–480. **Read-only.** Nothing is fetched from a platform.
- **Who:** filtered to Steve, Kevin, Laura, Atlas, Drop, Webmaster. Nova sees it.
- **Parameters:** `bot` only.
- **Reads:** `health/checks.json`, growth rows, stored Instagram posts, claims, song-page build reports. Returns each account’s `state` (`ok|watch|red|gap`) and headline.
- **Example:** `{"bot":"Atlas"}`
- **A correct result:** `read_only: true`, `wrote: false`, and an `accounts` array. Spotify’s reach line may say “posts”. That is the bug in section 9, not a successful “posts” metric.
- **Check:** `tests/account-health.test.mjs`.

### `needs_you` — Open Needs you cards

- **Lines:** 481–483, handler at 1192–1196. **Read-only.**
- **Parameters:** `bot` only.
- **Reads:** `action-cards.json` for workspace `badscandal` only (`workspaceNeeds(store, now, "badscandal")`).
- **Returns:** `{read_only, wrote: false, quiet_hours, open, needs_you, held_until_morning, note}`. `open` is `needsYou.length + held.length`. It does **not** count decision messages, lyrics approvals, attention rows, or Farm/Label cards.
- **Example:** `{"bot":"Nova"}`
- **A correct result when the phone shows a Verse lyrics wallet and no action cards:** `open: 0`, `needs_you: []`, and during 23:00–08:00 São Paulo `quiet_hours: true`. That is not a failed call. See section 9.
- **Check:** `tests/hq-auto.test.mjs`, `tests/night-test-18nov.test.mjs`.

### `song_pl` — Per-song profit

- **Lines:** 484–486. **Read-only.** Added so Forge would not have to parse `income_status` (night test, 18 Nov). Same numbers as `income_status.per_song`.
- **Who:** filtered to Ledger, Sheet, Forge.
- **Parameters:** `bot` only.
- **Reads:** income rows and spend rows that name a song, plus the HQ model. A figure that was not recorded stays missing. Nothing is guessed from a campaign name.
- **Example:** `{"bot":"Forge"}`
- **Check:** `tests/song-pl.test.mjs`.

### `read_guide` — Read the staff guide

- **Lines:** 487–489. **Read-only.**
- **Parameters:** `bot` only.
- **Reads:** `guide.json`. The handler prepends a live line: “The connector has 47 tools right now: …” and the current money rules. That line wins over an older stored guide. The stored text is not rewritten.
- **Example:** `{"bot":"Verse"}`
- **Check:** `tests/night-test-18nov.test.mjs` (the live tool line).

### `sort_payment` — Say what a Revolut payment is

- **Lines:** 490–498. **Write.** Idempotent.
- **Who:** Ledger, Sheet, Nova, Claude, Luke (`SORTERS`). Filtered list: Ledger and Sheet.
- **Parameters:** `bot`, `id`, `status` (`received|transfer`) required. Optional `month`, `category`, `pending_id`, `source`, `note`, `song`, `store`.
- **Writes:** `inc/<month>.json`. Use it only when the payer makes it clear. When it is not clear, leave it unsorted and ask Luke with one `send_message`, `needs: decision`. Never guess. A `pending_id` marks that statement received and removes the unsorted row so the money is not counted twice. What Luke or another person already decided cannot be changed here.
- **Example:** `{"bot":"Ledger","id":"i-example","month":"2026-11","status":"received","category":"Label deals","source":"Sample Distro"}`
- **Check:** `tests/bank.test.mjs`, `tests/ledger-payments.test.mjs`.

### `profile_jobs` — List profile images that need a new shape

- **Lines:** 499–501. **Not marked read-only, and it can write.** `listProfileJobs` calls `profileAlerts`. A job open more than a day sends Luke one decision (“Chase them” / “I’ll handle it”) unless that same set was already asked.
- **Who:** filtered to Atlas, Laura, Steve, Kevin. Nova sees every job. Each bot sees only their slots, plus Nova, Claude, and Luke see all.
- **Parameters:** `bot` only.
- **Reads / writes:** `profiles.json` jobs, and possibly `msg/` plus `profiles.asks`.
- **Example:** `{"bot":"Laura"}`
- **A correct result with no work:** `{jobs: [], note: "No profile image is waiting on you."}`
- **Check:** `tests/profile-images.test.mjs`.

### `profile_master` — Download a master and its target size

- **Lines:** 502–506. **Read-only.**
- **Parameters:** `bot` required. Optional `kind` (`photo|banner`) or `slot` (for example `spotify-header`).
- **Returns:** width, height, format, and a `url` that is **not public**. Open it with the same Authorization header (`GET /api/staff/profile-file/...`).
- **Example:** `{"bot":"Kevin","slot":"tiktok-profile"}`
- **Check:** `tests/profile-images.test.mjs`.

### `profile_rework` — Upload a reworked image

- **Lines:** 507–511. **Write.** Idempotent. Body up to 5.8 MB.
- **Parameters:** `bot`, `slot`, `image_base64` required.
- **Writes:** `profile-img/slot-<id>.json` and the version on `profiles.json`. The file must be the exact width and height. Any other size is refused and not stored, and Luke is told. Do not crop the subject away and do not scale the picture up.
- **Example:** `{"bot":"Steve","slot":"facebook-banner","image_base64":"<jpg or png base64>"}`
- **Check:** `tests/profile-images.test.mjs`.

### `profile_uploaded` — Mark a profile image uploaded, or rejected

- **Lines:** 512–518. **Write.** Idempotent.
- **Parameters:** `bot`, `slot` required. Optional `link` (https, after you uploaded it yourself), `rejected` (boolean), `note` (what the platform said).
- **Writes:** `profiles.json`. Rejected: Luke is asked and the job stays open. HQ does not upload and does not log in.
- **Example:** `{"bot":"Atlas","slot":"spotify-header","link":"https://example.com/the-live-header"}`
- **Check:** `tests/profile-images.test.mjs`.

### Calling the connector (shape, not a live call)

Do not call the live `/mcp` from a cloud session (`docs/WORKING-WITH-LUKE.md`). The shape, from `netlify/lib/mcp.mjs`:

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"needs_you","arguments":{"bot":"Nova"}}}
```

Header: `Authorization: Bearer <STAFF_BOT_KEY>`. `initialize` and `server/discover` both work. Notifications get 202. GET and DELETE get 405. OPTIONS gets 204. A foreign `Origin` gets 403. No key gets 401 with `WWW-Authenticate: Bearer`. `/.well-known/oauth-*` stays 404 so clients do not try OAuth.

`my_day` is the call that tells a bot whether to reconnect. After this tree, the count they should see is 47.

---

## 4. Netlify functions, routes, schedules, environment names

`netlify.toml` sets `functions.directory = "netlify/functions"` and `node_bundler = "esbuild"`. Schedules are on each function’s `export const config`, not in the toml. The toml comment still says the edge file is `touchme-geo.js`. The file on disk is `netlify/edge-functions/song-geo.js`. That comment is stale.

### Functions

| File | Path or schedule | What it does |
|---|---|---|
| `netlify/functions/staff.mjs` | `/mcp`, `/mcp/*`, `/api/staff/*` | The desk and the connector. |
| `netlify/functions/hq.mjs` | `/api/hq/*` | Sheet model, Instagram key, push registration. Cookie required. |
| `netlify/functions/admin.mjs` | `/api/admin/*` | Login, overview, Pages data, CSV, exclude-me. |
| `netlify/functions/hit.mjs` | `POST /api/hit` | Visit counter. Always 204. Bots are flagged, not dropped. |
| `netlify/functions/capi.mjs` | `POST /api/capi` | Meta Conversions API. Always 204. EU events without consent are refused. |
| `netlify/functions/feed.mjs` | `GET /api/feed/*` | `meta-daily.csv` and `meta-ads.csv` for the sheet. |
| `netlify/functions/bank.mjs` | `/api/bank/*` | Enable Banking, Revolut, read-only. |
| `netlify/functions/banksync.mjs` | `50 9 * * *` | Daily Revolut sync. 09:50 UTC is 06:50 São Paulo, before Ledger’s 07:30. Production only. |
| `netlify/functions/rollup.mjs` | `0 6 * * *` | 06:00 UTC. Folds `ev/` keys older than 90 days into `daily/<day>.json` and deletes them. Also deletes old `mh/` keys. Production only. |
| `netlify/functions/staffcheck.mjs` | `35 0,12,18 * * *` | 09:35, 15:35, 21:35 São Paulo. One message from HQ to Luke. Facts only, at most 1500 characters, cut on whole lines. |
| `netlify/functions/hqauto.mjs` | `*/15 * * * *` | Phase-1 checks in `netlify/lib/hq-jobs.mjs`: site, cap, release day, month, Monday draft. It does not call Meta or Instagram and it does not change ads. |
| `netlify/functions/pushhourly.mjs` | `5 * * * *` | Push sweep, 08:00 summaries, `chaseLate`, Meta spend onto the desk, Instagram sync, Verse’s release-day note, RouteNote watcher, song-build reports. |
| `netlify/functions/accounthealth.mjs` | `30 13 * * *` | 10:30 São Paulo. Messages the owning bot only when that account’s health changed. No platform call. |

**Edge:** `song-geo.js` stamps `data-geo`, `data-eu`, and `data-dc` on the song paths listed in its `config.path`. The path list is a literal rewritten by `tools/new-song.mjs`. `tests/songs.test.mjs` fails if it disagrees with `songs.json`.

There is no inbound webhook. `auto.json` stores outbound URLs. HQ POSTs a tiny JSON to them after a message, a task update, or a card answer. See `docs/DESK-PUSH.md`.

### `/api/staff/*` routes

From the header and the `api()` switch in `netlify/functions/staff.mjs`. Cookie or Claude’s bearer, except the public cover and the profile-file rule. Bots get 403. Luke-only where noted.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/staff/cover/<id>` | Public cover image. No auth. |
| GET | `/api/staff/profile-file/<name>` | Master or reworked image. Cookie, Claude, or a bot bearer. |
| GET | `/api/staff/board` | Everything HQ draws for Team, Messages, Money, Releases, Profiles, account health, `auto`. |
| GET | `/api/staff/fields` | Form fields and steps. Does not read the desk. |
| GET | `/api/staff/release?id=` | One release, including lyrics. |
| GET | `/api/staff/trace` | Last connector trouble lines (max 40). |
| GET | `/api/staff/workspace?ws=` | Farm or Label. |
| GET | `/api/staff/month-close.csv` | Changes since a month was closed. |
| POST | `/api/staff/message` | Luke or Claude writes. |
| POST | `/api/staff/resolve` | Settle a message. |
| POST | `/api/staff/release` | Save a draft. |
| POST | `/api/staff/release/send` | Send it. `anyway: true` sends with required fields missing. Never without a date. |
| POST | `/api/staff/release/date` | Move the day. |
| POST | `/api/staff/release/cancel` | Cancel. The team is told only if it had been sent. |
| POST | `/api/staff/release/step` | Luke may mark any step. |
| POST | `/api/staff/release/remove` | A cancelled release, or one out more than 90 days. No button. |
| POST | `/api/staff/release/approve` | Record an approval from the page. |
| POST | `/api/staff/sighting` | Luke only: `self`, `label`, `notmine`, `mistake`. |
| POST | `/api/staff/sort` | Sort one Revolut row. |
| POST | `/api/staff/config` | Luke only: `{botsOn}`. |
| POST | `/api/staff/card` | Luke only: `{id, choice: yes\|no\|edit, text?}`. |
| POST | `/api/staff/auto` | Luke only: taps switch, or one webhook. |
| PUT | `/api/staff/seed` | Claude loads roster, sources, guide. |
| POST | `/api/staff/workspace` | Farm or Label form. |
| POST | `/api/staff/profile-master` | Luke’s master upload. |
| POST | `/api/staff/profile-version` | A sized copy from the page. |

`/api/hq/*`: `GET /api/hq/data`, Instagram `GET/POST /api/hq/instagram`, `/key`, `/sync`, `/disconnect`, push `POST /api/hq/push/register|unregister|test|key` and `GET /api/hq/push/waiting`.

`/api/admin/*`: `POST login|logout|exclude`, `GET session|data|csv|overview`.

`/api/bank/*`: `GET callback` (public, Enable Banking, state cookie), `GET status`, `POST sync` (Luke or Claude), `POST connect|disconnect` (Luke, connect is production only).

`/api/licence/*` is a 200 proxy in `_redirects` to the Cloudflare Worker for CLEANSLATE. It is not an HQ route.

`_redirects` also 404s `/package*.json`, `/netlify/*`, `/tests/*`, `/tools/*`, `/CLAUDE.md`, `/README.txt`, `/docs/*`. `robots.txt` disallows `/admin`, `/hq`, `/stats`, `/api/`.

### Schedules in São Paulo

The zone in code is `America/Sao_Paulo`. UTC−3, no daylight saving in this zone.

| UTC cron | São Paulo | Job |
|---|---|---|
| `50 9 * * *` | 06:50 | Revolut sync |
| `5 * * * *` | every hour at :05 | Push, chase, Meta spend, Instagram, watchers |
| `*/15 * * * *` | every 15 min | HQ automation checks |
| `35 0 * * *` | 21:35 previous evening | Evening site check (00:35 UTC is 21:35 SP the day before) |
| `35 12 * * *` | 09:35 | Morning site check |
| `35 18 * * *` | 15:35 | Afternoon site check |
| `30 13 * * *` | 10:30 | Account health diff |
| `0 6 * * *` | 03:00 | 90-day rollup |

Chase messages go out only from 07:00 to 22:00 São Paulo (`chaseLate`). Outside that, nothing is sent. A duty still late 2 hours after its reminder is escalated to Nova.

### Environment variable names

Values are not in this file. They are set on Netlify, or in GitHub Actions for `GITHUB_TOKEN`. Do not print them. Do not open `.env`, `.pem`, or `.p8`.

| Name | Read by | What it is for |
|---|---|---|
| `ADMIN_KEY` | admin, hq, staff, bank | HQ password and the session HMAC |
| `STATS_KEY` | same | Legacy fallback for `ADMIN_KEY` |
| `STATS_SALT` | `hit.mjs` | Visitor hash. Falls back to `ADMIN_KEY`, then `STATS_KEY`, then a constant |
| `STAFF_BOT_KEY` | staff, bank | The bots’ one bearer |
| `STAFF_CLAUDE_KEY` | staff, bank | Claude’s bearer |
| `GITHUB_SONG_TOKEN` | `staff.mjs` | `repository_dispatch` for song pages. Production only |
| `META_CAPI_TOKEN` | `capi.mjs` | Conversions API. Never logged |
| `META_TEST_EVENT_CODE` | capi, admin | Sends to Test events. Previews only send while it is set. Remove after testing |
| `META_ADS_TOKEN` | admin, feed, hq-load, pushhourly | Read-only Ads Insights. Authorization header, never a URL |
| `META_AD_ACCOUNT_ID` | admin, feed, pushhourly | Digits only. Code has a default account id if this is unset |
| `SHEET_FEED_KEY` | `feed.mjs` | Query key for the CSVs |
| `GOOGLE_SA_KEY` | `gsheets.mjs` via hq-load | Service account JSON, spreadsheets.readonly |
| `HQ_SHEET_ID` | hq-load | The spreadsheet id |
| `ENABLE_BANKING_APPLICATION_ID` | `bank.mjs` | Enable Banking app id |
| `ENABLE_BANKING_PRIVATE_KEY` | `bank.mjs` | Signing key |
| `ENABLE_BANKING_ASPSP_NAME` | `bank.mjs` | Optional. Default Revolut |
| `ENABLE_BANKING_ASPSP_COUNTRY` | `bank.mjs` | Optional. Default IE |
| `BANK_OWN_NAMES` | `bank.mjs` | Comma-separated names treated as Luke’s own transfers |
| `APNS_KEY` | `apns.mjs` | Apple push key |
| `APNS_KEY_ID` | `apns.mjs` | Apple key id |
| `APNS_TEAM_ID` | `apns.mjs` | Team id. Code has a default if omitted |
| `FB_PAGE_ID` | `instagram.mjs` via hq | Overrides the Page id used to exchange the Instagram key |
| `GITHUB_TOKEN` | `song-page.yml` only | Actions token for the report push. Not a Netlify var |

Handlers use `Netlify.env.get`. They do not use `process.env`, except the GitHub workflow (`JOB`, `STEPS`, `RUN_URL`, `GH_TOKEN`).

---

## 5. Data model

### Blob keys on the `staff` store

All writes to a shared document go through `mutate()`: read with the etag, write only if it is unchanged, retry. Two bots in the same second both land.

| Key | Shape |
|---|---|
| `roster.json` | Array of bots: `name`, `role`, `duty`, `time`, `why`, `schedule[]`, `writes`, `access`. Empty → `DEFAULT_ROSTER`. |
| `rosteredit.json` | Nova’s overlay from `roster_card`. |
| `guide.json` | `{text, at}`. The live tool line is prepended on read, not written back. |
| `config.json` | `{botsOn, changedAt}`. |
| `sources.json`, `srcedit.json` | Income sources: name, accounts, state, category, `main`, `due_day`, `needs_luke`. |
| `splits.json` | Royalty split notes. L11 (a second person) is not built. |
| `upd/<SP day>.json` | `[{id, at, sp, bot, status, message, link, duty?, gaps?, release?}]`. Status: `done\|working\|blocked\|error\|info`. |
| `msg/<YYYY-MM>.json` | Messages: `id`, `at`, `sp`, `from`, `to`, `text`, `needs`, `re`, `options`, `questions`, `answers`, `recommendations`, `approval`, `proposal`, `resolved`, `about`, `via`, `mailId`. |
| `inc/<YYYY-MM>.json` | Payments: `id`, `at`, `by`, `date`, `payer`, `amount`, `currency`, `status`, `category`, `account`, `reference`, `period`, `source`, `note`, `song?`, `store?`, `arrived?`, `history?`, `bankRef?`, link fields (`movedTo`, `paidBy`). |
| `chk/<YYYY-MM>.json` | “I checked this account” rows. |
| `close/<YYYY-MM>.json`, `closes.json` | Month snapshot and the list of closes. |
| `spend/<YYYY-MM>.json` | `{platform, account, date, amount, currency, not_read?, song?, by, at, workspace?}`. |
| `grow/<YYYY-MM>.json` | Growth and song rows, optional `workspace`, claim fields, account-check echoes. |
| `releases.json` | Up to 60, newest first. `{id, title, date, status, createdAt, createdBy, updatedAt, sentAt, tight, alreadyOut?, sentWithout?, pack, steps[], log[]}` (log keeps 30). `status` is `draft\|scheduled\|cancelled`. “Released” is never stored: it is scheduled and `date <= today`. `id` is `releaseId(title)` (`medaseubody` from “Me Dá Seu Body”). |
| `sightings.json` | `{at, sp, by, note, list[], answers{}}`. |
| `claims.json` | `{items: [{key, claim, claimant, impact, date, by, at}]}`. |
| `tasks.json` | Map of `T-` id → `{status, note, by, at, sp}`. |
| `cards.json` | Map of bot name → `{workingOn, needs, blockers, blockersAt, at}`. |
| `action-cards.json` | Luke’s tap cards. See below. |
| `auto.json` | `{tapsCountAsYes, webhooks{}, changedAt}`. |
| `auto-state.json` | Dedupe for `hq-jobs.mjs`. |
| `profiles.json` | `{slots, masters, versions, uploaded, rejected, asks, jobs[]}`. |
| `profile-img/<key>.json` | `{type, b64}`. Keys `master-photo`, `master-banner`, `slot-<id>`. |
| `covers.json`, `covers/<id>.json` | Cover uploads. |
| `seen/<bot>.json` | `{at, tool}`. Last connector use. |
| `read/<name>.json` | `{at}`. Last time messages were handed over. |
| `trace.json` | Last 40 connector notes (HTTP status, method). No keys. |
| `chase/<SP day>.json` | Nudge and escalate timestamps per duty and step. |
| `push/devices.json` | Device tokens for the HQ apps. |
| `push/alerted.json` | What has already buzzed, including overnight. |
| `push/key.json` | APNS material if it is not in the env. Do not read this file in a session. |
| `health/checks.json`, `health/last.json` | Account-health readings and the last report. |
| `ws/farm/*`, `ws/label/*` | Workspace documents. The key names are the `KEY` object in `workspaces.mjs`. |

### Other stores

**stats:** `ev/<utc-day>/…` (key-encoded visit, 23 parts; old keys with fewer parts still parse), `daily/<day>.json` after rollup, `mh/<day>/…` CAPI counts, `health/last.json` and `health/last-error.json`.

**meta-cache:** `hq/sheets.json` (sheet cache; 2 minutes so the live log is fresh), `fx/<month>.json` (12 hours; a past month cached mid-month is re-read once the month has ended), insight and cap keys, `feed/file/<name>/<since>_<until>.json` (one hour), `meta-key/health.json`.

**bank:** `conn.json`, `state/<nonce>.json`, `sync.json`.

**instagram:** `key.json`, `state.json`, `posts.json`, `comments.json`, `countries.json`, `own.json`, `post-songs.json`, `tool-cache.json` (about 20 minutes).

**Song builds** are not blobs. They are `builds/<message-id>.json` on the GitHub branch `song-builds`.

### Action cards

`netlify/lib/action-cards.mjs`. Kinds: `message`, `booking`, `post`, `link`, `payment`, `signature`, `ads`, `track`, `month`, `monday`, `other`. `waiting_on`: `luke`, `bot`, `label`, `store`.

Lifecycle:

1. `open` — created by `send_message` with `card`, or by HQ itself. `dedupe_key` is unique.
2. Luke answers `yes`, `no`, or `edit` on the phone (`POST /api/staff/card`) or the answer is recorded. The answer stores the time and the **version**.
3. `edit` bumps the version. The previous Yes does not cover the new text. A new Yes is required.
4. `no` closes it as no.
5. `done` only when the owner calls `post_update` with `card` and `proof_message`, `proof_ref`, or `proof_link`. Proof may be recorded by the owner, Nova, Claude, Luke, or HQ.
6. Expired cards (`expires_at`) leave the Needs you list.

`mayAct` is true only when the current version has `yes` and `counts === true`. `counts` is false while the taps switch is off, and always false for `payment`, `signature`, `ads`, and `monday`. Those four say Luke does it himself. HQ never pays, never signs, and never changes an ad.

Quiet hours: `needsYou` is only `money_at_risk` cards between 23:00 and 08:00 São Paulo. A `payment` is always `money_at_risk`. The rest sit in `held` until 08:00. The phone header uses `needsYou` only.

### Profile jobs

`profiles.json` `jobs[]`: `{id, slot, status: "open"|"done", reason, note, at, by, owner, doneAt?}`. Created when Luke’s master does not have that slot’s aspect. Closed when `profile_uploaded` succeeds. A rejected upload stays open.

### Song-page jobs

There is no blob job. State is on the message (`proposal`, `proposalResult`, `resolved`) and on `builds/<id>.json`. Words the desk uses: waiting on Luke, sent to GitHub, not done (with the step and the why), live.

### Release step status

`todo`, `working`, `done`, `blocked`, `skipped`. `waiting: true` while the `after` step is not done or skipped (the pitch waits for Spotify for Artists). Skipped needs a note. `LABEL_NOTE`, `OUT_NOTE`, and `PITCHED_NOTE` are the standard skip notes. A skipped step is never late and is not in `total`.

### Label licence status

`todo`, `ordered_waiting_luke`, `paid`, `licensed`, `flagged`.

---

## 6. Rules built into the code

These are not style. A change that breaks one of them is a bug even if the tests were updated to match, unless Luke said so.

1. **Merge to `main` only when Luke says “deploy” or “publish”.** “Continue”, “fix it”, “go”, and “upload it” are not enough. A push to `main` is the production site when Netlify is allowed to build.

2. **The repo is public.** No keys, tokens, passwords, real amounts, payer names, account numbers, lyrics, or private notes, including in tests. Use made-up names. Never `git add -A` or `git add .`. Stage files by name.

3. **Approval is Luke’s own words.** `record_luke_answer` stores `luke_said` as he wrote it, marked via Alfred or via Nova. Nova’s own yes does not count, and Nova cannot relay an answer about money (Ledger, Sheet, Forge). A proposal, a song page, a pitch, and the final lyrics change nothing until he says yes. The options on those cards are “Yes, correct” / “Not yet” (or Approve / Not yet). An edit after a Yes is a new version.

4. **Quiet hours 23:00–08:00 São Paulo** for action cards (`action-cards.mjs` `quietNow`). Only money-at-risk cards stay on Needs you. Push quiet hours use the device timezone (`push.mjs`). Chase is a third window: 07:00–22:00 São Paulo. The on-page “Quiet” button is a fourth thing: it only filters the live feed on that device.

5. **Never invent a number.** A missing figure is “not reported”, “not enough data”, `not_read`, or `gaps`. An amount that cannot be parsed is refused, not stored as 0. A fee is shown only when both amounts were recorded in the same currency. A currency change on a payout route says “not enough data”. Account health says “Not enough data” rather than a green guess. Dates that do not parse become “not reported”, never `Invalid Date`.

6. **Nothing here posts to a DSP, sends a RouteNote email, or changes an ad.** `preflight` reads. `pitch_log` records what Atlas already sent. `store_status` records what Drop already did. `moderationDraft` builds a text block and appends “HQ does not send this email.” The ads card says “HQ never changes ads. Luke switches them off himself.” The Monday card says “No amount is chosen.” `hqauto.mjs` does not call Meta. Forge does not launch ads from a tool.

7. **RouteNote mail is read from `luke@badscandal.com`.** Constants: `ROUTE_NOTE_INBOX`, `MODERATION_FROM` (`luke@badscandal.com`), `MODERATION_CC` (`admin@badscandal.com`), `MODERATION_TO` (`moderation@routenote.com`) in `netlify/lib/staff.mjs` around lines 4851–4856. Lilian’s RouteNote mail is forwarded to that inbox (comment, 18 Nov night test). `routeNoteMailSource()` returns `connected: false` until Luke signs that inbox in, read-only. The Google key only reads the sheet. Meta, Instagram, Revolut, and the desk keys are not a mailbox. Until then the card says “RouteNote email: not connected”, Drop’s own store status still shows, and HQ does not invent a moderation result. A supplied email that does not match a status says “not reported” and does not change the release.

8. **A moderation draft is From `luke@badscandal.com`, CC `admin@badscandal.com`.** `moderationDraft()` is the only builder. Tests in `tests/night-test-18nov.test.mjs` and `tests/watchers.test.mjs` lock the headers.

9. **Income counts once, when it lands in Revolut, in the month it lands.** Wise and PayPal are not income. `link_transfer` is how they become the Revolut row’s source. Do not mark the same money twice.

10. **The artist name is `badscandal`.** Links and ads go to `https://badscandal.com/<song>`, never Feature.fm, never a pre-save, never straight to Spotify for an ad. The public song page is Spotify only.

11. **`luke_briefing`’s output does not change.** New facts get a new field on another tool (`needs_you`, `song_pl`, `account_health`, `luke_short_briefing`).

12. **People only, on the public pages.** Meta does not see a PageView before a human gesture. Data-centre IPs, crawler user agents, headless browsers, and Luke’s `bs_nostat` devices are stored and hidden.

13. **Our own accounts never count** in the Instagram ranking or the fan inbox. Nova maintains the list. Two accounts Luke named are filtered in code and never shown.

14. **One Spotify pitch in 14 days.** The later song’s pitch step is skipped, with the reason on the card.

15. **Songs come out on Fridays, at least two weeks apart, and go to RouteNote about four weeks ahead** (three weeks is tight). The desk compresses a late send so it is not born already late. Drop tells Luke on the desk the moment a date cannot be kept.

16. **Verse waits until release day**, then checks Musixmatch daily. A song that is not on Musixmatch yet is not a block. Only Luke writes the lyrics into the pack.

17. **Public pages stay monochrome.** Colour is allowed on `/hq` (the red for “needs attention” and the active tab, green for Spotify taps only). Swearing on the public site is assembled in JS. Do not put it in the served HTML.

18. **Every push to `main` updates `docs/HANDOFF.md` and `docs/STATUS.md` in that same push.** This docs PR does not do that job for a feature. When it merges, those two files should point at this one and stop saying “40 tools”.

---

## 7. Change log, 17–18 Nov 2026 night

Squash-merge SHAs are the commits on `main`. Times are UTC from `gh pr view`. “What it changed” is the commit message plus the files the message names, not a guess.

The night runs from PR #61 (17 Nov 23:53 UTC) through PR #88 (18 Nov 06:07 UTC). PRs #55–#60 are the hour before, included because the handoff’s “about #61” sits on top of them and the short docs still talk about them.

### Merged

| PR | Merge SHA | When (UTC) | Title | What changed |
|---|---|---|---|---|
| #61 | `1013f311a6d903695cb3b2487f6414a874403e6c` | 17 Nov 23:53 | L8: asset checker (cover, Spotify Canvas, Spotify header, YouTube banner) | `preflight` checks an asset’s width, height, seconds, format, and size against the platform’s rule. A Canvas link that is not MP4 or JPG shows on the release card. Atlas and Laura get the tool. `tests/asset-check.test.mjs`. The commit says 568 tests passed. |
| #62 | `a1b22943440cfbd19c21cef87c76e751cf99d7c5` | 18 Nov 00:04 | Docs: L8 is live, Profiles is an idea | Docs only. Marked L8 live and wrote L12 as an idea. |
| #63 | `e842b886348013e11579a9f2cff5cb4997f2a1b4` | 18 Nov 00:37 | Pitch tracker: status, deadline, and editorial playlists | Not pitched / pitched with the day / missed. Warn from 14 days out. `pitch_log`. HQ does not pitch. |
| #64 | `a6f67a76c81e5401005f356042f845a9c6f6ef8e` | 18 Nov 01:09 | Profiles: one place in HQ for each platform's photo and banner | The Profiles tab and the `profiles` tool. Luke says yes. The owner uploads by hand. |
| #65 | `f1cf96c30985c6ce358c346ad029a699d9da7cd7` | 18 Nov 01:18 | Release cards: sent pitches and red warnings | A sent pitch is not an approval. Red is only a failure. A tight send is amber. |
| #66 | `dab08d24ea4f96b276b6780cac346c984ed28363` | 18 Nov 01:32 | Fan inbox: song questions and repeat fans for Luke | L3 part 1. Comments already stored. No extra Meta call. HQ never replies. |
| #67 | `52a8c4239133a1d8b3aacb4270b5483611e3b6cc` | 18 Nov 01:41 | Per-song profit: royalties next to the ad spend that names the song | Money › Per song and a line on each Songs card. No new tool then. A row counts only when it names the song. |
| #69 | `dde345cd54034650b9d09765a01fb316e8568b90` | 18 Nov 01:55 | Connector bug fixes from the bots' read-only test | Ranking floor 1,000. Boost join on the post’s day or the next day. Money labels: Wise/PayPal already at Revolut is “moved to Revolut” and is not counted again. Stored amounts were not rewritten. Ads were not touched. `read_guide` matches the live desk. Digits that look like cards or raw ad-account ids are hidden in tool output. |
| #70 | `e5e731daf96a8c22fe51b7ad435d02fb594a044a` | 18 Nov 02:05 | Phone HQ: Needs you first | Needs you opens first. Folds in the desk answers from the closed PR #68: live tool list, optional `working_on`, stale blockers, questions to Luke, unsorted payment ids, a waiting step is not shown as blocked. |
| #71 | `f3f1def75a3208bed4c1256206d61bcac527e31e` | 18 Nov 02:14 | Expected money, and what each payout route cost | L1 and L9. Statement → expected row. Fee only when both amounts share a currency. No new tool. `luke_briefing` unchanged. |
| #73 | `11a3f243425c08abef5c3419e48e08dd13cdf86a` | 18 Nov 02:32 | HQ watchers: RouteNote mail, Verse's release day, Content ID claims | L5. Mail stays not connected until Luke signs a mailbox in. Verse gets one desk note on the release day. Laura records claims on `log_growth`. Nothing sends email. The commit still said 40 tools. |
| #75 | `6d36b5020b4c5776ac44b779b796eed2e0975e70` | 18 Nov 03:00 | Fix the HQ round-2 bugs from the bots' re-test | Pre-HQ packs keep the release-day link, the video, and the lyrics. Schedule lines follow the current state. Instagram ranking, the 20-minute read cache, and song links stop guessing. Preflight flags no longer fail the check. `song_pages` reports a live status. |
| #76 | `7ab80dfbde7835efa6663fee6c73ab97dc68b465` | 18 Nov 03:06 | Count received money once, only in Revolut | One counted flag shared by payments, `month_check`, `income_status`, and the briefings. A route sums every link. A gap with no source is unexplained, not a fee. A rate is kept only when Revolut recorded it. `close_month` needs the month ready and an https evidence link. |
| #77 | `8ace8793a07aa9f482f433015373a91b8c069ddc` | 18 Nov 03:14 | Account health for the official platforms | Green / watch / red from numbers already on the desk. A red item goes on the phone Needs you. Daily job tells the owner only when it changes. Still no new tool then: the check is fields on `log_growth`. |
| #79 | `224068b6ed2aceda5490b97b8e59713a3d130365` | 18 Nov 03:17 | HQ automation phase 1: one-tap cards on the phone | Yes / No / Edit, Waiting on others, scheduled checks, Monday draft. Same `dedupe_key` never posts twice. Only money at risk stays on top from 23:00 to 08:00. Options changed on `my_day`, `send_message`, and `post_update`. |
| #80 | `b140811fb3670f48929fc864271d41fdeb87266a` | 18 Nov 03:21 | Phone HQ: one received total per currency | `js/hq-look.js`. Pending money stays off the received cards. Wise or PayPal rows that only confirm a Revolut payment sit behind that payment. |
| #83 | `41681e376a35d38dea076b95931cd6aa2468dd53` | 18 Nov 03:31 | Stop the HQ home-screen app opening to a blank page on a bad connection | One content hash on every HQ script, 8 second fetch timeout, Try again / Reset app. The commit also notes the Tests workflow did not start for that merge; Netlify’s checks had passed. |
| #84 | `68eaced1d6ad328937cb94e9dc7da450bd6d5345` | 18 Nov 03:35 | Add Social Farm and Label workspaces on HQ | The switch, the licence step, spend and payouts off the official cap. The commit said still 40 tools, with new options, so every bot refreshes. |
| #85 | `275dec044eba40544244a5bb8f2e5bc0a09c0d29` | 18 Nov 03:47 | Record HQ workspaces as live | Docs only. The #84 merge had left the handoff calling workspaces unreleased. |
| #87 | `8a57594aa8cf40de87efe7c1f81f66a7e7d4f7c2` | 18 Nov 06:02 | Profiles: one master photo and banner, and readable buttons | Luke uploads one photo and one banner. A bad shape is not cropped. Four tools: `profile_jobs`, `profile_master`, `profile_rework`, `profile_uploaded`. Problems open a Needs you card. Cache `bs-hq-v8`. The commit says 44 tools. |
| #88 | `9e447e25dfb464da951e0f9db9c70f214e8fb53d` | 18 Nov 06:07 | HQ night test: 29 connector fixes (43 tools) | Reconnect only when the tool list differs. RouteNote drafts use the From/CC above. Three read-only tools: `account_health`, `needs_you`, `song_pl`. The commit message says 43 tools and 739 tests. That described the branch before it landed on top of #87. The merged tree has **47** tools (44 from #87, plus these three) and **745** tests. `tests/night-test-18nov.test.mjs` is the new file (283 lines added in the diff). |

The GitHub title of #88 is “HQ night test: 29 connector fixes (43 tools)”. The squash commit subject is “Fix the 18 Nov night-test findings on the HQ connector. (#88)”. Both are the same SHA.

### Not merged, in the same number range

| PR | State | Title | Why it matters |
|---|---|---|---|
| #68 | Closed, not merged | HQ polish: calmer screens, and the desk answers the bots asked for | Folded into #70. Do not revive it as a second copy. |
| #72 | Open | Docs: the phone HQ is live | A docs PR. The phone HQ is already on main via #70 and #80. Likely stale. |
| #74 | Open | Docs: L5 watchers are live | L5 is on main via #73. Likely stale. |
| #78 | Open | Docs: the money counting rule is live | The rule is on main via #76. Likely stale. |
| #81 | Open | Docs: account health is live | Account health is on main via #77. Likely stale. |
| #82 | Open | Docs: HQ automation phase 1 is live | Automation is on main via #79. Likely stale. |
| #86 | Open | Retrigger the production deploy | Empty of product changes. Written at 03:46 UTC because Netlify skipped `41681e3` and `68eaced`. The body said badscandal.com was still the phone-look deploy `e71e954`. That sentence is out of date for the service worker: at 06:23 UTC, `https://badscandal.com/hq-sw.js` was `bs-hq-v8`, which arrived in #87. Leave #86 for Luke. Do not merge it from a docs session. |

There is no PR #89 in this range. The next number is whatever GitHub assigns this docs pull request.

### The credits outage

**Not in git.** Luke’s record for this handoff: Netlify is a credits-based Personal plan; production deploys pause when credits run out; they were paused until he bought 500 credits on 18 Nov 2026.

**In git, and easy to mix up with that:** PR #86’s skip reason is “a new one was scheduled for the same branch”, not a credits error. Deploy previews kept building while those two production builds were skipped. After the credits purchase, something did publish, because the live service worker is the #87 file. Whether the #88 function code is in that same publish was not visible from the static file. The next agent can confirm #88 is live by logging into `/hq` (Luke) or by reading the Netlify deploy list for commit `9e447e2`. Do not call `/mcp` to check.

`docs/HANDOFF.md` inside #88 still says the night-test branch is “not merged”. That line was true on the branch and became false the moment the squash landed. It is one of the bugs in section 9.

---

## 8. Verification checklist

### How to run the tests

```bash
npm ci --no-audit --no-fund
npm test
npx -y node@22 --test tests/*.test.mjs
```

`npm test` is `node --test tests/*.test.mjs`. On 18 Nov 2026, on Node v22.23.4, the result was:

```
# tests 745
# pass 745
# fail 0
# cancelled 0
# skipped 0
```

Song-page checks only, which are allowed to block a page:

```bash
npm run test:song
```

That is `tests/songs.test.mjs`, `tests/song-pages-desk.test.mjs`, `tests/webmaster-tools.test.mjs`, `tests/song-build.test.mjs`.

`tests/js-syntax.test.mjs` parses every browser script. A broken apostrophe in `js/hq.js` once took HQ and both apps down (PR #57). Keep that test.

`tests/mcp.test.mjs` is order-sensitive in one older place: a bank test can rely on a roster an earlier test left behind. Run the file as part of `npm test`, not as a hand-picked subset, if you are chasing a roster failure.

Do not point tests at the live desk. `tests/fixtures/fake-blobs.mjs` replaces `@netlify/blobs`. `?sample=1` uses in-memory stores. No test should contain a real payer, a real amount from the accounts, or lyrics.

### What to check on the page

Local: serve the repo and open `/hq?sample=1` after the sample login path the tests use. The sample still needs a session in production; locally the sample flag is enough for the made-up board. Look at 390px and 1280px.

After a deploy, from a machine that can see the site:

- `GET /hq` returns 200 (the login shell).
- `POST /mcp` with no key returns 401.
- `GET /hq-sw.js` contains `bs-hq-v8` and the same `V` hash as the scripts in `hq.html`.
- `GET /cleanslate-version.json` is `no-store` (unrelated to HQ, but the headers test covers it).

This session confirmed the service-worker GET. It did not log in, and it did not call `/mcp`.

### Checklist by area

| Area | Test file | A correct result |
|---|---|---|
| Tool count and `bot` required | `tests/mcp.test.mjs` | 47 tools, every schema requires `bot`, unknown tool is an error |
| Tool version / reconnect | `tests/tools-version.test.mjs` | Reconnect when the count or the names differ. Version alone does not |
| Night-test fixes | `tests/night-test-18nov.test.mjs` | From/CC on the moderation draft, `needs_you` shape, live guide line |
| Needs you / cards | `tests/hq-auto.test.mjs` | Quiet hours hold non-money cards. Same dedupe key does not post twice. Payment and signature never count as a tap-yes |
| Phone home | `tests/hq-phone.test.mjs`, `tests/hq-look.test.mjs` | Pulse line, “not reported”, one received total per currency |
| Blank screen | `tests/hq-boot.test.mjs` | Cache name `bs-hq-v8`, one hash, 8 second timeout |
| Staff desk | `tests/staff.test.mjs`, `tests/hq-staff.test.mjs` | Messages, read marks, duties, connector switch |
| Releases | `tests/staff-releases.test.mjs`, `tests/staff-sightings.test.mjs` | Steps, waiting pitch, sightings, skip notes |
| Watchers | `tests/watchers.test.mjs` | Inbox not connected, Verse once per release day, claims say “not reported” when blank |
| Account health | `tests/account-health.test.mjs` | Green/watch/red from stored numbers. No platform fetch |
| Profiles | `tests/profiles.test.mjs`, `tests/profile-images.test.mjs` | Masters, exact-size rework, jobs |
| Workspaces | `tests/workspaces.test.mjs` | Farm and Label off the cap. Licence before upload. Card stays off the BADSCANDAL list |
| Money | `tests/money-one-entry.test.mjs`, `tests/money-links.test.mjs`, `tests/money-simple.test.mjs`, `tests/ledger-payments.test.mjs`, `tests/ledger-statements.test.mjs`, `tests/expected-money.test.mjs`, `tests/month-close.test.mjs` | Counted once at Revolut. Routes. Close needs evidence |
| Per-song | `tests/song-pl.test.mjs` | Missing song stays “not linked to a song” |
| Pitch | `tests/pitch-tracker.test.mjs` | Status, deadline, no auto-pitch |
| Fan inbox | `tests/fan-inbox.test.mjs` | Questions and repeat fans. No reply is sent |
| Preflight / assets | `tests/preflight.test.mjs`, `tests/asset-check.test.mjs` | Artist spelling, links, cover, Canvas, banners |
| Instagram | `tests/instagram.test.mjs`, `tests/post-rank.test.mjs` | Read-only budget, ranking floor, our accounts |
| Bank | `tests/bank.test.mjs` | Fake Enable Banking. No real bank |
| Push | `tests/push.test.mjs`, `tests/push-api.test.mjs`, `tests/apns.test.mjs` | Quiet hours, no secret in the payload |
| Song pages | `tests/songs.test.mjs`, `tests/release-page.test.mjs` | No Feature.fm, no pre-save, og:image absolute, share image under 200 KB |
| Pages tiles | `tests/song-tiles.test.mjs`, `tests/dashboard.test.mjs` | Redirects to `/hq`, sample never touches a real store |
| Syntax | `tests/js-syntax.test.mjs` | Every browser script parses |

### Checklist by tool

For each tool, a correct **read** returns JSON with no `isError`. A correct **write** returns `saved: true` or `asked: true` and a second call does not double-count when the tool is idempotent. A refused call is a sentence that names the field and what to do, and the store is unchanged.

| Tool | Kind | Pass looks like |
|---|---|---|
| `my_day` | read (plus read-marker) | `connector.tools === 47`. `reconnect_needed` false when `tools_seen` is 47 and names match |
| `post_update` | write | One new line in the live log. `done` flips that duty. A second different message is a second line |
| `send_message` | write | The message or the card appears. Same `dedupe_key` returns the existing card |
| `record_luke_answer` | write | Settled, marked via Alfred or Nova. Nova + a Forge message is refused |
| `recommend` | write | The card shows the recommendation. The question stays open |
| `preflight` | read | `ok` true or a list of problems. The pack is unchanged |
| `close_month` | write | Refused when `month_check` is not ready. With evidence, the month shows Closed |
| `instagram` | read (Nova can write the block list) | Ranking present or “not settled yet”. No comment is posted |
| `task_update` | write | That `T-` id changes. A `D-` id is the wrong tool |
| `read_messages` | read (marker moves on a broad read) | Open messages, newest first |
| `resolve_message` | write | `resolved` set. A decision to Luke from a bot is refused |
| `submit_income` | write | One row. The same reference does not create a second |
| `fix_payment` | write | The field changes and `history` has the reason. Unsorted is refused |
| `income_source` | write | The source shows the new state. `main` + `due_day` drives the colour |
| `record_spend` | write | One row for that platform and day. `not_read` stores the reason and not a zero |
| `log_growth` | write | The number you passed is the number stored. A blank claim field is “not reported” on the page |
| `income_check` | write | That account/day says it was checked, including zero new payments |
| `link_transfer` | write | Revolut row counts. Wise/PayPal row says moved and does not count |
| `month_check` | read | `ready` true only when nothing is unsorted, unlinked, or waiting |
| `payments` | read | Ids, no second copy of the same Revolut credit |
| `income_status` | read | Received totals per currency. `per_song` present. Unsorted listed by id |
| `team_board` | read | One entry per bot. Decisions waiting on Luke are listed |
| `luke_briefing` | read | Same shape as before this PR. If it grew a field, revert that part |
| `luke_short_briefing` | read | Cap, income, top 3 decisions, sign-ins. Shorter than the full briefing |
| `set_my_card` | write | Team card shows the new “Working on”. Clearing blockers without `working_on` works |
| `releases` | read | Your steps, with `waiting` on the pitch before Spotify for Artists |
| `release_pack` | read | Missing required fields listed. Approvals quote the text |
| `release_step` | write | Only your step. A waiting step refused for a bot. Label licence refused for Drop |
| `release_fill` | write | The field changes. Lyrics refused for Verse. A non-https link is refused |
| `propose_release` | write | `asked: true`. The release is unchanged until Yes |
| `song_page` | write | `asked: true`. No file appears in the repo until GitHub runs |
| `song_pages` | read | Each request has a state. Home-card `to_do` is “nothing” when the card is already right |
| `upload_cover` | write | An https link on our host. Warnings if the image is small |
| `roster_card` | write | Nova only. The Team card shows the new duty text |
| `store_status` | write | The release card shows the new status. `ready_to_resubmit` asks Luke and does not send |
| `spotify_upcoming` | write | `sightings.json` replaced. A matching release’s spotify step can flip to done |
| `pitch_log` | write | The pitch line shows the day. A skipped song refuses a pitch record |
| `profiles` | read or write | `list` does not change a platform. `propose` waits for Yes |
| `account_health` | read | `wrote: false`. Five accounts. Spotify may say “posts” (bug, not a pass to “fix” by inventing a number) |
| `needs_you` | read | `open` equals the action cards only. 0 is correct when the phone’s other line is a message |
| `song_pl` | read | Same figures as Money › Per song. Missing stays missing |
| `read_guide` | read | The first lines say 47 tools and name them |
| `sort_payment` | write | Unsorted row becomes received or transfer. A guess is not a successful call |
| `profile_jobs` | read, and it may message Luke | Jobs for your slots. A stuck job asks once |
| `profile_master` | read | Exact pixels. The URL needs the bearer |
| `profile_rework` | write | Exact size stored. Any other size refused |
| `profile_uploaded` | write | Slot shows the link, or stays open when `rejected` is true |

### Checklist by tab

| Tab | What “working” looks like on `?sample=1` |
|---|---|
| Needs you | Pulse, a sample payment card, a sample message card, quiet-hours copy if you set the clock inside 23:00–08:00, Monday block only when the sample ranking exists |
| Songs | Listener card and one card per sample song. No blank where a number is missing: “not reported” |
| Ads | Gauge with 750 and 900 marks. No button that pauses an ad |
| Pages | Song tiles, humans/bots switch, a log. CSV link present |
| Growth | Platform grid, Instagram box, fan inbox, claims box |
| Profiles | Two upload controls (photo, banner) and a platform list |
| Upcoming | A release, a pitch line, “the next 6 weeks”, an empty “needs you” line when nothing asks |
| Money | One received figure per currency. Wise/PayPal not added in. Revolut tile |
| Team | One card per bot, connector switch, desk-push boxes empty |
| Messages | Waiting list, compose box, sample writes disabled |
| Farm / Label | The BADSCANDAL tabs hide. The workspace has its own Needs you header. A label card is not on the BADSCANDAL pulse’s action-card subhead |

---

## 9. Known gaps and suspected bugs

Found while reading this tree. **None of them are fixed in the pull request that adds this file.**

### 1. The phone showed two different “need you” lines at 03:20 São Paulo on 18 Nov 2026

Luke’s screen, on the phone, Needs you, showed both:

- `1 need you · 11 at risk`
- `0 need you · nothing at risk`

and a Verse lyrics card. The `needs_you` tool returned `open: 0`.

This is what the code does. It is not two readers of one counter that drifted.

**The first line** is `homePulse` (`js/hq-look.js` lines 46–51), filled in `drawHome` (`js/hq-phone.js` lines 133–136).

- The `1` is the length of: decision wallets, plus action cards in `auto.needsYou`, plus red account-health rows. A single Verse lyrics decision is enough to make it 1.
- The `11` is `HQLib.attention(...).length` (`js/hq-lib.js` line 142). Those are alerts (late steps, cap, quiet bots, ads with no taps, and the rest listed in section 2). They are not money.

**The second line** is `needsHeader()` (`netlify/lib/action-cards.mjs` lines 145–154), shown as `<p class="dhead">` whenever `auto.header` is set (`js/hq-phone.js` line 140). It counts **action cards** only. The words “at risk” there mean a sum of `money_at_risk` amounts. No cards → `0 need you · nothing at risk`.

**The Verse card** is a **message**, not an action card. `decisionStack` (`js/hq-look.js` lines 181–198) turns a message to Luke with `needs: "decision"` and options into a wallet. `approval.what === "lyrics"` turns on the lyrics diff and the “Yes, correct” button. Verse is the lyrics bot, so the sender line is Verse. `needs_you` never sees that message.

**Why `open: 0` is consistent.** The handler (`netlify/lib/staff-tools.mjs` lines 1192–1196) sets `open` to `needsYou.length + held.length` from `workspaceNeeds(store, now, "badscandal")`. That reads `action-cards.json` only. Farm and Label cards are excluded. Messages are excluded. Attention rows are excluded. So a lyrics approval sitting in `msg/` with an empty action-card list is `open: 0` while the phone shows the wallet and the pulse.

**Quiet hours make it sharper.** 03:20 São Paulo is inside 23:00–08:00. `present()` (`action-cards.mjs` lines 462–467) puts non-money cards into `held` and builds the header from `needsYou` only. A screen can show the quiet line “Quiet hours until 08:00. These wait.” as well. Luke’s note did not mention that third line, so either there were no held cards, or it was below the fold. Either way the header stays `0 need you · nothing at risk` when no money card is open.

**Dead markup.** `lyricsCard()` in `js/hq-phone.js` (line 227) would render “&lt;from&gt; · final lyrics”. Nothing calls it. The card on screen is `walletCard()` (line 68).

**Also unused.** `drawHome` passes `board.actionCards` into `decisionStack`, but `GET /api/staff/board` (`staff.mjs` around line 222) spreads `auto` and does not set `actionCards`. That argument is empty in production. Decisions come from `board.waiting.luke`.

So the tool was right about action cards, and the phone was right about a lyrics decision plus eleven alerts. The bug is that both sentences use the same words for different counts, on the same screen, and the tool’s `open` matches only one of them.

### 2. Account health says “posts” for Spotify

`evaluate()` in `netlify/lib/account-health.mjs` (line 483) sets the reach source to `"posts the bot recorded"` for every account that is not Instagram. Spotify, TikTok, and YouTube all get that string. The site is handled in the other branch and does not.

`reachSignal()` (line 206) then writes sentences like “this account has N posts with a view or reach number” and “The last 3 posts are each under 30% of this account's own median”. Those sentences are the headline Atlas sees for Spotify.

The input is `recent_posts` on `log_growth` (`account-health.mjs` lines 121–134). The site is refused. Spotify is not. `recordedSeries()` (line 409) reads `c.posts` and feeds the same median. Spotify for Artists does not have posts. It has tracks. The source pill on the Growth / Needs you health card will say “posts the bot recorded” for Spotify whenever that signal is shown.

TikTok and YouTube really are posts, so the same string is fair there. The bug Luke named is the Spotify one. The code does not special-case it.

Related, not the same bug: listener counts for Spotify use `listenerSignal` and are labelled from growth rows. The “posts” wording is only the reach signal. An artificial-streams gap says “no artificial-streams warning has been recorded. That does not mean there is none.” That part is honest.

### 3. The short handoff on main contradicts main

`docs/HANDOFF.md` and `docs/STATUS.md` as they stood on `9e447e2`, before this docs PR:

- “main: through PR #84” and “Connector: 40 tools”.
- “Night test, 18 Nov … Not on main.”
- “Tests: 716”.
- Several “Waiting on Nova” lines still say 40 tools and `bs-hq-v7`.

PR #88’s own diff **added** the “not merged” line, because the branch was describing itself. After the squash, the line was false. This docs PR adds a pointer at the top of both short files, and corrects that one “not merged” sentence so the next agent does not go looking for a branch that already landed. The older “40 tools / 716 tests / through #84” paragraphs are left in place as the running log. The banner says this file wins.

### 4. PR #88’s own message undercounts the merged tree

The commit body says “three read-only tools bring the connector to 43. 739 tests”. The GitHub title says “43 tools”. After the merge with #87 the array length is 47 and `npm test` reports 745. Anyone reconciling “what the PR said” with `my_day` will think the deploy is wrong. It is the message that is behind, not the array.

### 5. `profile_jobs` can write while looking like a list

`listProfileJobs` calls `profileAlerts` (`profile-images.mjs` lines 197–199 and 254–267). A job open more than a day sends Luke a decision, once per set of stuck jobs. The tool is not marked `readOnly`. A bot that calls it “just to look” can still create a message. That is easy to miss because the description says “List”.

### 6. Other tools marked read-only that still write a little

- `my_day` and a broad `read_messages` update `read/<name>.json`.
- `luke_briefing` does that for Alfred.
- `instagram` writes the our-accounts list (Nova) and the post→song map (Steve, Forge, Nova).
- `song_pages` may refresh build reports and GETs the live site.

None of these change ads or money. They do make “read-only” slightly untrue, which matters when a bot is told it cannot change anything.

### 7. `read_messages` and the read marker

A broad read advances the marker and returns at most `limit` messages (default 20). The rest can show as already read. This is an old gap. PR #88 did not close it.

### 8. RouteNote mail cannot actually be read yet

`routeNoteMailSource()` hardcodes `connected: false` and an empty `messages` array (`staff.mjs` lines 4859–4867). The hourly job will keep saying not connected no matter how many emails are in the inbox, until someone wires a mailbox. The drafts and the From/CC headers are real. The reading is not.

### 9. `netlify.toml` names the wrong edge file

The comment says `touchme-geo.js`. The file is `song-geo.js`. Behaviour follows the file, not the comment.

### 10. Stale open pull requests

#72, #74, #78, #81, #82 are docs PRs for work that is already on main. #86’s “production is still the phone-look deploy” was true at 03:46 UTC and is not true of the service worker at 06:23 UTC. #68 is closed on purpose. Merging the stale docs PRs would fight `docs/HANDOFF.md`.

### 11. Smaller things worth knowing, not chased here

- `cards.json` (working-on) and `action-cards.json` (tap cards) are different. New code keeps mixing the English word “card”.
- The phone “Quiet” toggle, the card quiet hours, the push quiet hours, and the chase window are four different clocks.
- `HANDOFF` still tells Nova to reconnect because `tools_seen` is not 40. The live rule is 47, and only when the names differ too.
- A6 does not check a Musixmatch format. There is no written rule to check against (`docs/HQ-ROADMAP.md`).
- The song-page report step’s first real run was `/loveyou`. Later pages are the proof it still works.
- Instagram: it is not proven whether a post’s views include the ad’s views, or the exact Meta action names for Instagram-post ads (`docs/HANDOFF.md`).
- L3 part 2 and L10 are not built.
- The public home still has the stream line Luke called out (“as of September 2026”) and the Plugin store placement. Those were left for him on purpose. They are not HQ bugs.
- `tests/mcp.test.mjs` still has comments from when the tool count was 20. The assertion is 47. The comment can mislead a search.

---

## 10. Roadmap and what is waiting on Luke

Status words from `docs/HQ-ROADMAP.md`: `todo`, `live`, `needs Luke`, `on hold`, `not needed`, `idea`. The roadmap file itself was last written in the style of 17–18 Nov and does not yet mention #87 or #88. The statuses below are the roadmap plus what the code on `9e447e2` actually contains.

### Batch A — live

| Item | Status |
|---|---|
| A1 UI bugs | Live, PR #47 |
| A2 Build failures onto the desk | Live, PR #48 |
| A3 Decisions inbox with a recommendation | Live, PR #49 |
| A4 Automatic chasing | Live, PR #50 |
| A5 Six-week calendar | Live, PR #51 |
| A6 Preflight | Live, PR #52. Musixmatch format still has no rule |
| A7 Locked month close | Live, PR #53 |
| A8 Monthly listeners on Songs | Live, PR #54 |

### Batch B

| Item | Status |
|---|---|
| B1 Release-day Spotify watch | Not needed. Luke, 17 Nov |
| B2 YouTube Analytics | **Needs Luke.** One Google sign-in. Not built |
| B3 Meta spend recorded by HQ | Live, PR #54 |
| B4 Instagram reader | Live and connected, PRs #55, #56, #58. Renew the key before the date HQ shows if the Page token was not handed over (about 60 days from 17 Nov) |
| B5 Google Ads and TikTok APIs | Not needed. Luke, 17 Nov. Forge records that spend |

### Later items

| Item | Status on this tree |
|---|---|
| L1 Expected money | Live, PR #71 |
| L2 What engages best | Live, PR #60, floor tightened in #69 |
| L3 Fan inbox | Part 1 live, PR #66. **Part 2 not built** (country, and a reply he approves). HQ would still never send it |
| L4 Per-song profit | Live, PR #67. Also the `song_pl` tool since #88 |
| L5 Watchers | Live, PR #73, draft headers finished in #88. **Mailbox still needs Luke** |
| L6 Song-page tiles | Live, PR #59 |
| L7 Pitch tracker | Live, PR #63 |
| L8 Asset checker | Live, PR #61. Profile sizes were added later |
| L9 Payout route cost | Live, PR #71 |
| L10 End screens and pinned comments | **Todo.** Needs YouTube write access. Do not build it on a whim |
| L11 Split ledger for “Luka” | **Needs Luke.** Who is Luka? The roadmap asks if that is Lilian’s share. Nothing is built |
| L12 Profiles | Live, PR #64. Masters and the four tools are PR #87. A later idea (reading an image from a platform API) is not built and must not log in |

### On hold until Luke decides — H1 to H4

These would change a rule he set. Do not start them because they look useful.

| Item | Why it waits |
|---|---|
| H1 Live ads panel and a kill switch | HQ only reads ads on purpose. A Luke-only “pause all” is a product decision. Ads pausing themselves at USD 900 is a bigger one |
| H2 Ad templates and a creative test board | Needs write access to ads |
| H3 Upload once, post everywhere | Posting APIs put content in public. After the number feeds work, and only with his yes |
| H4 Fan capture on song pages | Emails and phone numbers mean privacy-law work (EU, Brazil) and a privacy-policy change |

### Not possible

Spotify for Artists stats (streams, saves, playlist adds, monthly listeners, top countries) have no public API. Atlas keeps reading the dashboard. The public Web API gives followers and popularity only. Monthly listeners on Songs are the numbers Atlas logs, not a Spotify pull.

### Not HQ’s

Emulator health (#19) is Nova’s machine, not this repo.

### Waiting on Luke, in one list

1. Say deploy or publish before anything in a branch reaches `main`.
2. Sign `luke@badscandal.com` into HQ, read-only, if RouteNote mail should stop saying “not connected”. Forward Lilian’s RouteNote mail there first if it is not already.
3. B2, if he wants YouTube numbers without Laura typing them: one Google sign-in.
4. H1–H4, only if he changes his mind. Default is leave them.
5. L11: who “Luka” is.
6. L10 and L3 part 2: only if he asks.
7. The public stream line (“as of September 2026”), where “Plugin store” sits on the home page, and whether pack genre and language should be checked against RouteNote’s list. Left on purpose.
8. Instagram key renewal if HQ shows an expiry date.
9. Paste desk-push webhook addresses on Team if a bot should get a ping. Empty is off. Nova collects the address. Only Luke pastes it.
10. “Taps count as Luke’s yes” stays off until he switches it on. Payments and signatures stay his even then.
11. X profile images: no owner bot. He uploads them.
12. Instagram profile photo: he uploads it. The API does not update it.
13. Stale open PRs #72, #74, #78, #81, #82, #86: close or ignore. Do not merge them to “tidy up” without him.
14. Old open PRs #1, #5, and #7 (mentioned in `docs/STATUS.md`): ask before touching them.
15. Anything only his Mac can do: Netlify env values, the private HQ-App repo, the bots’ seed in `badscandal-hq`, Keychain, screenshots of the logged-in page.

### Waiting on the bots, once he has deployed a tool change

This tree’s connector has 47 tools. `my_day` tells each bot to reconnect when their app’s count or names differ. The options that changed across #77, #79, #84, #87, and #88 mean a bot that last connected at 40 tools is stale. Nova’s message, when a deploy actually happens, is: refresh the connector; `needs_you`, `song_pl`, and `account_health` are read-only; the four profile tools are Atlas, Laura, Steve, and Kevin; Label `licence` is the Licence bot or Nova; money still counts once at Revolut; do not invent a number; do not post, pitch, or change an ad from HQ.

### What the next agent should do first

1. Read this file and `docs/WORKING-WITH-LUKE.md`.
2. Do not fix section 9 unless Luke asks. The Needs you wording is a product bug with a known cause. The Spotify “posts” wording is a copy bug with a known line.
3. If he asks for a fix, write the test first, run `npm test` and Node 22, and keep `luke_briefing`’s output still.
4. End a deploy with a short note for Nova, in plain words, and update `docs/HANDOFF.md` and `docs/STATUS.md` in that same push so they stop saying 40 tools.

---

## Message for Nova

Not a deploy. This pull request is a handoff file only (`docs/HQ-FULL-HANDOFF.md`). The connector on main is already 47 tools if `9e447e2` is what Netlify published. If your app still lists 40 or 43 or 44, reconnect. `needs_you` counts action cards, not lyrics decisions. `account_health` can say “posts” for Spotify; that is the page’s wording, not a number you should invent. RouteNote mail is still not connected. Nothing in this change posts, pitches, or touches an ad.
