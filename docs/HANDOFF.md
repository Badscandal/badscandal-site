# Handoff: where HQ is and what's next (read this first)

**Last updated:** 18 Nov 2026, by Cursor. L3 fan inbox part 1 is on main (PR #66). L1 and L9 are in flight as PR #71 (not merged).
**main:** every PR up to #66 is live. **Tests on main:** 590 pass on Node 24 and Node 22, none cancelled.
**Connector:** 40 tools. No new tool in #66, and none on the L1/L9 branch. The `instagram` tool now also returns the fan inbox, so Steve, Kevin and Forge should refresh if they have not since #66 (Nova too: she has every tool). `profiles` (L12) is still the newest tool name.

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

## Where it stands (18 Nov 2026)

**Where we left off:** L3 fan inbox, part 1, is on main (PR #66, `dab08d2`). Growth & Fans shows people asking the song's name or where to listen, and people who comment on more than one post. "Needs your reply" is for Luke. HQ never replies. Part 2 is not built. L1 (expected money) and L9 (what a payout route cost) are PR #71 and are not live yet. L12 (PR #64) and the release-card fix (PR #65) are live.

**HQ** (`badscandal.com/hq`, also inside the HQ apps on Luke's iPhone and Mac) has: Today, Songs, Ads, Pages
(one tile per song page since #59), Growth & Fans (with the Instagram reader), Profiles (since #64), Upcoming (the release pipeline),
Money (Revolut is the main account), Team, Messages. The bots (Nova, Alfred, Ledger, Sheet, Steve, Kevin, Laura,
Atlas, Drop, Verse, Webmaster, Forge) work through the connector `/mcp`.

**Done (17–18 Nov):** the bots' roadmap Batch A (A1–A8) and B3; B4 Instagram; L6 song page tiles; L2 ("What engages
best"); L8, the asset checker; L7, the pitch tracker (PR #63); L12, Profiles (PR #64); the release-card fix (PR #65). B1 and B5 were dropped by Luke.

**L12, live:** HQ › Profiles lists the profile photo and the banner on every official platform. The current image and the day it changed, the size rule (or "Rule not set"), a new image waiting for "Yes, correct", and the owner who uploads it by hand after that. The `profiles` tool. HQ never logs in and never changes a platform. No Meta or Instagram calls. `/hq` answered 200 and `/mcp` answered 401 right after the merge.

**L8, checked live on HQ:** `preflight` checks a cover, a Spotify Canvas, a Spotify header or a YouTube banner.
A Canvas at 1080×1920, mp4, 6 seconds passed. A Canvas at 1920×1080, .mov, 12 seconds and a YouTube banner at
1500×500, 9 MB were each caught on all three problems. Preflight for the song "Love You" passed. Atlas, Laura
and Webmaster were told to refresh their HQ tool list.

**Luke's priorities, in his words:** "our prime goal is not to get our account restricted or disabled, we need
ads" (every Meta/Instagram read is read-only, small, and stops by itself on a block). The aim: "an autonomous
artist growth bot that all we will need is content and $".

## In flight (branches not merged)

- **L1 + L9** (PR #71, `cursor/expected-money-routes-cbcf`, not merged): Expected money and the exchange-and-fee cost of each payout route, for Ledger and Sheet. No new tool (still 40). `income_status` gains `expected_money` and `payout_routes`. `my_day` for Ledger and Sheet gains the same summaries. `luke_briefing` is unchanged. A route with two currencies says "not enough data". HQ does not move money and does not guess a rate. Ledger and Sheet do not need to refresh: no tool was added and no option was added. Preview: https://deploy-preview-71--profound-haupia-db7ffa.netlify.app/hq?sample=1

## Waiting on someone

- **Nova (after #64):** tell every bot to refresh the tool list (40 tools). Atlas, Laura, Steve and Kevin: `profiles` records the image that is live (the link and the day it changed) and proposes a new one. Luke says "Yes, correct", then that bot uploads it by hand and records it. HQ never logs in. X has no owner yet: Luke uploads that one himself. Instagram, TikTok and Deezer say "Rule not set".
- **Nova (after #63, still open):** Atlas: after he sends a Spotify pitch, record the day with `pitch_log` (`pitched_on`). When he sees the song on a new editorial playlist in Spotify for Artists, record it the same day (`playlist`, `added_on`). HQ never pitches. A song the one-pitch rule skipped is not pitched.
- **Nova (after #60, still open):** other own accounts still go on the desk with the instagram tool (`our_accounts: "add"`, a handle and a reason). The two accounts named for the fan inbox are already filtered in code and never shown. Add the Monday routine to the
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
- **L12:** the first `profiles` record (what is live now) and the first new image Luke says yes to. HQ only stores the link. The bot uploads it.
- **L3 part 1:** the fan inbox fills from comments already read (every 3 hours, on posts from the last 8 days). If it stays empty after a day of real comments, the phrases in `askKind` need a line fans actually write.

## What's next (start any of these only on Luke's word)

Offer these, in this order:

1. **L3 fan inbox, part 2,** only if he asks: a fan's country, and a ready reply he approves. Part 1 does not draft a reply and HQ never sends one.

Later, if he asks:

2. **After a week of Instagram data:** check the ranking with Luke against what he sees in the app; tune the
   300-view floor and the 1-day window if needed.
3. **B2 YouTube Analytics** (one Google sign-in from Luke), so Laura's numbers come in by themselves.
4. **The rest of Later** (L4 per-song P&L, L5, L10): see docs/HQ-ROADMAP.md. L1 and L9 are the in-flight branch above.
5. **H1–H4** stay on hold until Luke decides (they would touch ads, posting or fans' data).

## How to check your work

- `npm test` and `npx -y node@22 --test tests/*.test.mjs` (both, all pass, none cancelled).
- `tests/js-syntax.test.mjs` parses every browser script: a broken `js/hq.js` once stopped HQ and both apps (#57).
- For the page: a local server with the fake stores and Playwright at 390 px and 1280 px, `/hq?sample=1`.
- After a deploy you usually can't reach badscandal.com from a cloud session: say so and let Luke check.
