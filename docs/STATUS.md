# HQ status (update on every deploy)

**Last updated:** 17 Nov 2026, ~05:30 São Paulo, by Claude (main `8c115dd`).
**Tests:** 465, all passing on Node 24 and Node 22. **Connector:** 34 tools.
No money amounts, payer names or account numbers in this file: the repo is public.

## Live (newest first)

| When | PR | What |
|------|----|------|
| 17 Nov | (song_page job) | badscandal.com/loveyou published by GitHub's song-page build (first real run; cover checked) |
| 17 Nov | #44 | Release page per song; Spotify Canvas field + Atlas step; ad plan field; "released before HQ" mark; missing pipeline steps added; `roster_card` for Nova; Revolut clears "not connected" when any account reads; "Kevin (TikTok)" = Kevin; log_growth channel/Shorts views |
| 17 Nov | #45 | Revolut reader's own call timer (Node 22 cancelled 12 bank tests and stopped the /loveyou build) |
| 17 Nov | #43 | Money: one entry per payment, counted when it lands in Revolut; Wise/PayPal only confirm; `link_transfer`; `month_check`; payments count in the month they arrived; bots ask Luke when unsure; tool-list version in my_day |
| 16–17 Nov | #39–#42 | Revolut 90-day look back; `payments` tool with ids; `fix_payment` source / paid_by; royalties = self-releases, label deals, publishing |
| 16 Nov | #36–#38 | Webmaster: upload_cover, song_pages, home card; Money simpler (one received total, main sources green/red) |
| 16 Nov | #33–#35 | Bots propose songs (Luke confirms); song pages built by GitHub; Revolut last-4 digits |
| 16 Nov | #34 | Round 3: received-only money, one pitch per 14 days, ads made with Luke after release, YouTube on release day |

## Waiting on Luke

- Batch B keys (see `docs/HQ-ROADMAP.md`): a Spotify developer app; a YouTube sign-in; Instagram on the Meta app.
- On-hold decisions H1–H4 in the roadmap (ads kill switch, posting, fan capture).
- Who "Luka" is in the split-ledger request (L11).
- Answers the bots are waiting for go through Nova; they are not tracked here.

## Next up

- **Batch A** of `docs/HQ-ROADMAP.md` (A1 UI bugs first). Luke agreed the order on 17 Nov 2026.

## Known gaps / watch

- The bots' app keeps its own copy of the tool list: after a tool change they must reconnect.
- Old open PRs #1 (old visit counter), #5 (Instagram test, "do not merge"), #7 (HQ summary for LDashboard): not
  merged; ask Luke before touching them.
- The bots' private seed (`badscandal-hq`) and the HQ-App repo are only on Luke's Mac.
