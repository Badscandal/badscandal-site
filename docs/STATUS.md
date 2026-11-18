# HQ status (update on every deploy)

**Last updated:** 18 Nov 2026, by Cursor. Main is through PR #80 (the phone look). Automation phase 1 (#79) and account health (#77) are live with it. Start with `docs/HANDOFF.md`.
**Tests:** 705, all passing on Node 24 and Node 22. **Connector:** 40 tools (no new tool). The phone look changes no option. Automation changed options on `my_day`, `send_message` and `post_update`, so every bot refreshes. `log_growth` account-health fields are live from #77. Claim fields are on main from #73. The instagram tool's `post` and `song` are on main from #75.
No money amounts, payer names or account numbers in this file: the repo is public.

## Live (newest first)

| When | PR | What |
|------|----|------|
| 18 Nov | #80 | Phone look. One received total per currency. The home keeps the Needs you header, one-tap Yes / No / Edit cards, quiet hours, Waiting on others, and the account-health dots. A missing number says not reported. Still 40 tools. No option changed. |
| 18 Nov | #79 | Automation phase 1. One-tap cards, Waiting on others, scheduled site, cap, release-day and month checks, and the Monday draft. Desk push stays empty until Luke pastes an address. Still 40 tools. `my_day`, `send_message` and `post_update` gained options, so every bot refreshes. |
| 18 Nov | #77 | Account health. One green / watch / red per official account, from numbers already on the desk. A red item goes on Needs you. The daily job (10:30 São Paulo) messages the owning bot only when it changes. Still 40 tools. `log_growth` records the check. HQ does not call Meta or Instagram for this. |
| 18 Nov | #76 | Money counts once, when it lands in Revolut, in payments, month_check, income_status and the briefings. A route sums every link. A gap with no source is short, unexplained, never a fee. A rate is kept only when Revolut recorded it. `close_month` needs month_check ready and an https evidence link. No new tool. |
| 18 Nov | #75 | Round-2 fixes from the bots' re-test. Pre-HQ packs, Canvas steps, schedule lines, lyrics blockers, signed-out lines, Instagram ranking and the 20-minute read cache, song links on posts, preflight flags, and `song_pages` reporting each page. Still 40 tools. |
| 18 Nov | #73 | L5 watchers. RouteNote email says not connected until Luke signs the site into that inbox, read-only. Verse gets one desk note on the release day (São Paulo). Content ID claims are only what Laura records with `log_growth`. No new tool. HQ does not email anyone. |
| 18 Nov | #71 | L1 and L9. Expected money, and what each payout route cost. A statement is the expected row. A fee is shown only when sent and landed are already the same currency. A currency change says "not enough data". No new tool. |
| 18 Nov | #70 | Phone HQ. Needs you opens first. Money shows what landed in Revolut on its own line. Payable, and money still in Wise or PayPal, are smaller and never added in. |
| 18 Nov | #69 | Connector bug fixes from the bots' read-only test. Still 40 tools. Ads untouched. Stored amounts untouched: a Wise or PayPal row already counted at Revolut is "moved to Revolut" and is not counted again. Ranking floor is 1,000 views, and a boost shows its spend, engagements, cost per engagement and the numbers from before the ad. `read_guide` matches the live desk. Card digits, account digits and raw ad-account ids are hidden in tool output. |
| 18 Nov | #67 | L4: per-song profit. Money › Per song, and one line on each Songs card. Royalties by store next to ad spend that names the song, and the release date. Anything without a song says "not linked to a song" and is not added in. No new tool. |
| 18 Nov | #66 | L3 fan inbox, part 1. Growth & Fans shows comments asking the song's name or where to listen, and people who comment on more than one post. "Needs your reply" is for Luke. HQ never replies. No extra Instagram call. The two accounts Luke named are never shown. |
| 18 Nov | #65 | Release cards: a sent Spotify pitch is not under Your approvals (it shows on the pitch line). Take it back only next to a real approval, and it names it. Red is only a failure. A step waiting on a date, on Luke, or on a decision he made stays calm and is not a warning. "Sent N days before release" is amber. |
| 18 Nov | #64 | L12: Profiles. One section for the profile photo and the banner on every official platform: the current image and the day it changed, the size rule (or "Rule not set"), a new image waiting for "Yes, correct", then the owner uploads it by hand. Atlas (the music stores), Laura (YouTube), Steve (Instagram and Facebook), Kevin (TikTok). X has no owner yet. The `profiles` tool. HQ never logs in and never changes a platform. |
| 18 Nov | #63 | L7: pitch tracker. Each upcoming and recent song shows not pitched, pitched with the day, or missed. Warns from 14 days out (Spotify needs the pitch 7 days before release). Two-week pitch slots on Upcoming. Atlas records the day and editorial playlists with `pitch_log`. HQ never pitches. |
| 17 Nov | #61 | L8: asset checker. `preflight` checks a cover, Spotify Canvas, Spotify header or YouTube banner against that platform's rule; a Canvas link that isn't MP4 or JPG shows on the release card. Atlas and Laura have the tool. |
| 17 Nov | #55 | B4: the Instagram reader (read-only): key pasted once in HQ (Growth & Fans › Connect Instagram), renewed weekly; followers to the desk, post numbers at 6 h / 1 day / 1 week, comments, countries; `instagram` tool for Steve and Kevin. B1 and B5 marked not needed (Luke). |
| 17 Nov | #56 | B4: the Facebook-login route (Meta blocks linking the Instagram-login app to the business portfolio): HQ takes a Facebook key and keeps only the Page's key, which doesn't run out. Safety brake: a Meta rate limit pauses Instagram reads for a day; a block, restriction or refused key stops them until a new key is pasted. A normal hour is at most 3 read calls. |
| 17 Nov | #57 | Fix: HQ and both HQ apps wouldn't open after #56 (an apostrophe broke js/hq.js). New test `tests/js-syntax.test.mjs` parses every browser script, so a broken script can't ship again. |
| 17 Nov | #58 | Instagram: the Badscandal Page is reached through the business portfolio (empty /me/accounts), so HQ reads the known Page (101630812698451, env FB_PAGE_ID overrides). If Meta won't hand over the Page's key, HQ keeps the pasted key and shows when it expires (about 60 days). "Not linked" only when the Page itself has no Instagram. |
| 17 Nov | #59 | L6: HQ's Pages tab opens with one tile per song page: live or not (with GitHub's reason when a change failed), what the button does, people and Spotify taps, whether Meta is receiving that page's events, and the home card. Meta health records now note their page (old records have none). |
| 17 Nov | #60 | L2 adapted: "What engages best" in HQ › Growth & Fans › Instagram and the instagram tool (Steve, Kevin, Forge): posts ranked by engagement per view at the same age (1 day), our own accounts' comments left out, saves + shares and follows per view, each boosting ad's spend and cost per engagement (read-only, hourly), numbers before the ad, older posts read once, "Needs a reply". Nova manages the "our accounts" list (our_accounts add/remove with a reason, logged; HQ shows it). |
| 17 Nov | #54 | A8: log_growth Spotify `monthly_listeners` / `brazil_listeners`, a "Spotify monthly listeners" card on Songs · B3: HQ records Meta's daily spend on the desk itself (hourly, read-only) |
| 17 Nov | #53 | A7: `close_month` locks a ready month (snapshot, received, evidence); later changes old → new in month_check and a CSV under Money |
| 17 Nov | #52 | A6: pre-flight checks (artist exactly "badscandal", links to badscandal.com/<song>, WAV/JPG-PNG, cover size) on cards, in the release tools and the `preflight` tool |
| 17 Nov | #51 | A5: "The next 6 weeks" in Upcoming › Planning; `six_weeks` in the releases tool for Nova and Claude |
| 17 Nov | #50 | A4: automatic chasing: one reminder per late duty or release step, Nova told 2 h later |
| 17 Nov | #49 | A3: recommendations on questions waiting on Luke (`recommend`, send_message `recommend`), shown on the card, the recommended option marked |
| 17 Nov | #48 | Song-page builds (A2): a failed build tells the bot that asked "Not done: <step>: <why>" (song_pages + hourly); only the song-page checks (`npm run test:song`) can block a page, every other test runs after it is live and reports to Claude; reports on the `song-builds` branch, read with no key |
| 17 Nov | #47 | HQ UI bugs (A1): Sheet deadlines shown as written (no more Invalid Date); page bottom follows the phone bar; More no longer logs out on a second tap, and the login says why it appeared; no "on time" next to a warning or blocked step; growth "in N days" with under a week of readings |
| 17 Nov | (song_page job) | badscandal.com/loveyou published by GitHub's song-page build (first real run; cover checked) |
| 17 Nov | #44 | Release page per song; Spotify Canvas field + Atlas step; ad plan field; "released before HQ" mark; missing pipeline steps added; `roster_card` for Nova; Revolut clears "not connected" when any account reads; "Kevin (TikTok)" = Kevin; log_growth channel/Shorts views |
| 17 Nov | #45 | Revolut reader's own call timer (Node 22 cancelled 12 bank tests and stopped the /loveyou build) |
| 17 Nov | #43 | Money: one entry per payment, counted when it lands in Revolut; Wise/PayPal only confirm; `link_transfer`; `month_check`; payments count in the month they arrived; bots ask Luke when unsure; tool-list version in my_day |
| 16–17 Nov | #39–#42 | Revolut 90-day look back; `payments` tool with ids; `fix_payment` source / paid_by; royalties = self-releases, label deals, publishing |
| 16 Nov | #36–#38 | Webmaster: upload_cover, song_pages, home card; Money simpler (one received total, main sources green/red) |
| 16 Nov | #33–#35 | Bots propose songs (Luke confirms); song pages built by GitHub; Revolut last-4 digits |
| 16 Nov | #34 | Round 3: received-only money, one pitch per 14 days, ads made with Luke after release, YouTube on release day |

