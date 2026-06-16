// POST /api/keywords
// Body: { keywords: string[], country?: string (ISO2, default "US") }
// Pulls search volume + top-of-page CPC bid range (low/high) from the Google Ads API
// (Keyword Planner historical metrics). If Google Ads is unavailable, returns
// deterministic ESTIMATED metrics (source:"estimated") so the live demo still works.

import { GoogleAdsApi, enums } from 'google-ads-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ISO2 -> Google Ads geo target constant id (== Google criterion id).
const LOCATION = {
  US: 2840, CA: 2124, GB: 2826, AU: 2036, IE: 2372, DE: 2276, FR: 2250,
  NL: 2528, CH: 2756, SE: 2752, NO: 2578, DK: 2208, JP: 2392, SG: 2702,
  AE: 2784, ES: 2724, IT: 2380, PL: 2616, PT: 2620, BR: 2076, MX: 2484,
  TR: 2792, GR: 2300, KR: 2410, CZ: 2203, IN: 2356, ID: 2360, PH: 2608,
  VN: 2704, NG: 2566, PK: 2586, EG: 2818, BD: 2050, ZA: 2710,
};
// Cost tier per country — drives the estimated social CPC on the client too.
const TIER = {
  US: 1, CA: 1, GB: 1, AU: 1, IE: 1, DE: 1, FR: 1, NL: 1, CH: 1, SE: 1,
  NO: 1, DK: 1, JP: 1, SG: 1, AE: 1,
  ES: 2, IT: 2, PL: 2, PT: 2, BR: 2, MX: 2, TR: 2, GR: 2, KR: 2, CZ: 2, ZA: 2,
  IN: 3, ID: 3, PH: 3, VN: 3, NG: 3, PK: 3, EG: 3, BD: 3,
};

const COMPETITION_LABEL = { 0: 'UNSPECIFIED', 1: 'UNKNOWN', 2: 'LOW', 3: 'MEDIUM', 4: 'HIGH' };
const micros = (m) => (m ? Number(m) / 1_000_000 : null);

// ---- deterministic estimate fallback ---------------------------------------
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295; // 0..1
}
function estimate(kw, tier) {
  const r = hash(kw);
  const volume = Math.round((200 + r * 39800) / 10) * 10; // 200..40000
  const tierBase = tier === 1 ? 1 : tier === 2 ? 0.45 : 0.18;
  const low = +(tierBase * (0.6 + hash('l' + kw) * 1.4)).toFixed(2);
  const high = +(low * (2.2 + hash('h' + kw) * 1.8)).toFixed(2);
  const competitionIndex = Math.round(8 + hash('c' + kw) * 67);
  const competition = competitionIndex > 66 ? 'HIGH' : competitionIndex > 33 ? 'MEDIUM' : 'LOW';
  return { keyword: kw, volume, competition, competitionIndex, low, high, estimated: true };
}

function hasCreds() {
  return Boolean(
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
      process.env.GOOGLE_ADS_CLIENT_ID &&
      process.env.GOOGLE_ADS_CLIENT_SECRET &&
      process.env.GOOGLE_ADS_REFRESH_TOKEN &&
      process.env.GOOGLE_ADS_CUSTOMER_ID,
  );
}

async function googleAdsMetrics(keywords, locationCode) {
  const client = new GoogleAdsApi({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  });
  const customer = client.Customer({
    customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID,
    login_customer_id: process.env.GOOGLE_ADS_MANAGER_ID,
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
  });

  const response = await customer.keywordPlanIdeas.generateKeywordHistoricalMetrics({
    customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID,
    keywords,
    geo_target_constants: [`geoTargetConstants/${locationCode}`],
    language: 'languageConstants/1000', // English
    keyword_plan_network: enums.KeywordPlanNetwork.GOOGLE_SEARCH,
  });

  const byKeyword = {};
  for (const r of response.results || []) {
    const m = r.keyword_metrics || {};
    byKeyword[(r.text || '').toLowerCase()] = {
      keyword: r.text,
      volume: Number(m.avg_monthly_searches || 0),
      competition:
        typeof m.competition === 'number' ? COMPETITION_LABEL[m.competition] || 'UNKNOWN' : m.competition || 'UNKNOWN',
      competitionIndex: Number(m.competition_index || 0),
      low: micros(m.low_top_of_page_bid_micros),
      high: micros(m.high_top_of_page_bid_micros),
      estimated: false,
    };
  }
  return byKeyword;
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  let keywords = Array.isArray(body.keywords) ? body.keywords : [];
  keywords = [...new Set(keywords.map((k) => String(k).toLowerCase().trim()).filter(Boolean))].slice(0, 5);
  if (!keywords.length) return Response.json({ error: 'No keywords provided.' }, { status: 400 });

  const country = (body.country || 'US').toString().toUpperCase();
  const locationCode = LOCATION[country] || LOCATION.US;
  const tier = TIER[country] || 1;

  if (!hasCreds()) {
    return Response.json({
      source: 'estimated',
      note: 'Google Ads credentials are not configured — set GOOGLE_ADS_* env vars.',
      country, locationCode, tier,
      keywords: keywords.map((k) => estimate(k, tier)),
    });
  }

  try {
    const byKeyword = await googleAdsMetrics(keywords, locationCode);
    const merged = keywords.map((k) => byKeyword[k] || { ...estimate(k, tier), note: 'no Google Ads data' });
    return Response.json({ source: 'google-ads', country, locationCode, tier, keywords: merged });
  } catch (e) {
    const detail = (e && (e.message || (e.errors && JSON.stringify(e.errors)))) || String(e);
    return Response.json({
      source: 'estimated',
      note: 'Google Ads request failed: ' + detail,
      country, locationCode, tier,
      keywords: keywords.map((k) => estimate(k, tier)),
    });
  }
}
