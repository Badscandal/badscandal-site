# Handoff: where HQ is and what's next (read this first)

**Last updated:** 18 Nov 2026, by Cursor. Main is through PR #75 (round 2) and PR #73 (L5 watchers). This branch is the money-links work, not merged.
**main:** every PR up to #75 is live. **Tests on this branch:** 665 pass on Node 24 and Node 22, none cancelled.
**Connector:** 40 tools. No new tool. `log_growth` gained `claim`, `claimant` and `impact` on this branch, so Laura, Steve, Atlas, Kevin and Nova refresh the tool list when it is deployed. Options also changed in #69.

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

**Where we left off:** L1 (expected money) and L9 (what a payout route cost) are on main (PR #71). The phone HQ is on main (PR #70). Money shows what landed in Revolut on its own line. Payable, and money still in Wise or PayPal, are smaller and never added in. The connector bug fixes (PR #69) are live. L5 (watchers, PR #73) and the round-2 fixes (PR #75) are on main. RouteNote email is not connected. L4 (PR #67), L3 part 1 (PR #66), L12 (PR #64) and the release-card fix (PR #65) are live.

**HQ** (`badscandal.com/hq`, also inside the HQ apps on Luke's iPhone and Mac) has: Today, Songs, Ads, Pages
(one tile per song page since #59), Growth & Fans (with the Instagram reader), Profiles (since #64), Upcoming (the release pipeline),
Money (Revolut is the main account), Team, Messages. The bots (Nova, Alfred, Ledger, Sheet, Steve, Kevin, Laura,
Atlas, Drop, Verse, Webmaster, Forge) work through the connector `/mcp`.

**Done (17–18 Nov):** the bots' roadmap Batch A (A1–A8) and B3; B4 Instagram; L6 song page tiles; L2 ("What engages
best"); L8, the asset checker; L7, the pitch tracker (PR #63); L12, Profiles (PR #64); the release-card fix (PR #65); L3 fan inbox part 1 (PR #66); L4 per-song profit (PR #67); the connector bug fixes (PR #69). B1 and B5 were dropped by Luke.

**Connector fixes, live (PR #69):** still 40 tools. Ads were not touched. Stored money amounts and records were not rewritten; only how rows are counted and labelled. Instagram ranking joins a Meta spend row to a post when that spend is on the post's day or the next day, and shows the boost's spend, its engagements, the cost per engagement, and the numbers from before the ad. The view floor is 1,000. A post under that is flagged. A post older than 21 days is also listed with the older posts. More ways of asking a question count as a fan question. A self-release names RouteNote when the distributor field is empty. badscandal moves to Primary only when the pack says so; otherwise it is flagged. A pitch that does not apply does not warn that mood, instruments and story are still needed. A reply from Luke that looks like lyrics is offered for the pack and stays pending until he says yes. Stale duty lines are cleared: Forge no longer says to log Meta by hand, and Google's currency is "not confirmed" until it is; a TikTok sign-in wait clears once TikTok is signed in; Ledger's "Revolut can't be read" clears once Revolut can be read. A Wise or PayPal row already counted at Revolut is "moved to Revolut" and is not counted again, in payments, income_status, month_check and the briefings. A second copy of the same Revolut credit is hidden. A payment can show both the statement month and the month it landed. Payable is not called pending. Card digits, account digits and raw ad-account ids are hidden in tool output. `read_guide` matches the live desk. `/hq` answered 200 and `/mcp` answered 401 right after the merge.

**L4, live:** Money › Per song, and one "Ad spend for this song" line on each Songs card. Royalties by store are money in. Ad spend and a royalty payment count for a song only when that row names the song. Anything else says "not linked to a song" and is not added in. One currency: money in minus that spend. Across currencies: an estimate at each month's average rate, and only when every rate is there. HQ only reads and records. `/hq` answered 200 and `/mcp` answered 401 right after the merge.

**L3 part 1, live:** Growth & Fans shows comments asking the song's name or where to listen, and people who comment on more than one post. "Needs your reply" is for Luke. HQ never replies, likes, hides or deletes a comment, and it makes no extra Instagram call. The two accounts Luke named are never shown. Part 2 (a fan's country, and a ready reply he approves) is not built.

**L12, live:** HQ › Profiles lists the profile photo and the banner on every official platform. The current image and the day it changed, the size rule (or "Rule not set"), a new image waiting for "Yes, correct", and the owner who uploads it by hand after that. The `profiles` tool. HQ never logs in and never changes a platform. No Meta or Instagram calls. `/hq` answered 200 and `/mcp` answered 401 right after the merge.

**L8, checked live on HQ:** `preflight` checks a cover, a Spotify Canvas, a Spotify header or a YouTube banner.
A Canvas at 1080×1920, mp4, 6 seconds passed. A Canvas at 1920×1080, .mov, 12 seconds and a YouTube banner at
1500×500, 9 MB were each caught on all three problems. Preflight for the song "Love You" passed. Atlas, Laura
and Webmaster were told to refresh their HQ tool list.

**L5, live (PR #73):** RouteNote's moderation mail, Verse's release-day note, and Laura's Content ID claims. Still 40 tools. `log_growth` records a claim (`claim`, `claimant`, `impact`, `date`). RouteNote email says **not connected**. The site has no mailbox. The Google key only reads the sheet. Meta, Instagram, Revolut and the desk keys are not a mailbox. Luke has to sign the site into that inbox, read-only (Gmail readonly, or a forward into a mailbox the site is allowed to read). Until then the card says "RouteNote email: not connected", Drop's own store status still shows, and HQ does not invent a moderation result and does not email anyone. On a release day (São Paulo) Verse gets one desk note to submit the approved lyrics on Musixmatch when the song shows there. A song not on Musixmatch yet is not a block. The same day does not send a second note. Growth & Fans shows only claims Laura recorded. A blank is "not reported". An empty list says none has been recorded. `luke_briefing` is unchanged.

**Luke's priorities, in his words:** "our prime goal is not to get our account restricted or disabled, we need
ads" (every Meta/Instagram read is read-only, small, and stops by itself on a block). The aim: "an autonomous
artist growth bot that all we will need is content and $".

## In flight (branches not merged)

- **Money links** (`cursor/hq-money-link-fixes-bf45`, not merged): one counting rule (received means Revolut) for payments, month_check, income_status and the briefings. A route sums every link. A gap with no source is short, unexplained, never a fee. A rate is kept only when Revolut recorded it. `close_month` needs month_check ready and an https evidence link. No new tool. HQ does not write the Google Sheet and does not decide a ledger month.
- **HQ round 2** (PR #75, on main): Pre-HQ packs mark only the RouteNote fields not needed; the release-day link, the video and the lyrics stay live. A Canvas step skipped for no link comes back when the link is added. `my_day` schedule lines stay whole, drop a done step and a past date, and the Monday line is the current one. Old notes to everyone drop off. A lyrics blocker clears when the lyrics are in or waiting on "Yes, correct", and that answer refreshes the step note. Signed-out lines name the platform, and a sign-in task follows the live list. Instagram: 0-view rows and old posts are not waiting; under 10 ranked says not settled; a read within 20 minutes reuses the last one and does not spend a call; a post says "song not linked" until Steve, Forge or Nova records the song. Preflight flags do not fail the check. `song_pages` fetches each page and reports the status and the time. Still 40 tools. `log_growth` keeps the Content ID claim fields from L5, and the instagram tool keeps `post` and `song`. The bots refresh.
- **L1 + L9** (PR #71, on main): Expected money and what a payout route cost. Still 40 tools. `luke_briefing` is unchanged.

## Waiting on someone

- **Nova (after this phone HQ is deployed):** tell every bot to refresh. Still 40 tools. `my_day` says "reconnect needed" when `tools_seen` is not 40 (or when `tools_version` / `list_version` is not the live one). `set_my_card` can clear a blocker without `working_on`. A blocker not restated for 48 hours shows as "old, still true?". `questions_to_luke` lists each open question and how long it has waited. Ledger, Sheet, Nova and Alfred: `income_problems` names unsorted payments by id and date. Atlas: if a duty still says "monthly listeners in note" or mentions a Salvation card, change that row. Those numbers are `monthly_listeners` and `brazil_listeners` on `log_growth`.
- **Nova (after #69, live):** tell every bot to refresh the tool list (still 40 tools; the options changed). Ranking uses 1,000 views. A boost shows its spend, its engagements, the cost per engagement, and the numbers from before the ad. Money counts once, at Revolut: a Wise or PayPal row already counted there says "moved to Revolut" and is not counted again. A reply from Luke that looks like lyrics stays pending for the pack until he says yes. `read_guide` is the current one.
- **Nova (after #67, live):** tell Ledger, Sheet, Forge and Nova to refresh the tool list (still 40 tools) if they have not since #67. `income_status` now includes `per_song`. Ledger and Sheet: name the song, and the store when they know it, on a royalty payment only when that payment is for that one song. If it covers more than one, leave the song out. Never guess. Forge: name the song on `record_spend` only when that amount is for one song. Leave it out for an account total. Never guess a song from a campaign name, and never record the same money both ways.
- **Nova (after #66):** tell Steve, Kevin and Forge to refresh the tool list (still 40 tools) if they have not since #66. The instagram tool now includes the fan inbox: song-name questions, where to listen, and repeat fans. `needs_reply` true is for Luke. They never reply, like, hide or delete a comment.
- **Nova (after #64):** Atlas, Laura, Steve and Kevin: `profiles` records the image that is live (the link and the day it changed) and proposes a new one. Luke says "Yes, correct", then that bot uploads it by hand and records it. HQ never logs in. X has no owner yet: Luke uploads that one himself. Instagram, TikTok and Deezer say "Rule not set".
- **Nova (after #63, still open):** Atlas: after he sends a Spotify pitch, record the day with `pitch_log` (`pitched_on`). When he sees the song on a new editorial playlist in Spotify for Artists, record it the same day (`playlist`, `added_on`). HQ never pitches. A song the one-pitch rule skipped is not pitched.
- **Nova (after #60, still open):** other own accounts still go on the desk with the instagram tool (`our_accounts: "add"`, a handle and a reason). The two accounts named for the fan inbox are already filtered in code and never shown. Add the Monday routine to the
  bots' duties with `roster_card` (Steve and Kevin: why the top 3 beat the bottom 3; Forge: one decision for Luke
  on where the ad money goes next).
- **Luke:** three things from the bots' test were left for him: the public stream line still says "as of September 2026"; "Plugin store" stays where it is on the home page; pack genre and language are not checked against RouteNote's list. If HQ shows "Meta key: expires around …" on the Instagram box, make a new key a few days before that
  date (same steps as 17 Nov). Optional: B2 (YouTube Analytics, one Google sign-in). On hold until he decides:
  H1–H4 (ads kill switch, ad templates, posting, fan capture). L11 needs him (who "Luka" is).

## What to watch (first real runs)

- **Instagram:** the first hourly reads fill older posts (4 an hour), the 1-day numbers, follows/profile visits
  (not every post type has them), comments with replies, countries. Not proven yet: whether Instagram's post views
  include the ad's views, and the exact action names Meta returns for Instagram-post ads. If a section stays
  empty after a day, ask Luke what HQ shows and adjust `netlify/lib/instagram.mjs` / `postrank.mjs`.
- **The ranking:** fewer than 10 ranked posts for the first week or two; the bots must call the order "not
  settled yet". The floor is 1,000 views (PR #69). A Meta spend row joins a post on the post's day or the next day.
- **Song page tiles:** the Meta line per page fills only from 17 Nov (older health records have no page).
- **A2:** the song_page build report has run once (/loveyou); watch the next one.
- **A4 / B3:** reminders and Meta's daily spend rows run hourly from 07:00 São Paulo.
- **L7:** Atlas's first `pitch_log` (a pitch day, then an editorial playlist after a song is out). HQ only records what he saw.
- **L12:** the first `profiles` record (what is live now) and the first new image Luke says yes to. HQ only stores the link. The bot uploads it.
- **L3 part 1:** the fan inbox fills from comments already read (every 3 hours, on posts from the last 8 days). If it stays empty after a day of real comments, the phrases in `askKind` need a line fans actually write.
- **L4:** the first royalty payment Ledger names to one song, and the first day's spend Forge names to one song. Until then, Money says "not linked to a song" for those amounts. A campaign name is never used.

## What's next (start any of these only on Luke's word)

Offer these, in this order:

1. **L3 fan inbox, part 2,** only if he asks: a fan's country, and a ready reply he approves. Part 1 does not draft a reply and HQ never sends one.

Later, if he asks:

2. **After a week of Instagram data:** check the ranking with Luke against what he sees in the app; the floor is
   1,000 views (PR #69). Tune the 1-day window if needed.
3. **B2 YouTube Analytics** (one Google sign-in from Luke), so Laura's numbers come in by themselves.
4. **L10** (auto end screens and pinned comments) still needs YouTube write access. L5 is the in-flight branch above. L1 and L9 are live (PR #71). L4 is live.
5. **H1–H4** stay on hold until Luke decides (they would touch ads, posting or fans' data).

## How to check your work

- `npm test` and `npx -y node@22 --test tests/*.test.mjs` (both, all pass, none cancelled).
- `tests/js-syntax.test.mjs` parses every browser script: a broken `js/hq.js` once stopped HQ and both apps (#57).
- For the page: a local server with the fake stores and Playwright at 390 px and 1280 px, `/hq?sample=1`.
- After a deploy you usually can't reach badscandal.com from a cloud session: say so and let Luke check.
