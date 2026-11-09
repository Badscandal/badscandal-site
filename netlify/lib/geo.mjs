/* Countries where the Meta Pixel / Conversions API only run after the visitor taps "Allow":
   the EU, the rest of the EEA (Iceland, Liechtenstein, Norway) and the UK. Shared by the
   /touchme edge function (shows the consent bar) and netlify/functions/capi.mjs (refuses to
   forward an event from these countries without consent, as a second lock). */
export const CONSENT_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV",
  "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "IS", "LI", "NO",
  "GB",
]);

export function needsConsent(countryCode) {
  return CONSENT_COUNTRIES.has(String(countryCode || "").toUpperCase());
}
