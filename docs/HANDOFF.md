# Handoff: where HQ is and what's next (read this first)

**Full picture:** [docs/HQ-FULL-HANDOFF.md](HQ-FULL-HANDOFF.md) (18 Nov 2026). It was checked against the code at `9e447e2` (PR #88). If this file disagrees with it, the full file wins. Main is through PR #89: 47 connector tools, service worker `bs-hq-v8`, 745 tests. The paragraphs below still describe the state at PR #84 in places. They are kept as the running log.

**25 Nov 2026: Team clean-up + Luke's cap call (PR #126, live, main `382619f`).** After Money, Rights and Claude came off HQ.
- **Ledger and Sheet are `offHq`** (roster flag; default in `netlify/lib/offhq.mjs` `OFF_HQ_DEFAULT`; a seed entry with `offHq: true/false` wins; `getRoster` sets it on every entry). Not on Team (`board().staff` filters them; `board(..., {all: true}).allStaff` keeps them for `my_day`), never quiet, late, chased (`chaseLate`), counted, in the site check, the duty overlay, the To list or Search. `hqModel` drops their sheet rows (`staff.offHq`). Their `my_day` still answers with `money_stopped`. Team ends with "Ledger and Sheet work outside HQ now (money → badscandal books, they report to Alfred)." (`HQLib.offHqLine`, `#offHqLine`).
- **No money text:** `dropMoneyText` drops clauses (and brackets) about income, payments, royalties, Revolut, PayPal/Wise, statements, month close, Content ID claims; ad spend and the cap are not money. Used by `dutiesReport` (a duty only about money is not shown), `freshDuty` (`my_day`) and `workers()` (roster card). The sheet is not changed. Alfred's default card has no income line.
- **Needs you:** `S.offNeeds(owner, text, off)` in `waitingOnLuke` skips an off-HQ bot's message, card, card line or task and any money ask (`moneyText`). One list for the count, badge, alerts and `needs_you`.
- **Luke's call on the month's cap:** `POST /api/staff/capover {note}` / `{off: true}` (Luke's cookie, Origin required; Claude's key and the bots 403) -> `capover/<YYYY-MM>.json`. `hq-load` reads it (`staff.capOver`), `applyCapOverride` turns warn/stop/over into `lukes_call` with `overrideLine` "Past the stop line on Luke's call (note)". Amber on the Ads cap card, Today's cap tile, attention (tone amber, no red card) and the briefing; `runCapCheck` sends no 750/900 message or card; Forge/Nova/Alfred `my_day` `cap_call`, `record_spend` `luke_call`, `luke_short_briefing` and the site check say "Luke's call: keep running, report only". `luke_briefing` keeps its shape (status reads `lukes_call`). Next month there is none. Nothing changes an ad.
- A done release step hides an old "waiting on Luke / in draft" note (`HQLib.staleDoneNote`). 804 tests. Tests: `tests/hq-team-cleanup.test.mjs`.

**25 Nov 2026: Needs you tidy (PR #125, live, main `e920352`).** Luke: the two cards on Needs you were "fully outdated and pointless"; "messages section is pointless"; "waiting on others ... should only be in the team section".
- **Done on a Nova task card works.** A Nova task is kind `handle`, and `waitingOnLuke` skipped the done mark for that kind; it now goes by key (`sign|acc|yes|fan|t:`). A task's key is `t:<id>:<print of its words>` (`taskPrint`), so Done holds while the sheet says the same thing.
- **Money tasks are off Needs you** (`MONEY_TASK`: amounts, payments, payouts, royalties, statements, invoices, proof of arrival, Revolut, Wise, PayPal, income). Money is not on HQ since #114.
- **Old bot card lines are off Needs you:** a line not said again for 48 h (`BLOCKER_STALE`; blockers by `blockersAt`) is ignored by `lukeExtraNeeds`. A sign-in item carries when the bot said it (`signedOutLines` returns `at`), so Done holds until the bot says it again.
- **No Messages tab** (rail, More, Search). `#messages` and `#messages/<id>` land on Needs you (shell `ALIAS`). "You answered" is folded on Needs you (`#answeredCard` in `#today`). The `#messages` section stays in the page, hidden; the compose box and the site-check line on Today are not shown.
- **Waiting on others** is off Needs you (and the Farm/Label workspace) and folded on Team (`#othersFold`, `drawOthers` in js/hq-staff.js). Script hash recomputed; cache name unchanged. 794 tests. Tests: `tests/hq-needs-tidy.test.mjs`.

**24 Nov 2026: Ads per song (PR #124, live).** Luke: "we need it done per song ... the total ad spend and then i can click per song and in each song it says the spend on that song for ads and then the return but don't log return yet ... the meta events health at the bottom".
- **Top: Total ad spend** for the header's range (Meta, Google, TikTok; each currency on its own, never added across), the split by platform, and this month against the USD 1,000 cap with its bar.
- **Per song:** one row per song with spend in the range, biggest first; tap it for the spend by platform, real Spotify taps, cost per tap, each Meta ad, and **Return: Not logged yet** (to be wired once Luke has a way to log it). "Not linked to a song" collects Meta ads with no song in their name nobody visited from, and days logged without a song. Rule: `HQLib.adsBySong` (Meta per song from Meta's per-ad read; Google/TikTok from Forge's `record_spend` rows that name a song: the sheet's answer now carries `money.rows`).
- **Bottom:** Meta events health, unchanged. The pins row, the gauge, the big cap card and the cost-per-tap tables are gone from this page. Tests: `tests/hq-ads-per-song.test.mjs`.

**24 Nov 2026: Ledger and Sheet off HQ (PR #123, live).** Luke: "questions shouldn't go on HQ they should report directly to my other bot alfred my assistant now they don't interact with hq anymore". On HQ they see only `my_day`; its `money_stopped` and their roster card send them to badscandal books (`https://badscandal-books.netlify.app/mcp`, same key) and tell them to report to Alfred directly. The books connector says the same (repo badscandal-books, deployed). Connector 1.22.0.

**24 Nov 2026: the header tidied (PR #119, live).** Luke: "ok and sources is all meshed together"; "an option for all time ... instead of this month"; "remove the night quiet thing that's pointless".
- **Sources** is one pill on one line: the dot, then "Sources OK" / "Check sources" / "Sources partly read".
- **The date range:** Today · 7 days · 30 days · **All time** · Custom. "This month" is gone (a saved one opens on 30 days). All time = every day since the counter started (`ALL_FROM` 2026-10-11 in `netlify/lib/admin.mjs`, range `all`); it has no period before it, so no "vs" changes are shown.
- **Night quiet** is gone (the button, `bs_hq_quiet`, and the done-bot rows it hid at night). The server's own quiet hours for push alerts are unchanged.
- **Search** (⌘K) jumps to any page, song, bot, release or message; its tooltip now says so. Tests: `tests/hq-header-24nov.test.mjs`.

**24 Nov 2026: Profiles rings = the bot's check of the real profile (PR #117, live).** Luke: "deezer is showing up as green ... the bots ... should be checking my profiles for each platform and making sure that's my profile photo after i submit a new upload".
- **Green only after a bot checked the public profile** and recorded it after Luke's current upload (`profile_uploaded` result `live`). A sized copy alone is no longer green (the Deezer bug). Old upload records do not count, so the live page goes yellow/red until the bots record checks.
- **Yellow:** the bot can't log in ("<bot> can't log in", its note), or one image is not his. **Red:** all of a platform's images (photo and banner) are not his. **Grey:** nothing uploaded for that platform yet. A ring that is not green shows the bot's screenshot of the profile (`shot-<slot>`), else initials.
- `profile_uploaded` gains `result` (live | not_mine | login | failed), `screenshot_base64` (required for not_mine), `page`. None of these messages Luke: problems show only on HQ and Luke sorts them in the bot's own chat. After Luke uploads a master, HQ messages each owner bot once to upload, check, screenshot and record. `profile_jobs` lists `upload` and `retry` items.
- **Tap a ring** → Every platform opens at that card: the reason per image, the bot, when it checked, the screenshot, **Try again** (`POST /api/staff/profile-retry {platform}`, Luke only: one message to the bot, also in its profile_jobs) and **Open <platform> ↗**.
- Connector 1.21.0, still 43 tools (the bots refresh). Script hash recomputed. Tests: `tests/hq-profiles-verify.test.mjs`, `tests/hq-profiles-v2.test.mjs`.

**24 Nov 2026: the money moves to badscandal books (PR #115, live).** Luke: "i also want the books site to literally be our money page just move it there". He chose: replace the old books app on `badscandal-books.netlify.app` and copy HQ's stored payments over. HQ gains ONE read-only route, `GET /api/staff/money-export` (Luke's login only; Claude's key and the bots 403; the sample 404): every `inc/`, `chk/` month, `sources.json` and `closes.json` as one JSON download (`netlify/lib/money-export.mjs`). Nothing is changed or deleted. Luke downloads it once and imports it on the books site (private repo Badscandal/badscandal-books). Remove the route once the move is confirmed. Tests: `tests/money-export.test.mjs`.

**24 Nov 2026: Rights, Money and Claude off HQ; Disputes off the bar (PR #114, live).**
- **Rights is gone** (Luke: "totally unnecessary"): the page, `read_claims`, the claim fields on `log_growth`, `claim_id` on `open_case`, the Content ID signal in YouTube's health. `claims.json` stays on the desk, unread. A real problem with a video is still a dispute case. Laura's `my_day` has `rights_removed` telling her to stop and delete those tasks.
- **Money is gone** ("we don't need that at all"): the Money page, the Revolut reader (`bank.mjs`, `banksync.mjs`, `/api/bank/*`), the sheet's Income and Royalties tabs, royalties on Songs, `/api/staff/sort`, `month-close.csv`, and 11 tools (`submit_income`, `fix_payment`, `income_source`, `income_check`, `link_transfer`, `month_check`, `payments`, `income_status`, `close_month`, `song_pl`, `sort_payment`). Stored payments are NOT deleted, just no longer read (the code is in git history for the coming "badscandal books" site). **Ads and ad spend stay** (`record_spend`, the cap, Meta). Ledger and Sheet stay on the roster, "Waiting for new work"; their `my_day` has `money_stopped`. `luke_briefing` keeps its keys; only `income_this_month`'s values now say "Money is no longer on HQ." (`problems: []`). `luke_short_briefing` lost `income`.
- **Claude is off the desk** ("he is no longer required"): a new message to Claude is refused (Write to Nova); an answer to an old Claude message still lands; Claude's old questions leave Needs you; Claude is not in the To list; HQ's "other tests failed" note goes to Nova; "Ad drafts ready" is Forge's. Claude's key still loads the seed (guide, roster) and reads the board. The rounds on Luke's Mac (`com.badscandal.claude-rounds`) are unloaded; the plist is in `~/.badscandal-hq/disabled/`.
- **Disputes is off the bar and the More sheet** (it is in Songs). On the phone **Songs takes Money's place**: Needs you · Upcoming · Team · Songs · More. `#rights` and `#money` land on Needs you, `#disputes` on Songs' disputes.
- Connector 1.20.0, **43 tools**: the bots reconnect. Script hash recomputed; cache name unchanged. 768 tests on Node 24 and 22. Tests: `tests/hq-trim-24nov.test.mjs`, `tests/hq-no-money.test.mjs`.

**23 Nov 2026: Songs › Disputes in plain words (PR #113, live).**
- **The full note** is a pill with a turning chevron, so it looks tappable.
- **Each case says the issue** ("The issue", from the case's new `issue` field; else the oldest real timeline line; else "Not written yet") and **who has the next move**, in words (`HQLib.caseWaitWords`): "Needs your decision", "Waiting for RouteNote to answer", "Drop has to send what you confirmed on Sun 22 Nov", "Drop has to act on your reply of …: “…”". The raw "waiting on bot" never shows. The song card's line is "1 dispute · Drop is sending what you confirmed".
- **Resolved** lists each case with the day it closed, the issue and "How it ended" (the new `outcome` field; else the bot's last real line).
- Connector: `open_case` takes `issue`; `update_case` takes `issue` and `outcome`; `read_cases` returns them and `closedAt`. Version 1.19.0: the bots refresh. Tests: `tests/hq-songs-disputes.test.mjs`.

**23 Nov 2026: Upcoming trimmed (PR #112, live).** Luke: "this will make the upcoming page perfect".
- **The next 6 weeks** and **Spotify pitches** are gone from Upcoming › Planning (he has the calendar; each song's steps show its pitch). `HQLib.sixWeeks` / `pitchBlock` and the bots' `six_weeks` stay.
- **In Spotify for Artists** is hidden unless Atlas saw a song there that did not go through Upcoming (or one whose message to Nova must go again). It is then called "Found in Spotify for Artists" and shows only the question (`#relSpotWrap`).
- **What the distributor said:** each row is the day, one word (Approved / In review / Rejected …) and, only for a rejection, the reason with its brackets and "Action needed:" taken off. Who wrote it and the bot's notes stay on the desk (`HQLib.storeRows`, `storeWhy`). The "At the distributor" line follows the same words.
- Script hash recomputed; cache name unchanged (no file added or removed). Tests: `tests/hq-upcoming-trim.test.mjs`.

**21 Nov 2026: Profiles is upload-driven (PR #110 + #111, live).** Luke uploads one profile photo and one banner. Each platform's copy is made from them. Green means the platform uses his upload (a copy is ready, or live). Red means an issue. Grey means nothing has been uploaded yet.
- **What counts as red:** the wrong shape or too small (that platform's bot makes an AI version that looks exactly like his), the platform rejected it, the copy was not saved, or a new image waits for his yes.
- **A small master is a bot job now,** not a question to Luke. `jobNote` and the `profile_*` tool texts say: make an AI version at the exact size, exactly like his.
- **The page:** the two uploads, then the strip, then one issue card per red platform with a plain sentence and a reply box. The reply is a message from Luke to that bot ("About the YouTube banner: …"). Below that, every platform folded away.
- **Code:** `HQLib.profileState` / `profileIssueText` / `profileOverview`. Tests: `tests/hq-profiles-v2.test.mjs` and `tests/profile-images.test.mjs`.

**21 Nov 2026: HQ v18 is LIVE (PR #108, main 76790d3).** `/hq` answered 200, `/mcp` 401, and hq-sw.js serves `bs-hq-v18`. Luke's issue #5 in the private repo is the spec.
- **Needs you cards.** A decision is one short question with Yes, No and Reply. Under it: song, status, waiting on, next check, and one recommended line. The draft email (To, CC, Subject, body with its line breaks) opens only on Reply and can be edited there. An ask (a sign-in, Netlify access, a task, a fan) has a reply box, plus Done for an action.
- **How answers are recorded.** The same way as before: a message reply, Mark as done, the case Confirm/Ignore/Respond, or the card's yes/no/edit. Asks with no message of their own go through the new `POST /api/staff/need` (Luke only). It writes a done mark in `needs-done.json` and sends the answer to the bot as a message from Luke.
- **Where the cards live.** `netlify/lib/need-cards.mjs` builds each card. `needsCount` attaches it, so the phone, needs_you, my_day and team_board say the same short question. luke_briefing keeps its row shape.
- **The one list.** T-32 is on it, and a step waiting on Luke's yes is a Yes card. A sign-in id is a short slug, never a sentence. my_day says `reconnect` only when a reconnect is needed.
- **Also in v18.** No "Salvation" line in Atlas's duty or reminders. The bots' v17 re-check fixes and Forge's and Ledger's lists (what was fixed and what was skipped is in the comment on issue #5).
- **Versions.** Cache `bs-hq-v18`. Connector serverInfo version 1.18.0. The tool list's version hash changed, so the bots refresh. 892 tests on Node 24 and 22.

**19 Nov 2026: PR #100 is LIVE.** Steve logs a boost on `log_growth` with `boosts`: the post link, that ad's id, the amount that ad has spent, the currency, and active or paused. It is stored on that day's growth row. It is not `record_spend` and it is not added to the cap. The account's day total is still not that boost. A ranking that says boost unknown does not hide a boost he logged. Still 54 tools. `log_growth` gained `boosts`, so the tool-list version changes. That is not a reconnect unless an app does not show the new option. 796 tests on Node 24 and 22. Cache name stays `bs-hq-v11`. `/hq` answered 200 and `/mcp` answered 401 right after the merge, and the live page serves `hq-growth.js?v=8dd211181a0b`. `luke_briefing` is unchanged.

**19 Nov 2026: PR #99 is LIVE.** A Reel logged only as the day's best post is a boost when the ranking or an ad names it. A ranking spend with no per-ad scope says "spend not read since boost started". No new tool. 54 tools. 795 tests on Node 24 and 22. Cache `bs-hq-v11`.

**19 Nov 2026: PR #98 is LIVE.** Growth's Boosted spend is that post's own ad, or a spend row that names that post. The time of that read is shown next to the amount. A read from before the boost, or no per-ad spend, says "spend not read since boost started". The account's day total is not used. Cost per engagement is that spend divided by the post's likes, comments, saves and shares. Cost per follow is shown when follows were logged. A missing side says "not reported". `read_growth` returns the same figures in `boosts`. `ad_spend` on a growth row stays the logged platform figure. No new tool. 54 tools. 793 tests on Node 24 and 22. Cache name stays `bs-hq-v11`. `/hq` answered 200 and `/mcp` answered 401 right after the merge. `luke_briefing` is unchanged.

**19 Nov 2026: PR #97 is LIVE.** Disputes sit on Songs. Bots run the case (`open_case`, `update_case`, `read_cases`). Luke decides on the card (Confirm, Ignore, Respond). A case waiting on him is in Needs you. A Content ID claim on Rights can become a case by its id, and Rights links to it. The Rights page stays. 54 tools. 790 tests on Node 24 and 22. Cache name stays `bs-hq-v11`. `/hq` answered 200 and `/mcp` answered 401 right after the merge. `luke_briefing` is unchanged.

**18 Nov 2026, Claude: PR #90 is LIVE (Luke: "deploy when you're complete").** The handoff's suspected bugs are fixed and tested. One "waiting on you" list for the phone line, Today's line, the app badge, push alerts and `needs_you` (alerts are "to check"). Read-only tools no longer write or message (`profile_jobs`, `song_pages`; `instagram` is no longer labelled read-only; opening /hq sends nothing). The read marker moves only past what was handed over. Spotify health says tracks, not posts. `netlify.toml` names `song-geo.js`. CI runs Node 22 and 24. The Upcoming and Money screens Luke sent are tidied (no raw timestamps, buttons spaced, said-once notes). Needs you lost the platform stat blocks (now on Growth & Fans) and the RouteNote email card; Monday-pick posts show their own picture. Still 47 tools, no option renamed. 765 tests on Node 24 and 22. Cache `bs-hq-v9`. Details: "Fixed after the handoff" at the end of section 9 of HQ-FULL-HANDOFF.md. Main is through PR #90.

**Last updated:** 19 Nov 2026, by Cursor: PR #100 (Steve logs a boost) is live. Earlier the same day: PR #99 (a best post counts when the ranking or an ad names it), PR #98 (Boosted spend is that post's ad) and PR #97 (Disputes on Songs).
**main:** through PR #100. 54 connector tools. 796 tests pass on Node 24 and Node 22. Social Farm and Label are on /hq. The blank-screen fix (#83), the phone look (#80), one-tap cards (#79) and account health (#77) are live with it.
**Connector:** 54 tools. New on 19 Nov 2026: `open_case`, `update_case`, `read_cases`. `log_growth` gained `boosts` (PR #100). A bot never sets Luke's decision. Cache name `bs-hq-v11`.

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

- **Dispute follow-up** (branch `cursor/hq-dispute-fixes-f1cf`, not merged). Standup lists include a case waiting on Luke. A rounded Studio figure such as 1.7k is stored as approximate. A claim keeps one id. Cases and song cards are coloured. Needs you is one list. A boost with no ad id is keyed on the post link. The opening bot can rename a song and replace its timeline with event dates. Not live until Luke says deploy.
- **Interactive charts** (PR #102, on main, `84f32a3`). Every line on /hq scrubs like Spotify for Artists: a guide, a dot and a dark pill with the day and the real number. A missing day stays a gap. Last period and this period show under a chart only when both windows are the same length and complete. Cache `bs-hq-v12`.
- **Log a boost** (PR #100, on main). Steve logs a boost on `log_growth` with the post link, the ad id, the amount that ad has spent, the currency and paused or active. The account's day total is not that boost.
- **Boost from the best post** (PR #99, on main). A Reel logged only as the day's best post is a boost when the ranking or an ad names it. A ranking spend with no per-ad scope says "spend not read since boost started".
- **Account health** (PR #92, on main). A view total at about 35% of the median is a dip, not "in line", and that version left boosted posts out.
- **Engagement health** (branch `cursor/account-health-engagement-1188`, not merged). Instagram health follows engagement per view, (likes + comments + saves + shares) / views, and keeps boosted Reels in. Views stay as context. Not live until Luke says deploy.
- **Handoff fixes** (PR #90) are on main. Nova refreshes the tool list once (the `needs_you`, `instagram`, `read_messages` and `log_growth` descriptions changed; same 47 names). A new Yes/No/Edit card or a red account now buzzes Luke's phone once (quiet hours and the 10-minute rule still apply).

- **Night test, 18 Nov** (PR #88, on main, `9e447e2`). 29 connector fixes, including RouteNote mail from luke@badscandal.com with admin@badscandal.com in CC, plus the three read-only tools. With PR #87's four profile tools the connector is 47. `luke_briefing` unchanged. The detail, including the two "need you" lines, is in docs/HQ-FULL-HANDOFF.md.
- **Profile masters** (PR #87, on main). Luke uploads one profile photo and one banner on Profiles. A fitting shape is resized on the page. A shape that does not fit is not cropped: Atlas, Laura and Kevin extend it with `profile_jobs`, `profile_master`, `profile_rework` and `profile_uploaded`. Problems open a Needs you card. Instagram is Luke's. Deezer, TikTok and Instagram have size rules. TIDAL is on the list. Secondary buttons set their own colours. Cache `bs-hq-v8`.

- **Blank-screen fix** (PR #83, on main). One content hash on every HQ script, an 8-second fetch timeout, and Try again / Reset app when the page never paints.
- **Phone look** (PR #80, on main). One received total per currency.
- **One-tap cards** (PR #79, on main). Needs you header, Yes / No / Edit, Waiting on others, scheduled checks, desk push (empty until Luke pastes an address), Monday draft. Still 40 tools.
- **Account health** (PR #77, on main). One green / watch / red per official account. A red item goes on the phone Needs you. `luke_briefing` is unchanged.

## Waiting on someone

- **Nova (after logging a boost, PR #100, live):** still 54 tools. `log_growth` gained `boosts`. The tool-list version changes. Reconnect only if the app does not show that option, then refresh once. Steve logs a boost: post link, that ad's id, the amount spent, currency, and active or paused. Not the daily budget. Not the account's day total. Forge does not put it on `record_spend`. It is not added to the cap.
- **Nova (after Boosted spend, PR #98, live):** still 54 tools. Steve, Kevin and Forge: a boost's spend is that ad, or a spend row that names that post. The account's day total is not that boost. If the read is older than the boost, the line says spend not read since boost started. Cost per engagement uses that post's likes, comments, saves and shares. A missing side says not reported. `read_growth` puts the same figures in `boosts`.
- **Nova (after Disputes, PR #97, live):** 54 tools. Every bot reconnects. The new tools are `open_case`, `update_case` and `read_cases`. A bot never sets Luke's decision. When the status is waiting on bot, do what he confirmed or wrote, then `update_case`. A Content ID claim is escalated with `claim_id` from `read_claims`. The claim stays on Rights. HQ does not send the email or file the dispute. Licence and Spark do not get these tools.
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
