/* The connector's tools (11 Nov 2026): what a bot can do on the staff desk through /mcp. Protocol in
   mcp.mjs, the desk itself in staff.mjs. The bots' app shares ONE connector between all bots, so the
   key says "a BADSCANDAL bot" and each call says WHICH bot in its `bot` argument (checked against
   the roster). Claude has its own key and always acts as "Claude".

   Written for bots that follow instructions literally: every description says when to use the tool
   and what to put in each field, and every refusal says what to do instead. */
import { hasAccountCheck, recordAccountCheck } from "./account-health.mjs";
import { SONGS, homeCardSong } from "./songs.mjs";
import * as C from "./action-cards.mjs";
import { healthReport, needsDesk } from "./needs.mjs";
import { pingNames } from "./desk-push.mjs";
import * as S from "./staff.mjs";
import * as P from "./profile-images.mjs";
import * as W from "./workspaces.mjs";
import * as IG from "./instagram.mjs";
import { rankLine, rankPosts } from "./postrank.mjs";
import "../../js/hq-lib.js";

const str = (description, extra = {}) => ({ type: "string", description, ...extra });
const BOT = str('Your own name on the team, exactly as in the roster (for example "Nova", "Ledger", "Atlas"). Never another bot\'s name.');
const obj = (properties, required) => ({ type: "object", properties, required, additionalProperties: false });

/* Each line with the bots it is for (null = everyone). /mcp gives every line (INSTRUCTIONS, unchanged);
   /mcp/<bot> gives that bot the shared lines and its own (instructionsFor, batch 5). */
const INSTRUCTION_LINES = [
  [null, "This is the badscandal HQ staff desk: the one place where the bot team and Luke leave word for each other. It feeds Luke's dashboard at badscandal.com/hq."],
  [null, "Every call needs `bot`: your own team name. Start every run with my_day. When you start or finish a duty, or get stuck, call post_update."],
  [null, "Rules: never write a password, login code, key, card or bank account number here. Never guess a number: if you could not see it, say so with status \"blocked\". Every amount keeps the currency it was paid in. Only Luke approves money, logins, account settings and public posts."],
  [null, "Your T- tasks (open_tasks in my_day): when one is finished, call task_update with status done (or blocked, with what is needed); daily D- duties go through post_update."],
  [null, "Asking Luke several things at once? Put each one in questions (2 to 6): each gets its own answer, and the message stays open until all are answered. A message to Luke about another bot names it in about, so the answer reaches that bot too."],
  [null, "Disputes: RouteNote moderation, YouTube Content ID, a takedown, a distributor issue or a copyright dispute is a case. Open it with open_case, update it with update_case, and read Luke's decision with read_cases. You never set his decision. When the status is waiting on bot, do what he confirmed or wrote, then update the case. HQ does not send the email or file the dispute."],
  [null, "Releases: when Luke sends a new song to the team, your steps and their dates appear in my_day. Read everything about the song with release_pack, mark ONLY your own steps with release_step (done only when it is really done), and fill the fields you are responsible for with release_fill."],
  [null, "Social Farm and Label stay off the BADSCANDAL numbers, the ad cap and the official accounts. Farm: log_growth with workspace farm (account or post). Label streams: log_growth with workspace label. Label spend: record_spend with workspace label (never the USD 1,000 cap). A Label cover is pack, then licence, then Drop's upload, then Atlas's pitch. The licence step shows waiting on licence until it is licensed, with a proof link. release_step step licence, workspace label: only the Licence bot (bot \"Licence\") or Nova can mark it, and only after Luke has said yes for that song. Fields: esl_order_number, licence_pdf_url, drive_folder_url, original_title, original_writers, original_publisher, status (todo, ordered_waiting_luke, paid, licensed, flagged) and flag_reason. The Licence bot reads its queue and marks one done with licence_queue and a proof link. Drop's upload stays blocked until the licence is licensed. HQ never pays a licence."],
  ["Licence", "Licence: you are idle until Luke starts a cover. He writes the covers himself and keeps the songs. When a pack is ready, and before Drop uploads it to RouteNote, get the mechanical licence through Easy Song Licensing. Save the licence, the song and the assets to Google Drive. Read the queue with licence_queue. Mark one licensed only with a proof link, and only after Luke has said yes for that song. You report to Nova only. Never pay. HQ does not take payment."],
  ["Spark", "Spark: once a day around 10:00 São Paulo, rank BADSCANDAL's recent official posts on Instagram, TikTok and YouTube by engagement per view ((likes + comments + saves + shares) / views). Compare them with outlier posts by similar artists. Send Nova 3 to 5 content ideas with content_ideas: each idea has a hook, the on-screen text, a format, a platform and why. You report to Nova only. Never post, comment, send a DM, or touch an ad. HQ does not post them."],
  ["Atlas", "Atlas, every day: open Spotify for Artists, Music, Upcoming, and report everything listed there with spotify_upcoming (an empty list when nothing is). The Spotify pitch waits until the song shows there."],
  /* B4 (17 Nov 2026): the Instagram reader */
  ["Steve Kevin Forge", "Steve, Kevin and Forge: the instagram tool ranks the posts by engagement per view ((likes + comments + saves + shares) / views), not by views, every post at the SAME age (its numbers at 1 day; older posts are a separate reference list), with our own accounts' comments left out, plus saves + shares per view and follows per view: paid views bring few engagements, so a boosted post never wins on reach alone. With fewer than 10 ranked posts, say the order is not settled yet. Fans' questions nobody of ours answered are in needs_reply: put them in your update for Luke, never reply yourself. Song-name questions, where to listen, and people who comment on more than one post are in fan_inbox (needs_reply true goes to Luke). Never reply, like, hide or delete a comment. Our own accounts (team, family, friends, bots, spam) never count: Nova keeps that list with instagram our_accounts add/remove (a handle and a short reason, logged); anyone can read it with our_accounts list. Each post shows the ad that boosted it (spend, its own engagements, cost per engagement) and its numbers from BEFORE the ad (its wow factor with our own followers). Every Monday: Steve and Kevin say WHY the top 3 beat the bottom 3 (the hook in the first seconds and the first line, the format, length, sound, topic, the time posted) as ONE update; Forge then sends Luke ONE send_message (needs decision, with recommend) naming the post that deserves the ad money next and why (high engagement per view, low cost per engagement, strong before the ad). The bots never change, start, pause or create ads: Luke decides and makes them."],
  ["Steve Kevin", "Steve and Kevin: HQ reads the Instagram account itself (the instagram tool: followers, every post's numbers at 6 hours, a day and a week, comments, countries). Once it says connected, never open Instagram in a browser for numbers again (that got the account locked); HQ logs the Instagram followers on the desk by itself."],
  /* A8 + B3 (17 Nov 2026) */
  ["Atlas", "Atlas: with your daily numbers, log the artist's Spotify monthly listeners and the Brazil listeners: log_growth platform Spotify, monthly_listeners and brazil_listeners (as shown in Spotify for Artists)."],
  ["Forge", "Forge: HQ records Meta's spend itself every hour from Meta (read-only), one row a day, so record_spend is for Google and TikTok; record Meta only when Luke asks or the dashboard says Meta couldn't be read."],
  /* A6 (17 Nov 2026): pre-flight checks */
  ["Forge Drop Verse Webmaster", "Before anything goes to the stores or into an ad, run preflight: the artist name is badscandal, one word (capitalisation does not matter), the primary artist is Badscandal and matches Spotify artist 29kaubgb6Esvwu0idVndGy, ads and links go to https://badscandal.com/<song>, the master is a WAV, the artwork a JPG or PNG 3000 x 3000. Fix what it lists first."],
  ["Atlas Laura Webmaster", "Before you upload a Spotify Canvas, a Spotify header image, a YouTube banner or a cover, run preflight with asset (canvas, spotify_header, youtube_banner or cover) and the file's width, height, seconds, format and size_mb: it checks them against that platform's rule. Fix what it lists first."],
  /* L12 (18 Nov 2026): profile photos and banners. HQ never logs in. */
  /* 24 Nov 2026, Luke: "immediately after luke submits an upload, upload it to each respected profile and then change
     the profile ring to green". Green only after the bot checked the public profile. */
  ["Atlas Laura Steve Kevin", "Profiles: HQ's Profiles section lists the profile photo and the banner on every official platform. Luke uploads one master profile photo and one master banner there. When the shape fits, a sized copy is made. When it does not fit, profile_jobs lists the job: make an AI version of his master at the exact size that looks exactly like it. profile_master is the master and the size, profile_rework stores your file (exact pixels). After Luke uploads, the same day: log in to each of your platforms, put it up, open the public profile, take a screenshot and record it with profile_uploaded (result live + screenshot_base64 + page). Only that turns his ring green; a copy on HQ alone does not. Could not log in: result login with what happened, then fix it with Luke in your own chat (never on HQ); once it works, upload, check and record live. The profile shows another image: result not_mine with the screenshot. A \"Try again\" from Luke arrives as a message and in profile_jobs (kind retry). HQ never logs in and never sends a file to a platform. Record the image that is live with profiles (action record). To propose a different image, action propose: Luke is asked \"Yes, correct\". Instagram is Luke's to upload. X has no owner yet: Luke uploads that one himself. Deezer is a square at least 1200. TikTok's help only requires 20 px; the file we prepare is 720. TIDAL is a square 1500."],
  /* A4 (17 Nov 2026): automatic chasing */
  [null, "When a duty or a release step of yours is late, HQ sends you ONE reminder (07:00 to 22:00). Do it then and post_update or release_step; if it is still not done 2 hours later, Nova is told and chases you."],
  ["Nova", "Nova: HQ reminds the bots about late duties and steps by itself and tells you only when one is still late 2 hours after its reminder: then chase that bot, or tell Luke if it needs him."],
  /* A3 (17 Nov 2026): Luke's decisions inbox */
  [null, "When you ask Luke to decide (needs: decision, options), say what you recommend and why in recommend (and recommend_option): Luke sees it on the card."],
  ["Nova", "Nova: go through decisions_waiting_on_luke (team_board) and add your recommendation to each with recommend: which option and why, in one or two sentences. Never answer for Luke."],
  /* the release timeline and who does what (14 Nov 2026, Luke) */
  [null, "The release timeline (the team's rule): a song goes to RouteNote 4 weeks before its release day (3 weeks at the very least: less is tight and the pitch may miss), songs come out on Fridays, and there are at least 2 weeks between two releases."],
  ["Drop", "Drop: you submit everything to RouteNote (the master, the artwork, every detail and the release date) and you keep the schedule: upload on its day, check the approval, and tell Luke on the desk the moment a date can't be kept (a rejection, a missing file, a delay at the stores)."],
  ["Atlas", "Atlas: send the Spotify pitch the same day the song shows in Spotify for Artists; don't wait for its planned day. Before you send it, improve Luke's words from the pack (mood, instruments, story): keep his meaning and make it clear and strong."],
  ["Atlas", "Atlas: when the pitch is sent, record the day with pitch_log (pitched_on). HQ never pitches a song and never changes Spotify: you send the pitch in Spotify for Artists, then record it here. When you see the song on a new editorial playlist in Spotify for Artists, record it the same day with pitch_log (playlist, added_on). A song the one-pitch rule skipped is not pitched: do not record a pitch for it."],
  ["Laura", "Laura: when the pack has a visualiser link, upload it to YouTube for the release and write its description like the other visualisers."],
  /* 24 Nov 2026 (Luke): the Rights page and Content ID claims are gone. Laura no longer records claims. */
  [null, "Account health: Steve (Instagram), Kevin (TikTok), Laura (YouTube), Atlas (Spotify) and Webmaster (badscandal.com) record what the platform's own page shows, with log_growth, on the same day as the numbers, and again that day if Account Status changes. account_status is clear, restricted, strike, copyright, ineligible or age, and status_note is the page's own words. visible is yes, no or unknown, and visible_where is where you looked (For You, Explore, a hashtag). non_follower_share is the percent of views from people who do not follow, when the page shows it. recent_posts is the last few posts, each with at (YYYY-MM-DD) and views or reach, as shown. Atlas records track_moved (and moved_to) when a track is on another profile, and artificial_streams for a warning on the screen. Drop records artificial_streams on Spotify only. Webmaster records site_ok yes or no. HQ messages that bot only when the health changes. Never buy reach, never use a pod, never sign in somewhere else to get around a block, and never delete or appeal from here. HQ will not delete, appeal or post anything."],
  ["Webmaster", "Webmaster: make each song page (badscandal.com/<song>) before the song comes out, in the order the songs come out: a week after the previous song's release day. The home page shows a song as Out now for 7 days after its release day, then switches to the next upcoming song."],
  ["Verse", "Verse: the lyrics go on Musixmatch only once the song is out and shows there. Your lyrics step waits until the release day; from that day check Musixmatch every day and add Luke's approved text (the pack's lyrics) the day the song appears. A song not on Musixmatch yet is not a block. Only Luke writes the lyrics into the pack."],
  /* batch 3 (14 Nov 2026) */
  [null, "release_step: put the post, store page or video in link, and when the work was done on an earlier day, that day in done_on (YYYY-MM-DD)."],
  ["Drop", "Drop: keep where each song is at the distributor with store_status (uploaded, in moderation, rejected with RouteNote's reason, resubmitted, approved, delivered, live). After a rejection, once it is fixed, ask Luke with store_status ready_to_resubmit: he answers Yes or Not yet."],
  ["Atlas Verse", "Atlas (the pitch) and Verse (the final lyrics): ask Luke for his approval with send_message and approval; release_pack shows what he approved, when, and the exact text. Never treat anything else as his approval."],
  /* batch 4 (15 Nov 2026) */
  ["Steve Atlas Kevin Laura", "Steve, Atlas, Kevin, Laura: log each day's numbers with log_growth (one call per platform or song); a number you could not read goes in gaps with why, and your duty counts as done with gaps. post_update takes gaps too: one missing number is never a reason for blocked."],
  ["Forge", "Forge: record each platform's daily spend with record_spend (not_read with why when you could not read it). The month's total against the cap is the one record_spend and the dashboard give, at the team's fixed rate: never add it up yourself."],
  ["Forge", "Forge: when a day's spend is for one song, name it on record_spend (song). Leave song out for an account total: HQ says not linked to a song. Never guess a song from a campaign name, and never record the same money as both."],
  /* 24 Nov 2026, Luke: "leave a note for the bots telling them to stop checking all things related to money and delete any
     tasks related to money". Ledger and Sheet stay on the team; Luke gives them new work. */
  [null, "HQ no longer handles money: no income, payments, Revolut or income sheet. Ad spend stays (record_spend and the USD 1,000 cap)."],
  ["Ledger Sheet", "Ledger and Sheet: HQ no longer handles money (Luke, 24 Nov 2026). Stop checking income, payments, Revolut and the income sheet. Delete your money tasks. Ask Luke for your new task."],
  /* batch 5 (15 Nov 2026) */
  [null, "A duty you finish before Nova has put today's duty rows on the board still counts: post_update with status done as usual, and it is marked done once the row appears."],
  ["Nova", "Nova: reset today's duty rows at 07:00 São Paulo, before the team's morning runs, so every bot finds its row."],
  ["Alfred", "Alfred: for a short message use luke_short_briefing (the cap, the top 3 decisions by deadline, every sign-in Luke has to do); luke_briefing is the full one."],
  /* the pipeline, 15 Nov 2026 (Luke) */
  [null, "The artist name is badscandal, one word, everywhere: store details, featuring, copyright lines, captions, messages. Capitalisation does not matter."],
  ["Forge Webmaster", "Forge and Webmaster: every ad links to the song's own page, badscandal.com/<song>, which carries the Meta pixel (HQ's Pages shows who clicked and what it cost); never straight to Spotify."],
  /* 16 Nov 2026 (Luke, also sent to Nova) */
  ["Forge", "Forge: you never make or launch ads on your own. A song's ads are made WITH Luke after it is out (he oversees them, often several sets, with Claude working in his browser); your release step \"Ads made with Luke, after the release\" waits for the release day. Later you may copy those ads for other posts, only with videos Luke gives you. A lyric video is never used for ads: it is only for YouTube."],
  ["Laura", "Laura: YouTube runs on a schedule. Each new song's video is uploaded ahead and set to go public on its release day (scheduled in advance, never late). The goal is two uploads a month. A lyric video is only for YouTube, never for ads."],
  [null, "One Spotify pitch in two weeks (Luke): when two songs come out less than 14 days apart, only the first is pitched and the later one's pitch step is skipped (it says why)."],
  [null, "There are no teaser steps on releases any more: teasers will get their own place later."],
  /* round 2, 15 Nov 2026 (Luke: "yes novas counts as long as i told him yes") */
  [null, "To add a song to the releases or change one (its title, day or details), use propose_release: Luke is asked if it is correct first, and nothing changes until he says yes. Never tell Luke a song is added or changed before that."],
  ["Webmaster", "Webmaster: check song_pages first (what happened to each request, and which song the home card should show today); a cover that isn't on a public link goes up with upload_cover; the home card changes with song_page kind card, Luke confirming."],
  ["Webmaster Nova", "Webmaster: song pages are made with song_page (kind new: address, title, day, cover link; kind track: the Spotify link on release day). Luke confirms, then GitHub builds and checks the page: never Luke's Mac, never by hand."],
  [null, "my_day's connector line says how many tools the desk has and the version of their list. Pass tools_seen (the number your app lists) and, if you have them, tool_names. Reconnect only when the count or the names differ. A version difference by itself is not a reconnect. The version is also on the connector when you connect."],
  [null, "Nova's yes counts as Luke's, as long as Luke told Nova yes himself: Nova records it with record_luke_answer (Luke's exact words), and it reaches you as Luke's answer, via Nova. Never for money (ad spend): only Luke answers those."],
  [null, "A finished action Luke can tap is a card: send_message with card {kind, text, dedupe_key, action, owner, recipient, amount, currency, link, preview, deadline, expires_at, waiting_on, money_at_risk, ticket}. The same dedupe_key is never posted twice. Read his answer in my_day (card_answers): choice, time and the card version. An edit after a Yes is a new version and needs a new Yes. The card is done only when you post_update with card (the id) and proof_message, proof_ref or proof_link. Until Luke switches on \"taps count as Luke's yes\", a Yes is recorded and you still confirm with him. Payments and signatures always say Luke does this himself. Only a money_at_risk card may reach him between 23:00 and 08:00 São Paulo. Ads and the Monday pick: HQ never changes an ad and never chooses an amount."],
  ["Drop", "Drop: before you distribute, resubmit, or reply to a moderation note, call my_day with luke_tap (the card id or dedupe_key, the version, and the action). Go ahead only when it says yes and gives the time he tapped. A tap while \"taps count as Luke's yes\" is off does not let you proceed. Payments and signatures are never yours to send."],
];
export const INSTRUCTIONS = INSTRUCTION_LINES.map((l) => l[1]).join("\n");
/* a short fingerprint of the tool list: names and every option. It changes whenever a tool or an option is added or
   removed (17 Nov 2026, Nova: the bots' app kept an old copy, so new options looked missing) */