## Waiting on Luke

- **Instagram:** connected 17 Nov (Luke pasted the key; it works). Watch the first hourly reads: post numbers at 6 h / 1 day / 1 week, comments, countries. If the Page's key wasn't handed over, renew the key before the date HQ shows (about 60 days).

- B2 (YouTube Analytics, one Google sign-in) if Luke wants it; B1 and B5 are not needed.
- On-hold decisions H1–H4 in the roadmap (ads kill switch, posting, fan capture).
- Who "Luka" is in the split-ledger request (L11).
- Answers the bots are waiting for go through Nova; they are not tracked here.

## In flight

- Nothing.

## Next up

- The phone look (#80), automation phase 1 (#79), account health (#77), the money-counting rule (#76), the round-2 fixes (#75), L5 watchers (#73), L1/L9 (#71), the first phone HQ (#70) and the connector bug fixes (#69) are on main. L3 part 2 is not built: a fan's country, and a ready reply he approves. HQ would still never send it. A later Profiles slice (reading an image from a platform) still needs his go, and HQ would still not log in.
- Still for Luke, not in #69: the public stream line ("as of September 2026"), where "Plugin store" sits on the home page, and checking pack genre and language against RouteNote's list.
- Still needs Luke: B2 YouTube sign-in, the on-hold decisions H1–H4, and L11 (who "Luka" is). B1 and B5 are not needed; B4 Instagram is connected.
- L10 still waits (it needs YouTube write access). L4 is live. Start any of it on his word.

## Known gaps / watch

- First live runs to watch: A4's reminders (hourly from 07:00), B3's Meta rows (hourly from 07:00; needs META_ADS_TOKEN valid), A2's build report (next song_page).
- A6 does not check the Musixmatch format yet (no written rule to check against).

- A2: the report step has never run on GitHub; the next real song_page build is its first test. If song_pages still says "no report from GitHub yet" after 15 minutes, look at the run and the `song-builds` branch.

- A1 sign-out: if HQ signs Luke out again, the login form says why (button, or which answer said "not logged in"); ask him for that line.
- A1 bottom bar: the overlap never reproduced in a phone-sized desktop browser; Luke checks on his phone.

- The bots' app keeps its own copy of the tool list: after a tool change they must reconnect.
- Old open PRs #1 (old visit counter), #5 (Instagram test, "do not merge"), #7 (HQ summary for LDashboard): not
  merged; ask Luke before touching them.
- The bots' private seed (`badscandal-hq`) and the HQ-App repo are only on Luke's Mac.
