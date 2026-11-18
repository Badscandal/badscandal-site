# Handoff: where HQ is and what's next (read this first)

**Full picture:** [docs/HQ-FULL-HANDOFF.md](HQ-FULL-HANDOFF.md) (18 Nov 2026). It was checked against the code at `9e447e2` (PR #88). If this file disagrees with it, the full file wins. Main is through PR #89: 47 connector tools, service worker `bs-hq-v8`, 745 tests. The paragraphs below still describe the state at PR #84 in places. They are kept as the running log.

**18 Nov 2026, Claude: PR #90 is LIVE (Luke: "deploy when you're complete").** The handoff's suspected bugs are fixed and tested. One "waiting on you" list for the phone line, Today's line, the app badge, push alerts and `needs_you` (alerts are "to check"). Read-only tools no longer write or message (`profile_jobs`, `song_pages`; `instagram` is no longer labelled read-only; opening /hq sends nothing). The read marker moves only past what was handed over. Spotify health says tracks, not posts. `netlify.toml` names `song-geo.js`. CI runs Node 22 and 24. The Upcoming and Money screens Luke sent are tidied (no raw timestamps, buttons spaced, said-once notes). Needs you lost the platform stat blocks (now on Growth & Fans) and the RouteNote email card; Monday-pick posts show their own picture. Still 47 tools, no option renamed. 765 tests on Node 24 and 22. Cache `bs-hq-v9`. Details: "Fixed after the handoff" at the end of section 9 of HQ-FULL-HANDOFF.md. Main is through PR #90.

**Last updated:** 18 Nov 2026, by Claude: PR #90 (handoff fixes) is live. Earlier: by Cursor, HQ workspaces v1 is live (PR #84).
**main:** through PR #84. Social Farm and Label are on /hq. The blank-screen fix (#83), the phone look (#80), one-tap cards (#79) and account health (#77) are live with it. **Tests:** 716 pass on Node 24 and Node 22, none cancelled.
**Connector:** 40 tools. No new tool. `workspace` is on `log_growth`, `record_spend`, `submit_income`, `releases`, `release_step` and on an action card. `release_step` accepts `licence` for a Label cover only. `hq-workspaces.js` shares the HQ content hash and is in the precache (`bs-hq-v7`). The options changed, so every bot refreshes.

> **The rule (Luke, 17 Nov 2026):** every time anything is pushed to `main` for HQ, the same push updates THIS
> file (and `docs/STATUS.md`). If Luke's computer crashes or a session ends mid-way, the next agent starts from
> here. A branch that isn't merged yet gets one line under "In flight" below, pushed with the branch.

---

## Paste this into a new Claude Code session

```
You're picking up the BADSCANDAL HQ work in the repo Badscandal/badscandal-site (badscandal.com, the public
site + Luke's private dashboard /hq + the bots' connector /mcp).

1. Read, in this order: docs/HQ-FULL-HANDOFF.md (the full picture: pages, all 47 tools, routes, the 17–18 Nov PRs, known bugs), docs/HANDOFF.md (where we are, what's next), docs/WORKING-WITH-LUKE.md (the rules),
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

**Where we left off:** The blank-screen fix is on main (PR #83): one content hash on every HQ script, an 8-second fetch timeout, and a boot guard. The phone look is live (PR #80). The home keeps the Needs you header, one-tap Yes / No / Edit cards, the quiet-hours lane, Waiting on others, and the account-health dots. Money is one received total per currency: only what has landed in Revolut counts. Automation phase 1 is live (PR #79). Account health is live (PR #77). Money counts once, when it lands in Revolut (PR #76). The round-2 fixes (PR #75) and L5 watchers (PR #73) are on main. RouteNote email is still not connected. Social Farm and Label are live (PR #84). The switch is BADSCANDAL, Social Farm, Label. The last choice is remembered on the device. Farm pages and Label covers, spend and payouts stay off the official numbers, the scoreboard, the USD 1,000 cap, and the official Instagram, TikTok and YouTube tools. The same Needs you header and cards work inside those workspaces, and a Farm or Label card is not on the BADSCANDAL Needs you. Label is covers only. The genre list starts with UK garage. Each genre has a playlist placeholder, status "not set up". A Label cover's steps are licence (owner_bot Licence, before upload), then upload, then pitch. Drop's upload shows blocked until the licence is licensed. Only the Licence bot or Nova can mark the licence step. HQ does not take payment. Official releases have no licence step. `hq-workspaces.js` uses the same content hash and is in the precache. Cache name stays `bs-hq-v7`.

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

- **Account health** (branch `cursor/account-health-organic-1188`, not merged). Instagram no longer calls a paid-inflated view count "in line". Not live until Luke says deploy.
- **Handoff fixes** (PR #90) are on main. Nova refreshes the tool list once (the `needs_you`, `instagram`, `read_messages` and `log_growth` descriptions changed; same 47 names). A new Yes/No/Edit card or a red account now buzzes Luke's phone once (quiet hours and the 10-minute rule still apply).

- **Night test, 18 Nov** (PR #88, on main, `9e447e2`). 29 connector fixes, including RouteNote mail from luke@badscandal.com with admin@badscandal.com in CC, plus the three read-only tools. With PR #87's four profile tools the connector is 47. `luke_briefing` unchanged. The detail, including the two "need you" lines, is in docs/HQ-FULL-HANDOFF.md.
- **Profile masters** (PR #87, on main). Luke uploads one profile photo and one banner on Profiles. A fitting shape is resized on the page. A shape that does not fit is not cropped: Atlas, Laura and Kevin extend it with `profile_jobs`, `profile_master`, `profile_rework` and `profile_uploaded`. Problems open a Needs you card. Instagram is Luke's. Deezer, TikTok and Instagram have size rules. TIDAL is on the list. Secondary buttons set their own colours. Cache `bs-hq-v8`.

- **Blank-screen fix** (PR #83, on main). One content hash on every HQ script, an 8-second fetch timeout, and Try again / Reset app when the page never paints.
- **Phone look** (PR #80, on main). One received total per currency.
- **One-tap cards** (PR #79, on main). Needs you header, Yes / No / Edit, Waiting on others, scheduled checks, desk push (empty until Luke pastes an address), Monday draft. Still 40 tools.
- **Account health** (PR #77, on main). One green / watch / red per official account. A red item goes on the phone Needs you. `luke_briefing` is unchanged.

## Waiting on someone

- **Nova (after workspaces, PR #84, live):** still 40 tools. The options changed, so every bot refreshes the connector. `release_step` accepts `licence` for a Label cover only (`workspace` `label`). Only the Licence bot (`bot` `Licence`) or Nova can mark it. Status is `todo`, `ordered_waiting_luke`, `paid`, `licensed` or `flagged`. Fields: `esl_order_number`, `licence_pdf_url`, `drive_folder_url`, `original_title`, `original_writers`, `original_publisher`, `flag_reason`. Drop's upload stays blocked until the status is `licensed`. HQ never pays. Farm pages: `log_growth` with `workspace` `farm` (`farm` `account` or `post`). Label streams: `log_growth` with `workspace` `label`. Label spend: `record_spend` with `workspace` `label` and the genre. That spend is not in the USD 1,000 cap. Label payouts: `submit_income` with `workspace` `label`. A card for Farm or Label: `send_message` with `card.workspace` `farm` or `label`. It shows on that workspace's Needs you, not on the BADSCANDAL one. The genre list starts with UK garage. Playlists are not set up.
- **Nova (after the phone look, PR #80, live):** still 40 tools. The look changes no option, so nobody refreshes for the look itself. Automation phase 1 is live with it: `my_day`, `send_message` and `post_update` gained options (action cards, Luke's tap, proof). Every bot refreshes the tool list. Account health is live: Steve, Kevin, Laura, Atlas, Drop and Webmaster refresh if they have not since PR #77, because `log_growth` gained options. HQ messages a bot only when that account's health changes. Nobody buys reach, uses a pod, or signs in somewhere else to get around a block.
- **Nova (after account health is deployed):** still 40 tools. Steve, Kevin, Laura, Atlas, Drop and Webmaster refresh the tool list, because `log_growth` gained options. What each one records, and how often, is in the Message for Nova on that PR. HQ messages a bot only when that account's health changes. Nobody buys reach, uses a pod, or signs in somewhere else to get around a block.
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
4. **L10** (auto end screens and pinned comments) still needs YouTube write access. The phone look (PR #80), automation (PR #79), account health (PR #77), money (PR #76), the round-2 fixes (PR #75) and L5 (PR #73) are on main. L1 and L9 are live (PR #71). L4 is live.
5. **H1–H4** stay on hold until Luke decides (they would touch ads, posting or fans' data).

## How to check your work

- `npm test` and `npx -y node@22 --test tests/*.test.mjs` (both, all pass, none cancelled).
- `tests/js-syntax.test.mjs` parses every browser script: a broken `js/hq.js` once stopped HQ and both apps (#57).
- For the page: a local server with the fake stores and Playwright at 390 px and 1280 px, `/hq?sample=1`.
- After a deploy you usually can't reach badscandal.com from a cloud session: say so and let Luke check.
