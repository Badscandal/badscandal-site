# HQ roadmap: the bots' ideas, ranked (17 Nov 2026)

The goal (Nova, for Luke): **build towards the bots running everything, with Luke approving.**
This file is the plan. Update an item's **Status** whenever it changes (in the same PR as the work).
Status words: `todo` · `building (PR #n)` · `live (PR #n)` · `needs Luke` · `on hold` · `not possible`.

Sources: Nova's ranked list (05:05 SP) and her add-on from Webmaster, Steve and Atlas (05:10 SP), 17 Nov 2026,
and Claude's assessment the same morning. Luke said "perfect" to the order below.

---

## Batch A: do first (cheap, no new accounts) — Luke agreed

| # | What | Asked by | Status | Notes |
|---|------|----------|--------|-------|
| A1 | **UI bugs**: "Invalid Date" on task deadlines; the phone's bottom bar covers content; signed out after ~3 minutes; "everything on time" next to a red warning; Growth cards "– in 7 days" | Verse, all bots (round 2) | live (PR #47) | 17 Nov. Deadlines shown as written (`HQLib.day`); bottom space follows the bar (`--navpad`); sign-out cause found: the More sheet put Log out under the More button (bar now stays on top; the login says why it appeared, `bs_hq_signout`); "on time" only via `HQLib.releaseTrouble`; growth `weekDays` ("in N days"). The bottom-bar overlap never reproduced in a desktop browser: confirm on Luke's phone. |
| A2 | **Build failures to the desk** (#14): a failed song_page build says "Not done: why" to Webmaster, not only a GitHub email | Webmaster | live (PR #48) | 17 Nov: every build pushes a report to the `song-builds` branch; the site reads it (no key) and the desk says "Not done: <why>" to the bot that asked. Only the song-page checks block a page now (Webmaster via Luke, 17 Nov: 14 bank tests held /loveyou ~20 min); every other test runs after it is live and reports to Claude. |
| A3 | **Luke's decisions inbox** with Nova's recommendation on each card | Nova | live (PR #49) | Messages "Waiting on you" exists; add a `recommendation` to decision messages and show it. |
| A4 | **Automatic chasing**: HQ nudges a bot when its duty is late, so Nova only escalates | Nova | live (PR #50) | Hourly 07:00–22:00: one reminder per late duty or release step; still late 2 h later, one message to Nova (Nova's own to Luke). `S.chaseLate`, `chase/<day>.json`. |
| A5 | **6-week release calendar** with every song's steps | Nova | live (PR #51) | Upcoming › Planning › "The next 6 weeks" (week by week, late steps in this week); the `releases` tool gives Nova and Claude `six_weeks`. `S.sixWeeks` = `HQLib.sixWeeks`. |
| A6 | **Pre-flight checks** (#6): artist names vs the store spelling ("Basdcandal"), ad links = badscandal.com/<song>, cover size on upload, WAV/artwork specs, Musixmatch format | Forge, Drop, Verse | live (PR #52) | Artist name exactly "badscandal" (misspellings, "Bad Scandal", capitals), song-page and ad links = https://badscandal.com/<song> (never Feature.fm or a store), master WAV, artwork JPG/PNG; on each release card (amber), in releases / release_pack, and the `preflight` tool; upload_cover warns when not square or under 3000 px. Musixmatch format: not done (no rule to check against yet). |
| A7 | **Locked month close** (#9): when month_check is ready, freeze the month, snapshot, CSV + evidence links; later edits logged old → new | Ledger, Sheet | live (PR #53) | `close_month` (Ledger, Sheet; Nova) once `month_check` is ready: snapshot + received + evidence links; later changes listed old → new in `month_check` and the CSV (Money › Received in <Month> › "CSV with every change since"). |
| A8 | **log_growth**: `monthly_listeners`, `brazil_listeners`; a Growth chart on Songs | Atlas | live (PR #54) | Platform Spotify (artist numbers). Songs opens with "Spotify monthly listeners": the number, the change over 7 days (or fewer, said), Brazil and its share, the trend line (`artistReport`, `HQLib.artistLines`). |

## Batch B: worth it, each needs a free key or app from Luke (~10 min each, once)

| # | What | Asked by | Status | Needs from Luke |
|---|------|----------|--------|-----------------|
| B1 | **Release-day automation** (#13): watch the artist page (Spotify Web API, public), match the new track by ISRC, propose song_page kind track + the home-card switch for one "Yes, correct" | Webmaster, Atlas | not needed | Luke, 17 Nov 2026: skip it. Release day is one song_page call by Webmaster; stats aren't in the public Spotify API anyway. |
| B2 | **YouTube Analytics API**: subscribers, channel + Shorts views, top videos, Brazil vs Ireland | Laura | needs Luke | One Google sign-in (OAuth) for the channel. |
| B3 | **Meta spend straight to record_spend** | Forge | live (PR #54) | The hourly job (from 07:00) reads the last 7 finished days from Meta (read-only, cached) and writes one Meta row a day as HQ (`S.recordMetaSpend`); a day with Forge's one Meta row updates it, a day with two is left alone. Forge records Google and TikTok. |
| B4 | **Instagram Graph API**: followers, Reel insights, comments (browser reads locked the account in Oct) | Steve | building (PR #55) | Read-only Instagram API with Instagram Login (graph.instagram.com); Luke pastes the key once in HQ (Growth & Fans › Connect Instagram); the site renews it weekly. Followers to the desk, post numbers at 6 h / 1 day / 1 week, comments, countries; the `instagram` tool for Steve and Kevin. |
| B5 | **Google Ads API, TikTok Business / creator APIs** | Forge, Kevin | not needed | Luke, 17 Nov 2026: Google and TikTok spend stays small; Forge records it with record_spend. |

## Not possible

| What | Why |
|------|-----|
| Spotify for Artists stats (streams, saves, adds, monthly listeners, top countries) by API | Spotify has no public API for them. A bot keeps reading the dashboard. The public Web API gives followers and popularity only. |

## On hold: each changes a rule Luke set (his decision first)

| # | What | Asked by | Why on hold |
|---|------|----------|-------------|
| H1 | **Live ads panel + kill switch** (#2), cap rule firing automatically | Forge | HQ only READS ads, on purpose. A Luke-only "pause all" is reasonable; ads pausing themselves at USD 900 is a bigger step. |
| H2 | **Ad templates + creative test board** (#7) | Forge | Needs write access to ads (as H1). |
| H3 | **Upload once, post everywhere** (#5) | Kevin, Laura | Posting APIs need each platform's approval and it puts content in public. After the number feeds work. |
| H4 | **Fan capture** (#18): "tell me when it's out" box on song pages | Webmaster | Collecting emails/phone numbers = privacy-law duties (EU, Brazil) and a privacy policy update. Plan it properly. Needs Luke's yes (contacts fans). |

## Later (good; easier once the API feeds exist)

| # | What | Asked by | Status |
|---|------|----------|--------|
| L1 | **Expected money** (#3): every statement → an expected row with due date; learn pay days; flag short/late/missing; statement → payable → paid → landed, days per step | Ledger, Sheet | todo (partly there: pending/payable, paid_by, main sources' due days) |
| L2 | **Post log + hook tracker** (#4): every post with its hook, numbers at +6h/+24h/+7d, a "boosted" flag; weekly top 3 / bottom 3 hooks; a Brazil hook tester | Kevin, Steve | todo |
| L3 | **Fan inbox** (#8): song-name questions and repeat fans, with country and a ready reply Luke approves | Kevin, Laura | todo |
| L4 | **Per-song P&L** (#10): royalties per song/store next to its ad spend and release date | Ledger | todo |
| L5 | **Watchers** (#11): RouteNote status and moderation emails → store_status + a drafted fix; release-day trigger for Verse; Content ID claims panel | Drop, Verse, Laura | todo |
| L6 | **Song page tile** (#15): live status, button state, visits, Spotify clicks, Pixel/CAPI health | Webmaster | todo |
| L7 | **Pitch tracker** (#16): each song's pitch status, editorial adds, the two-week pitch slot calendar | Atlas | todo (the one-pitch rule is live) |
| L8 | **Asset checker** (#17): cover, Canvas and banner vs each platform's rules | Atlas | todo |
| L9 | Exchange-rate cost per payout route | Ledger | todo |
| L10 | Auto end screens and pinned comments linking badscandal.com/<song> | Laura | todo (needs YouTube write access) |
| L11 | A split ledger for Luke's and "Luka's" shares | Ledger | needs Luke (who is "Luka"? Lilian's 50%?) |

## Not HQ's

| What | Whose |
|------|-------|
| Emulator health check (#19) | The bots' own machine: Nova. |

## Already done (for the record)

- Musixmatch status field (PR #34) · lyrics approval tied to the exact text (approvals keep the text; a change shows "changed since") · log_growth channel_views / shorts_views (PR #44) · release page (PR #44) · one entry per payment at Revolut, link_transfer, month_check (PR #43).
