# HQ roadmap: the bots' ideas, ranked (17 Nov 2026)

The goal (Nova, for Luke): **build towards the bots running everything, with Luke approving.**
This file is the plan. Update an item's **Status** whenever it changes (in the same PR as the work).
Status words: `todo` · `building (PR #n)` · `live (PR #n)` · `needs Luke` · `on hold` · `not possible` · `idea` (needs his go; nothing is built).

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
| B4 | **Instagram Graph API**: followers, Reel insights, comments (browser reads locked the account in Oct) | Steve | live and connected (17 Nov; PR #55, #56 Facebook-login route + safety brake, #58 Page through the portfolio) | Read-only Instagram API with Instagram Login (graph.instagram.com); Luke pastes the key once in HQ (Growth & Fans › Connect Instagram); the site renews it weekly. Followers to the desk, post numbers at 6 h / 1 day / 1 week, comments, countries; the `instagram` tool for Steve and Kevin. |
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
| L2 | **Post log + hook tracker** (#4): every post with its hook, numbers at +6h/+24h/+7d, a "boosted" flag; weekly top 3 / bottom 3 hooks; a Brazil hook tester | Kevin, Steve | live (PR #60): posts ranked by engagement per view at the same age, with each boosting ad's spend and cost per engagement and the numbers before the ad; Monday why-analysis by Steve/Kevin, ad-money pick by Forge for Luke |
| L3 | **Fan inbox** (#8): song-name questions and repeat fans, with country and a ready reply Luke approves | Kevin, Laura | live (PR #66), part 1: song name, where to listen, repeat fans, needs_reply for Luke, from comments already stored. No extra Instagram call. Two named accounts never shown. Part 2 not built: country, and a ready reply he approves. HQ never replies. |
| L4 | **Per-song P&L** (#10): royalties per song/store next to its ad spend and release date | Ledger | building | Money › Per song, and a line on each Songs card. Royalties by store are money in. Ad spend and a royalty payment count for a song only when that row names the song. Anything else says "not linked to a song" and is not added in. Same currency: money in minus ad spend. Across currencies: an estimate at each month's average rate, only when every rate is there. No new tool (still 40). `income_status` gains `per_song`. `record_spend`, `submit_income`, `fix_payment` and `sort_payment` can name a song. Ledger, Sheet, Forge and Nova refresh the tool list. |
| L5 | **Watchers** (#11): RouteNote status and moderation emails → store_status + a drafted fix; release-day trigger for Verse; Content ID claims panel | Drop, Verse, Laura | todo |
| L6 | **Song page tile** (#15): live status, button state, visits, Spotify clicks, Pixel/CAPI health | Webmaster | live (PR #59) |
| L7 | **Pitch tracker** (#16): each song's pitch status, editorial adds, the two-week pitch slot calendar | Atlas | live (PR #63): not pitched / pitched with the day / missed; warn from 14 days out (deadline is 7 days before release); two-week slots on Upcoming; `pitch_log` for Atlas (pitched day, editorial playlist). The one-pitch rule still skips the later song. HQ never pitches. |
| L8 | **Asset checker** (#17): cover, Canvas and banner vs each platform's rules | Atlas | live (PR #61): `preflight` asset = cover / canvas / spotify_header / youtube_banner with width, height, seconds, format, size_mb; a Canvas link that isn't MP4/JPG shows on the card; Atlas and Laura have the tool. Live check on HQ passed (17 Nov, ~20:52 SP). Atlas, Laura and Webmaster were told to refresh. |
| L9 | Exchange-rate cost per payout route | Ledger | todo |
| L10 | Auto end screens and pinned comments linking badscandal.com/<song> | Laura | todo (needs YouTube write access) |
| L11 | A split ledger for Luke's and "Luka's" shares | Ledger | needs Luke (who is "Luka"? Lilian's 50%?) |
| L12 | **Profiles**: one place in HQ for the profile photo, and the banner, header, cover or wallpaper, on every official badscandal platform that has one | Luke | live (PR #64): HQ › Profiles. Current image and the day it changed; the size rule (L8 kinds, plus published profile and banner sizes; Instagram, TikTok and Deezer say "Rule not set"); a new image waits for "Yes, correct"; then the owner uploads it by hand. Atlas (DSPs), Laura (YouTube), Steve (Instagram and Facebook), Kevin (TikTok). X has no owner. The `profiles` tool. HQ never logs in and never changes a platform. No Meta or Instagram calls. |

## Ideas

Luke, 17 Nov 2026, night. L12's first version is live (PR #64, in Later above). The login notes under it stay, for a later version that might read an image. Nothing in that version, or this one, logs in to Meta.

**First version (live).** One Profiles section. It records what is already live and asks Luke before a new image. After "Yes, correct" the owner bot uploads it by hand and then records the new link and the day. HQ does not log in and does not change any platform.

Platforms: Facebook Page, Instagram, YouTube, Spotify, Apple Music, TikTok, X, SoundCloud, Deezer, Amazon Music.

Size rules that are set come from the platform's own help: Spotify avatar and header, YouTube profile photo and banner, Apple Music artist image, X profile photo and header, SoundCloud profile image and header, Facebook Page profile photo and cover, Amazon Music profile image and background. Instagram, TikTok and Deezer say "Rule not set" (TikTok's only published minimum is 20 px, which is not a useful rule; Instagram and Deezer publish no size). No other size was invented.

Not in this version: reading or changing an image through any platform's API. The notes below are only what a later version could read, and what still needs Luke's own login. No bot logs in to Meta. No password goes in the repo.

What can be read, and what needs Luke's own login (checked 17 Nov 2026 against the official pages). No bot logs in to Meta. No password goes in the repo.

- **Instagram.** The key HQ already holds can read the profile photo (`profile_picture_url`). Meta's IG User page says updating is not supported. There is no banner. Luke changes the photo himself.
- **Facebook Page.** The Page key already held can read the profile photo and the cover. Changing either is a write, so Luke does it himself. Do not add a write to the reader.
- **Spotify.** The public Web API returns the artist images. Nothing in that API changes the avatar or the header. Luke changes both in Spotify for Artists. The header kind `spotify_header` is already in L8.
- **YouTube.** The public channel thumbnail can be read. The banner upload is in the Data API, and only with Luke's Google login as the channel owner (not connected). B2 is Analytics, so it does not upload the banner. Luke changes the profile photo himself. The banner kind `youtube_banner` is already in L8.
- **Apple Music.** A partner API can upload a hero image (square JPEG or PNG, at least 2400×2400). It needs Apple partner access, not a public key. Until that access is confirmed, Luke uploads it.
- **SoundCloud.** Their help says the profile image and the header are uploaded on the website.
- **Deezer.** The profile photo is changed in Deezer for Creators.
- **Amazon Music.** The profile image and the background are changed in Amazon Music for Artists.
- **TikTok and X.** TikTok's help only says a photo must be at least 20 x 20, so the first version says "Rule not set" and Kevin uploads it by hand after yes. X's profile photo and header have published sizes (in the checker). X has no owner yet, so Luke uploads those himself.

The bullets above are about what an API can do. The first version does not call any of them. The owners in the L12 row upload by hand after Luke says yes.

## Not HQ's

| What | Whose |
|------|-------|
| Emulator health check (#19) | The bots' own machine: Nova. |

## Already done (for the record)

- Musixmatch status field (PR #34) · lyrics approval tied to the exact text (approvals keep the text; a change shows "changed since") · log_growth channel_views / shorts_views (PR #44) · release page (PR #44) · one entry per payment at Revolut, link_transfer, month_check (PR #43).
