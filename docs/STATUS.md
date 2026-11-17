# HQ status (update on every deploy)

**Last updated:** 17 Nov 2026, ~15:20 São Paulo, by Claude (main `9020fce`).
**Tests:** 531, all passing on Node 24 and Node 22. **Connector:** 38 tools (bots must reconnect).
No money amounts, payer names or account numbers in this file: the repo is public.

## Live (newest first)

| When | PR | What |
|------|----|------|
| 17 Nov | #55 | B4: the Instagram reader (read-only): key pasted once in HQ (Growth & Fans › Connect Instagram), renewed weekly; followers to the desk, post numbers at 6 h / 1 day / 1 week, comments, countries; `instagram` tool for Steve and Kevin. B1 and B5 marked not needed (Luke). |
| 17 Nov | #56 | B4: the Facebook-login route (Meta blocks linking the Instagram-login app to the business portfolio): HQ takes a Facebook key and keeps only the Page's key, which doesn't run out. Safety brake: a Meta rate limit pauses Instagram reads for a day; a block, restriction or refused key stops them until a new key is pasted. A normal hour is at most 3 read calls. |
| 17 Nov | #57 | Fix: HQ and both HQ apps wouldn't open after #56 (an apostrophe broke js/hq.js). New test `tests/js-syntax.test.mjs` parses every browser script, so a broken script can't ship again. |
| 17 Nov | #58 | Instagram: the Badscandal Page is reached through the business portfolio (empty /me/accounts), so HQ reads the known Page (101630812698451, env FB_PAGE_ID overrides). If Meta won't hand over the Page's key, HQ keeps the pasted key and shows when it expires (about 60 days). "Not linked" only when the Page itself has no Instagram. |
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

## Next up

- Batch A and B3 are done. What's left needs Luke: B2 YouTube sign-in (B1 and B5 not needed; B4 Instagram connected 17 Nov), the on-hold decisions H1–H4, and L11. The "Later" list (L1–L10) waits for the API feeds; start any of it on Luke's word.

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
