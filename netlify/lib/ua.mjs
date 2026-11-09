/* Reads a user agent into four short labels for the admin portal. Only the labels are stored,
   never the user agent itself.

   app      the in-app browser, when the link was opened inside an app: instagram, facebook,
            messenger, tiktok, snapchat, x, linkedin, threads, whatsapp; "-" otherwise
   os       ios | android | macos | windows | chromeos | linux | other
   device   mobile | tablet | desktop
   browser  safari | chrome | samsung | firefox | edge | opera | webview | other */

/* Crawlers, link-preview fetchers (incl. Meta's own ad reviewer fetch) and scripts: never
   counted, never sent to Meta. Shared by hit.mjs and capi.mjs. */
export const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|meta-externalagent|headless|lighthouse|pingdom|curl|wget|python|node-fetch|axios|undici|go-http|okhttp|java\//i;

const APPS = [
  ["instagram", /Instagram/i],
  ["messenger", /MessengerForiOS|\bOrca-Android|FB_IAB\/Orca|FBAN\/Messenger/i],
  ["facebook", /FBAN|FBAV|FB_IAB|FBIOS|\[FB/i],
  ["threads", /Barcelona\s\d|Threads\s\d/i],
  ["tiktok", /musical_ly|TikTok|BytedanceWebview|trill_/i],
  ["snapchat", /Snapchat/i],
  ["x", /Twitter(?:Android)?\b/i],
  ["linkedin", /LinkedInApp/i],
  ["whatsapp", /WhatsApp/i],
];

export function parseUA(ua) {
  ua = String(ua || "");
  let app = "-";
  for (const [name, re] of APPS) if (re.test(ua)) { app = name; break; }

  let os = "other";
  if (/iPhone|iPad|iPod/.test(ua)) os = "ios";
  else if (/Android/.test(ua)) os = "android";
  else if (/CrOS/.test(ua)) os = "chromeos";
  else if (/Mac OS X|Macintosh/.test(ua)) os = "macos";
  else if (/Windows/.test(ua)) os = "windows";
  else if (/Linux/.test(ua)) os = "linux";

  let device = "desktop";
  if (/iPad|Tablet/.test(ua) || (os === "android" && !/Mobile/.test(ua))) device = "tablet";
  else if (/Mobi|iPhone|iPod|Android/.test(ua)) device = "mobile";

  let browser = "other";
  if (/EdgA?\/|EdgiOS/.test(ua)) browser = "edge";
  else if (/SamsungBrowser/.test(ua)) browser = "samsung";
  else if (/OPR\/|Opera|OPiOS/.test(ua)) browser = "opera";
  else if (/Firefox|FxiOS/.test(ua)) browser = "firefox";
  else if (/CriOS|Chrome\//.test(ua)) browser = /; wv\)/.test(ua) ? "webview" : "chrome";
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = "safari";
  else if (os === "ios") browser = "webview"; /* iOS app web views drop the Safari token */

  return { app, os, device, browser };
}
