# Handoff: where HQ is and what's next (read this first)

**Last updated:** 18 Nov 2026, by Cursor. L12 (Profiles) is in a branch, not on main.
**main:** every PR up to #63 is live. **Tests on main:** 574 pass on Node 24 and Node 22, none cancelled.
**Connector on main:** 39 tools. `pitch_log` is new (L7), so every bot must refresh the tool list. Atlas is the one who uses it.

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

**Where we left off:** L7 (the pitch tracker) is live on main (PR #63, commit `e842b88`). Luke merged it.
Nothing else is in flight. A new session starts from this file.

**HQ** (`badscandal.com/hq`, also inside the HQ apps on Luke's iPhone and Mac) has: Today, Songs, Ads, Pages
(one tile per song page since #59), Growth & Fans (with the Instagram reader), Upcoming (the release pipeline),
Money (Revolut is the main account), Team, Messages. The bots (Nova, Alfred, Ledger, Sheet, Steve, Kevin, Laura,
Atlas, Drop, Verse, Webmaster, Forge) work through the connector `/mcp`.

**Done (17–18 Nov):** the bots' roadmap Batch A (A1–A8) and B3; B4 Instagram; L6 song page tiles; L2 ("What engages
best"); L8, the asset checker; L7, the pitch tracker (18 Nov, PR #63). B1 and B5 were dropped by Luke.

**L8, checked live on HQ:** `preflight` checks a cover, a Spotify Canvas, a Spotify header or a YouTube banner.
A Canvas at 1080×1920, mp4, 6 seconds passed. A Canvas at 1920×1080, .mov, 12 seconds and a YouTube banner at
1500×500, 9 MB were each caught on all three problems. Preflight for the song "Love You" passed. Atlas, Laura
and Webmaster were told to refresh their HQ tool list.

**Luke's priorities, in his words:** "our prime goal is not to get our account restricted or disabled, we need
ads" (every Meta/Instagram read is read-only, small, and stops by itself on a block). The aim: "an autonomous
artist growth bot that all we will need is content and $".

## In flight (branches not merged)

- **`cursor/hq-profiles-9009` (L12, preview PR, waiting for Luke's "deploy"):** HQ › Profiles lists the profile photo and the banner on every official platform. For each: the current image and the day it changed, the size rule (or "Rule not set"), a new image waiting for "Yes, correct", and the owner who uploads it by hand after that. The `profiles` tool (list, record, propose) is for Atlas, Laura, Steve and Kevin. X has no owner yet. HQ never logs in and never changes a platform. No Meta or Instagram calls. 582 tests pass on Node 24 and Node 22. On merge: STATUS row, roadmap L12 -> live, and tell Atlas, Laura, Steve, Kevin and Nova to refresh the tool list (40 tools).

## Waiting on someone

- **Nova (after #63):** tell every bot to refresh the tool list (39 tools). Atlas: after he sends a Spotify pitch, record the day with `pitch_log` (`pitched_on`). When he sees the song on a new editorial playlist in Spotify for Artists, record it the same day (`playlist`, `added_on`). HQ never pitches. A song the one-pitch rule skipped is not pitched.
- **Nova (after #60, still open):** add our own accounts with the instagram tool (`our_accounts: "add"`, the two handles Luke
  named, each with a reason; they are NOT in the code because the repo is public). Add the Monday routine to the
  bots' duties with `roster_card` (Steve and Kevin: why the top 3 beat the bottom 3; Forge: one decision for Luke
  on where the ad money goes next).
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
- **L7:** Atlas's first `pitch_log` (a pitch day, then an editorial playlist after a song is out). HQ only records what he saw.

## What's next (start any of these only on Luke's word)

Offer these, in this order:

1. **Profiles (L12):** in flight on `cursor/hq-profiles-9009`. Do not start a second version until Luke says deploy, or asks for the next slice (reading an image, still with no login from HQ).
2. **L3 fan inbox, part 1:** song-name questions and repeat fans (builds on "Needs a reply"). Agree the slice
   with him before building the rest of L3 (a ready reply he approves).

Later, if he asks:

3. **After a week of Instagram data:** check the ranking with Luke against what he sees in the app; tune the
   300-view floor and the 1-day window if needed.
4. **B2 YouTube Analytics** (one Google sign-in from Luke), so Laura's numbers come in by themselves.
5. **The rest of Later** (L1 expected money, L4 per-song P&L, L5, L9, L10): see docs/HQ-ROADMAP.md.
6. **H1–H4** stay on hold until Luke decides (they would touch ads, posting or fans' data).

## How to check your work

- `npm test` and `npx -y node@22 --test tests/*.test.mjs` (both, all pass, none cancelled).
- `tests/js-syntax.test.mjs` parses every browser script: a broken `js/hq.js` once stopped HQ and both apps (#57).
- For the page: a local server with the fake stores and Playwright at 390 px and 1280 px, `/hq?sample=1`.
- After a deploy you usually can't reach badscandal.com from a cloud session: say so and let Luke check.