function schemaShape(schema, depth) {
  if (!schema || typeof schema !== "object" || depth > 6) return "";
  const props = schema.properties && typeof schema.properties === "object" ? schema.properties : null;
  const keys = props ? Object.keys(props).sort().map((k) => {
    const p = props[k] || {};
    const en = Array.isArray(p.enum) ? "=" + p.enum.join("/") : "";
    return k + en + schemaShape(p, depth + 1);
  }).join(",") : "";
  const items = schema.items ? "[" + schemaShape(schema.items, depth + 1) + "]" : "";
  return (keys || items) ? "(" + keys + items + ")" : "";
}
export function toolsVersion(tools) {
  /* nested fields count: a new boost or case field changes the version the bots see */
  const text = tools.map((t) => t.name + ":" + schemaShape(t.inputSchema, 0)).sort().join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
/* what my_day says about the tool list (18 Nov 2026 night test). reconnect_needed is true only when
   the count or the tool names differ. A version-only bump is not a reconnect. The sentence is said
   only when reconnect_needed is true. */
export function connectorStatus(tools, args) {
  const version = toolsVersion(tools), n = tools.length;
  const names = tools.map((t) => t.name).sort();
  const seenRaw = args && args.tools_seen;
  const reportedCount = !(seenRaw == null || seenRaw === "");
  const seen = reportedCount ? Number(seenRaw) : null;
  const countBad = reportedCount && seen !== n;
  const rawNames = args && (args.tool_names || args.tools_names);
  const nameList = Array.isArray(rawNames) ? rawNames.map((x) => String(x).trim()).filter(Boolean).sort() : null;
  const namesBad = !!nameList && (nameList.length !== names.length || nameList.some((x, i) => x !== names[i]));
  const old = countBad || namesBad;
  const yours = countBad ? `you see ${Number.isFinite(seen) ? seen : "an unreadable number of"} tools` : namesBad ? "the tool names differ" : "";
  const status = old
    ? `reconnect needed: your tool list is old (${yours}; the desk has ${n} tools, version ${version}). Refresh the connector, then call my_day again.`
    : `The desk has ${n} tools, version ${version}.`;
  return { tools: n, version, reconnect_needed: old, status };
}

export const TOOLS = [
  { name: "my_day", title: "My day", readOnly: true,
    description: "START HERE, every run. Returns who you are on the team, today's duties and their deadlines (São Paulo time), your open tasks, messages waiting on you, your open questions to Luke and how long each has waited (questions_to_luke: one list, a clean excerpt, the id and the link), every new message for you since your last read (messages_for_you: Luke's answers to you included), card_answers (Luke's Yes, No or Edit on your action cards, with the version and the time), new notes for the whole team, and the rules. Before an irreversible step, pass luke_tap (id or dedupe_key, version, action): yes is true only when he tapped yes for that exact action and version and the tap counts. Pass tools_seen (how many tools your app lists) and tool_names when you have them. Reconnect is needed only when the count or the names differ. A version difference by itself is not. The version is on the connector when you connect. Read it before doing anything else.",
    inputSchema: obj({ bot: BOT,
      tools_seen: { type: "integer", description: "How many tools your app lists right now. If this is not the desk's count, the answer says reconnect needed." },
      tool_names: { type: "array", items: { type: "string" }, description: "Optional. The tool names your app lists. If they differ from the desk's names, reconnect is needed." },
      list_version: str("Optional. The version from your last my_day. Kept so you can compare it. A difference by itself does not mean reconnect."),
      tools_version: str("Optional. The version your app last loaded. Same as list_version: a difference by itself does not mean reconnect."),
      luke_tap: { type: "object", description: "Before an irreversible step (Drop: distribute, resubmit, or a reply to moderation). Did Luke tap yes for this exact action and card version, and when.",
        properties: { id: str("The card id (it starts with k)."), dedupe_key: str("The card's dedupe_key, if you do not have the id."), version: { type: "integer", description: "The card version you are about to act on." }, action: str("The card's action, exactly, for example distribute, resubmit or moderation.") }, additionalProperties: false } }, ["bot"]) },
  { name: "post_update", title: "Post an update", idempotent: false,
    description: "Add one line to the live log Luke sees on the dashboard. Call it when you START a duty (status working), when you FINISH it (status done, with the number you logged), when you are STUCK (status blocked, say exactly what is needed and from whom) or when something FAILED (status error). One line, plain words, no secrets. Finishing a duty here also marks it done on the dashboard.",
    inputSchema: obj({ bot: BOT,
      status: str("working | done | blocked | error | info", { enum: S.UPDATE_STATUS }),
      message: str('What happened, in one line (240 characters at most). Good: "Touch Me row for Mon 9 Nov written: 3,540 streams". Bad: "done".'),
      duty: str('Optional. The id of the duty this is about, from my_day (it starts with "D-"). Leave empty if you have only one duty today.'),
      link: str("Optional. An https link to the row, post or page this is about."),
      gaps: str('Only with status done: what you could NOT read, and why (for example "views: TikTok shows them a day late"). The duty counts as done, with its gaps; never use blocked for one missing number.'),
      card: str("Optional. The id of an action card you are closing (it starts with k). Also give proof_message, proof_ref or proof_link. The update is saved only after the proof is accepted."),
      proof_message: str("Optional, with card. A message id that proves the action was done."),
      proof_ref: str("Optional, with card. A booking reference."),
      proof_link: str("Optional, with card. An https link that proves it was done.") }, ["bot", "status", "message"]) },
  { name: "send_message", title: "Send a message",
    description: "Write to Luke, another bot, or the whole team (to: all). Use needs to say what you expect: reply (a question), action (please do this), decision (Luke must choose: give 2 to 4 options) or none (just so you know). To answer a message, put its id in reply_to. Messages to Luke reach him through the dashboard and Alfred's 10:00 message: keep them short and say exactly what you need.",
    inputSchema: obj({ bot: BOT,
      to: str('Who it is for: "Luke", a bot\'s name, or "all".'),
      text: str("The message, plain words (1,500 characters at most). No passwords, codes or keys."),
      needs: str("none | reply | action | decision. Default none.", { enum: S.NEEDS }),
      reply_to: str("Optional. The id of the message you are answering (it starts with m)."),
      options: { type: "array", items: { type: "string" }, description: "Only with needs: decision, for ONE question. The 2 to 4 choices Luke can pick from, your recommendation first." },
      questions: { type: "array", items: { type: "string" }, description: "When you ask SEVERAL things: one entry per question, 2 to 6 (300 characters each). Each gets its own answer; the message closes only when every one is answered. Not with options, not to all." },
      about: str("Optional. The bot this message is about, when it is addressed to someone else (for example a decision for Luke about Forge's ads): the message and its answer reach that bot too."),
      approval: { type: "object", description: 'Only to ask Luke to APPROVE something on a release: Atlas the pitch, Verse the final lyrics. {"song": "Night Drive", "what": "pitch", "text": "the pitch, exactly as it would be sent"} (for the lyrics leave text out: the lyrics in the pack are what he approves). It becomes a decision with the options Approve / Not yet; his Approve is recorded on the release.',
        properties: { song: str("The song's title or id."), what: str("pitch | lyrics", { enum: ["pitch", "lyrics"] }), text: str("For the pitch: the pitch itself.") }, required: ["song", "what"], additionalProperties: false },
      answers: { type: "object", description: 'Only with reply_to, when the message you answer has numbered questions: {"1": "your answer to question 1", "3": "..."}. Questions you leave out stay open.', additionalProperties: { type: "string" } },
      recommend: str("Only on a message to Luke that needs him: what you recommend and why, in one or two sentences (300 characters at most). Luke sees it on the card."),
      recommend_option: str("Optional, with options: the option you recommend, exactly as listed."),
      card: { type: "object", description: "Optional. Creates or edits an action card instead of posting this text as a board message. to and text are still required and are not posted. Same dedupe_key never posts a second card.",
        properties: {
          id: str("Optional. The card id, to edit one. A change after a Yes needs a new Yes."),
          kind: str("message, booking, post, link, payment, signature, ads, track, month, monday or other."),
          text: str("The finished action, exactly."),
          dedupe_key: str("Required on a new card. The same key is never posted twice. Letters, digits and . _ : - only."),
          action: str("The exact action a later luke_tap must name, for example distribute, resubmit or moderation."),
          owner: str("The bot who carries it out. Nova may name another bot. Leave it out to use yourself."),
          recipient: str("Who it is addressed to, when the action has a recipient."),
          amount: str("Optional. The amount, as written. Leave it out if there is none. HQ does not convert it."),
          currency: str("The three-letter code, only with amount."),
          link: str("Optional. An https link."),
          preview: str("Optional. The short line Luke sees before he expands the card."),
          deadline: str("Optional. YYYY-MM-DD or YYYY-MM-DD HH:MM, São Paulo."),
          expires_at: str("Optional. When the card stops asking Luke. ISO time, or YYYY-MM-DD HH:MM in São Paulo."),
          waiting_on: str("luke, bot, label or store. Anything but luke is Waiting on others, not on Luke's phone."),
          money_at_risk: { type: "boolean", description: "True only when money is at risk. Only those cards may reach Luke between 23:00 and 08:00 São Paulo. A payment is always true." },
          ticket: str("Optional. An external thread or ticket id, for Waiting on others."),
          workspace: str("Leave this out for BADSCANDAL. farm or label puts the card on that workspace's Needs you. It is not on the BADSCANDAL Needs you."),
        }, additionalProperties: false } }, ["bot", "to", "text"]) },
  { name: "record_luke_answer", title: "Record Luke's answer from Alfred's or Nova's chat",
    description: "ALFRED, or NOVA. When Luke answers a message that waits on him in your chat (not on the dashboard), record it here so the bot that asked gets it. NOVA: only when Luke himself told you the answer (never your own yes, never another bot's word), and never about money: a message from Forge (ad spend) is refused; Luke answers those on the dashboard or to Alfred. reply_to = the message's id, luke_said = Luke's EXACT words, copied as he wrote them (never your summary). For a decision, also put the option he picked in option (exactly as listed). For a message with numbered questions, put each answer in answers. It is saved as Luke's answer, marked \"via Alfred\" or \"via Nova\", and closes the message the way Luke's own answer would.",
    inputSchema: obj({ bot: BOT, reply_to: str("The id of the message Luke answered (it starts with m)."),
      luke_said: str("Luke's exact words from your chat (1,500 characters at most)."),
      option: str("Only for a decision with options: the option Luke picked, exactly as listed."),
      answers: { type: "object", description: 'Only for a message with numbered questions: {"1": "Luke\'s answer to question 1", ...}.', additionalProperties: { type: "string" } } }, ["bot", "reply_to", "luke_said"]) },
  { name: "recommend", title: "Add your recommendation to a question waiting on Luke", idempotent: true,
    description: "NOVA. Luke's decisions inbox: on a message waiting on Luke (decisions_waiting_on_luke in team_board, or read_messages), add YOUR recommendation so Luke can decide at a glance: which option (exactly as listed, when it has options) and why, in one or two sentences. It does not answer the question: only Luke does. Calling it again replaces your earlier recommendation on that message; the asker's own stays beside it. Never for money questions from Ledger, Sheet or Forge unless you checked the numbers yourself.",
    inputSchema: obj({ bot: BOT, message_id: str("The id of the message waiting on Luke (it starts with m)."),
      option: str("Optional: the option you recommend, exactly as listed on the message."),
      why: str("Why, in one or two sentences (300 characters at most).") }, ["bot", "message_id", "why"]) },
  { name: "preflight", title: "Check a song, a text or a link before it goes out", idempotent: true, readOnly: true,
    description: "FORGE, DROP, VERSE, WEBMASTER, ATLAS, LAURA (Nova too). Pre-flight checks before anything reaches the stores or the ads. song = every check on that release's pack (the artist name is badscandal, one word (capitalisation does not matter), in primary/featured artists, producers, split and copyright; the master a WAV; the artwork a JPG or PNG, 3000 x 3000; the Canvas an MP4 or JPG; the song page and every link in the ad plan going to badscandal.com/<song>). text = check the artist name in any text (credits, a description). link = an ad link: it must be https://badscandal.com/<the song> (utm tags are fine), never Feature.fm or a store link. asset = check a file against its platform's rule BEFORE you upload it: cover, canvas, spotify_header, youtube_banner, or a profile photo or banner (the profiles tool lists them). Give what the file shows (width, height, seconds, format, size_mb); anything left out is not checked, and the answer's rule says the whole rule. ok true = nothing to fix. It changes nothing.",
    inputSchema: obj({ bot: BOT, song: str("Optional: the song's title or id (every check on its pack)."),
      text: str("Optional: any text to check the artist name in."),
      link: str("Optional: an ad link to check (with song, it must go to that song's page). With mode track, a release-day Spotify track link instead."),
      mode: str("Optional. track = this link is the release-day Spotify track (https://open.spotify.com/track/<id>). ?si= is removed for you. Leave it out for an ad link, which must be badscandal.com/<song>."),
      asset: { type: "string", enum: Object.keys(S.ASSETS), description: "Optional: the kind of file to check against its platform's rule (cover, canvas, a profile photo or a banner)." },
      width: { type: "number", description: "With asset: the file's width in px." },
      height: { type: "number", description: "With asset: the file's height in px." },
      seconds: { type: "number", description: "With asset canvas: the video's length in seconds." },
      format: str("With asset: the file type, e.g. mp4, mov, jpg, png."),
      size_mb: { type: "number", description: "With asset: the file's size in MB." } }, ["bot"]) },
  { name: "instagram", title: "The Instagram account's numbers, read by HQ itself", idempotent: true,
    description: "STEVE, KEVIN, FORGE (Nova too). Since 17 Nov 2026 HQ reads the badscandal Instagram account itself through Meta's official API (read-only), so nobody opens Instagram in a browser for numbers again (that got the account locked). Gives: connected or not (and why), followers, the newest posts with their numbers at 6 hours, a day and a week (views, reach, likes, saves, shares), the newest comments, the followers' top countries, the RANKING (which posts engage best per view, with the ads that boosted them and the cost per engagement), and the FAN INBOX: comments asking the song's name or where to listen (needs_reply true when nobody of ours has answered: that is for Luke) and repeat fans (the same account on more than one post). Never reply, like, hide or delete a comment. HQ also logs the day's Instagram followers on the desk by itself. Not read-only: a fresh read can use one of the 3 Meta reads an hour, and post + song or our_accounts add/remove save on the desk.",
    inputSchema: obj({ bot: BOT,
      our_accounts: str("Optional. The list of OUR OWN accounts, whose comments never count (left out of the ranking, the fans' list and needs_reply). list = show it with its changes (anyone). add = leave a handle's comments out (team, family, friends, bots, spam); remove = count that handle's comments again. Only Nova changes it, always with handle and a short reason.", { enum: ["list", "add", "remove"] }),
      handle: str('With add or remove: the Instagram handle, like "@name".'),
      reason: str("With add or remove: a short reason (who it is and why), kept in the log with the date."),
      post: str("With song: the post id or the shortcode from its link. Steve, Forge or Nova sets which song this post is. Never guess it from the caption."),
      song: str("With post: the song's name, as it is on the release. Empty clears the link.") }, ["bot"]) },
  { name: "task_update", title: "Update or close one of my tasks", idempotent: true,
    description: 'Update ONE of YOUR OWN open tasks from my_day (open_tasks: the ids start with "T-"). status done = the task is really finished (say in note what was done, with the date or the link); blocked = you cannot go on (say in note exactly what is needed and from whom); working = you started it; todo = it is no longer blocked. The dashboard shows your word over the sheet\'s row straight away: done takes it off the open list, and a blocker you clear disappears. Never another bot\'s task (Nova may update anyone\'s). Daily duties (ids starting with "D-") are NOT tasks: finish or block those with post_update.',
    inputSchema: obj({ bot: BOT, task: str('The task id from my_day, for example "T-27".'),
      status: str("todo | working | blocked | done | cancelled (no longer needed: say why in note)", { enum: S.TASK_STATUS }),
      note: str("One line (240 characters at most). Required with blocked (what is needed and from whom) and cancelled (why). With done: what was done. No passwords or codes."),
      title: str("Optional: the task's corrected wording, shown on HQ instead of the sheet's (for example a wrong number in it).") }, ["bot", "task", "status"]) },
  { name: "read_messages", title: "Read messages", readOnly: true,
    description: 'Read the message board, newest first. show: mine (to you, to all, about you, answers to yours, or from you: the default), open (everything still waiting on someone), all (the whole board). Narrow it with since, from, to, about or search; unread: true gives only what came for you since you last read; id gives ONE message in full; count_only: true answers just "anything new for me?" cheaply (it does not count as reading). Reading without since/from/to/about/search/id counts as reading your messages.',
    inputSchema: obj({ bot: BOT, show: str("mine | open | all. Default mine.", { enum: ["mine", "open", "all"] }),
      limit: { type: "integer", description: "How many to return, 1 to 50. Default 20.", minimum: 1, maximum: 50 },
      since: str('Only messages written from then on: a day "YYYY-MM-DD" (from its start, São Paulo time) or "YYYY-MM-DD HH:MM" (São Paulo time).'),
      unread: { type: "boolean", description: "true = only the messages for you (to you, to all, or answering yours) written since you last read your messages." },
      from: str('Only messages from this name (a bot, "Luke" or "Claude").'),
      to: str('Only messages to this name, or "all".'),
      about: str("Only messages from OR to this name."),
      search: str('Only messages whose text has all these words, for example "11 Nov pitch". Capitals and accents do not matter.'),
      id: str("The id of ONE message (it starts with m): returns that message in full, whatever its age."),
      count_only: { type: "boolean", description: 'true = only say whether anything new came for you since you last read, and how many (no messages, and it does not count as reading).' } }, ["bot"]) },
  { name: "resolve_message", title: "Mark a message as handled", idempotent: true,
    description: "Close a message that was waiting on you (needs: action or reply) once you have done what it asked. Say in note what you did. A decision waiting on Luke can only be closed by Luke.",
    inputSchema: obj({ bot: BOT, id: str("The id of the message (it starts with m)."), note: str("One line: what you did.") }, ["bot", "id"]) },
  { name: "record_spend", title: "Record a day's ad spend",
    description: "FORGE (Nova may do it for him): ONE platform's spend for ONE day, exactly as the ad account shows it, in the account's own currency (never converted). 0 for a day with no ads. If you could not read it, send not_read with why (for example \"signed out\") instead of an amount: the dashboard lists it as missing and marks the month's total estimated. Sending the same day again with a new amount corrects it. The answer is the month so far against the USD 1,000 cap, worked out on the site with the team's fixed monthly rate: use that figure, never your own sum. song: only when this amount is for one song. Leave it out for the account total. Never guess a song from the campaign name, and never record the same money both ways.",
    inputSchema: obj({ bot: BOT, platform: str("Meta | Google | TikTok", { enum: S.SPEND_PLATFORMS }), account: str("The ad account's name as shown."),
      date: str("The day, YYYY-MM-DD. Or use days for several days in one call."), amount: { type: "number", description: "The day's spend as shown, for example 12.40. 0 for no ads." },
      currency: str("The account's three-letter currency: USD, EUR..."), not_read: str("Only when you could not read the amount: why, in a few words."),
      song: str("Optional. The song this amount is for. Leave it out when it is the account total: HQ then says not linked to a song."),
      workspace: str("Leave this out for BADSCANDAL. label = this spend belongs to a Label genre and is not in the USD 1,000 cap."),
      genre: str("Label only. The genre, for example UK garage."),
      alias: str("Label only. The alias, when this spend is for one alias."),
      days: { type: "array", description: "Optional. Several days in one call: each {date, amount, currency, song} or {date, not_read}.", items: { type: "object", properties: { date: { type: "string" }, amount: { type: "number" }, currency: { type: "string" }, not_read: { type: "string" }, song: { type: "string" } } } } }, ["bot", "platform"]) },
  { name: "log_growth", title: "Log a day's growth or song numbers",
    description: "STEVE, ATLAS, KEVIN, LAURA: ONE call per platform (Growth: followers, views, the best post) or per song (Songs: Spotify streams, listeners, saves, playlist adds) for ONE day, numbers exactly as shown. The change in followers is worked out for you. Anything you could not read: leave it out and name it in gaps with why (TikTok views come a day late; Instagram has no daily views on the web): your duty is marked done, with gaps, never blocked. Sending the same numbers again does nothing; a later call for the same day fills in what was missing. Put your duty id (D-...) in duty if you have more than one duty today. Account health, same tool: Steve, Kevin, Laura, Atlas and Webmaster can send account_status, visible, non_follower_share, recent_posts or site_ok without follower numbers. Atlas or Drop can send artificial_streams on Spotify. Atlas can send track_moved. A check on its own does not mark a growth duty done. Record only what the page showed. STEVE, a boost: send boosts. Each item is link (the post's https link), ad (that ad's id, not the ad account), spend (the amount that one ad has spent), currency (USD) and status (active or paused). Not the daily budget. Not the account's day total. Forge does not record this with record_spend. It is not added to the cap.",
    inputSchema: obj({ bot: BOT, date: str("The day the numbers are for, YYYY-MM-DD."),
      platform: str("For Growth: TikTok, Instagram, YouTube..."), account: str("For Growth: the account handle."),
      followers: str("Followers as shown, for example 1240 or 1,240. YouTube: use subscribers (followers is accepted too). A rounded figure like 1.7k is stored as approximate."), subscribers: str("YouTube: subscribers as shown. Stored as the follower number. 1.7k is approximate."), views: str("Views as shown, including 1.7k or 3.8k. A k or m figure is approximate and shown with a tilde. Not the channel's lifetime total."),
      change: str("Optional. The subscriber or follower change the page itself shows, like +1 or -2. When you send it, HQ keeps it instead of working one out."),
      late_read: { type: "boolean", description: "Optional. true when this count is a live reading, not the closed day. The next day's worked-out change is then approximate." },
      correct: { type: "boolean", description: "true = fix a wrong count." },
      views_date: str("The day those views are for, YYYY-MM-DD, when they arrive a day late (TikTok)."),
      channel_views: str("YouTube: the channel's lifetime views (the Official Artist Channel total), not the day's views. The page labels this Lifetime channel views."), shorts_views: str("Shorts or Reels views as shown."), watch_hours: str("YouTube: watch hours as shown. Decimals are kept (for example 56.6)."), monthly_listeners: str("Platform Spotify (Atlas): the artist's monthly listeners as shown in Spotify for Artists (17 Nov 2026)."), brazil_listeners: str("Platform Spotify: the monthly listeners in Brazil, as shown (Audience, Location)."), best_post: str("Optional. The day's best post, in a few words."), best_post_link: str("Optional. Its https link. YouTube may send video_id instead."),
      video_id: str("YouTube: the video id when there is no https link. Either this or best_post_link."),
      official_views: str("YouTube: views that day on the official channel. Not the lifetime total."),
      other_views: str("YouTube: views that day on other channels."),
      views_6h: str("TikTok: views at 6 hours."),
      follows_6h: str("TikTok: follows from the post at 6 hours."),
      follows_48h: str("TikTok: follows from the post at 48h."),
      avg_watch: str("TikTok: average watch time at 1 day, in seconds, decimals allowed."),
      avg_watch_6h: str("TikTok: average watch time at 6 hours, in seconds."),
      posts: { type: "array", description: "Optional. The day's posts, one fixed window per column. Each: date, hook, views_24h, views_7d, likes, comments, saves, shares, follows, follows_6h, follows_48h, avg_watch, link or video_id, boosted true or false. Leave a number out when you could not read it. Do not send 0 for a number you did not see.", items: { type: "object" } },
      boosts: { type: "array", description: "Steve. Each: link, ad, spend, currency, status, started, follows, engagements, views, link_clicks, as_of. Cost per follow is spend / follows when follows is above 0.", items: { type: "object", properties: { link: { type: "string" }, ad: { type: "string" }, spend: { type: "number" }, currency: { type: "string" }, status: { type: "string" }, started: { type: "string" }, follows: { type: "number" }, engagements: { type: "number" }, views: { type: "number" }, link_clicks: { type: "number" }, as_of: { type: "string" } } } },
      top_videos: { type: "array", description: "YouTube: the top 3 videos that day. Each: title, views, and link or video_id. 3 at most.", items: { type: "object" } },
      fan_signals: { type: "array", description: "TikTok (Kevin): fan signals, the same idea as the Instagram fan inbox. Each: handle, quote, link, about, engage. 8 at most. Leave one out when you did not see it.", items: { type: "object" } },
      pattern: str("Optional. One line on what worked, for the week card. Only what you actually saw."),
      ad_spend: str("Optional. Ad spend for this platform that day, the amount shown."),
      ad_currency: str("Optional. The currency of ad_spend, a 3-letter code."),
      paid_views: str("Optional. Paid views that day, as shown."),
      organic_views: str("Optional. Organic views that day, as shown."),
      ads_read_at: str("Optional. When the ads numbers were read, YYYY-MM-DD or YYYY-MM-DD HH:MM."),
      song: str("For Songs: the song's title."), streams: str("Spotify streams for that day."), listeners: str("Spotify listeners."), saves: str("Saves."), playlist_adds: str("Playlist adds."),
      gaps: { type: "object", description: 'What could not be read, and why: {"views": "TikTok shows them a day late"}.', additionalProperties: { type: "string" } },
      duty: str('Optional. Your duty id from my_day (it starts with "D-").'),
      workspace: str("Leave this out for the official BADSCANDAL accounts. farm = a Social Farm page. label = that genre's streams or listeners. Neither is written to BADSCANDAL Growth."),
      farm: str("With workspace farm: account (the page) or post."),
      handle: str("Farm: the handle, without the @."),
      niche: str("Farm account: the niche or content type."),
      page_status: str("Farm account: active, paused, restricted or banned. This is the account's health."),
      songs: str("Farm account: which of our songs it uses, separated by commas."),
      content_type: str("Farm post: the content type."),
      likes: str("Farm post: likes, as shown. Leave it out if you could not read it."),
      shares: str("Farm post: shares, as shown."),
      saves_count: str("Farm post: saves, as shown. saves on an official song row is unchanged."),
      follows: str("Farm post: follows from this post, as shown."),
      post_link: str("Farm post: the https link."),
      genre: str("Label: the genre, for example UK garage."),
      alias: str("Label: the alias, when you know it."),
      direction: str("Label trend: rising or falling."),
      research: str("Label: a candidate genre for the research list."),
      account_status: str("What that platform's own Account Status, Account Check or Studio page says: clear, restricted, strike, copyright, ineligible or age. Record only the word the page uses."),
      status_note: str("Optional. The page's own words, one line. Needs account_status."),
      visible: str("A check you did by hand: yes, no or unknown. There is no official API for hashtag, For You or Explore."),
      visible_where: str("Where you looked: For You, Explore, a hashtag, or the words the app used."),
      non_follower_share: str("Percent of views from people who do not follow, only when the page shows it (for example 42). Leave it out when it does not."),
      recent_posts: { type: "array", description: "The last few posts (on Spotify: the last few tracks), 12 at most. Each one: at (YYYY-MM-DD, the day it went out) and views or reach (on Spotify: streams), as shown.", items: { type: "object", properties: { at: { type: "string" }, views: { type: "string" }, reach: { type: "string" } } } },
      artificial_streams: str("Spotify only. Atlas or Drop: an artificial-streams warning, in the words on the screen. Never guess one."),
      track_moved: str("Spotify only. Atlas: a track he saw on another profile, named as shown."),
      moved_to: str("Spotify only. The other profile's name, when Atlas saw it. Needs track_moved."),
      site_ok: str("Webmaster only, platform badscandal.com: yes or no, as the page answered."),
      site_note: str("Webmaster only. One line about what the page showed. Needs site_ok."),
      monetisation: str("YouTube only. What Studio shows: on, limited or off. Leave it out when Studio did not show it.") }, ["bot", "date"]) },
  { name: "read_growth", title: "Read growth rows", readOnly: true,
    description: "STEVE, ATLAS, KEVIN, LAURA (Nova too): the growth rows already on the desk. Read only. Filter with platform, date or song. A missing number was not logged. It is not zero. channel_views is the lifetime total. views is that day's views. YouTube's count is subscribers. TikTok fan_signals are on the TikTok rows. boosts lists a post Steve logged as boosted. how_to_log_a_boost says what to send: link, ad, spend, currency, status.",
    inputSchema: obj({ bot: BOT, platform: str("Optional. TikTok, Instagram, YouTube or Spotify."), date: str("Optional. One day, YYYY-MM-DD."), song: str("Optional. A song title, for the Songs rows.") }, ["bot"]) },
  { name: "team_board", title: "The whole team right now", readOnly: true,
    description: "Every bot with today's duties (done, to do, late, blocked), its latest update, what it says it is working on, what is waiting on it, and when it last used this desk; every release with its late steps and warnings, and what Spotify for Artists showed in Atlas's last report. For Nova's standup, the 12:00 chase and the 21:00 wrap-up.",
    inputSchema: obj({ bot: BOT }, ["bot"]) },
  { name: "luke_briefing", title: "What Luke needs to hear", readOnly: true,
    description: "For Alfred's 10:00 message and for alerts. For Alfred it also gives every new message for him since his last read (messages_for_you). Returns the site's latest check (three times a day), Claude's latest note for Luke, every decision waiting on Luke with its options, ad spend against the monthly cap (one figure only, as of the time in this answer), the next release and what is late, the songs Spotify for Artists shows as upcoming that are not in the pipeline (Luke has to say what they are), and which bots have not logged. Money is no longer on HQ: income_this_month only says so. Report it; do not add numbers of your own.",
    inputSchema: obj({ bot: BOT }, ["bot"]) },
  /* batch 5 (15 Nov 2026): Alfred's SHORT briefing, a separate tool so luke_briefing stays exactly as it is */
  { name: "luke_short_briefing", title: "Luke's short briefing", readOnly: true,
    description: "For a SHORT message to Luke (Alfred). Three things, ready to say: ad spend against the monthly cap (with the rate and what was not read), the top 3 decisions waiting on Luke by deadline (the soonest first; how many more), and ONE list of everything that needs Luke to sign in (codes, logins, signed-out accounts). It hands over no messages: luke_briefing is the full one. Say it as given; \"not read\" is never 0.",
    inputSchema: obj({ bot: BOT }, ["bot"]) },
  { name: "set_my_card", title: "Say what I am working on", idempotent: true,
    description: "Update your card on the dashboard's Team page. working_on is optional: leave it out to keep what you last said, so you can clear only a blocker (blockers \"\"). needs is what you need and from whom. A blocker not said again for 48 hours is shown as old and drops off the headline: send it again if it still stands.",
    inputSchema: obj({ bot: BOT, working_on: str("Optional. What you are working on now, plain words (400 characters at most). Leave it out to keep the last one. \"\" clears it."), needs: str("Optional. What you need and from whom. Empty if nothing. Say it again each day it still stands: after 2 days without a new card it stops showing as an ask."),
      blockers: str('Optional. Your known blockers as they are NOW (300 characters at most). "" (empty) = nothing stands in your way any more: it clears the blocker written in your profile (my_day: your_known_blockers). Leave it out to keep the last one. You can send blockers on their own, with no working_on.') }, ["bot"]) },
  { name: "releases", title: "Releases and my steps", readOnly: true,
    description: "Every release Luke has sent to the team that is coming up or came out in the last 14 days: the song, its release day, how many days to go, where it is at, its warnings, whose release it is (self-release or with a label), what is still missing from its pack, and YOUR steps for it with their due dates and state (to do, working, late, blocked, done, waiting, skipped). waiting = it can't start yet (the pitch waits until the song shows in Spotify for Artists); skipped = it does not apply (the label delivers it). Call it when my_day lists release steps for you, or when Nova asks about a release.",
    inputSchema: obj({ bot: BOT, workspace: str("Leave this out for BADSCANDAL. label = the Label covers (pack, then licence, then Drop's upload, then Atlas's pitch). They are not BADSCANDAL releases. The licence step shows waiting on licence or licensed, with a proof link.") }, ["bot"]) },
  { name: "release_pack", title: "Everything about one release", readOnly: true,
    description: "The whole pack of ONE release: every field with its label (the master WAV link, the artwork link, the lyrics in full, the writers, the details for RouteNote, the pitch notes, ISRC, UPC...) and every step with its owner, due date and state. Use it before you work on a release step: everything you need should be here. If something you need is missing: mark your step blocked with release_step, naming the field, and send Luke ONE message naming the field (only once, not every run).",
    inputSchema: obj({ bot: BOT, song: str('The song\'s title or its id, for example "Me Dá Seu Body" or "medaseubody". Accents and capitals do not matter.') }, ["bot", "song"]) },
  { name: "release_step", title: "Mark one of my release steps",
    description: "Mark ONE of YOUR OWN steps of a release (from my_day or releases). status working = you started it. status done = it is really done in the store or on the platform (uploaded, approved, pitched, live), NOT \"started\" and NOT \"I asked someone\"; put the link that proves it in link when there is one. status blocked = you cannot go on: say in note exactly what is needed and from whom. status todo = undo a mistake. status skipped = the step does not apply to this release (Nova only, with the reason in note). A step that is \"waiting\" (the pitch, until the song shows in Spotify for Artists; the ads, until the song page is live; the lyrics, until the release day) cannot be marked done yet. The step spotify (Showing as upcoming in Spotify for Artists) is done by Atlas's spotify_upcoming report, not by this tool (the staff guide's Atlas part names the only two exceptions). Never mark another bot's step (Nova only: when the owner told you it is done and cannot reach the desk; say so in the note). This also writes a line in the live log Luke sees. Label covers only: the steps are pack, then licence, then Drop's upload, then Atlas's pitch. Pass workspace label. The licence step shows waiting on licence until it is licensed, with a proof link. Status for that step is todo, ordered_waiting_luke, paid, licensed or flagged. Only the Licence bot (bot \"Licence\") or Nova can mark it, and only after the pack is ready and Luke has said yes for that song. HQ does not take payment. Drop's upload stays blocked until the licence is licensed. A BADSCANDAL release has no licence step. To read the queue or mark one licensed with only a proof link, use licence_queue.",
    inputSchema: obj({ bot: BOT, song: str("The song's title or its id."),
      step: str(`Which step: ${S.RELEASE_STEPS.map((s) => `${s.key} (${s.label}, ${s.owner})`).join("; ")}; pack (Release pack ready, Nova) — Label covers only; licence (Mechanical licence, Easy Song Licensing, Licence) — Label covers only, after the pack and before upload.`, { enum: [...S.RELEASE_STEPS.map((s) => s.key), "pack", "licence"] }),
      status: str("BADSCANDAL: working | done | blocked | todo | skipped (skipped: Nova only). Label licence: todo | ordered_waiting_luke | paid | licensed | flagged.", { enum: [...S.STEP_STATUS, "ordered_waiting_luke", "paid", "licensed", "flagged"] }),
      note: str("Optional, except with blocked: then say exactly what is needed and from whom. One or two lines, no passwords or codes."),
      link: str("Optional. An https link that shows it is done (the store page, the pitch, the post, the video, the song page). It is kept and shown to everyone."),
      done_on: str("Optional, only with status done: the day it was really done, YYYY-MM-DD, when that was before today (for example the upload was done before the pack reached the desk)."),
      workspace: str("Leave this out for a BADSCANDAL release. label = a Label cover."),
      esl_order_number: str("Label licence: the Easy Song Licensing order number. HQ does not pay it."),
      licence_pdf_url: str("Label licence: the https link to the licence PDF."),
      drive_folder_url: str("Label licence: the https link to the Drive folder for this cover."),
      original_title: str("Label licence: the title of the song being covered."),
      original_writers: str("Label licence: the original writers, if known."),
      original_publisher: str("Label licence: the original publisher, if known."),
      flag_reason: str("Label licence: required when status is flagged. What is wrong."),
      s4a: { type: "boolean", description: "Label pitch: true once the alias has Spotify for Artists access." } }, ["bot", "song", "step", "status"]) },
  { name: "open_case", title: "Open a dispute or moderation case",
    description: "Open ONE case the team is handling: a RouteNote moderation email, a YouTube Content ID claim, a dispute, a DSP takedown, a distributor issue, or another copyright problem. Say what is wrong in issue: Luke sees it first. status starts at open. Set waiting_on to who or what you are waiting for, and next_check to the next day you will look (YYYY-MM-DD). recommendation is one plain paragraph. proposal is the reply you want Luke to approve (the email draft, or the dispute text). You never set Luke's decision. HQ does not send the email or file the dispute.",
    inputSchema: obj({ bot: BOT,
      song: str("The song's title."),
      platform: str("Who the case is with: RouteNote, YouTube, Spotify, or another store or distributor."),
      type: str("moderation | Content ID claim | dispute | takedown | other."),
      owner: str("Optional. The bot who carries it. Leave it out to own it yourself. Only Nova may name another bot."),
      opened: str("Optional. The day it started, YYYY-MM-DD. Leave it out for today."),
      status: str("Optional. open | waiting on them | waiting on Luke | waiting on bot | resolved. Ignored is Luke's, on the dashboard."),
      waiting_on: str("Optional. Who or what you are waiting for, in a few words."),
      next_check: str("Optional. The next day you will look, YYYY-MM-DD."),
      recommendation: str("Optional. One plain paragraph: what you recommend and why."),
      proposal: str("Optional. The reply or dispute text you want Luke to approve, as he would send it."),
      issue: str("What is wrong, one sentence."),
      entry: str("Optional. One short line for the timeline.") }, ["bot", "song", "platform", "type"]) },
  { name: "update_case", title: "Update a dispute case",
    description: "Update ONE case you own (Nova may update any). id from read_cases. Set song, status (open, waiting on them, waiting on Luke, waiting on bot, solved - confirm, resolved), waiting_on, waiting_since (when the wait started), next_check (YYYY-MM-DD), recommendation, proposal, entry (one timeline line; entry_date is its YYYY-MM-DD), or timeline (replaces the whole timeline; only the bot who opened the case). Put status waiting on Luke when he has to decide. Put status solved - confirm when it is solved and he only has to confirm. When it is resolved, say how it ended in outcome. You cannot set his decision, and you cannot mark a case ignored.",
    inputSchema: obj({ bot: BOT,
      id: str("The case id from read_cases."),
      song: str("Optional. The song title, when the old one is wrong."),
      status: str("Optional. open | waiting on them | waiting on Luke | waiting on bot | solved - confirm | resolved."),
      waiting_on: str("Optional. Who you are waiting for. Empty clears it. Say Luke, not A human."),
      waiting_since: str("Optional. When this wait started, YYYY-MM-DD or an ISO time. Stored on the case. It does not add a timeline line."),
      next_check: str("Optional. YYYY-MM-DD. Empty clears it."),
      recommendation: str("Optional. One paragraph. Replaces the previous one."),
      proposal: str("Optional. The reply you want approved. Replaces the previous one."),
      issue: str("Optional. What is wrong."),
      outcome: str("Optional. How it ended."),
      entry: str("Optional. One timeline line."),
      entry_date: str("Optional. YYYY-MM-DD for entry. Shown instead of the save time."),
      timeline: { type: "array", description: "Optional. Opening bot only. Replaces the timeline. Each: text, date (YYYY-MM-DD), by.", items: { type: "object", properties: { text: { type: "string" }, date: { type: "string" }, by: { type: "string" } } } } }, ["bot", "id"]) },
  { name: "read_cases", title: "Read dispute cases", readOnly: true,
    description: "The dispute cases on Songs. Filters: status, song, owner, needs_luke (true = only cases waiting on Luke). Each case includes the timeline, the recommendation, the proposal, and Luke's decision when he has made one (choice, text, at). You cannot set that decision. When status is waiting on bot, do what the decision says, then update_case. A claim_id is the Content ID claim this case came from.",
    inputSchema: obj({ bot: BOT,
      status: str("Optional. open | waiting on them | waiting on Luke | waiting on bot | resolved | ignored."),
      song: str("Optional. Only this song. The title. Accents and capitals do not matter."),
      owner: str("Optional. Only this bot's cases."),
      needs_luke: { type: "boolean", description: "Optional. true = waiting on Luke, or solved and waiting for his confirm." } }, ["bot"]) },
  { name: "delete_case", title: "Delete a TEST dispute case",
    description: "Delete a case only when its platform is TEST, and only if you opened it. A real case cannot be deleted. Read the id with read_cases. Nothing else is removed.",
    inputSchema: obj({ bot: BOT, id: str("The case id from read_cases.") }, ["bot", "id"]) },
  { name: "licence_queue", title: "Label licence queue",
    description: "For the Licence bot. With no song: the Label covers whose release pack is ready and whose licence is not done. Each one says waiting on licence. Licensed covers are listed separately with their proof link. To mark one licensed: pass song and proof_link (an https link to the licence saved with the song and the assets in Google Drive). Do this only after Luke has said yes for that song. Nova records that yes with luke_said (Luke's exact words) and the song; the Licence bot cannot record the yes. Never pass an amount, a card or a bank detail: HQ does not take payment. You report to Nova only.",
    inputSchema: obj({ bot: BOT,
      song: str("The cover's title or its id. Leave it out to read the queue."),
      proof_link: str("The https link that proves the licence is saved (the Drive folder or the licence PDF). Required to mark one licensed."),
      luke_said: str("Nova, Claude or Luke only: Luke's exact yes for this one cover. The Licence bot cannot record this.") }, ["bot"]) },
  { name: "content_ideas", title: "Content ideas for Nova",
    description: "For Spark, once a day around 10:00 São Paulo. With no ideas: the latest ideas already on the desk. To send today's: posts (the official ones you ranked, whose \"ours\", plus similar artists' outlier posts, whose \"similar\") and ideas (3 to 5). Each post needs platform (Instagram, TikTok or YouTube), views, and likes, comments, saves and shares. Engagement per view is (likes + comments + saves + shares) / views. The best official post is the highest of those. Each idea needs hook, text (the on-screen text), format, platform and why. Optional on an idea: song, market, source (https), score, status (idea, shot or posted), and once posted: views, epv, verdict (won, flat or lost) and why_won. Optional next_song: when an official post beats the others, HQ adds one next-idea card with the same recipe. If next_song is left out, the song on that card is not reported. A post may include at (YYYY-MM-DD) so the page can compare with a 14-day average. You report to Nova only. Never post, comment, send a DM, or touch an ad. HQ only stores the ideas.",
    inputSchema: obj({ bot: BOT,
      posts: { type: "array", description: "The posts you ranked. Each: platform, title, views, likes, comments, saves, shares, whose (ours or similar), an optional https link, and an optional at (YYYY-MM-DD).", items: { type: "object" } },
      ideas: { type: "array", description: "3 to 5 ideas. Each: hook, text, format, platform, why. Optional: song, market, source, score, status (idea, shot, posted), views, epv, verdict, why_won.", items: { type: "object" } },
      next_song: str("Optional. The next song for an auto idea, when a post beat the average. Leave it out if you do not know it: HQ does not invent a title."),
      compared: str("Optional. One line on the similar artists' outlier posts you compared. No lyrics.") }, ["bot"]) },
  { name: "release_fill", title: "Fill one field of a release pack",
    description: `Fill ONE field of a release pack that you are responsible for, once you have the real value: ${S.PACK_FIELDS.filter((f) => f.fill.length).map((f) => `${f.key} (${f.short}): ${f.fill.join(" or ")}`).join("; ")}. Nova may fill any of these. Copy the value exactly as the store or platform shows it; links must start with https://. Every other field is filled by Luke on the dashboard: if one is wrong or missing, send Luke a message.`,
    inputSchema: obj({ bot: BOT, song: str("The song's title or its id."),
      field: str("Which field.", { enum: S.PACK_FIELDS.filter((f) => f.fill.length).map((f) => f.key) }),
      value: str("The value, exactly as shown in the store or platform (for lyrics: the whole text, line by line).") }, ["bot", "song", "field", "value"]) },
  /* 16 Nov 2026 (Luke: "they should be able to add edit and change upcoming songs and should always ask me if
     something is correct before making the addition") */
  { name: "propose_release", title: "Propose a new song, or changes to one (Luke confirms first)", idempotent: false,
    description: "Add a song to the releases, or change one that is on the desk (its title, its release day, or any field of its pack: the deal, links, store details, ISRC, UPC, status at the distributor...). NOTHING changes yet: Luke is asked ONE question, \"is this correct?\", with every change listed from and to, and the answers Yes, correct / No. Only his \"Yes, correct\" makes the change, in his name (on the dashboard, or through Alfred or Nova when he tells them yes); you are told on the desk when it is done, or why not. New song: give title (and date, and the pack fields you know). Change: give song (its title or id) and only what changes. send true = once he says yes, also send it to the team (needs the release day). Copy values exactly as the store, contract or Luke wrote them; never guess one. Explain in why where the information comes from (\"Luke said yes in chat at 11:40\", \"RouteNote shows UPC ...\"). One open question per song: wait for Luke's answer before asking again.",
    inputSchema: obj({ bot: BOT,
      song: str("To CHANGE a song on the desk: its title or id. Leave empty to ADD a new song."),
      title: str("A new song's title, or the new title of the song you change."),
      date: str("The release day, YYYY-MM-DD (for a new song, or the new day of the song you change)."),
      pack: { type: "object", description: `The fields to set, each with its value (an empty value clears one), for example {"upc": "...", "featuring": "..."}. The fields: ${S.PACK_FIELDS.map((f) => `${f.key} (${f.short})`).join(", ")}.`, additionalProperties: { type: "string" } },
      send: { type: "boolean", description: "true = once Luke says yes, also send it to the team (needs the release day)." },
      why: str("Where this comes from, in one line (400 characters at most).") }, ["bot"]) },
  /* 16 Nov 2026 (Luke: "a tool that can allow webmaster to use this without my computer") */
  { name: "song_page", title: "Make a song page, or put its Spotify link on it (Luke confirms first)", idempotent: false,
    description: "WEBMASTER (Nova may ask for him). Song pages (badscandal.com/<address>) are built by GitHub, not on Luke's Mac. kind new = a new song's page: address (slug: lowercase letters and digits, for example loveyou), title exactly as in the stores, date (the release day, YYYY-MM-DD) and cover (an https link to the square cover picture: a Dropbox link is fine, a Google Drive link only when it is shared \"Anyone with the link\", or it answers with a sign-in page). It shows a countdown and Follow on Spotify until release day, the Meta pixel and HQ's Pages count it by themselves. kind track = release day: the song's Spotify link (https://open.spotify.com/track/<id>, nothing after the id) so the button says Listen on Spotify. kind card = put a song that has its page on the home card (badscandal.com): the rule is in song_pages (a song out in the last 7 days, the newest; else the next one coming). NOTHING happens yet: Luke is asked \"is this correct?\" with Yes, correct / No. On his yes GitHub builds the page, runs the song-page checks and puts it live in about 2 minutes; if a check fails nothing goes live and you get a \"Not done\" message with the reason (song_pages shows it too). You get a message on the desk either way; then open the page to make sure, and mark your release step done with its link.",
    inputSchema: obj({ bot: BOT,
      kind: str("new | track | card", { enum: ["new", "track", "card"] }),
      slug: str("The address after badscandal.com/, lowercase letters and digits (for example loveyou)."),
      title: str("kind new: the song's title exactly as in the stores."),
      date: str("kind new: the release day, YYYY-MM-DD."),
      cover: str("kind new: an https link to the cover picture (a square JPG or PNG, 3000 x 3000)."),
      artists: str("kind new, optional: the artist line when it is not badscandal alone, for example \"Badscandal & Someone\"."),
      track: str("kind track: https://open.spotify.com/track/<id>. ?si= is removed for you."),
      isrc: str("kind track, optional: the track's ISRC. If it does not match the pack, the answer says so."),
      why: str("Optional: where this comes from, in one line.") }, ["bot", "kind", "slug"]) },
  /* 16 Nov 2026 (Luke: "let's do webmasters 3 fixes") */
  { name: "song_pages", title: "What happened to each song-page request, and the home card", readOnly: true,
    description: "WEBMASTER (read only). Every song_page request of the last two months, newest first, and where it is: waiting on Luke, Luke said no, not sent (and why), sent to GitHub (not live yet), built (going live), not done (GitHub's build stopped: where and why), or live. Plus the home card: what it shows now, and which song the rule says it should show today (a song out in the last 7 days, the newest; else the next song coming out). Call it before asking again, so nothing is asked twice; when should_show differs from now, ask with song_page kind card.",
    inputSchema: obj({ bot: BOT }, ["bot"]) },
  { name: "upload_cover", title: "Put a cover on the desk and get its public link", idempotent: false,
    description: "WEBMASTER (Nova may for him). For song_page's cover when the picture is not on a public link (a Google Drive file answers with a sign-in page). Send the picture itself as image_base64 (a JPG, PNG or WebP, a square 3000 x 3000, 4 MB at most), or url = a link the site can open without signing in. The answer is a public https://badscandal.com/... link: use it as cover in song_page. Nothing else changes, and Luke still confirms the page.",
    inputSchema: obj({ bot: BOT, song: str("Which song the cover is for (its title)."),
      image_base64: str("The picture file itself, base64 (a data: prefix is fine). Or leave it empty and give url."),
      url: str("Instead of image_base64: an https link to the picture that opens without signing in.") }, ["bot", "song"]) },
  /* 17 Nov 2026 (Nova): job cards fixed on the desk */
  { name: "roster_card", title: "Fix a bot's job card", idempotent: false,
    description: "NOVA only. Correct a bot's job card on the desk (what my_day tells it): duty, why, usual time (HH:MM São Paulo), schedule (up to 8 lines {time, what}) or role. Use it when a card is out of date (for example a duty that moved to another bot). Only what you send changes; it stays when the private seed is loaded again.",
    inputSchema: obj({ bot: BOT, for: str("Whose card: the bot's name."), duty: str("Optional: the daily duty, one line."), why: str("Optional: why the bot is needed."),
      time: str("Optional: usual time, HH:MM."), role: str("Optional: the role, a few words."),
      schedule: { type: "array", description: 'Optional: the whole schedule, replacing the old one: [{"time": "09:20", "what": "..."}].', items: { type: "object", properties: { time: { type: "string" }, what: { type: "string" } }, additionalProperties: false } } }, ["bot", "for"]) },
  { name: "store_status", title: "Where a song is at the distributor",
    description: "DROP (Nova may do it for him): say where ONE release is at the distributor, each time it changes: not uploaded, uploaded, in moderation, rejected, resubmitted, approved, delivered, live (RouteNote's \"Pending Moderation\" or \"In review\" = in moderation, \"Action needed\" = rejected). To fill in history, give each change with on = the day it happened, in any order: the history is kept in day order and the newest day is the status now. Every change is kept as its history (the moderation log Luke sees). With rejected, put what RouteNote said, in its words, in reason. When a rejected song is fixed and ready to go again, call it with status rejected and ready_to_resubmit true (and what changed in note): Luke is asked Yes, resubmit / Not yet, and his answer comes back to you in my_day. Do not resubmit before he says yes. Before you distribute, resubmit, or reply to moderation, call my_day with luke_tap for that card's action and version.",
    inputSchema: obj({ bot: BOT, song: str("The song's title or its id."),
      status: str(S.STORE_STATUS.join(" | "), { enum: S.STORE_STATUS }),
      reason: str("Required with rejected: what RouteNote said, in its words (300 characters at most)."),
      note: str("Optional. One line, for example what you changed before resubmitting."),
      on: str("Optional. The day it happened, YYYY-MM-DD, when not today."),
      ready_to_resubmit: { type: "boolean", description: "Only with status rejected: the song is fixed; ask Luke whether to resubmit it." } }, ["bot", "song", "status"]) },
  { name: "spotify_upcoming", title: "Report what Spotify for Artists shows as upcoming", idempotent: true,
    description: "Atlas, once a day (Nova may report for him): open Spotify for Artists, Music, Upcoming, and send EVERYTHING listed there right now, one entry per song: title exactly as shown, release date as YYYY-MM-DD, and shown_as = the artist line and the label or distributor text exactly as shown. Each report REPLACES the last one, so always send the whole list (20 at most). If nothing is upcoming there, send an empty list: that is a real report (\"I looked; nothing is upcoming\"). If you could NOT open Spotify for Artists, do NOT call this: post_update with status blocked and say why. A song in the pipeline that shows there gets its step \"Showing as upcoming in Spotify for Artists\" done automatically (that opens the Spotify pitch); a song that is not in the pipeline becomes a question for Luke. Example: releases [{\"title\": \"Night Drive\", \"date\": \"2026-12-11\", \"shown_as\": \"BADSCANDAL · RouteNote\"}].",
    inputSchema: obj({ bot: BOT,
      releases: { type: "array", maxItems: 20, description: "Everything Spotify for Artists lists under upcoming releases right now. [] when nothing is listed.",
        items: { type: "object", properties: { title: str("The title exactly as Spotify for Artists shows it."), date: str("Its release date, YYYY-MM-DD."),
          shown_as: str("Optional. The artist line and the label or distributor text, exactly as shown."),
          copy_uri: str("Optional. The song's https copy link, if Spotify for Artists shows one.") }, required: ["title", "date"], additionalProperties: false } },
      note: str("Optional. One line, for example \"two songs are on another artist's profile\".") }, ["bot", "releases"]) },
  { name: "pitch_log", title: "Record a Spotify pitch or an editorial playlist", idempotent: true,
    description: "ATLAS (Nova may record it for him). HQ never pitches a song and never changes anything on Spotify: you send the pitch yourself in Spotify for Artists, then record it here. pitched_on = the day you sent the pitch (YYYY-MM-DD). That marks \"Spotify pitch sent\" done on that day. A song the one-pitch rule skipped (another song is pitched in the same two weeks) cannot be recorded as pitched. playlist + added_on = an editorial playlist you saw the song on in Spotify for Artists, once the song is out: the playlist's name exactly as shown, and the day it was added. Log each NEW editorial playlist the day you see it. The same song, playlist and day again changes nothing. Example: song \"Night Drive\", pitched_on \"2026-11-27\". Example: song \"Night Drive\", playlist \"Dance Rising\", added_on \"2026-12-12\".",
    inputSchema: obj({ bot: BOT, song: str("The song's title or its id."),
      pitched_on: str("Optional. The day you sent the Spotify pitch, YYYY-MM-DD."),
      playlist: str("Optional. An editorial playlist's name, exactly as Spotify for Artists shows it."),
      added_on: str("With playlist: the day the song was added to that playlist, YYYY-MM-DD.") }, ["bot", "song"]) },
  { name: "profiles", title: "Profile photos and banners",
    description: "ATLAS (Spotify, Apple Music, SoundCloud, Deezer, Amazon Music, TIDAL), LAURA (YouTube), STEVE (Facebook), KEVIN (TikTok). Nova may do it for them. Instagram is Luke's: he uploads that photo. X has no owner yet: only Luke, Claude or Nova. action list = every platform, the image that is live, the day it changed, the size rule, a new image waiting for Luke, and one he already said yes to. action record = the image that is LIVE now (you saw it on the platform): platform, image, link (https), changed (YYYY-MM-DD, the day it last changed). action propose = a NEW image: the same, plus width, height, format and size_mb when the rule needs them. It is checked against the rule first. A bad file is not asked. Luke is asked \"Yes, correct\" or \"No\". Only after yes do you upload it yourself, by hand, and then record it. HQ never logs in and never changes a platform. A master that does not fit a platform is not cropped: use profile_jobs.",
    inputSchema: obj({ bot: BOT,
      action: str("list | record | propose. Default list.", { enum: ["list", "record", "propose"] }),
      platform: str("Facebook, Instagram, YouTube, Spotify, Apple Music, TikTok, X, SoundCloud, Deezer, Amazon Music or TIDAL."),
      image: str("Which image: profile, photo, header, banner, cover, background, or the id (spotify-header). Leave it out when the platform has only one."),
      link: str("The https link to the image. For record, the one that is live. For propose, the new one."),
      changed: str("With record: the day that live image last changed, YYYY-MM-DD, or \"unknown\"."),
      changed_on: str("Same as changed."),
      platform_filter: str("With list: only this platform. \"Facebook\" and \"Facebook Page\" are the same."),
      width: { type: "number", description: "With propose, when the image has a size rule: width in px." },
      height: { type: "number", description: "With propose, when the image has a size rule: height in px." },
      format: str("With propose, when the image has a size rule: jpg, png, gif or whatever the file is."),
      size_mb: { type: "number", description: "With propose, when the rule has a size limit: the file's size in MB." },
      why: str("Optional, with propose: one line on why this image.") }, ["bot"]) },
  { name: "account_health", title: "Read account health", readOnly: true,
    description: "Read only. The account-health picture HQ already has (Instagram, TikTok, YouTube, Spotify, the site). Nothing is fetched from a platform and nothing is written. Steve, Kevin, Laura, Atlas, Drop and Webmaster (Nova too). Use this instead of guessing, and instead of opening the platform in a browser.",
    inputSchema: obj({ bot: BOT }, ["bot"]) },
  { name: "needs_you", title: "What needs Luke right now (the count on his phone)", readOnly: true,
    description: "Read only. What is waiting on Luke, counted the way his phone and his app badge count it: total = messages waiting on him (decisions, lyrics and pitch approvals, replies, actions) + Spotify for Artists songs only he can name + his open Yes/No/Edit cards (open; in quiet hours most wait in held_until_morning) + accounts whose health is red. waiting lists each one. Alerts like a late step are not in total. Nothing is changed. Use this to see what is waiting before you ask again.",
    inputSchema: obj({ bot: BOT }, ["bot"]) },
  { name: "read_guide", title: "Read the staff guide", readOnly: true,
    description: "The written guide to this desk: who does what, the daily times, how messages work, the rules that never bend. Read it once when you are first connected, and again whenever Nova says it changed.",
    inputSchema: obj({ bot: BOT }, ["bot"]) },
  { name: "profile_jobs", title: "List the profile images waiting on you", readOnly: true,
    description: "ATLAS (Spotify, Apple Music, SoundCloud, Deezer, Amazon Music, TIDAL), LAURA (YouTube), KEVIN (TikTok), STEVE (Facebook). Nova sees every job. kind rework = Luke's master is the wrong shape or too small: make an AI version at the exact size, exactly like his (nothing cropped or changed), then profile_rework. kind upload = Luke uploaded and the public profile has no live check since: log in, put it up, screenshot the profile, profile_uploaded result live. kind retry = Luke pressed Try again: do the same now. HQ never logs in and never sends a file to a platform. Reading this list changes nothing.",
    inputSchema: obj({ bot: BOT }, ["bot"]) },
  { name: "profile_master", title: "Download a profile master and its target size", readOnly: true,
    description: "The master Luke uploaded, and the size a platform needs. kind = photo or banner, or slot = the id from profile_jobs (for example spotify-header). url is not public: open it with the same Authorization header you use for the connector. The answer has the exact width and height. HQ never logs in and never sends the file to a platform.",
    inputSchema: obj({ bot: BOT,
      kind: str("Optional. photo or banner, when you want the whole master."),
      slot: str("Optional. The id from profile_jobs, for example youtube-banner. Use this when you are making one platform's file.") }, ["bot"]) },
  { name: "profile_rework", title: "Upload a reworked profile image", idempotent: true,
    description: "Upload the file you made for ONE platform. slot = the id from profile_jobs. image_base64 = the picture itself, a JPG or PNG at the EXACT width and height in the job, under that platform's size limit. A file of any other size is refused and not stored, and Luke is told. It must look exactly like Luke's master. HQ never logs in and never sends this file to a platform.",
    inputSchema: obj({ bot: BOT,
      slot: str("The id from profile_jobs, for example spotify-header."),
      image_base64: str("The picture itself, base64. A JPG or PNG at the exact size the job names.") }, ["bot", "slot", "image_base64"]) },
  { name: "profile_uploaded", title: "Record what the public profile shows", idempotent: true,
    description: "After YOU log in and put Luke's image up, open the PUBLIC profile and record what it shows, with a screenshot of that image. result live = it shows Luke's current upload (this alone turns his ring green). not_mine = it shows another image (screenshot required). login = you could not log in: say what happened in note, then sort it out with Luke in your own chat; once it works, upload, check and record live. failed = the upload did not work (note). None of these messages Luke: he sees them on HQ. rejected true (old) = the platform refused it: Luke is asked. HQ never logs in and changes nothing on the platform.",
    inputSchema: obj({ bot: BOT,
      slot: str("The id from profile_jobs, for example youtube-banner."),
      result: { type: "string", enum: ["live", "not_mine", "login", "failed"], description: "What you saw. Default live." },
      screenshot_base64: str("A JPG or PNG screenshot of the image as the public profile shows it now, base64, 4 MB at most. Required for not_mine; send it every time."),
      page: str("The https link to the public profile you checked."),
      link: str("Optional: an https link that shows the image there."),
      rejected: { type: "boolean", description: "Old: true when the platform refused the image. Say what it said in note." },
      note: str("What happened, in plain words (login, failed, rejected). Never a password or a code.") }, ["bot", "slot"]) },
];

/* Nothing is Claude-only. (24 Nov 2026, Luke: "lets fully remove the money section": the income tools
   submit_income, fix_payment, income_source, income_check, link_transfer, month_check, payments,
   income_status, close_month, song_pl and sort_payment are gone; git history keeps them.) */
export const CLAUDE_TOOLS = [];

/* Each bot's own tools (batch 5, 15 Nov 2026: the whole list was ~40 KB on every run, mostly income tools
   the social bots never use). A tool not named here is for everyone. /mcp keeps the whole list; the
   address /mcp/<bot> (or /mcp?bot=<bot>) lists only that bot's. Nova runs the team and gets everything;
   a name not on the team gets everything too, so a typo never hides a tool. Who may CALL a tool is still
   decided by the desk (staff.mjs), not by this list. */
/* the bots whose questions to Luke are about money (ad spend): Nova never answers those. 24 Nov 2026: income
   is gone from HQ, so Ledger and Sheet are no longer money askers. */
const MONEY_ASKERS = ["Forge"];
export const TOOL_USERS = {
  record_luke_answer: ["Alfred", "Nova"], luke_briefing: ["Alfred"], luke_short_briefing: ["Alfred"],
  record_spend: ["Forge"], log_growth: ["Steve", "Atlas", "Kevin", "Laura"],
  read_growth: ["Steve", "Atlas", "Kevin", "Laura"],
  account_health: ["Steve", "Kevin", "Laura", "Atlas", "Drop", "Webmaster"],
  store_status: ["Drop"], spotify_upcoming: ["Atlas"], pitch_log: ["Atlas"], song_page: ["Webmaster"], roster_card: ["Nova"], recommend: ["Nova"], preflight: ["Forge", "Drop", "Verse", "Webmaster", "Atlas", "Laura"], instagram: ["Steve", "Kevin", "Forge"], song_pages: ["Webmaster"], upload_cover: ["Webmaster"],
  profiles: ["Atlas", "Laura", "Steve", "Kevin"],
  profile_jobs: ["Atlas", "Laura", "Steve", "Kevin"], profile_master: ["Atlas", "Laura", "Steve", "Kevin"],
  profile_rework: ["Atlas", "Laura", "Steve", "Kevin"], profile_uploaded: ["Atlas", "Laura", "Steve", "Kevin"],
};
const onTeam = (bot, roster) => { const k = String(bot || "").trim().toLowerCase(); return k ? (roster.find((b) => b.name.toLowerCase() === k) || {}).name || "" : ""; };
const LICENCE_TOOLS = ["my_day", "post_update", "send_message", "set_my_card", "releases", "release_step", "licence_queue"];
const SPARK_TOOLS = ["my_day", "post_update", "send_message", "set_my_card", "content_ideas", "account_health"];
export function toolsFor(bot, roster) {
  const me = onTeam(bot, roster);
  /* Licence and Spark are on the roster. Each list is the job. my_day and every other tool still accept the name. */
  if (me === "Licence") return TOOLS.filter((t) => LICENCE_TOOLS.includes(t.name));
  if (me === "Spark") return TOOLS.filter((t) => SPARK_TOOLS.includes(t.name));
  if (!me || me === "Nova") return TOOLS;
  return TOOLS.filter((t) => !TOOL_USERS[t.name] || TOOL_USERS[t.name].includes(me));
}
export function instructionsFor(bot, roster) {
  const me = onTeam(bot, roster);
  if (!me || me === "Nova") return INSTRUCTIONS;
  return INSTRUCTION_LINES.filter(([who]) => !who || who.split(" ").includes(me)).map((l) => l[1]).join("\n");
}

const RULES = [
  "Never write a password, login code, key, card or bank account number anywhere on this desk.",
  "Never guess a number. If you could not see it, post an update with status blocked and say why.",
  "Every amount keeps the currency it was paid in. Nobody converts by hand.",
  "Luke approves all money, logins, account settings and public posts, in writing.",
  "Ad spend: USD 1,000 a month for all platforms; warning at 750; everything off at 900.",
  "No pre-save links and no Feature.fm links, ever. No bought or fake engagement.",
  "Fans: suggestions only. Nobody is contacted without Luke's yes.",
  "Quiet hours 23:00 to 08:00 São Paulo, unless money is at risk.",
];
const BUILT_IN_GUIDE = "The staff guide has not been loaded onto the desk yet. Until it is: call my_day at the start of every run, post_update when you start, finish or get stuck, and follow Nova's briefs. Ask Nova for anything else.";

/* a release step in words a bot can act on. skipped = it does not apply (the label delivers it);
   waiting = it can't start until the step before it is done (the pitch, until the song shows in
   Spotify for Artists): never late */
/* the same words in my_day, releases and release_pack (11 Nov 2026, review) */
const WAIT_SPOTIFY = "the song to show as upcoming in Spotify for Artists";
/* 16 Nov 2026 (Luke): the ads come after the release, made with him; the Spotify for Artists step waits for RouteNote */
const WAIT_ADS = "the release day: the ads are made WITH Luke once the song is out (never before, never on your own)";
const WAIT_OTHER = { approved: "RouteNote to approve the song (Drop's step \"Approved by RouteNote\"): until then it can't show in Spotify for Artists", page: "Webmaster's song page (badscandal.com/<song>) to be live: the ads link to it", release: "the release day: then check Musixmatch every day and add the lyrics the day the song shows there" };
const waitFor = (s) => (s.waitingFor === "spotify-window" ? "Waits until Spotify lists it" : s.waitingFor === "release" && (s.key === "ads" || s.step === "ads") ? WAIT_ADS : s.waitingFor === "spotify" || !s.waitingFor ? WAIT_SPOTIFY : WAIT_OTHER[s.waitingFor] ? WAIT_OTHER[s.waitingFor] : `the step "${(S.RELEASE_STEPS.find((x) => x.key === s.waitingFor) || {}).label || s.waitingFor}"`);
const SPOT_HOW = "done by your spotify_upcoming report, not by release_step";
/* a block whose note says it is waiting (for the release day, for Luke) is waiting, not blocked (18 Nov 2026) */
/* v18, 21 Nov 2026 (Atlas): a Canvas with no link before the release waits for Luke's link: it is not skipped yet */
const stepState = (s) => (!s ? "to do" : s.status === "done" ? "done" : s.canvasWait ? "waiting" : s.status === "skipped" ? "skipped" : (s.waiting || S.blockIsWait(s)) ? "waiting" : s.status === "blocked" ? "blocked" : s.late ? "late" : s.status === "working" ? "working" : "to do");
const when = (d) => (d ? `${S.dayWords(d)} (${d})` : "no date yet");
/* v18, 21 Nov 2026 (Atlas, Laura): a Spotify step past its day waits on Spotify: no stale date */
const SPOTIFY_WHEN = "when Spotify lists it";
const dueOut = (s) => (s && s.waitingFor === "spotify-window" ? SPOTIFY_WHEN : when(s.due));
const stepOut = (s, pack) => ({ step: s.key, label: s.label, owner: s.owner, due: dueOut(s), state: stepState(s), ...(s.note ? { note: s.note } : {}), ...(s.link ? { link: s.link } : {}), ...(s.status === "done" && s.by ? { done_by: s.by } : {}),
  ...(s.status === "done" && s.doneOn ? { done_on: when(s.doneOn) } : {}), ...(s.key === "live" && pack && pack.spotifyTrack ? { spotify_track: pack.spotifyTrack } : {}),
  ...(s.waiting ? { waiting_for: waitFor(s) } : {}), ...(s.key === "spotify" && !["done", "skipped"].includes(s.status) ? { how: SPOT_HOW } : {}) });
/* batch 3: Luke's approvals and the distributor's history, as Atlas, Verse and Drop read them */
/* "Sat 14 Nov 12:01" (São Paulo) */
const stampWords = (iso) => { const t = S.spStamp(Date.parse(iso)); return `${S.dayWords(t.slice(0, 10))} ${t.slice(11, 16)}`; };
const approvalOut = (ap, what) => {
  if (ap && ap.skipped) return { approved: null, state: "skipped: approval not needed" };
  if (!ap) return { approved: false, state: `not approved yet: ask Luke with send_message and approval (what: ${what})` };
  if (ap.sentOnly && what === "pitch") return { approved: null, sent: true, state: `pitched ${S.dayWords(ap.on) || "already"}${ap.by ? ` by ${ap.by}` : ""}` };
  if (ap.sentOnly) return { approved: null, sent: true, state: `done, approval not needed (sent ${S.dayWords(ap.on) || "already"}${ap.by ? ` by ${ap.by}` : ""}; no approval was recorded on the desk)` };
  const by = "Luke" + (ap.via ? ` (via ${ap.via})` : "");
  if (what === "lyrics" && ap.current === false) return { approved: false, state: `approved by ${by} on ${stampWords(ap.at)}, but the lyrics changed since: ask Luke again`, by };
  return { approved: true, by, on: stampWords(ap.at), ...(what === "pitch" ? { text: ap.text } : { matches_the_pack: true }), ...(ap.words ? { luke_said: ap.words } : {}) };
};
const storeOut = (st) => (st.status || st.legacy ? { status: st.status || st.legacy, ...(st.since ? { since: when(st.since) } : {}), ...(st.reason ? { reason: st.reason } : {}),
  history: st.history.map((h) => `${S.dayWords(h.on)}: ${h.status}` + (h.reason ? `: ${h.reason}` : "") + (h.note ? ` (${h.note})` : "") + ` (${h.by})`) } : { status: "not recorded yet" });
const dealOut = (d) => (d && d.kind ? { kind: d.kind, ...(d.label ? { label: d.label } : {}), ...(d.split ? { split: d.split } : {}), delivered_by: d.distributor } : "not recorded yet");
/* L7: the pitch line Atlas and the desk read. HQ never pitches. */
const pitchOut = (p) => (!p || !p.line ? "no pitch on this one" : { status: p.status, line: p.line, ...(p.pitchedOn ? { pitched_on: when(p.pitchedOn) } : {}), ...(p.deadline ? { deadline: when(p.deadline) } : {}),
  ...(p.editorial && p.editorial.length ? { editorial: p.editorial.map((e) => `${e.name} (${when(e.date)})`) } : {}) });
/* what Spotify for Artists showed in Atlas's last report, as the bots read it (V4) */
const s4aOut = (sv) => ({ reported_at: sv.never ? "never" : sv.sp, ...(sv.stale ? { stale: "older than 48 hours" } : {}),
  unknown: sv.items.filter((x) => x.state === "unknown").map((x) => x.title), waiting_on_luke: sv.waitingOnLuke });
const missingOut = (m) => (m.required ? m.short : `${m.short} (needed for "${m.step}", ${m.owner})`);
/* One sentence. An empty list and a field that says "not filled yet" were the same gap said two ways
   (18 Nov 2026 night test). */
function missingForNext(v) {
  const next = (v.steps || []).find((s) => s.status !== "done" && s.status !== "skipped" && !s.waiting);
  const rows = (v.missing || []).filter((m) => m.required || (next && m.neededBy === next.key));
  if (!rows.length) return "nothing missing for the next step";
  return "missing for next step: " + rows.map(missingOut).join(", ");
}
function releaseCard(v, me, chase, mail) {
  const tightText = (v.warnings || []).map((w) => (w && w.text) || w).find((t) => typeof t === "string" && /Uploaded .+ before release/.test(t));
  const mailLine = !mail || mail.connected !== true ? "not connected" : (v.mail && (v.mail.status || v.mail.on) ? `${v.mail.status || "read"}${v.mail.on ? " " + v.mail.on : ""}` : "no data yet");
  return { song: v.title, id: v.id, status: v.status === "draft" ? "draft (not sent to the team yet)" : v.released ? "released" : "coming",
    release_day: when(v.date), days_to_go: v.daysToGo, where: v.where, deal: dealOut(v.deal), ...(tightText ? { tight: tightText } : {}),
    warnings: v.warnings, missing: missingForNext(v), steps_done: `${v.counts.done} of ${v.counts.total}`,
    at_the_distributor: v.store.status || v.store.legacy || "not recorded yet",
    moderation: (v.store && v.store.status) || (v.mail && v.mail.status) || "no data yet",
    /* v18, 21 Nov 2026 (Atlas, Webmaster): email_watch and inbox are said once, at the top of releases */
    routenote_email: mailLine,
    ...(v.mail && v.mail.status === "rejected" ? { moderation_draft: { from: S.MODERATION_FROM, cc: S.MODERATION_CC, to: S.MODERATION_TO, note: "HQ does not send this email." } } : {}),
    pitch: pitchOut(v.pitch),
    your_steps: v.steps.filter((s) => s.owner === me).map((s) => stepOut(s, v.pack)), ...(chase ? { all_steps: v.steps.map((s) => stepOut(s, v.pack)) } : {}) };
}

/* 24 Nov 2026, Luke: "lets fully remove the money section ... We can fully ignore the money section". */
const NO_MONEY = "Money is no longer on HQ.";
const MONEY_STOP_BOTS = ["Ledger", "Sheet"];
const MONEY_STOP = "HQ no longer handles money. Stop checking income, payments, Revolut and the income sheet. Delete your money tasks. Ask Luke for your new task.";
/* the recommendations on a decision, for Alfred's SHORT briefing only (A3, 17 Nov 2026); luke_briefing stays as it is */
const recWords = (m) => (Array.isArray(m.recommendations) ? m.recommendations.slice().sort((a, b) => (a.by === "Nova" ? -1 : b.by === "Nova" ? 1 : 0)) : [])
  .map((x) => ` · ${x.by} recommends: ${x.option || x.why}${x.option ? ` (${x.why})` : ""}`).join("");
/* the same rows for needs_you, my_day, team_board and both briefings */
/* luke_briefing keeps its row shape (rule 6: Alfred depends on it). Same items, same order as needRows. */
function needRowsBriefing(count, messages) {
  const byId = new Map((messages || []).filter((m) => m && m.id).map((m) => [m.id, m]));
  return (count.items || []).map((x) => {
    const m = (x.kind === "message" || x.kind === "handle") ? byId.get(x.id) : null;
    if (!m) return { id: x.id, kind: x.kind, from: x.from || "", text: x.text, what: x.text, screen: S.lukeLine(x.text), ...(x.href ? { href: x.href } : {}) };
    return { ...short(m), kind: x.kind === "handle" ? "handle" : (m.approval && m.approval.what ? m.approval.what + " approval" : m.needs), what: x.text, screen: S.lukeLine(m.text) };
  });
}
/* v18 (21 Nov 2026): one row per card, the same words Luke's card shows. text = the short question (no
   "what"/"screen" copies of it); the card's facts, recommendation and Yes/No go with it. */
function needRows(count, messages) {
  const byId = new Map((messages || []).filter((m) => m && m.id).map((m) => [m.id, m]));
  return (count.items || []).map((x) => {
    const m = (x.kind === "message" || x.kind === "handle") ? byId.get(x.id) : null;
    const card = { text: x.title || x.text, card: x.type, ...(x.facts && Object.keys(x.facts).length ? { facts: x.facts } : {}), ...(x.recommend ? { recommend: x.recommend } : {}),
      ...(x.yes ? { yes: x.yes.choice } : {}), ...(x.no ? { no: x.no.choice } : {}), ...(x.email ? { has_email: true } : {}), ...(x.done ? { done_button: true } : {}) };
    if (!m) return { id: x.id, kind: x.kind, from: x.from || x.to || "", ...card, ...(x.href ? { href: x.href } : {}) };
    const { text: _full, ...rest } = short(m);
    return { ...rest, kind: x.kind === "handle" ? "handle" : (m.approval && m.approval.what ? m.approval.what + " approval" : m.needs), ...card };
  });
}
async function oneNeeds(store, now, ctx, desk, hqAns) {
  const counted = await needsDesk(store, now, { desk, ig: ctx && ctx.ig ? ctx.ig() : null });
  const cap = hqAns && hqAns.money && hqAns.money.cap;
  counted.notRead = cap && Array.isArray(cap.notRead) ? cap.notRead : [];
  counted.lukeTasks = (hqAns && hqAns.team && hqAns.team.tasks) || [];
  const count = C.needsCount(counted, S.spDay(now), now);
  return { count, rows: needRows(count, counted.messages || []), briefingRows: needRowsBriefing(count, counted.messages || []) };
}
const short = (m) => ({ id: m.id, from: m.from, to: m.to, at: m.sp, needs: m.needs, text: m.text, ...(m.options && m.options.length ? { options: m.options } : {}),
  ...(m.questions && m.questions.length ? { questions: m.questions.map((q, i) => ({ n: i + 1, q: q.q, answer: q.answer || "", by: q.by || "" })) } : {}),
  ...(m.answers ? { answers: m.answers } : {}), ...(m.about ? { about: m.about } : {}), ...(m.via ? { via: m.via } : {}),
  ...(m.re ? { reply_to: m.re } : {}), ...(m.resolved ? { handled_by: m.resolved.by, handled_note: m.resolved.note } : {}) });

/* ctx: { store, now, role: "bot" | "claude", hq: async () => the dashboard answer or null } */
async function pingSafe(store, now, names, item) {
  try { await pingNames(store, now, names, item); } catch { /* a missed ping never fails the desk write */ }
}
/* Every id in an answer, wherever it sits (messages_for_you, waiting_on_you, notes, messages...). */
function idsIn(v, out = new Set()) {
  if (Array.isArray(v)) v.forEach((x) => idsIn(x, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { if (k === "id" && typeof x === "string") out.add(x); else idsIn(x, out); }
  return out;
}
/* The read marker moves only past what this answer handed over (18 Nov 2026, handoff bug 7: a broad read
   moved it to "now" while returning 20 messages, so the rest looked already read). Everything for the reader
   since its last read that is NOT in the answer keeps the marker just before the oldest of them. Returns how
   many are still unread. */
export async function settleRead(store, now, me, since, answer, list = null) {
  /* list: the messages the tool already loaded (the marker uses the call's start time, so one that arrived
     during the call stays unread either way) */
  const all = Array.isArray(list) ? list : await S.listMessages(store, now, 2);
  const unread = S.messagesFor(all, me, since, Infinity).list; /* oldest first */
  const handed = idsIn(answer);
  const left = unread.filter((m) => !handed.has(m.id));
  if (!left.length) { await S.touchRead(store, now, me); return 0; }
  /* the time stays just before the oldest one not handed over; what was handed over after it is listed by id */
  const before = Date.parse(left[0].at) - 1;
  const at = Number.isFinite(before) && (!since || before > Date.parse(since.at)) ? before : since ? Date.parse(since.at) : before;
  const cut = new Date(at).toISOString();
  const also = [...(since ? since.also : []), ...unread.filter((m) => handed.has(m.id)).map((m) => m.id)];
  const byId = new Map(all.map((m) => [m.id, m]));
  await S.touchRead(store, at, me, also.filter((id) => byId.has(id) && byId.get(id).at > cut), now);
  return left.length;
}
/* two auto lines for the same platform on the same day ("YouTube 19 Nov:") are one line */
/* v18, 21 Nov 2026 (Webmaster: Atlas's line ended "Draft only." after a long audience list): one short line for Luke */
function forLuke(message) {
  let t = S.lukeLine(message).replace(/\s*\bDraft only\.?\s*$/i, "").trim();
  if (t.length <= 200) return t;
  const cut = t.slice(0, 200);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end >= 40 ? cut.slice(0, end + 1) : S.clipWords(t, 200);
}
/* v18, 21 Nov 2026 (Laura: an old "Verify it's you" line stayed in the feed): a blocked line goes once the same
   bot has posted a newer line that is not blocked */
function pastBlocks(updates) {
  const moved = new Set();
  return (updates || []).filter((u) => {
    const k = String((u && u.bot) || "").toLowerCase();
    if (u && (u.status === "blocked" || u.status === "error")) return !moved.has(k);
    moved.add(k);
    return true;
  });
}
function dedupeGrowthUpdates(lines) {
  const seen = new Set(), out = [];
  for (const line of lines || []) {
    const m = String(line).match(/(Instagram|TikTok|YouTube|Spotify)\s+(\d{1,2}\s+[A-Za-z]{3})\s*:/i);
    const k = m ? m[1].toLowerCase() + "|" + m[2].toLowerCase() : "";
    if (k && seen.has(k)) continue;
    if (k) seen.add(k);
    out.push(line);
  }
  return out;
}
export async function callTool(tool, args, ctx) {
  const read = {};
  const answer = await runTool(tool, args, ctx, read);
  if (!read.me) return answer;
  let left = 0;
  try { left = await settleRead(ctx.store, ctx.now, read.me, read.since, answer, read.list); } catch { /* a marker that could not move never fails the answer */ }
  if (left && tool.name === "read_messages" && answer && typeof answer === "object")
    answer.still_unread = `${left} message${left === 1 ? "" : "s"} for you ${left === 1 ? "is" : "are"} not in this answer and still count as unread: call read_messages with unread: true to get ${left === 1 ? "it" : "them"}.`;
  return answer;
}
async function runTool(tool, args, ctx, read) {
  const { store, now } = ctx;
  const roster = await S.getRoster(store);
  const me = ctx.role === "claude" ? "Claude" : S.whoIs(args.bot, roster);
  const config = ctx.role === "claude" ? null : await S.getConfig(store);
  if (config && !config.botsOn) throw new S.StaffError("Luke has switched the bots' connector off. Stop, and tell Nova.", "off");
  await S.touchSeen(store, now, me, tool.name);
  /* releases sent before the pipeline changed are brought up to date before anyone reads them (15 Nov
     2026: no teaser steps, lyrics after the release); one read when nothing is old, and never a reason to fail the call */
  await S.upgradeReleases(store, now).catch(() => null);
  /* "read" (V6): only the tools that hand over the caller's messages say it has read them. The marker it
     had before is read first: my_day and Alfred's luke_briefing hand over everything written since then
     (messages_for_you), so "Read by Ledger" never stands under an answer Ledger was not given. */
  /* read_messages counts as reading only when it hands over the reader's messages unfiltered (14 Nov 2026:
     a quick count, one message by id, or a search must not hide the rest from the next unread read) */
  const narrowed = tool.name === "read_messages" && (args.count_only === true || ["since", "from", "to", "about", "search", "id"].some((k) => args[k] != null && String(args[k]).trim() !== ""));
  const hands = tool.name === "my_day" || (tool.name === "read_messages" && !narrowed) || (tool.name === "luke_briefing" && me === "Alfred");
  const readSince = hands || narrowed ? await S.readState(store, me) : null; /* {at, also} or null */
  if (hands) { read.me = me; read.since = readSince; } /* the marker moves in callTool, past what was handed over */
  const today = S.spDay(now);

  switch (tool.name) {
    case "post_update": {
      if (me === "Claude") throw new S.StaffError("Updates are the bots' log. Claude writes with send_message.");
      let card_done = null;
      if (args.card != null && String(args.card).trim()) {
        const done = await C.recordProof(store, now, roster, { by: me, id: args.card, messageId: args.proof_message, bookingRef: args.proof_ref, link: args.proof_link });
        card_done = C.botCard(done);
      }
      const u = await S.postUpdate(store, now, roster, { ...args, bot: me });
      const proof = card_done && card_done.proof && card_done.proof.link ? card_done.proof.link : (S.httpsLink(args.proof_link) || "");
      return { saved: true, id: u.id, at: u.sp, bot: u.bot, status: u.status, message: u.full || u.message, ...(u.link ? { link: u.link } : {}), ...(proof ? { proof_link: proof } : {}), shown_on: "badscandal.com/hq, Team", ...(card_done ? { card_done, may_act: card_done.may_act } : {}) };
    }
    case "send_message": {
      if ((me === "Licence" || me === "Spark") && (!/^nova$/i.test(String(args.to || "").trim()) || (args.card && typeof args.card === "object"))) throw new S.StaffError(`${me} reports to Nova only. Put Nova in to. Nothing was sent.`, "not_allowed");
      if (args.card && typeof args.card === "object") {
        const card = await C.saveCard(store, now, roster, { by: me, ...args.card });
        const view = C.botCard(card);
        const where = card.workspace === "farm" || card.workspace === "label" ? ` Shown on the ${card.workspace === "farm" ? "Social Farm" : "Label"} Needs you, not on the BADSCANDAL Needs you.` : "";
        return { saved: true, card: view, note: view.duplicate ? "This dedupe_key is already on the desk. Nothing new was posted." : view.waiting_on === "luke" ? "Saved as a card for Luke. It was not also posted as a message. Read his answer in my_day (card_answers). It is done only when you record proof with post_update." + where : "Saved as a card on Waiting on others. It was not posted as a message, and it is not on Luke's Needs you." + where };
      }
      const r = await S.sendMessage(store, now, roster, { from: me, to: args.to, text: args.text, needs: args.needs, re: args.reply_to, options: args.options, questions: args.questions, about: args.about, answers: args.answers, approval: args.approval, recommend: args.recommend, recommend_option: args.recommend_option });
      const names = r.message.to === "all" ? roster.map((b) => b.name) : [r.message.to];
      if (r.message.about) names.push(r.message.about);
      await pingSafe(store, now, names, { kind: "message", id: r.message.id });
      const left = r.parent && Array.isArray(r.parent.questions) ? r.parent.questions.filter((q) => !q.answer).length : 0;
      return { sent: true, id: r.message.id, to: r.message.to, needs: r.message.needs, ...(r.parent && r.parent.resolved ? { answered: r.parent.id } : {}), ...(left ? { still_open: `${left} question${left === 1 ? "" : "s"} of that message still need${left === 1 ? "s" : ""} an answer` } : {}),
        ...(r.lyricsPending ? { lyrics_pending: r.lyricsPending.note || "These look like lyrics. They are not in the pack yet." } : {}),
        note: r.message.to === "Luke" ? "Luke sees this on the dashboard and in Alfred's next message. It is not sent to his phone straight away." : "Saved on the board." };
    }
    case "instagram": {
      if (!ctx.ig) throw new S.StaffError("The Instagram reader isn't available here. Tell Nova.");
      const oa = args.our_accounts ? String(args.our_accounts) : "";
      const ig = ctx.ig();
      const hour = new Date(now).toISOString().slice(0, 13);
      const callsLeft = async (spend) => {
        let used = 0;
        try {
          const prev = typeof ig.get === "function" ? await ig.get("tool-calls.json") : null;
          used = prev && prev.hour === hour ? Number(prev.n) || 0 : 0;
          if (spend) { used += 1; if (typeof ig.setJSON === "function") await ig.setJSON("tool-calls.json", { hour, n: used }); }
        } catch { if (spend) used += 1; }
        return Math.max(0, 3 - used);
      };
      if (args.post != null && String(args.post).trim()) {
        if (!["Steve", "Forge", "Nova"].includes(me)) throw new S.StaffError("Steve, Forge or Nova sets which song a post is. Nothing was saved.");
        let saved;
        try { saved = await IG.setPostSong(ig, now, { by: me, post: args.post, song: args.song }); } catch (e) { throw new S.StaffError(e.message); }
        return { saved: true, post: saved.post, song: saved.song || "song not linked", state: saved.state, calls_left: await callsLeft(false), note: "Saved on the desk. This did not use a call. The next ranking shows it. Never guess a song from the caption." };
      }
      let changed = null;
      if (oa === "add" || oa === "remove") {
        if (!IG.OWN_EDITORS.includes(me)) throw new S.StaffError("Only Nova changes the list of our own accounts. Read it with our_accounts list; to change it, ask Nova (send_message).");
        try { changed = await IG.editOwn(ctx.ig(), now, { by: me, action: oa, handle: args.handle, reason: args.reason }); } catch (e) { throw new S.StaffError(e.message); }
      } else if (oa && oa !== "list") throw new S.StaffError("our_accounts is list, add or remove.");
      let spend = [], boosts = [];
      try { spend = (await S.listSpend(store, now) || []).filter((r) => /meta|facebook|instagram/i.test(r.platform || "")); } catch {}
      try { boosts = ((await S.listGrowth(store, now, 2)) || []).flatMap((r) => (r && r.boosts) || []); } catch {}
      const fresh = oa === "add" || oa === "remove" || oa === "list";
      if (!fresh) {
        const cached = await IG.readToolCache(ig, now);
        const staleBoost = boosts.some((b) => b && b.link) && cached && /boost unknown/.test(JSON.stringify(cached.body));
        if (cached && cached.body && !staleBoost) return { ...cached.body, last_read: S.spStamp(cached.at), cached: `This is the read from ${S.spStamp(cached.at)}. It did not use a call.` };
      }
      const v = await IG.igView(ig, now, { spend, boosts });
      const ourAccounts = { handles: v.own.map((h) => "@" + h), count: v.own.length, note: "Comments from these accounts never count: not in the ranking, the fans' list or needs_reply. The connected account is always on it. Only Nova changes it.",
        changes: (v.ownLog || []).map((x) => ({ on: S.spStamp(x.at), by: x.by, what: `${x.action} @${x.handle}`, reason: x.reason })) };
      const calls_left = await callsLeft(oa !== "list");
      /* v18, 21 Nov 2026 (Steve): one list, our_accounts (own_accounts was the same list again) */
      if (oa === "list") return { our_accounts: ourAccounts, calls_left, note: "Listing our accounts does not use a call. The numbers are below only when you ask for the ranking." };
      const st = v.status;
      const lineOf = (c) => `${c.at.slice(0, 16).replace("T", " ")} · ${c.user}: ${c.text} (on “${c.postCaption}”)` + (c.id ? ` · comment ${c.id}` : "") + (c.link ? ` · ${c.link}` : "");
      const flags = [];
      if (v.ranking.notSettled) flags.push("under 10 ranked = not settled");
      if (v.ranking.needSix) flags.push("need 6+ ranked to compare top 3 vs bottom 3");
      if (v.ranking.noClearWinner) flags.push("no clear winner: the top two are within 1 point");
      const answer = { connected: st.connected, ...(st.connected ? { account: "@" + st.username } : { how: "Luke connects it once in HQ (Growth & Fans › Connect Instagram)." }),
        ...(st.picture ? { profile_picture: st.picture } : {}),
        ...(st.lastError ? { problem: st.lastError } : {}), followers: st.followers, last_read: S.spStamp(now), calls_left,
        posts: v.posts.map(IG.postLine), new_comments: v.comments.slice(0, 20).map(lineOf),
        top_countries: v.countries.map((c) => `${c.country} ${c.count}`),
        ranking: { how: "Every recent post at the SAME age: its numbers at 1 day. Best first by engagement per view. Posts older than 3 weeks are in older, even when a 1-day number exists. A boost's spend is that ad's own spend, or a spend row that names that post or ad. The account's day total is not used. If that read is older than the boost, the line says spend not read since boost started. Cost per engagement uses the post's likes, comments, saves and shares when the spend row has none. A missing side says not reported, never 0. 'before the ad' is the post's numbers before that spend. Posts under 1,000 views are not ranked. Follows per view and profile visits are on the line when Instagram sent them.",
          ranked: v.ranking.ranked.length, not_settled: !!v.ranking.notSettled, best: v.ranking.ranked.slice(0, 5).map(rankLine),
          worst: v.ranking.ranked.length > 5 ? v.ranking.ranked.slice(-3).reverse().map(rankLine) : [],
          worst_why: v.ranking.ranked.length > 5 ? "" : (v.ranking.notSettled ? "not settled: fewer than 10 ranked posts, so there is no bottom 3 yet" : "fewer than 6 ranked posts, so there is no bottom 3 yet"),
          older: v.ranking.older.map(rankLine), waiting: v.ranking.tooFew.map(rankLine), not_ranked_yet: v.ranking.tooFew.length,
          ...(flags.length ? { flags } : {}),
          ads_read: v.ranking.adsAt ? S.spStamp(v.ranking.adsAt) : "not yet (the ads are read hourly with Meta's read-only key)" },
        needs_reply: v.needsReply.map(lineOf),
        needs_reply_note: "Questions from fans nobody of ours has answered. Replying goes outside the team: Luke decides and replies. Put them in your update for Luke; never reply yourself.",
        fan_inbox: { note: "People asking the song's name or where to listen, and people who commented on more than one post. needs_reply true is for Luke: put it in your update for him. Never reply, like, hide or delete a comment.",
          questions: (v.fanInbox ? v.fanInbox.questions : []).map((q) => ({ needs_reply: q.needsReply, kind: q.kind === "listen" ? "where to listen" : q.kind === "use" ? "using the music" : "song name", when: String(q.at || "").slice(0, 16).replace("T", " "), user: q.user, text: q.text, on: q.postCaption, ...(q.id ? { comment: q.id } : {}), ...(q.link ? { link: q.link } : {}), ...(q.needsReply ? {} : { replied_by: q.repliedBy && q.repliedBy.length ? q.repliedBy.join(", ") : "one of our accounts", replied_at: q.repliedAt || "the time was not on the comment" }) })),
          repeat_fans: (v.fanInbox ? v.fanInbox.repeats : []).map((r) => ({ needs_reply: r.needsReply, user: r.user, posts: r.posts, comments: r.comments, latest: r.lastText, on: r.postCaption })) },
        our_accounts: oa ? ourAccounts : v.own.map((h) => "@" + h),
        do_not_reply: IG.HIDDEN_HANDLES.map((h) => "@" + h),
        do_not_reply_note: "These accounts are do-not-reply. Never reply, and never count their comments. @liliancardos and @liliancardosomakeup are on this list.",
        ...(oa && oa !== "add" && oa !== "remove" && oa !== "list" ? { our_accounts_list: ourAccounts } : {}),
        ...(changed ? { done: `${changed.change.action === "add" ? "Added" : "Removed"} @${changed.change.handle}.` } : {}),
        note: "Read-only. 3 reads an hour. A read from the last 20 minutes is reused and does not use a call. Don't open Instagram in a browser for these numbers. Never change, start, pause or create ads." };
      if (!oa && !changed) {
        try { await IG.writeToolCache(ig, now, answer); } catch { /* the answer still goes out */ }
        try { if (typeof ig.setJSON === "function") await ig.setJSON("tool-read.json", { at: now }); } catch { /* the stamp is only for last_read */ }
      }
      return answer;
    }
    case "preflight": {
      const has = (k) => args[k] != null && String(args[k]).trim() !== "";
      if (!has("song") && !has("text") && !has("link") && !has("asset")) throw new S.StaffError("Give song, text, link or asset to check.");
      const problems = [];
      let rule = "";
      if (has("asset")) { /* L8, 17 Nov 2026: a Canvas, a banner or a cover against its platform's rule */
        const kind = String(args.asset).trim().toLowerCase();
        for (const k of ["width", "height", "seconds", "size_mb"]) if (has(k) && !(Number(args[k]) > 0)) throw new S.StaffError(`${k} must be a number above 0 (as the file shows it), or leave it out.`);
        const found = S.assetProblems(kind, { width: args.width, height: args.height, seconds: args.seconds, format: args.format, mb: args.size_mb });
        rule = S.ASSETS[kind].rule;
        for (const t of found) problems.push(`${S.ASSETS[kind].label}: ${t.replace(new RegExp("^" + S.ASSETS[kind].label + " "), "")}`);
      }
      const notes = [], checked = [], flags = [], couldnt = [];
      let own = "";
      if (has("song")) {
        const r = S.findRelease(await S.listReleases(store), args.song, { drafts: true }); own = r.id;
        if (r.pack && r.pack.prehq === "Yes") {
          return { ok: true, song: r.title, skipped: "skipped: pre-HQ song", note: "skipped: pre-HQ song", problems: [], flags: [], checked: ["skipped: pre-HQ song"], couldnt_check: [], notes: [] };
        }
        for (const x of S.preflightOf(r)) (x.warn ? flags : problems).push(x.text);
        const seenNote = new Set();
        for (const t of S.artistNotes([r.pack && r.pack.primary, r.pack && r.pack.featuring, r.pack && r.pack.copyright, r.pack && r.pack.spotifyArtist].filter(Boolean).join("\n"))) if (!seenNote.has(t)) { seenNote.add(t); notes.push(t); }
        checked.push("artist name is one word");
        const primary = String((r.pack && r.pack.primary) || "").trim();
        if (primary && !S.artistProblems(primary).length && /^badscandal$/i.test(primary)) checked.push("primary artist is Badscandal and matches Spotify artist 29kaubgb6Esvwu0idVndGy");
        else if (!primary) couldnt.push("Primary artists is empty, so it was not checked against the Spotify artist");
        const wav = r.pack && r.pack.wav;
        if (!wav) couldnt.push("Master WAV is empty, so the file type could not be checked");
        else if (/\.wav(\?|$)/i.test(wav)) checked.push("master link ends in .wav");
        else if (!/\.(mp3|m4a|aac|ogg|opus)(\?|$)/i.test(wav)) couldnt.push("Master WAV could not be checked: the link has no file type (it may be a folder)");
        checked.push("artwork rule is a JPG or PNG, 3000 x 3000 (pass width and height on asset cover to check a file)");
      }
      if (has("asset")) { for (const t of S.assetNotes(String(args.asset).trim().toLowerCase(), { width: args.width, height: args.height, seconds: args.seconds, format: args.format, mb: args.size_mb }) || []) notes.push(t); checked.push("platform size and format"); }
      if (has("text")) { for (const t of S.artistProblems(args.text)) problems.push(`Text: ${t}`); for (const t of S.artistNotes(args.text)) notes.push(t); checked.push("the text"); }
      if (has("link")) {
        if (String(args.mode || "") === "track") {
          const t = S.spotifyTrackProblem(args.link);
          if (t.problem) problems.push(`Link: ${t.problem}`);
          else { checked.push("the Spotify track link"); if (t.si) notes.push(`${S.SI_REMOVED} The clean link: ${t.clean}.`); }
        } else {
          const pr = S.adLinkProblem(args.link, "", own); if (pr) problems.push(`Link: ${pr}`); checked.push(pr ? "the link" : "the link points at badscandal.com/<song>");
        }
      }
      return { ok: problems.length === 0, problems, ...(flags.length ? { flags } : {}), ...(notes.length ? { notes } : {}), ...(checked.length ? { checked } : {}), ...(couldnt.length ? { couldnt_check: couldnt } : {}), ...(rule ? { rule } : {}), note: problems.length ? "Fix these before it goes out (release_fill for your own fields; tell Luke for his)." : flags.length ? "Flagged only: nothing is blocking it." : "Nothing to fix." };
    }
    case "recommend": {
      const p = await S.recommendMessage(store, now, roster, { by: me, id: args.message_id, option: args.option, why: args.why });
      return { saved: true, id: p.id, recommendations: (p.recommendations || []).map((x) => `${x.by}: ${x.option ? `"${x.option}". ` : ""}${x.why}`), note: "Luke sees it on the card in Waiting on you, and Alfred says it in his short briefing. Only Luke answers the question." };
    }
    case "record_luke_answer": {
      if (me !== "Alfred" && me !== "Nova") throw new S.StaffError("Only Alfred or Nova records Luke's answers from their chat. Everyone else: Luke answers on the dashboard.", "not_allowed");
      const p = await S.getMessage(store, args.reply_to);
      if (p.to !== "Luke" || !S.isOpen(p)) throw new S.StaffError("That message is not waiting on Luke (it was not sent to him, or it is already handled). Nothing was saved.", "not_allowed");
      /* Nova's yes counts as Luke's when Luke told Nova himself, never for money (Luke, 15 Nov 2026) */
      if (me === "Nova" && MONEY_ASKERS.includes(p.from)) throw new S.StaffError(`That is a money question from ${p.from}: Nova never answers money for Luke. Luke answers it on the dashboard or to Alfred. Nothing was saved.`, "not_allowed");
      let note = "";
      if (args.option != null && String(args.option).trim()) {
        const want = String(args.option).trim().toLowerCase();
        const hit = (p.options || []).find((o) => o.toLowerCase() === want);
        if (!hit) throw new S.StaffError(`option must be one of the options of that message: ${(p.options || []).join(" | ") || "it has none: leave option out"}.`);
        note = hit;
      }
      const r = await S.sendMessage(store, now, roster, { from: "Luke", via: me, to: p.from, text: args.luke_said, re: p.id, note, answers: args.answers });
      const left = Array.isArray(r.parent && r.parent.questions) ? r.parent.questions.filter((q) => !q.answer).length : 0;
      return { saved: true, id: r.message.id, closed: r.settled, to: p.from, ...(r.approved && !r.approved.error ? { approved: `${r.approved.what === "pitch" ? "The pitch" : "The final lyrics"}: recorded as approved by Luke (via ${me})` } : {}), ...(r.proposal ? { release: r.proposal.done ? r.proposal.text : `Not done: ${r.proposal.error}` } : {}), ...(left ? { still_open: `${left} question${left === 1 ? "" : "s"} still need${left === 1 ? "s" : ""} Luke's answer` } : {}), shown_on: `badscandal.com/hq, Messages (as Luke's answer, via ${me})` };
    }
    case "resolve_message": {
      const p = await S.resolveMessage(store, now, roster, { id: args.id, by: me, note: args.note });
      return { handled: true, id: p.id, by: me };
    }
    case "read_messages": {
      if (args.id != null && String(args.id).trim()) {
        const m = await S.getMessage(store, args.id);
        return { you: me, message: short(m) };
      }
      const all = await S.listMessages(store, now, 2);
      read.list = all;
      const forMe = (since) => { const got = S.messagesFor(all, me, since, 1000); return got.list.reverse(); };
      if (args.count_only === true) {
        const fresh = forMe(readSince);
        return { you: me, anything_new: fresh.length > 0, count: fresh.length, last_read: readSince ? S.spStamp(Date.parse(readSince.at)) : "never", waiting_on_you: S.waitingOn(all, me).length };
      }
      const show = args.unread === true ? "unread" : args.show || "mine", n = Math.min(50, Math.max(1, Number(args.limit) || 20));
      let pick = show === "unread" ? forMe(readSince) : show === "all" ? all : show === "open" ? all.filter((m) => S.isOpen(m) && (m.to === me || m.from === me)) : (() => {
        /* mine = everything my_day would hand over (about you, answers to yours) plus what you sent, so a broad
           read can always move the read marker past it (18 Nov 2026) */
        const sent = new Set(all.filter((m) => m.from === me).map((m) => m.id));
        return all.filter((m) => m.to === me || m.to === "all" || m.from === me || m.about === me || (!!m.re && sent.has(m.re)));
      })();
      pick = S.filterMessages(pick, roster, args);
      /* unread hands over the OLDEST first, so a long backlog is read in order and the marker can move past it */
      const total = pick.length;
      if (show === "unread" && total > n) pick = pick.slice(-n);
      return { you: me, showing: show, waiting_on_you: S.waitingOn(all, me).map(short), messages: pick.slice(0, n).map(short), ...(total > n ? { more: show === "unread" ? `These are your ${n} oldest unread. ${total - n} newer ones come next: call read_messages with unread: true again.` : `${total - n} more match: narrow it or raise limit (50 at most).` } : {}) };
    }
    case "task_update": {
      const ans = ctx.hq ? await ctx.hq().catch(() => null) : null;
      const open = ans && ans.team && Array.isArray(ans.team.tasks) ? ans.team.tasks : null;
      const t = await S.setTaskStatus(store, now, roster, { by: me, task: args.task, status: args.status, note: args.note, title: args.title }, open);
      const owner = open && open.find((x) => String(x.id || "").toUpperCase() === String(t.id).toUpperCase());
      await pingSafe(store, now, [owner && owner.owner], { kind: "task", id: t.id });
      return { saved: true, task: t.id, status: t.status, ...(t.title ? { title: t.title } : {}), ...(t.note ? { note: t.note } : {}), shown_on: t.status === "done" || t.status === "cancelled" ? "badscandal.com/hq, Team: taken off the open tasks" : "badscandal.com/hq, Team" };
    }
    case "record_spend": {
      {
        const ws = String(args.workspace || "").trim().toLowerCase();
        if (ws === "label" || args.genre || args.alias) {
          if (ws !== "label") throw new S.StaffError("A genre or an alias is Label spend. Pass workspace \"label\". It was not recorded, and it is not in the USD 1,000 cap.");
          return W.recordSpend(store, now, { ...args, by: me });
        }
      }
      const days = Array.isArray(args.days) && args.days.length ? args.days : [{ date: args.date, amount: args.amount, currency: args.currency, not_read: args.not_read, song: args.song }];
      const saved = [];
      let r = null;
      for (const d of days) {
        r = await S.recordSpend(store, now, roster, { by: me, platform: args.platform, account: args.account, date: d.date, amount: d.amount, currency: d.currency || args.currency, not_read: d.not_read, song: d.song || args.song });
        saved.push(r.entry);
      }
      /* the month so far as the site works it out (the team's fixed rate), read AFTER this row was saved */
      const hq = ctx.hq ? await ctx.hq().catch(() => null) : null;
      const cap = hq && hq.money ? hq.money.cap : null;
      return { saved: saved.some((x) => x), days: saved.length, ...(r.duplicate ? { duplicate: true } : {}), ...(r.updated ? { updated: true } : {}),
        recorded: saved.map((x) => `${x.platform} ${x.date}: ` + (x.amount != null ? `${x.currency} ${x.amount.toFixed(2)}` : `not read (${x.notRead})`)).join("; "),
        month_to_date: cap ? { spent: `${cap.currency} ${cap.spent.toFixed(2)}`, cap: `${cap.currency} ${cap.amount}`, left: `${cap.currency} ${cap.left.toFixed(2)}`, status: cap.status,
          rate: cap.rateUsed ? `${cap.rateUsed.value} USD per EUR (${cap.rateUsed.from})` : "no conversion needed", not_read: cap.notRead || [], estimated: !!cap.estimated }
          : "not read just now: the team's sheet could not be read" };
    }
    case "log_growth": {
      const growthKeys = ["followers", "subscribers", "views", "channel_views", "shorts_views", "watch_hours", "monthly_listeners", "brazil_listeners", "best_post", "best_post_link", "song", "streams", "listeners", "saves", "playlist_adds", "video_id", "official_views", "other_views", "views_6h", "follows_6h", "follows_48h", "avg_watch", "avg_watch_6h", "posts", "boosts", "top_videos", "fan_signals", "pattern", "ad_spend", "paid_views", "organic_views"];
      const hasNumbers = growthKeys.some((k) => args[k] != null && (Array.isArray(args[k]) ? args[k].length > 0 : String(args[k]).trim() !== ""));
      const checkOf = async () => {
        const c = await recordAccountCheck(store, now, roster, { ...args, by: me });
        return { account_check: c.summary, account_check_saved: !!c.saved };
      };
      /* A status-page check with no follower numbers does not mark a growth duty done. */
      if (!hasNumbers && hasAccountCheck(args)) {
        const c = await recordAccountCheck(store, now, roster, { ...args, by: me });
        return { saved: !!c.saved, duplicate: !!c.duplicate, account_check: c.summary, shown_on: "badscandal.com/hq, Needs you" };
      }
      {
        const ws = String(args.workspace || "").trim().toLowerCase();
        if ((args.genre || args.alias) && ws !== "label") throw new S.StaffError("A genre or an alias belongs on the Label workspace. Pass workspace \"label\". Nothing was written to BADSCANDAL Growth.");
        const aside = await W.fromGrowth(store, now, { ...args, by: me });
        if (aside) return aside;
      }
      const prev = me !== "Claude" && args.platform && ctx.hq ? await ctx.hq().then((h) => { const g = h && h.growth ? h.growth.find((p) => String(p.platform).toLowerCase() === String(args.platform).trim().toLowerCase()) : null; return g && g.lastDay ? { date: g.lastDay, followers: g.followers } : null; }).catch(() => null) : null;
      const r = await S.logGrowth(store, now, roster, { by: me, date: args.date, platform: args.platform, account: args.account, followers: args.followers, subscribers: args.subscribers, views: args.views, views_date: args.views_date, channel_views: args.channel_views, shorts_views: args.shorts_views, watch_hours: args.watch_hours, monthly_listeners: args.monthly_listeners, brazil_listeners: args.brazil_listeners, best_post: args.best_post, best_post_link: args.best_post_link,
        video_id: args.video_id, official_views: args.official_views, other_views: args.other_views, views_6h: args.views_6h, follows_6h: args.follows_6h, follows_48h: args.follows_48h, avg_watch: args.avg_watch, avg_watch_6h: args.avg_watch_6h, posts: args.posts, boosts: args.boosts, top_videos: args.top_videos, fan_signals: args.fan_signals, pattern: args.pattern, ad_spend: args.ad_spend, ad_currency: args.ad_currency, paid_views: args.paid_views, organic_views: args.organic_views, ads_read_at: args.ads_read_at,
        song: args.song, streams: args.streams, listeners: args.listeners, saves: args.saves, playlist_adds: args.playlist_adds, gaps: args.gaps, duty: args.duty, change: args.change, late_read: args.late_read, correct: args.correct, prev });
      const extra = hasAccountCheck(args) ? await checkOf() : {};
      const fixedWords = r.corrected && r.corrected.length ? r.corrected.map((c) => `${c.date}: ${c.from == null ? "none" : (c.from >= 0 ? "+" : "") + c.from} -> ${(c.to >= 0 ? "+" : "") + c.to}`) : null;
      if (r.duplicate) return { saved: false, duplicate: true, ...(fixedWords ? { changes_fixed: fixedWords } : {}),
        note: "Those numbers were already logged for that day. Nothing was added." + (fixedWords ? " The day-to-day change was worked out again from the day before's total and put right (changes_fixed)." : ""), ...extra };
      return { saved: true, ...(fixedWords ? { changes_fixed: fixedWords } : {}), ...(r.row.change != null && r.row.kind === "growth" ? { change: r.row.change } : {}), ...(r.filled && r.filled.length ? { filled: r.filled } : {}), ...(r.replaced && r.replaced.length ? { corrected: r.replaced } : {}),
        duty: r.duty, ...(r.gapText ? { gaps: r.gapText } : {}), ...(r.row && r.row.boosts ? { boosts_logged: r.row.boosts.length, boosts: r.row.boosts, note: "Saved on this day's growth row. It is not added to the ad cap. record_spend is not used for this." } : {}), ...(r.row && r.row.channel_views != null ? { channel_views_is: "lifetime total, not the day's views" } : {}), ...(r.row && r.row.official_views != null ? { official_views_is: "views that day on the official channel" } : {}), ...(r.row && r.row.gate_6h ? { gate_6h: r.row.gate_6h } : {}),
        ...(r.row && r.row.live && r.row.live.at === new Date(now).toISOString() && r.row.by !== "HQ" ? { later_read: `Kept beside the day's logged number as a later read (${Object.keys(r.row.live).filter((k) => k !== "at").join(", ")}). The logged day stays as it was. Send correct true only if the logged number was wrong.` } : {}),
        shown_on: "badscandal.com/hq, Growth and Songs", ...extra };
    }
    case "read_growth": {
      /* The day's best post is a boost when the ranking or an ad names it, even with no posts[] entry. */
      let ranking = null, ads = null;
      if (ctx.ig) {
        try {
          const ig = ctx.ig();
          const get = (k) => (typeof ig.get === "function" ? ig.get(k, { type: "json" }) : null);
          const [posts, adDoc, comments] = await Promise.all([get("posts.json"), get("adposts.json"), get("comments.json")]);
          ads = adDoc;
          const spend = (await S.listSpend(store, now).catch(() => [])).filter((r) => /meta|facebook|instagram/i.test((r && r.platform) || ""));
          const growth = await S.listGrowth(store, now, 2).catch(() => []);
          const boosts = (growth || []).flatMap((r) => (r && r.boosts) || []);
          if (Array.isArray(posts)) ranking = rankPosts(posts, adDoc, { now, comments: Array.isArray(comments) ? comments : [], spend, boosts });
        } catch { ranking = null; ads = null; }
      }
      return S.readGrowth(store, now, { platform: args.platform, date: args.date, song: args.song, ranking, ads });
    }
    case "open_case": {
      const r = await S.openCase(store, now, roster, { ...args, by: me });
      const c = S.caseOut(r.item);
      if (r.duplicate) return { saved: false, duplicate: true, id: c.id, status: c.status, note: "That case is already open. Use update_case on it. Nothing new was opened.", shown_on: "badscandal.com/hq, Songs" };
      return { saved: true, id: c.id, status: c.status, song: c.song, platform: c.platform, type: c.type, owner: c.owner, shown_on: "badscandal.com/hq, Songs" };
    }
    case "update_case": {
      const r = await S.updateCase(store, now, roster, { ...args, by: me });
      const c = S.caseOut(r.item);
      return { saved: true, id: c.id, status: c.status, waiting_on: c.waitingOn, waiting_since: c.waitingSince || "", next_check: c.nextCheck, decision: c.decision, shown_on: "badscandal.com/hq, Songs" };
    }
    case "read_cases":
      return S.readCases(store, now, { status: args.status, song: args.song, owner: args.owner, needs_luke: args.needs_luke });
    case "delete_case": {
      const r = await S.deleteCase(store, now, roster, { ...args, by: me });
      return { deleted: true, id: r.id, song: r.song, platform: r.platform, note: "The TEST case is gone." };
    }
    case "set_my_card": {
      if (me === "Claude") throw new S.StaffError("Cards are for the bots.");
      const c = await S.setCard(store, now, roster, { bot: me, working_on: args.working_on, needs: args.needs, blockers: args.blockers });
      return { saved: true, bot: c.bot, working_on: c.workingOn, needs: c.needs, ...(typeof c.blockers === "string" ? { blockers: c.blockers } : {}) };
    }
    case "releases": {
      if (String(args.workspace || "").trim().toLowerCase() === "label") return W.labelList(store, now);
      const [raw, sightings, messages, cardDoc] = await Promise.all([S.listReleases(store), S.getSightings(store), S.listMessages(store, now), S.readDoc(store, "action-cards.json", []).catch(() => ({ data: [] }))]);
      const actionCards = Array.isArray(cardDoc && cardDoc.data) ? cardDoc.data : [];
      const mail = S.routeNoteMailSource();
      const list = raw.map((r) => S.releaseView(r, today, { sightings, messages, actionCards }));
      const chase = me === "Nova" || me === "Claude"; /* the two who chase everyone see every step */
      const show = list.filter((v) => S.releaseActive(v) || (me === "Claude" && v.status === "draft"));
      return { you: me, today, email_watch: mail.line, inbox: mail.inbox, moderation_from: mail.from, moderation_cc: mail.cc, releases: show.sort((a, b) => ((a.date || "9") < (b.date || "9") ? -1 : 1)).map((v) => releaseCard(v, me, chase, mail)),
        pitch_slots: S.pitchSlotLines(S.pitchSlots(list, today)),
        spotify_for_artists: s4aOut(S.sightingsView(sightings, raw, today, now)),
        /* A5 (17 Nov 2026): Nova's 6-week calendar, every song's steps (drafts' release days too) */
        ...(chase ? { six_weeks: S.sixWeekLines(S.sixWeeks(list, today)) } : {}),
        how: "Read a song's whole pack with release_pack. Mark your own step with release_step. Fill your own fields with release_fill." };
    }
    case "release_pack": {
      const [raw, sightings, msgs, cardDoc] = await Promise.all([S.listReleases(store), S.getSightings(store), S.listMessages(store, now), S.readDoc(store, "action-cards.json", []).catch(() => ({ data: [] }))]);
      const r = S.findRelease(raw, args.song, { drafts: me === "Claude" });
      const actionCards = Array.isArray(cardDoc && cardDoc.data) ? cardDoc.data : [];
      const lyricsPending = msgs.some((m) => m.proposal && !m.resolved && m.needs === "decision" && (m.proposal.id === r.id || m.proposal.title === r.title) && m.proposal.pack && String(m.proposal.pack.lyrics || "").trim());
      const v = S.releaseView(r, today, { sightings, lyricsPending, messages: msgs, actionCards }), pack = r.pack || {};
      const nextStep = (v.steps || []).find((s) => s.status !== "done" && s.status !== "skipped" && !s.waiting);
      return { song: v.title, id: v.id, status: v.status === "cancelled" ? "cancelled: do not work on it" : v.status === "draft" ? "draft (not sent to the team yet)" : v.alreadyOut ? "already out (recorded for its deal: no steps)" : v.released ? "released" : "coming",
        release_day: when(v.date), days_to_go: v.daysToGo, where: v.where, deal: dealOut(v.deal), warnings: v.warnings,
        pack: S.PACK_FIELDS.map((f) => S.packFieldView(f, pack, r.steps, { storeStatus: v.store && v.store.status, nextKey: nextStep && nextStep.key, released: v.status === "scheduled" && !v.alreadyOut && !!v.date && v.date <= today })),
        missing: missingForNext(v), steps: v.steps.map((s) => stepOut(s, pack)),
        pitch: pitchOut(v.pitch),
        approvals: { pitch: approvalOut(v.approvals.pitch, "pitch"), lyrics: approvalOut(v.approvals.lyrics, "lyrics") },
        store: storeOut(v.store),
        how: "Everything you need for your step should be here. If a field you need is missing: mark your step blocked with release_step, naming the field, and send Luke ONE message naming the field (only once). Mark your step with release_step." };
    }
    case "spotify_upcoming": {
      const r = await S.reportSightings(store, now, roster, { by: me, releases: args.releases, note: args.note });
      const sv = S.sightingsView(r.doc, await S.listReleases(store), today, now);
      return { saved: true, at: r.doc.sp, songs: sv.items.length, ...(sv.items.length ? {} : { note: "Recorded: nothing is upcoming in Spotify for Artists." }),
        in_the_pipeline: sv.items.filter((x) => x.state === "pipeline").map((x) => x.title),
        not_in_the_pipeline: sv.items.filter((x) => x.state === "unknown").map((x) => `${x.title}, ${x.dateWords}: Luke is asked what it is`),
        answered_by_luke: sv.items.filter((x) => x.state === "answered" || x.state === "retry").map((x) => `${x.title}: ${x.answer.text}`),
        steps_done: r.completed.map((c) => `${c.title}: ${c.label} (the Spotify pitch is open now)`),
        shown_on: "badscandal.com/hq, Upcoming" };
    }
    case "pitch_log": {
      const r = await S.logPitch(store, now, roster, { by: me, song: args.song, pitched_on: args.pitched_on, playlist: args.playlist, added_on: args.added_on });
      const p = r.view.pitch;
      return { saved: true, song: r.release.title, ...(p && p.line ? { pitch: p.line, status: p.status } : {}),
        ...(r.pitchChange ? { pitched_on: when(r.pitchChange) } : {}),
        ...(r.editChange ? { editorial: r.editChange, added_on: when(args.added_on) } : {}),
        ...(r.already ? { already: "Already recorded. Nothing new." } : {}),
        note: "HQ never pitches a song. This only records what you already sent, or a playlist you saw, in Spotify for Artists.",
        shown_on: "badscandal.com/hq, Upcoming" };
    }
    case "profiles": {
      const action = String(args.action || "list").trim().toLowerCase();
      if (action === "list" || !args.action) {
        const view = S.profilesView(await S.getProfiles(store), await S.listMessages(store, now), args.platform || args.platform_filter);
        /* v18, 21 Nov 2026: the note is said once ("The owner uploads…"), no second "You upload…" line */
        return { note: view.note,
          profiles: view.platforms.map((p) => ({ platform: p.platform, owner: p.owner ? `${p.owner} uploads this` : "no owner yet: Luke uploads this himself",
            /* v18, 21 Nov 2026 (Atlas, Steve, Laura): a recorded live link reads Live, not Waiting (the page already did) */
            images: p.slots.map((s) => ({ id: s.id, kind: s.kind, rule: s.rule, size: s.sizeLine || "", status: s.current && s.status === "waiting" ? "Live" : s.statusLine || "",
              current: s.current ? { link: s.current.link, changed: s.current.changed, by: s.current.by } : "not recorded yet",
              waiting_for_luke: s.waiting ? { link: s.waiting.link, message: s.waiting.id } : null,
              said_yes: s.approved ? { link: s.approved.link, upload: `${p.owner || "Luke"} uploads it by hand. HQ does not change the platform.` } : null,
              last_check: s.check ? { result: s.check.result, by: s.check.by, at: s.check.at, after_lukes_upload: s.check.fresh } : null })) })),
          shown_on: "badscandal.com/hq, Profiles" };
      }
      if (action === "record") return S.recordProfile(store, now, roster, { by: me, platform: args.platform, image: args.image, link: args.link, changed: args.changed || args.changed_on });
      if (action === "propose") {
        const r = await S.proposeProfile(store, now, roster, { by: me, platform: args.platform, image: args.image, link: args.link, width: args.width, height: args.height, format: args.format, size_mb: args.size_mb, why: args.why });
        const who = r.slot.owner || "Luke";
        return { asked: true, message_id: r.message.id, platform: r.slot.platform, image: r.slot.kind, rule: r.rule,
          note: `Luke is asked "Yes, correct" or "No" (message ${r.message.id}). Nothing is uploaded until he says yes. Then ${who} uploads it by hand and records it. HQ does not log in and does not change the platform.`,
          shown_on: "badscandal.com/hq, Profiles and Messages" };
      }
      throw new S.StaffError("action must be list, record or propose.");
    }
    case "content_ideas": {
      const posting = Array.isArray(args.ideas) || Array.isArray(args.posts) || String(args.compared || "").trim();
      if (!posting) return { you: me, ...(await S.readContentIdeas(store)) };
      return S.saveContentIdeas(store, now, { by: me, posts: args.posts, ideas: args.ideas, compared: args.compared, next_song: args.next_song, comment: args.comment, dm: args.dm, reply: args.reply, ad: args.ad, boost: args.boost, publish: args.publish });
    }
    case "licence_queue": {
      const said = String(args.luke_said || "").trim();
      const proof = String(args.proof_link || args.link || "").trim();
      if (said) {
        if (me === "Licence" || !["Nova", "Claude", "Luke"].includes(me)) throw new S.StaffError("Only Luke says yes to a licence. Nova records his exact words. You cannot record the yes yourself. Nothing was saved.", "not_allowed");
        if (!args.song) throw new S.StaffError("Which cover? Pass song with luke_said. Nothing was saved.");
        await W.recordLicenceYes(store, now, { by: me, song: args.song, words: said, amount: args.amount });
        if (!proof) return { saved: true, luke_yes: true, status: "waiting on licence", note: "Luke's yes is recorded. The licence stays waiting on licence until the Licence bot or Nova saves a proof link. HQ did not take payment." };
        if (me !== "Nova") return { saved: true, luke_yes: true, status: "waiting on licence", note: "Luke's yes is recorded. Only the Licence bot or Nova can mark it licensed, with a proof link. HQ did not take payment." };
      }
      if (proof) return W.markLicenceDone(store, now, { by: me, song: args.song, proof_link: proof, amount: args.amount });
      if (!["Licence", "Nova", "Claude", "Luke"].includes(me)) throw new S.StaffError("The licence queue is for the Licence bot. Ask Nova if you need it.", "not_allowed");
      return { you: me, ...(await W.licenceQueue(store, now)) };
    }
    case "release_step": {
      if (String(args.workspace || "").trim().toLowerCase() === "label" || String(args.step || "").trim().toLowerCase() === "licence") {
        const card = await W.markLabelStep(store, now, { ...args, by: me });
        const want = String(args.step || "").trim().toLowerCase();
        const st = card.steps.find((s) => s.key === want);
        return { saved: true, workspace: "label", song: card.title, step: st.key, label: st.label, owner_bot: st.owner_bot, status: st.status,
          ...(st.key === "licence" ? { shown: st.shown || (st.status === "licensed" ? "licensed" : "waiting on licence"), proof_link: st.proof_link || "" } : {}),
          ...(st.note ? { note: st.note } : {}),
          licence: card.licence, upload: card.uploadBlocked ? "blocked" : "open",
          ...(card.licence && (card.licence.status === "paid" || card.licence.status === "licensed") ? { payment: "HQ did not take or send any payment." } : {}),
          shown_on: "badscandal.com/hq, Label" };
      }
      const r = await S.setStep(store, now, roster, { by: me, id: args.song, step: args.step, status: args.status, note: args.note, link: args.link, done_on: args.done_on, due: args.due });
      const want = String(args.step || "").trim().toLowerCase();
      const st = S.releaseView(r, today).steps.find((s) => s.key === want || s.label.toLowerCase() === want);
      return { saved: true, song: r.title, step: st.key, label: st.label, state: stepState(st), due: when(st.due), ...(st.note ? { note: st.note } : {}), ...(st.link ? { link: st.link } : {}),
        ...(st.status === "done" && st.doneOn ? { done_on: when(st.doneOn) } : {}), shown_on: "badscandal.com/hq, Upcoming and the live log" };
    }
    case "store_status": {
      const r = await S.setStoreStatus(store, now, roster, { by: me, id: args.song, status: args.status, reason: args.reason, note: args.note, on: args.on, ready_to_resubmit: args.ready_to_resubmit });
      return { saved: true, song: r.release.title, status: r.store.status, ...(r.store.reason ? { reason: r.store.reason } : {}), history: r.store.history.length,
        ...(r.asked ? { asked_luke: r.asked, note: r.already ? "Luke was already asked and hasn't answered yet: his answer comes back to you in my_day." : "Luke is asked: Yes, resubmit / Not yet. His answer comes back to you in my_day. Do not resubmit before he says yes." } : {}),
        shown_on: "badscandal.com/hq, Upcoming" };
    }
    case "roster_card": {
      const b = await S.editRosterCard(store, now, roster, { by: me, for: args.for, duty: args.duty, why: args.why, time: args.time, role: args.role, schedule: args.schedule });
      return { saved: true, bot: b.name, duty: b.duty, time: b.time, schedule: (b.schedule || []).map((x) => `${x.time}: ${x.what}`), note: "The bot's my_day says this from now on." };
    }
    case "song_pages": {
      /* how each build ended (A2, 17 Nov 2026): a failed one says "not done: <why>". Read here, never saved or
         sent: the hourly job keeps the report and tells the bot that asked (18 Nov 2026, handoff bug 6) */
      let peek = {};
      try { peek = await S.peekSongBuilds(store, now); } catch { peek = {}; }
      const list0 = await S.songPages(store, now, peek);
      /* v18, 21 Nov 2026 (Webmaster): each request says where its release step is */
      const rels = await S.listReleases(store).catch(() => []);
      const list = list0.map((q) => {
        const key = q.what.startsWith("Spotify link") ? "live" : q.what.startsWith("new page") ? "page" : "";
        const r = key ? rels.find((x) => x && x.status !== "cancelled" && (x.id === q.slug || S.songKey(x.title) === q.slug)) : null;
        const st = r ? (S.releaseView(r, S.spDay(now)).steps || []).find((x) => x.key === key) : null;
        return st ? { ...q, release_step: `${st.label}: ${stepState(st)}` + (st.status === "done" ? "" : `, due ${dueOut(st)}`) } : { ...q, release_step: key ? "no release on the desk for this song" : "no release step" };
      });
      const card = S.homeCardNow(), rule = homeCardSong(SONGS, S.spDay(now));
      const fetchFn = ctx.fetch || globalThis.fetch;
      const checkedAt = S.spStamp(now);
      const live = await Promise.all(SONGS.map(async (s) => {
        const url = `https://badscandal.com/${s.slug}`;
        if (typeof fetchFn !== "function") return { slug: s.slug, status: null, note: "couldn't check" };
        try {
          const res = await fetchFn(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined });
          return { slug: s.slug, status: res.status, ok: res.status === 200, checked_at: checkedAt };
        } catch { return { slug: s.slug, status: null, checked_at: checkedAt, note: "couldn't check" }; }
      }));
      const bySlug = Object.fromEntries(live.map((x) => [x.slug, x]));
      const asked = new Set(list.map((r) => r.slug));
      return { requests: list, pages: S.liveSongPages().map((p) => { const c = bySlug[p.slug] || {}; const words = c.note === "couldn't check" || c.status == null ? `couldn't check (${c.checked_at || checkedAt})` : c.ok ? `200 at ${c.checked_at}` : `${c.status} at ${c.checked_at}`; return { ...p, live: words, status: c.status ?? null, checked_at: c.checked_at || checkedAt, ...(asked.has(p.slug) ? {} : { history: "built before the desk" }) }; }), home_card: { now: card.title ? `${card.title} (${card.mode})` : "nothing", should_show: rule ? rule.title : "nothing", why: rule ? rule.why : "no song pages yet",
        ...(rule && rule.slug !== card.slug ? { to_do: `Ask Luke with song_page kind card, slug ${rule.slug}` } : { to_do: "nothing: the card shows the right song" }) } };
    }
    case "upload_cover": {
      const r = await S.uploadCover(store, now, roster, { by: me, song: args.song, image_base64: args.image_base64, url: args.url });
      return { saved: true, link: r.link, width: r.width, height: r.height, ...(r.warnings && r.warnings.length ? { warnings: r.warnings } : {}), note: "Use this link as cover in song_page. It is public: it goes on the song page anyway." };
    }
    case "song_page": {
      const r = await S.proposeSongPage(store, now, roster, { by: me, kind: args.kind, slug: args.slug, title: args.title, date: args.date, cover: args.cover, artists: args.artists, track: args.track, isrc: args.isrc, why: args.why });
      return { asked: true, id: r.message.id, question: r.message.text, ...(r.proposal && r.proposal.isrc_warning ? { warning: r.proposal.isrc_warning } : {}), ...(r.proposal && r.proposal.stripped_si ? { note_link: S.SI_REMOVED } : {}), note: "Nothing is built yet. Luke answers Yes, correct or No; on his yes GitHub builds it (about 2 minutes) and you get a message on the desk." };
    }
    case "propose_release": {
      const r = await S.proposeRelease(store, now, roster, { by: me, song: args.song, title: args.title, date: args.date, pack: args.pack, send: args.send, why: args.why });
      return { asked: true, id: r.message.id, question: r.message.text, changes: r.changes.map((c) => `${c.label}: ${c.from ? `${c.from} → ` : ""}${c.to || "(empty)"}`),
        note: "Nothing has changed yet. Luke answers Yes, correct or No on the dashboard (or tells Alfred or Nova); you get a message on the desk when it is done, or why not." };
    }
    case "release_fill": {
      const r = await S.fillRelease(store, now, roster, { by: me, id: args.song, field: args.field, value: args.value });
      const f = S.PACK_FIELDS.find((x) => x.key.toLowerCase() === String(args.field || "").trim().toLowerCase());
      const v = r.pack[f.key];
      return { saved: true, song: r.title, field: f.key, label: f.label, value: v.length > 200 ? v.slice(0, 200) + `… (${v.length} characters saved)` : v };
    }
    case "account_health": {
      /* the same inputs as the board (stored Instagram copy, song-page builds), so the tool and Luke's
         phone show the same health (18 Nov 2026: the tool read without them) */
      const report = await healthReport(store, now, { ig: ctx.ig ? ctx.ig() : null });
      return { read_only: true, wrote: false, accounts: (report.accounts || []).map((a) => ({ id: a.id, label: a.label, owner: a.owner, state: a.state, headline: a.headline })),
        ...(report.connection ? { connection: report.connection } : {}), note: "Read only. Nothing was fetched from a platform and nothing was written." };
    }
    case "needs_you": {
      /* the ONE list (S.waitingOnLuke on needsDesk, 18 Nov 2026): the number on Luke's phone, Today's line and
         the app badge. Texts say who and what kind; the first line of a question is masked like my_day's. */
      const [desk, board, hqAns] = await Promise.all([needsDesk(store, now, { ig: ctx.ig ? ctx.ig() : null }), C.workspaceNeeds(store, now, "badscandal"), ctx.hq ? ctx.hq().catch(() => null) : null]);
      const cap = hqAns && hqAns.money && hqAns.money.cap;
      const counted = { ...desk, notRead: cap && Array.isArray(cap.notRead) ? cap.notRead : [], lukeTasks: (hqAns && hqAns.team && hqAns.team.tasks) || [] };
      const count = C.needsCount(counted, today, now);
      const rows = needRows(count, desk.messages);
      return { read_only: true, wrote: false, total: count.total, line: count.line, by_kind: count.byKind, quiet_hours: !!board.quiet,
        waiting: rows, open: count.total, needs_you: rows, held_until_morning: board.held || [],
        ...(desk.health ? {} : { accounts_note: "Account health could not be read just now: red accounts are not in total." }),
        note: "Read only. total is the number on Luke's phone. Nothing was changed." };
    }
    case "read_guide": {
      const g = await S.getGuide(store);
      /* the live rules win over a stored guide from 12 Nov (18 Nov 2026 night test). The stored text is not rewritten. */
      const live = `The connector has ${TOOLS.length} tools right now: ${TOOLS.map((t) => t.name).join(", ")}. Where the guide below says otherwise, this line and the tools' own descriptions are right.`;
      const current = [
        /* 24 Nov 2026, Luke: money is no longer on HQ. This line wins over the money rules in an older stored guide. */
        "CURRENT MONEY RULE (it wins over any older date in the guide below): HQ no longer handles money. No income, payments, Revolut or income sheet. Stop checking them and delete money tasks. Ad spend stays: record_spend and the USD 1,000 cap.",
        "GROWTH (19 Nov 2026). Daily numbers are logged on the desk with log_growth and read back with read_growth. They are not written into a Google Sheet. YouTube's count is subscribers, not followers. watch_hours may be a decimal (56.6). A YouTube video may be a video id when there is no https link. official_views and other_views are that day's views. channel_views is the lifetime total. TikTok fan signals go in fan_signals (handle, quote, link), the same idea as the Instagram fan inbox. A missing number is left out. The page says not reported. Do not send a zero you did not see.",
        `RouteNote mail is read from ${S.ROUTE_NOTE_INBOX} (Lilian's mail is forwarded there). A draft to a moderation team is From ${S.MODERATION_FROM}, CC ${S.MODERATION_CC}. HQ does not send the email.`,
      ].join("\n");
      let text = g.text || BUILT_IN_GUIDE;
      text = text.replace(/eighteen tools/gi, `${TOOLS.length} tools`);
      /* v18 (21 Nov 2026, Forge): the stored guide's old count and version line */
      const NUM_WORD = "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|\\d+)";
      text = text.replace(new RegExp(`\\b${NUM_WORD}\\s+new\\s+tools?\\s*:\\s*${NUM_WORD}\\s+in all\\b`, "gi"), `${TOOLS.length} tools in all`);
      const COUNT_WORD = "(?:ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|\\d{2})";
      text = text.replace(new RegExp(`\\b${COUNT_WORD}\\s+in all\\b`, "gi"), `${TOOLS.length} tools in all`);
      text = text.replace(new RegExp(`\\b${COUNT_WORD}\\s+tools\\b`, "gi"), `${TOOLS.length} tools`);
      text = text.replace(/\bv\d+,\s*((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{1,2}\s+[A-Z][a-z]{2}\s+20\d{2})\b/g, "first written $1");
      text = text.replace(/you still write your numbers into the Google Sheets exactly as before[^.]*\./gi, "Growth, Songs and Fans are logged on the desk with log_growth. Read them with read_growth. They are not written into a Google Sheet.");
      return `${current}\n\n${live}\n\n` + (g.text ? `STAFF GUIDE (stored ${g.at ? g.at.slice(0, 10) : "?"}; the current rules above win)\n\n${text}` : text);
    }
  }

  /* the rest need the whole desk and, when it can be read, the dashboard's numbers */
  const [desk, hqAns, cardDoc] = await Promise.all([S.loadDesk(store, now), ctx.hq ? ctx.hq().catch(() => null) : null, S.readDoc(store, "action-cards.json", []).catch(() => ({ data: [] }))]);
  const hq = hqAns && hqAns.team ? hqAns : null;
  read.list = desk.messages;
  const b = S.board(desk, now, hq);
  const actionCards = Array.isArray(cardDoc && cardDoc.data) ? cardDoc.data : [];
  const rel = (desk.releases || []).map((r) => S.releaseView(r, today, { sightings: desk.sightings, messages: desk.messages, actionCards }));
  const sheetNote = hq ? null : "The team's Google Sheet could not be read just now, so duties and tasks are missing from this answer. Carry on with your job card.";
  const luke = await oneNeeds(store, now, ctx, desk, hqAns);
  /* no duty row for the caller: before Nova's reset (no rows for anyone yet) that is expected, and work
     done now still counts (batch 5); after it, the row is missing */
  const resetAt = S.dutyResetTime(roster);
  const hmNow = S.spHM(now);
  const quietHours = hmNow >= "23:00" || hmNow < "08:00";
  const beforeReset = !!(resetAt && hmNow < resetAt);
  /* note and next say the same thing about the duty. Before the rows exist, or in quiet hours, do not
     say "do your daily duty now" (18 Nov 2026 night test). */
  const dutyLine = (hasRows) => (quietHours || beforeReset) && !hasRows
    ? "Today's duties appear after 07:00. Work you finish now still counts, and shows as done once your row appears."
    : !hasRows
      ? "The task board has no duty row for you today. Do your daily duty at your usual time anyway, and tell Nova the row is missing."
      : "Do your duty, then call post_update with status done and the number. If you are stuck, post_update with status blocked and say what is needed.";
  const waitingSpotify = (w) => {
    const steps = w.releaseSteps || [];
    const realLate = (w.duties || []).some((d) => d.late) || steps.some((s) => s.late);
    const spot = steps.some((s) => s.key === "spotify" && s.waiting && /spotify/i.test(s.waitingText || ""));
    return !realLate && spot;
  };
  const worker = (w) => ({ name: w.name, role: w.role, state: waitingSpotify(w) ? "waiting on Spotify" : w.state, ...(waitingSpotify(w) ? { waiting_on: "Spotify" } : {}), duties: w.duties.map((d) => ({ id: d.id, task: S.freshDuty(d.task), due: d.due || "today", status: d.late ? "late" : d.status, ...(d.blocker ? { blocker: d.blocker } : {}) })),
    last_update: w.last ? `${w.last.at} ${w.last.status}: ${w.last.message}${w.last.link ? " " + w.last.link : ""}` : "none",
    for_luke: w.last ? `${w.name}: ${forLuke(w.last.message) || "Update posted."}` : "No update yet",
    working_on: w.card ? w.card.workingOn : "", needs: w.card ? w.card.needs : "",
    open_tasks: w.tasks.length, late_tasks: w.lateTasks, waiting_on_it: w.waiting.length, last_used_the_desk: w.seen ? S.spStamp(Date.parse(w.seen)) : "never" });
  /* everything new for the caller since its last read (S.messagesFor), not repeating what the same answer
     already lists (shown = ids); a reply to one of its own messages carries the start of that message */
  const byId = Object.fromEntries(desk.messages.map((m) => [m.id, m]));
  const forYou = (shown) => {
    const got = S.messagesFor(desk.messages, me, readSince), skip = new Set(shown);
    return { messages_for_you: got.list.filter((m) => !skip.has(m.id)).map((m) => ({ ...short(m), ...(m.re && byId[m.re] && byId[m.re].from === me ? { answering_yours: byId[m.re].text.slice(0, 160) } : {}) })),
      ...(got.more ? { more_messages: `${got.more} older message${got.more === 1 ? "" : "s"} for you did not fit here: call read_messages to see ${got.more === 1 ? "it" : "them"}.` } : {}) };
  };

  switch (tool.name) {
    case "my_day": {
      const conn = connectorStatus(TOOLS, args); /* the bots share ONE connector: their app lists every tool */
      const card_answers = await C.answersFor(store, me);
      const luke_tap = args.luke_tap && typeof args.luke_tap === "object" ? await C.checkTap(store, args.luke_tap, now) : null;
      const questions = (from) => desk.messages.filter((m) => S.isOpen(m) && m.to === "Luke" && m.from === from).map((m) => {
        const link = S.httpsLink(m.link) || (Array.isArray(m.links) ? m.links.map((x) => S.httpsLink(x)).find(Boolean) : "");
        return { id: m.id, needs: m.needs, waiting: S.waitedFor(now - Date.parse(m.at)), since: m.sp, text: S.excerptText(S.hidePrivate(m.text), 160), ...(link ? { link } : {}) };
      });
      if (me === "Claude") return { ...(conn.reconnect_needed ? { reconnect: conn.status } : {}), connector: { tools: conn.tools, version: conn.version, reconnect_needed: conn.reconnect_needed }, you: "Claude", today, now: b.now, waiting_on_you: b.waiting.claude.map(short), questions_to_luke: questions("Claude"), card_answers, ...(luke_tap ? { luke_tap } : {}), ...forYou(b.waiting.claude.map((m) => m.id)), waiting_on_luke: luke.rows,
        releases: rel.filter((v) => S.releaseActive(v) || v.status === "draft").map((v) => `${v.title}: ${v.status === "draft" ? "draft" : v.released ? "released" : "coming"}, ${when(v.date)}, ${v.counts.done} of ${v.counts.total} steps done` + (v.counts.late ? `, ${v.counts.late} late` : "") + (v.counts.blocked ? `, ${v.counts.blocked} blocked` : "") + (v.missing.length ? `; missing: ${v.missing.map((m) => m.short).join(", ")}` : "")),
        unknown_in_spotify: b.sightings.items.filter((x) => x.state === "unknown").map((x) => `${x.title}, ${x.dateWords}`),
        ...(sheetNote ? { note: sheetNote } : {}) };
      const w = b.staff.find((x) => x.name === me);
      const rs = w.releaseSteps.map((s) => ({ song: s.title, step: s.key, label: s.label, due: s.waitingFor === "spotify-window" ? SPOTIFY_WHEN : (s.waiting || S.blockIsWait(s)) ? "when it can start" : when(s.due), state: stepState(s), ...(s.note ? { note: s.note } : {}), ...(s.link ? { link: s.link } : {}),
        ...(s.spotifyTrack ? { spotify_track: s.spotifyTrack } : {}), ...((s.waiting || S.blockIsWait(s)) ? { waiting_for: s.waiting ? waitFor(s) : (s.note || "the note on this step") } : {}), ...(s.key === "spotify" ? { how: SPOT_HOW } : {}) }));
      /* the soonest step the bot can work on now; a waiting one (including a block that is only a wait) is not today's job */
      const firstRs = w.releaseSteps.find((s) => !s.waiting && !S.blockIsWait(s));
      const lyricsReady = rel.filter((v) => v.pack && v.pack.lyrics).map((v) => v.title);
      const lyricsPending = desk.messages.filter((m) => m.proposal && !m.resolved && m.needs === "decision" && m.proposal.pack && String(m.proposal.pack.lyrics || "").trim()).map((m) => m.proposal.title);
      const lyricOpt = { lyricsReady, lyricsPending };
      const titles = rel.map((v) => v.title);
      const notes = desk.messages.filter((m) => S.noteStillCurrent(m, { now, releases: rel })).slice(0, 5);
      /* the spotify step is done by the daily report, never by release_step (11 Nov 2026, review) */
      const spotNext = firstRs && firstRs.key === "spotify";
      const nextRel = rel.find((v) => v.date && v.date >= today);
      let igConnected = false;
      try { if (ctx.ig) { const st = await ctx.ig().get("state.json"); igConnected = !!(st && (st.lastOkAt || st.username)); } } catch {}
      const knownDuty = INSTRUCTION_LINES.map(([, text]) => text);
      const full = (S.DEFAULT_ROSTER.find((b) => b.name === me) || {}).duty || "";
      const dutyPool = [full, ...knownDuty, ...S.DEFAULT_ROSTER.map((b) => b.duty || "")];
      const uncut = (duty) => S.fullDuty(duty, dutyPool);
      const dutyShown = S.dutyPair(w.duty, dutyPool);
      const dutyTask = (task) => (me === "Atlas" && /monthly listeners in note|salvation/i.test(task || "")
        ? "Log yesterday's Spotify numbers for every released song, plus monthly listeners and Brazil listeners in their own fields (monthly_listeners and brazil_listeners)."
        : uncut(task));
      const clearBlock = (text) => S.blockerForDuty("", S.freshBlocker(text, { igConnected, ...lyricOpt }), titles);
      const shownBlocker = clearBlock(w.blockers);
      const signedBits = [];
      for (const person of b.staff) for (const bit of [person.blockers, person.card && person.card.needs, person.card && person.card.workingOn]) if (bit) signedBits.push({ who: person.name, text: bit });
      const signedRaw = signedBits.map((x) => `${x.who}: ${x.text}`);
      const signedOut = S.signedOutLines(signedBits).filter((x) => x.who === me).map((x) => x.line);
      const backIn = S.signedInAgain(signedBits); /* v18: T-30's "TikTok Ads sign-in" when TikTok is back */
      const duties = w.duties.filter((d) => !S.staleTask(d)).map((d) => {
        const blocker = S.blockerForDuty(d.task, S.freshBlocker(d.blocker, { igConnected, ...lyricOpt }), titles);
        const status = d.late ? "late" : (d.status === "blocked" && !blocker ? "todo" : d.status);
        return { id: d.id, task: dutyTask(d.task), due: d.due || "today", status, ...(blocker ? { blocker } : {}) };
      });
      const licenceDay = me === "Licence" ? await W.licenceQueue(store, now) : null;
      const sparkDay = me === "Spark" ? await S.readContentIdeas(store) : null;
      return { ...(conn.reconnect_needed ? { reconnect: conn.status } : {}), connector: { tools: conn.tools, version: conn.version, reconnect_needed: conn.reconnect_needed }, you: me, role: w.role, why_you_are_needed: S.freshWhy(me, w.why), today, now_sao_paulo: b.now,
        ...(w.grok ? { grok_bot: w.grok } : {}),
        ...(licenceDay ? { reports_to: "Nova", licence_queue: licenceDay, idle_until: "Luke starts a cover. He writes the covers and keeps the songs." } : {}),
        ...(sparkDay ? { reports_to: "Nova", content_ideas: sparkDay, posts: "Read only. Never post, comment, send a DM, or touch an ad." } : {}),
        ...(me === "Atlas" ? { numbers_how: "Monthly listeners and Brazil listeners go in log_growth as monthly_listeners and brazil_listeners. They are not a note." } : {}),
        /* 24 Nov 2026 (Luke): "fully remove the rights section ... leave a note for the bots to ignore this" */
        ...(me === "Laura" ? { rights_removed: "The Rights page is gone. Stop checking YouTube Content ID claims for HQ and delete any task about them. A real problem with a video is still a dispute: open_case." } : {}),
        daily_duty: dutyShown.text, daily_duty_full: dutyShown.full, usual_time: w.time, schedule: S.scheduleForMyDay(me, w.schedule, { today, releases: rel, nextDate: nextRel && nextRel.date, duty: duties[0] }),
        duties_today: duties,
        open_tasks: w.tasks.filter((t) => !S.staleTask(t) && S.signInOpen(t, signedRaw.join(" "))).map((t) => ({ id: t.id, task: dutyTask(t.task), deadline: /^invalid date$/i.test(String(t.deadline || "")) ? "" : t.deadline, status: t.late ? "late" : t.status, ...(t.blocker ? { blocker: t.blocker } : {}), ...(S.blockerCheck(t.blocker, backIn) ? { blocker_check: S.blockerCheck(t.blocker, backIn) } : {}), ...(t.note ? { your_note: t.note } : {}) })),
        questions_to_luke: questions(me), card_answers, ...(luke_tap ? { luke_tap } : {}),
        ...(signedOut.length ? { signed_out_accounts: signedOut.slice(0, 6) } : {}),
        waiting_on_you: w.waiting, waiting_on_luke: luke.rows, notes_for_everyone: notes.map(short), ...forYou(w.waiting.map((m) => m.id).concat(notes.map((m) => m.id))),
        your_last_update: (() => {
          if (!w.last) return "none yet";
          let line = `${w.last.at} ${w.last.status}: ${w.last.message}${w.last.link ? " " + w.last.link : ""}`;
          if (w.last.status === "blocked") {
            const fresh = S.freshBlocker(w.last.message, { igConnected, ...lyricOpt });
            const cardClear = w.card && !String(w.card.blockers || "").trim() && w.card.oldBlockers;
            if (fresh === "" || cardClear) line += " (stale: that blocker was resolved)";
          }
          return line;
        })(),
        ...(shownBlocker && !w.blockersStale ? { your_known_blockers: shownBlocker, your_known_blockers_how: 'If this no longer stands in your way, clear it: set_my_card with blockers "" (empty). working_on can be left out. If it changed, send the new words in blockers.' } : {}),
        ...(shownBlocker && w.blockersStale ? { your_known_blockers_old: "old, still true? " + shownBlocker, your_known_blockers_how: 'This blocker is more than 48 hours old, so it is off the headline. If it still stands, send it again with set_my_card (blockers). If it does not, send blockers "".' } : {}),
        /* 24 Nov 2026, Luke: "leave a note for the bots telling them to stop checking all things related to money and
           delete any tasks related to money". Ledger and Sheet get it at the start of every run until Luke gives them new work. */
        ...(MONEY_STOP_BOTS.includes(me) ? { money_stopped: MONEY_STOP } : {}),
        /* L5: Verse, on a release day only. Not a sheet duty, and not the lyrics. */
        ...(me === "Verse" ? { lyrics_duty: rel.filter((v) => v.status === "scheduled" && v.daysToGo != null && v.daysToGo >= 0 && v.daysToGo <= 14).map((v) => `${v.title}: submit the approved lyrics on Musixmatch when the song shows there. A song not on Musixmatch yet is not a block.`) } : {}),
        release_steps: rs, rules: RULES,
        next: (spotNext ? `Report what Spotify for Artists shows as upcoming with spotify_upcoming: the first report that lists ${firstRs.title} marks "${firstRs.label}" done (due ${when(firstRs.due)}${firstRs.late ? ", LATE" : ""}). Do not mark it with release_step.${rs.length > 1 ? ` You have ${rs.length} open release steps in all: see release_steps.` : ""} `
          : firstRs ? `You have ${rs.length} open release step${rs.length === 1 ? "" : "s"}; the soonest is "${firstRs.label}" for ${firstRs.title}, due ${when(firstRs.due)}${firstRs.late ? " (LATE)" : ""}. Read the pack with release_pack, do it, then mark it with release_step (done only when it is really done). `
          : rs.length ? `Your release step${rs.length === 1 ? " is" : "s are"} waiting for ${rs.every((x) => x.waiting_for === rs[0].waiting_for) ? rs[0].waiting_for : "the step before"}: nothing to do on ${rs.length === 1 ? "it" : "them"} yet. ` : "") +
          (me === "Atlas" && !spotNext ? "Every day: report what Spotify for Artists shows as upcoming with spotify_upcoming. " : "") +
          (me === "Atlas" ? "Record a pitch you sent with pitch_log (pitched_on). When you see a new editorial playlist in Spotify for Artists, record it with pitch_log (playlist and added_on) the same day. HQ never pitches. " : "") +
          dutyLine(duties.length),
        next_one: !duties.filter((d) => d.status !== "done").length && !rs.length ? "Done for today" : S.clipWords(firstRs ? `${firstRs.label} for ${firstRs.title}` : (duties.find((d) => d.status !== "done") || {}).task || "Done for today", 140),
        ...((() => { const dutyNote = !duties.length && !w.paused ? dutyLine(false) : ""; const note = [dutyNote, sheetNote].filter(Boolean).join(" "); return note ? { note } : {}; })()) };
    }
    case "team_board":
      return { today, now_sao_paulo: b.now, duties: hq ? { done: hq.team.duties.done, total: hq.team.duties.total, late: hq.team.duties.late, blocked: hq.team.duties.blocked } : "not read",
        team: b.staff.map(worker), waiting_on_luke: luke.rows, waiting_on_claude: b.waiting.claude.map(short), waiting_on_bot: b.waiting.claude.map(short), open_messages_for_bots: b.waiting.bots,
        latest_updates: dedupeGrowthUpdates(pastBlocks(b.updates).slice(0, 20).map((u) => `${u.sp} ${u.bot} ${u.status}: ${u.message}${u.link ? " " + u.link : ""}`)),
        latest_for_luke: S.lukeUpdates(b.updates),
        growth: S.growthOnce(await S.listGrowth(store, now, 2)),
        releases: rel.filter(S.releaseActive).map((v) => ({ song: v.title, date: when(v.date), done: `${v.counts.done} of ${v.counts.total}`, late: v.counts.late, blocked: v.counts.blocked,
          late_steps: v.steps.filter((s) => s.late).map((s) => `${s.label} (${s.owner})`), warnings: v.warnings })),
        spotify_for_artists: s4aOut(b.sightings),
        ...(sheetNote ? { note: sheetNote } : {}) };
    case "luke_briefing": {
      const cap = hq && hq.money ? hq.money.cap : null;
      /* the merged list (sheet + desk) when the sheet was read; else the desk's own next release */
      const deskNext = rel.filter((v) => v.status === "scheduled" && v.date && v.date >= today).sort((a, x) => (a.date < x.date ? -1 : 1))[0];
      const next = hq ? hq.next : deskNext ? { song: deskNext.title, date: deskNext.date, daysToGo: deskNext.daysToGo, steps: deskNext.steps.map((s) => ({ label: s.label, owner: s.owner, late: s.late })) } : null;
      /* "none planned" only when the sheet WAS read (11 Nov 2026): with it unread, an earlier release in
         its Releases tab can't be ruled out, so the desk's own next release says so, and nothing is "not read" */
      const note = desk.messages.find((m) => m.from === "Claude" && m.to === "Luke" && now - Date.parse(m.at) < 36 * 3600000) || null;
      const quiet = b.staff.filter((w) => !w.paused && w.duties.length && w.duties.some((d) => d.status !== "done")).map((w) => `${w.name} (${w.duties.filter((d) => d.status !== "done").map((d) => (d.late ? "late" : d.status)).join(", ")})`);
      return { today, now_sao_paulo: b.now,
        site_check: b.report ? { at: b.report.sp, text: b.report.text } : "The site has not run its check yet.",
        claude_note: note ? { at: note.sp, text: note.text } : "none",
        decisions_waiting_on_luke: luke.briefingRows,
        /* v18 (21 Nov 2026, Forge): one plain sentence for the days that were not read (Google since 14 Nov).
           The six keys stay as they were; not_read is added only when something was not read. */
        ad_spend: cap ? { month: cap.month, spent: `${cap.currency} ${cap.spent.toFixed(2)}`, cap: `${cap.currency} ${cap.amount}`, left: `${cap.currency} ${cap.left.toFixed(2)}`, status: cap.status, estimated: cap.estimated,
          ...((() => { const u = S.unreadSpendLine(cap.notRead || []); return u ? { not_read: u } : {}; })()) } : "not read",
        next_release: next ? { song: next.song, date: next.date, days_to_go: next.daysToGo, late_steps: next.steps.filter((s) => s.late).map((s) => `${s.label} (${s.owner})`),
          ...(hq ? {} : { source: "the desk only: the sheet's Releases tab was not read, so an earlier release there can't be ruled out" }) } : hq ? "none planned" : "not read",
        unknown_in_spotify: b.sightings.items.filter((x) => x.state === "unknown").map((x) => `${x.title}, ${x.dateWords}`),
        ...(me === "Alfred" ? forYou([]) : {}), /* Alfred's call marks his messages read: they are handed to him here */
        /* v18 (21 Nov 2026, Luke's spec): the same keys. 24 Nov 2026, Luke: "lets fully remove the money section".
           Rule 6 (Alfred depends on luke_briefing) keeps the SHAPE: the key, an object with the same four fields,
           three strings and a list. The strings now say money is no longer on HQ and the list is empty. */
        income_this_month: { received: NO_MONEY, pending: NO_MONEY, payable: NO_MONEY, problems: [] },
        duties_not_done: hq ? quiet : "not read",
        how_to_report: "One message, 8 lines at most. Numbers exactly as given here, with their currency. \"not read\" is said as not read, never as 0. Decisions: say the question and the options.", ...(sheetNote ? { note: sheetNote } : {}) };
    }
    case "luke_short_briefing": {
      const cap = hq && hq.money ? hq.money.cap : null;
      const money = (n) => Number(n).toFixed(2);
      const rateFrom = cap && cap.rateUsed && cap.rateUsed.from === "Rates!B1" ? "the month's fixed rate" : (cap && cap.rateUsed && cap.rateUsed.from) || "the month's average";
      const unread = cap ? S.unreadSpendLine(cap.notRead || cap.estimatedWhy || []) : "";
      const ad_spend = cap ? `${cap.month}: ${cap.currency} ${money(cap.spent)} of ${cap.currency} ${cap.amount}, ${cap.currency} ${money(cap.left)} left (${cap.status})` +
        (cap.rateUsed ? `; EUR at ${cap.rateUsed.value} (${rateFrom})` : "") +
        (cap.estimated || unread ? `; estimated${unread ? ": " + unread : ""}` : "")
        : "not read: the team's sheet could not be read just now";
      /* a decision's deadline: an approval -> that step's day; "ready to resubmit" -> the release day */
      const due = (m) => {
        const id = m.approval ? m.approval.id : m.ask === "resubmit" ? m.release : null;
        const v = id ? rel.find((x) => x.id === id) : null;
        if (!v) return "";
        if (m.approval) { const st = v.steps.find((x) => x.key === m.approval.what); return (st && st.due) || v.date || ""; }
        return v.date || "";
      };
      const asks = b.waiting.luke.map((m) => ({ m, due: due(m) }))
        .sort((x, y) => (x.due && y.due ? (x.due < y.due ? -1 : x.due > y.due ? 1 : 0) : x.due ? -1 : y.due ? 1 : x.m.at < y.m.at ? -1 : 1));
      const decisions = asks.slice(0, 3).map(({ m, due: d }) => `${m.from}: ${S.lukeLine(m.text) || (m.text.length > 140 ? m.text.slice(0, 139) + "…" : m.text)}` +
        (m.options && m.options.length ? ` [${m.options.join(" / ")}]` : "") + (d ? ` (by ${S.dayWords(d)})` : "") + recWords(m));
      /* everything that needs Luke to sign in, from wherever a bot said it, each once */
      const SIGN_IN = /sign(ed)?[ -]?(in|out)\b|log(ged)?[ -]?(in|out)\b|login|2fa|two[- ]factor|phone code|verification code|security code|session (expired|ended)|re-?authori[sz]/i;
      const signIns = [], seenKeys = new Set();
      /* round 3 (16 Nov 2026, Alfred): one line per account (Google Ads 376-… came 4 times), and "is signed in
         again" is good news, not a sign-in */
      const DONE_IN = /\b(is|now|got|are)?\s*(signed|logged) (back )?in( again)?\b/i, STILL = /\b(need|needs|please|expired|signed out|logged out|code)\b/i;
      const PLACES = /google ads|tiktok|meta|facebook|instagram|youtube|spotify|routenote|revolut|tipalti|paypal|wise|symphonic|soundcloud|gmail|google/i;
      /* the same account number is one sign-in whoever says it; a platform's name only within one bot (Kevin's
         TikTok profile and Forge's TikTok Ads are two accounts) */
      const keyOf = (who, t) => {
        const day = /\b(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*|\d{4}-\d{2}-\d{2})\b/i.exec(t);
        const dayBit = day ? "|" + day[0].toLowerCase().replace(/\s+/g, "") : "";
        const num = /\d{3}-\d{3}-\d{4}|\d{6,}/.exec(t);
        if (num) return "n:" + num[0] + dayBit;
        const pl = PLACES.exec(t);
        return (pl ? "p:" + who + "|" + pl[0].toLowerCase() : "t:" + who + "|" + t.toLowerCase()) + dayBit;
      };
      const add = (who, text) => {
        const t = String(text || "").trim(); const line = who ? `${who}: ${t}` : t;
        if (!t || /none right now/i.test(t) || !SIGN_IN.test(t) || (DONE_IN.test(t) && !STILL.test(t))) return;
        if (!PLACES.test(t) && !/\d{3}-\d{3}-\d{4}/.test(t)) return;
        const k = keyOf(who, t);
        if (seenKeys.has(k) || signIns.includes(line)) return;
        seenKeys.add(k); signIns.push(S.hidePrivate(line, { keepAdsId: true }));
      };
      for (const w of b.staff) {
        add(w.name, w.blockers);
        if (w.card) add(w.name, w.card.needs);
        for (const x of w.duties) add(w.name, x.blocker);
      }
      for (const u of b.updates) if (u.sp && u.sp.slice(0, 10) === today && ["blocked", "error"].includes(u.status)) add(u.bot, u.message);
      if (cap) for (const x of cap.notRead || []) if (!(/google/i.test(x) && /signed out/i.test(x))) add("Ad spend", x);
      const googleLine = ((cap && S.unreadSpendLine(cap.notRead || [])) || "").split("; ").find((l) => /Google not read/.test(l));
      if (googleLine && !signIns.includes(googleLine)) signIns.push(googleLine);
      const plainSign = [];
      const seenSign = new Set();
      for (const raw of signIns) {
        let t = String(raw || "").replace(/\s+/g, " ").trim();
        if (!t || /none right now|expire often|sessions expire|sfa is signed in/i.test(t)) continue;
        if (/sign-in from luke for account/i.test(t)) continue;
        t = S.dropAccountId(t); /* v18: no "signed out ()" left behind */
        const key = t.toLowerCase();
        if (!t || seenSign.has(key)) continue;
        seenSign.add(key);
        plainSign.push(t);
      }
      const need = luke.count;
      /* 24 Nov 2026, Luke: money is no longer on HQ, so the short briefing has no income line any more */
      return { today, now_sao_paulo: b.now, ad_spend, decisions,
        ...(asks.length > 3 ? { more_decisions: `${asks.length - 3} more waiting on Luke: see the dashboard` } : {}),
        needs_luke_sign_in: plainSign.length ? plainSign : ["nothing"],
        needs_you: need.total,
        how_to_report: "Short: four lines at most, numbers exactly as given, \"not read\" never as 0." };
    }
    case "profile_jobs": return P.listProfileJobs(store, now, roster, { by: me });
    case "profile_master": return P.profileMasterFile(store, roster, { by: me, kind: args.kind, slot: args.slot });
    case "profile_rework": return P.saveProfileVersion(store, now, roster, { by: me, slot: args.slot, image_base64: args.image_base64, source: "rework" });
    case "profile_uploaded": return P.markProfileUploaded(store, now, roster, { by: me, slot: args.slot, link: args.link, rejected: args.rejected, note: args.note, result: args.result, screenshot_base64: args.screenshot_base64, page: args.page });
  }
  throw new S.StaffError("That tool is not available.");
}
