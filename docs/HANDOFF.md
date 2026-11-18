# Handoff: where HQ is and what's next (read this first)

**Last updated:** 18 Nov 2026, by Cursor (cloud session). L7 is in a branch, not on main.
**main:** every PR up to #61 is live. **Tests on main:** 568 pass on Node 24 and Node 22, none cancelled.
**Connector on main:** 38 tools. `preflight` gained asset options (L8); Atlas, Laura and Webmaster were told to refresh their tool list.

> **The rule (Luke, 17 Nov 2026):** every time anything is pushed to `main` for HQ, the same push updates THIS
> file (and `docs/STATUS.md`). If Luke's computer crashes or a session ends mid-way, the next agent starts from
> here. A branch that isn't merged yet gets one line under "In flight" below, pushed with the branch.

---

## Paste this into a new Claude Code session

```
You're picking up the BADSCANDAL HQ work in the repo Badscandal/badscandal-site (badscandal.com, the public
site + Luke's private dashboard /hq + the bots' connector /mcp).

1. Read, in this order: docs/HANDOFF.md (where we are, what's next), docs/WORKING-WITH-LUKE.md (the rules),
   docs/STATUS.md (what's live), docs/HQ-ROADMAP.md (the plan). CLAUDE.md is the full technical reference.
2. Hard rules: merge to main ONLY when Luke says "deploy" or "publish". The repo is PUBLIC: no keys, money
   amounts, payer or account names, lyrics or private notes, not even in tests. Never read a key, .env, .pem or
   .p8. Never call the live site's write endpoints. No npm dependencies. luke_briefing's output never changes.
   Stage files by name. Tests first; npm test AND npx -y node@22 --test tests/*.test.mjs must both pass.
3. Every push to main also updates docs/HANDOFF.md and docs/STATUS.md (the next agent starts from them).
4. Then tell Luke in plain words where things stand and ask what he wants next (or carry on with what
   HANDOFF.md says is in flight). End every deploy with a message for Nova.
```

---

## Where it stands (17 Nov 2026, night)

**Where we left off:** L7 (the pitch tracker) is built on branch `cursor/pitch-tracker-feb7` and is waiting for
Luke's "deploy". It is not on main. L8 (the asset checker) is live (PR #61, commit `1013f31`). A new session
starts from this file: the branch is the work in flight.

**HQ** (`badscandal.com/hq`, also inside the HQ apps on Luke's iPhone and Mac) has: Today, Songs, Ads, Pages
(one tile per song page since #59), Growth & Fans (with the Instagram reader), Upcoming (the release pipeline),
Money (Revolut is the main account), Team, Messages. The bots (Nova, Alfred, Ledger, Sheet, Steve, Kevin, Laura,
Atlas, Drop, Verse, Webmaster, Forge) work through the connector `/mcp`.

**Done today (17 Nov):** the bots' roadmap Batch A (A1–A8) and B3; B4 Instagram (connected, read-only, Facebook
Page route, a safety brake that stops reading if Meta objects); L6 song page tiles; L2 adapted ("What engages
best": posts ranked by engagement per view at the same age, each boosting ad's cost per engagement, numbers before
the ad, "Needs a reply", our-own-accounts list Nova manages); L8, the asset checker. B1 and B5 were dropped by Luke.

**L8, checked live on HQ:** `preflight` checks a cover, a Spotify Canvas, a Spotify header or a YouTube banner.
A Canvas at 1080×1920, mp4, 6 seconds passed. A Canvas at 1920×1080, .mov, 12 seconds and a YouTube banner at
1500×500, 9 MB were each caught on all three problems. Preflight for the song "Love You" passed. Atlas, Laura
and Webmaster were told to refresh their HQ tool list.

**Luke's priorities, in his words:** "our prime goal is not to get our account restricted or disabled, we need
ads" (every Meta/Instagram read is read-only, small, and stops by itself on a block). The aim: "an autonomous
artist growth bot that all we will need is content and $".

## In flight (branches not merged)

- **`cursor/pitch-tracker-feb7` (L7, PR #63, waiting for Luke's "deploy"):** each upcoming and recent song shows not pitched, pitched with the day, or missed. The deadline is 7 days before release; a warning shows from 14 days out, while there is still time. The two-week pitch slots stay on Upcoming. Atlas records a pitch and an editorial playlist with `pitch_log`. HQ never pitches. Tests 574 on Node 24 and 22. On merge: the connector has 39 tools, so every bot refreshes the tool list. Atlas is the one who uses `pitch_log`.

## Waiting on someone

- **Nova (after #60):** add our own accounts with the instagram tool (`our_accounts: "add"`, the two handles Luke
  named, each with a reason; they are NOT in the code because the repo is public). Add the Monday routine to the
  bots' duties with `roster_card` (Steve and Kevin: why the top 3 beat the bottom 3; Forge: one decision for Luke
  on where the ad money goes next). Steve, Kevin and Forge: refresh the tool list.
- **Luke:** if HQ shows "Meta key: expires around …" on the Instagram box, make a new key a few days before that
  date (same steps as 17 Nov). Optional: B2 (YouTube Analytics, one Google sign-in). On hold until he decides:
  H1–H4 (ads kill switch, ad templates, posting, fan capture). L11 needs him (who "Luka" is).

## What to watch (first real runs)

- **Instagram:** the first hourly reads fill older posts (4 an hour), the 1-day numbers, follows/profile visits
  (not every post type has them), comments with replies, countries. Not proven yet: whether Instagram's post views
  include the ad's views, and the exact action names Meta returns for Instagram-post ads. If a section stays
  empty after a day, ask Luke what HQ shows and adjust `netlify/lib/instagram.mjs` / `postrank.mjs`.
- **The ranking:** fewer than 10 ranked posts for the first week or two; the bots must call the order "not
  settled yet".
- **Song page tiles:** the Meta line per page fills only from 17 Nov (older health records have no page).
- **A2:** the song_page build report has run once (/loveyou); watch the next one.
- **A4 / B3:** reminders and Meta's daily spend rows run hourly from 07:00 São Paulo.

## What's next (start any of these only on Luke's word)

Offer these three, in this order:

1. **L7 pitch tracker:** built, on `cursor/pitch-tracker-feb7`, waiting for "deploy". Not live yet.
2. **Profiles (L12):** an idea. One place in HQ for the profile photo and the banner on every official platform.
   Needs Luke's go before any build. Do not start it before he says go.
3. **L3 fan inbox, part 1:** song-name questions and repeat fans (builds on "Needs a reply"). Agree the slice
   with him before building the rest of L3 (a ready reply he approves).

Later, if he asks:

4. **After a week of Instagram data:** check the ranking with Luke against what he sees in the app; tune the
   300-view floor and the 1-day window if needed.
5. **B2 YouTube Analytics** (one Google sign-in from Luke), so Laura's numbers come in by themselves.
6. **The rest of Later** (L1 expected money, L4 per-song P&L, L5, L9, L10): see docs/HQ-ROADMAP.md.
7. **H1–H4** stay on hold until Luke decides (they would touch ads, posting or fans' data).

## How to check your work

- `npm test` and `npx -y node@22 --test tests/*.test.mjs` (both, all pass, none cancelled).
- `tests/js-syntax.test.mjs` parses every browser script: a broken `js/hq.js` once stopped HQ and both apps (#57).
- For the page: a local server with the fake stores and Playwright at 390 px and 1280 px, `/hq?sample=1`.
- After a deploy you usually can't reach badscandal.com from a cloud session: say so and let Luke check.
