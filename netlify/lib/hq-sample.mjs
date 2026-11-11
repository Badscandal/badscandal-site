/* MADE-UP numbers so Luke can see /hq before any real data is connected (11 Nov 2026). Every
   figure and every fan here is invented; the page shows a SAMPLE banner whenever this is used. */
const day = (today, back) => new Date(Date.parse(today + "T12:00:00Z") - back * 86400000).toISOString().slice(0, 10);

const spStamp = (ms) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(ms).map((x) => [x.type, x.value])); return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`; };

export function sampleSheets(today, now = Date.now()) {
  const m = today.slice(0, 7);
  const prev = day(m + "-01", 1).slice(0, 7);
  const Growth = [["date", "platform", "account", "followers", "change", "views", "best_post", "best_post_link", "logged_by", "note"]];
  const Songs = [["date", "song", "spotify_streams", "spotify_listeners", "saves", "playlist_adds", "logged_by", "note"]];
  const Spend = [["date", "platform", "campaign", "spend", "currency"]];
  for (let i = 30; i >= 1; i--) {
    const d = day(today, i), k = 30 - i;
    Growth.push([d, "Instagram", "@badscandal", 12900 + k * 21 + (k % 7 === 3 ? 60 : 0), 21 + (k % 7 === 3 ? 60 : 0), 5200 + k * 90, k % 7 === 3 ? "ok what is this vibe? (rooftop)" : "studio clip " + (k % 5), "https://www.instagram.com/badscandal/", "Steve", ""]);
    Growth.push([d, "TikTok", "@badscandal", 4100 + k * 9, 9, 2100 + k * 40, "vibe or no?", "https://www.tiktok.com/@badscandal", "Kevin", ""]);
    Growth.push([d, "YouTube", "BADSCANDAL", 1830 + k * 3, 3, 800 + k * 12, "Touch Me (visualiser)", "https://www.youtube.com/badscandal", "Laura", ""]);
    Growth.push([d, "Spotify", "BADSCANDAL", 8020 + k * 14, 14, "", "", "", "Atlas", ""]);
    if (i >= 2) {
      if (k >= 18) Songs.push([d, "Touch Me", 900 + (k - 18) * 260 + (k % 3) * 40, 610 + (k - 18) * 150, 30 + (k - 18) * 9, 4 + (k % 4), "Atlas", ""]);
      Songs.push([d, "Love You", 2400 - k * 22, 1500 - k * 12, 20, 2, "Atlas", ""]);
    }
    if (d.slice(0, 7) === m && k % 4 !== 0) Spend.push([d, "Meta", "Touch Me BR", (38 + (k % 3)).toFixed(2), "USD"]);
  }
  Spend.push([day(today, 6), "TikTok", "Touch Me follows", "12.50", "EUR"], [day(today, 5), "Google", "YouTube subs", "9.00", "EUR"]);
  const Fans = [["date", "platform", "handle", "signal", "quote", "post_link", "logged_by", "profile_link", "about", "how_to_engage"],
    [day(today, 1), "Instagram", "@sample_marina.br", "asked_song", "Qual o nome dessa música??", "https://www.instagram.com/badscandal/", "Steve", "https://www.instagram.com/", "São Paulo, posts DJ sets", "Reply with the song name and a 🔥, then follow back"],
    [day(today, 3), "Instagram", "@sample_marina.br", "repeat", "Essa música é muito viciante", "https://www.instagram.com/badscandal/", "Steve", "https://www.instagram.com/", "São Paulo, posts DJ sets", "Send her the Spotify link by DM"],
    [day(today, 2), "TikTok", "@sample_dj.caio", "tagged_friend", "@joao olha isso", "https://www.tiktok.com/@badscandal", "Kevin", "https://www.tiktok.com/", "Rio, house playlists", "Like and reply to the tag"],
    [day(today, 1), "Instagram", "@sample_luiza", "dm", "Asked when the next song is out", "", "Steve", "https://www.instagram.com/", "Curitiba, festival photos", "Tell her the release date and the song page"],
    [day(today, 4), "YouTube", "@sample_nightdrive", "repeat", "Third time back here today", "https://www.youtube.com/badscandal", "Laura", "https://www.youtube.com/", "Comments on melodic house channels", "Pin and heart the comment"]];
  const rel = day(today, -13), rel2 = day(today, -30);
  const Releases = [["song", "slug", "release_date", "status", "isrc", "upc", "T-28 files", "T-21 submitted", "T-14 pitched", "T-10 lyrics", "T-7 video + page", "ads_ready", "notes"],
    ["Touch Me", "touchme", day(today, 12), "out", "", "", "done", "done", "done", "done", "done", "done", ""],
    ["Me Dá Seu Body", "medaseubody", rel, "in review at RouteNote", "GX8LD2651342", "5064172779824", "done", "done", "", "", "page live", "", "Pitch not sent yet"],
    ["Survivors", "survivors", rel2, "proposed, waiting for Luke", "", "", "", "", "", "", "", "", "Master needed from Luke"]];
  const Tasks = [["id", "owner", "task", "deadline", "status", "blocker", "updated"],
    ["T-101", "Atlas", "Send the Spotify pitch for Me Dá Seu Body", day(today, 1), "todo", "", day(today, 1)],
    ["T-102", "Luke", "Master + cover for Survivors to Drop", day(today, -2), "todo", "", day(today, 1)],
    ["T-103", "Forge", "Log yesterday's spend per platform", today, "doing", "", today],
    ["T-104", "Kevin", "Find the official Touch Me sound on TikTok", day(today, 3), "blocked", "Needs Luke's phone code", day(today, 2)],
    ["T-105", "Laura", "Schedule the lyric video for 00:00 release day", day(today, -6), "todo", "", day(today, 1)],
    ["T-100", "Webmaster", "Song page for Me Dá Seu Body", day(today, 2), "done", "", day(today, 2)],
    /* today's duties (ids starting "D-") */
    ["D-atlas-1", "Atlas", "Log yesterday's Spotify numbers", today + " 09:15", "done", "", today],
    ["D-steve-1", "Steve", "Log Instagram followers + best post", today + " 09:10", "done", "", today],
    ["D-kevin-1", "Kevin", "Log TikTok followers + best post", today + " 09:10", "blocked", "TikTok login expired", today],
    ["D-laura-1", "Laura", "Log YouTube subscribers", today + " 00:30", "todo", "", today],
    ["D-forge-1", "Forge", "Log yesterday's ad spend per platform", today + " 09:30", "done", "", today],
    ["D-forge-2", "Forge", "Check the monthly ad cap", today + " 23:30", "todo", "", today],
    ["D-atlas-0", "Atlas", "Log Spotify numbers (yesterday's duty)", day(today, 1), "done", "", day(today, 1)]];
  const Royalties = [["month", "song", "store", "streams", "amount", "currency", "logged_by"],
    [prev, "Love You", "Spotify", "61000", "152.40", "EUR", "Drop"], [prev, "Love You", "Apple Music", "9000", "41.10", "EUR", "Drop"],
    [m, "Touch Me", "Spotify", "14000", "38.20", "EUR", "Drop"]];
  const Income = [["month", "source", "category", "amount", "currency", "status"],
    [prev, "inGrooves", "Royalties (label deals)", "1137.39", "USD", "received"], [prev, "SoundCloud", "Royalties (label deals)", "104.04", "USD", "received"],
    [prev, "RouteNote", "Self-releases", "193.50", "EUR", "received"], [prev, "Jeff", "Production", "4388.43", "EUR", "received"],
    [m, "RouteNote", "Self-releases", "112.01", "EUR", "received"], [m, "Liu Holdings", "Afro house salary", "1753.42", "EUR", "received"],
    [m, "Cheerful Music", "Production", "1300.00", "USD", "pending"]];
  /* the bots' live log (made up), newest a few minutes ago */
  const ago = (min) => spStamp(now - min * 60000);
  const Updates = [["time", "bot", "status", "message", "link"],
    [ago(4), "Forge", "working", "Checking the monthly ad cap in the Ads Tracker", ""],
    [ago(11), "Forge", "done", "Yesterday's spend logged: Google EUR 9.00, TikTok EUR 12.50", ""],
    [ago(26), "Atlas", "done", "Touch Me row for Mon 9 Nov written: 3,540 streams", "https://artists.spotify.com/"],
    [ago(38), "Steve", "done", "Instagram row written: 13,509 followers (+21)", "https://www.instagram.com/badscandal/"],
    [ago(41), "Kevin", "blocked", "TikTok login expired: needs Luke's phone code", ""],
    [ago(55), "Nova", "info", "Standup: 3 logged, 1 blocked (Kevin), Laura not yet", ""],
    [ago(190), "Drop", "done", "Me Dá Seu Body: RouteNote status still In Review", ""]];
  return { Growth, Songs, Fans, Releases, Tasks, Royalties, Spend, Income, Updates };
}

/* A MADE-UP Meta read for /hq?sample=1 (11 Nov 2026): Meta's "own" numbers = the sample sheet's Meta
   rows, except the latest day is 6.40 higher, so the "sheet says X" line can be seen. */
export function sampleMeta(sheets, today) {
  const rows = sheets.Spend.slice(1).filter((r) => r[1] === "Meta").map((r) => ({ day: r[0], spend: Number(r[3]), currency: r[4] }));
  const last = rows.reduce((a, r) => (r.day > a ? r.day : a), "");
  for (const r of rows) if (r.day === last) r.spend = Math.round((r.spend + 6.4) * 100) / 100;
  const m = today.slice(0, 7), prev = day(m + "-01", 1).slice(0, 7);
  return { ok: true, rows, since: prev + "-01", until: today };
}
