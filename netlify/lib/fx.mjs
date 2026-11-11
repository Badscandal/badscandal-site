/* Monthly average exchange rates (Luke, 11 Nov 2026: "convert the dollar to euro based off the
   average price that month"). Source: the European Central Bank's daily reference rates through
   api.frankfurter.dev (free, no key, GET only). A month's rate = the plain average of its daily
   rates so far (ECB publishes on working days). Rates are "units of <currency> per 1 EUR".

   Converted figures are ESTIMATES for reading the dashboard: every amount is still stored and
   shown in the currency it was billed or paid in, with the converted figure next to it and the
   rate used. Nothing here touches money. */
export const FX_CURRENCIES = ["USD", "GBP", "BRL", "DKK"];
export const FX_TTL_MS = 12 * 60 * 60 * 1000;

export function fxRequest(month, today) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const end = today && today.slice(0, 7) === month && today < last ? today : last;
  return `https://api.frankfurter.dev/v1/${month}-01..${end}?symbols=${FX_CURRENCIES.join(",")}`;
}

/* json: frankfurter's answer { base:"EUR", rates:{ "2026-11-03": { USD: 1.12, ... }, ... } } */
export function monthAverage(json) {
  const days = Object.values((json && json.rates) || {});
  const out = { days: days.length };
  for (const c of FX_CURRENCIES) {
    const v = days.map((d) => Number(d[c])).filter((n) => n > 0);
    out[c] = v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10000) / 10000 : null;
  }
  return out;
}

/* avg: monthAverage()'s answer. convert(10, "USD", "EUR", avg) -> EUR, or null if a rate is missing. */
export function convert(amount, from, to, avg) {
  if (from === to) return amount;
  const per = (c) => (c === "EUR" ? 1 : avg && avg[c]);
  const f = per(from), t = per(to);
  if (!f || !t) return null;
  return Math.round((amount / f) * t * 100) / 100;
}

/* fetchImpl is injectable for tests. Returns { month, EUR:1, USD, GBP, ..., days } or { error }. */
export async function fetchMonthAverage(month, today, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(fxRequest(month, today), { method: "GET", signal: AbortSignal.timeout(6000) });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json || !json.rates) return { error: "No exchange rates for " + month };
    const avg = monthAverage(json);
    if (!avg.days) return { error: "No exchange rates for " + month + " yet" };
    return { month, EUR: 1, ...avg };
  } catch (e) {
    return { error: "Couldn't reach the exchange-rate source" };
  }
}
