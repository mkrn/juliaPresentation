// POST /api/keywords
// Body: { keywords: string[], country?: string (ISO2, default "US") }
// Pulls live search volume, CPC, difficulty and intent from DataForSEO.
// If DataForSEO is unreachable / unauthorized, returns deterministic ESTIMATED
// metrics (source:"estimated") so the live demo still produces numbers.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ISO2 -> DataForSEO location_code (subset; falls back to US).
const LOCATION = {
  US: 2840, CA: 2124, GB: 2826, AU: 2036, IE: 2372, DE: 2276, FR: 2250,
  NL: 2528, CH: 2756, SE: 2752, NO: 2578, DK: 2208, JP: 2392, SG: 2702,
  AE: 2784, ES: 2724, IT: 2380, PL: 2616, PT: 2620, BR: 2076, MX: 2484,
  TR: 2792, GR: 2300, KR: 2410, CZ: 2203, IN: 2356, ID: 2360, PH: 2608,
  VN: 2704, NG: 2566, PK: 2586, EG: 2818, BD: 2050, ZA: 2710,
};
// Cost tier per country — drives the estimated-CPC scale on the client too.
const TIER = {
  US: 1, CA: 1, GB: 1, AU: 1, IE: 1, DE: 1, FR: 1, NL: 1, CH: 1, SE: 1,
  NO: 1, DK: 1, JP: 1, SG: 1, AE: 1,
  ES: 2, IT: 2, PL: 2, PT: 2, BR: 2, MX: 2, TR: 2, GR: 2, KR: 2, CZ: 2, ZA: 2,
  IN: 3, ID: 3, PH: 3, VN: 3, NG: 3, PK: 3, EG: 3, BD: 3,
};

function authHeader() {
  const login = process.env.DATAFORSEO_LOGIN || '';
  const password = process.env.DATAFORSEO_PASSWORD || '';
  return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
}

async function dfs(path, taskBody) {
  const res = await fetch(`https://api.dataforseo.com/v3/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
    body: JSON.stringify([taskBody]),
  });
  const json = await res.json();
  if (json.status_code && json.status_code !== 20000) {
    const err = new Error(json.status_message || `DataForSEO ${json.status_code}`);
    err.statusCode = json.status_code;
    throw err;
  }
  return json?.tasks?.[0] || null;
}

// ---- deterministic estimate fallback ---------------------------------------
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295; // 0..1
}
function guessIntent(kw) {
  const k = kw.toLowerCase();
  if (/\b(buy|price|pricing|cost|cheap|deal|discount|order|subscribe|near me|for sale)\b/.test(k)) return 'transactional';
  if (/\b(best|top|review|reviews|vs|compare|alternative|software|app|tool|service|agency|company)\b/.test(k)) return 'commercial';
  if (/\b(how|what|why|guide|tutorial|ideas|examples|meaning)\b/.test(k)) return 'informational';
  return 'commercial';
}
function estimate(kw, tier) {
  const r = hash(kw);
  const r2 = hash('v' + kw);
  const volume = Math.round((200 + r * 39800) / 10) * 10; // 200..40000
  const tierCpc = tier === 1 ? 1 : tier === 2 ? 0.45 : 0.18;
  const cpc = +(tierCpc * (0.6 + r2 * 5.4)).toFixed(2); // scaled by tier
  const difficulty = Math.round(8 + hash('d' + kw) * 67); // 8..75
  return { keyword: kw, search_volume: volume, cpc, competition_index: difficulty, difficulty, intent: guessIntent(kw), estimated: true };
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

  const base = { keywords, location_code: locationCode, language_code: 'en' };

  const [volRes, kdRes, intentRes] = await Promise.allSettled([
    dfs('keywords_data/google_ads/search_volume/live', base),
    dfs('dataforseo_labs/google/bulk_keyword_difficulty/live', base),
    dfs('dataforseo_labs/google/search_intent/live', { keywords, language_code: 'en' }),
  ]);

  // If the primary (volume/CPC) call failed, return estimates for everything.
  if (volRes.status !== 'fulfilled' || !volRes.value?.result) {
    const reason =
      volRes.status === 'rejected'
        ? volRes.reason?.statusCode === 40100
          ? 'DataForSEO credentials were rejected (40100). Verify DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD at app.dataforseo.com/api-access.'
          : String(volRes.reason?.message || volRes.reason)
        : 'No result from DataForSEO.';
    return Response.json({
      source: 'estimated',
      note: reason,
      country,
      locationCode,
      tier,
      keywords: keywords.map((k) => estimate(k, tier)),
    });
  }

  // Index the live results by keyword.
  const volMap = {};
  for (const r of volRes.value.result || []) volMap[(r.keyword || '').toLowerCase()] = r;

  const kdMap = {};
  if (kdRes.status === 'fulfilled') {
    const items = kdRes.value?.result?.[0]?.items || [];
    for (const it of items) kdMap[(it.keyword || '').toLowerCase()] = it.keyword_difficulty;
  }

  const intentMap = {};
  if (intentRes.status === 'fulfilled') {
    const items = intentRes.value?.result?.[0]?.items || [];
    for (const it of items) {
      const main = it.keyword_intent?.label || it.keyword_intent?.main_intent || it.keyword_intent?.intent;
      if (main) intentMap[(it.keyword || '').toLowerCase()] = main;
    }
  }

  const merged = keywords.map((k) => {
    const v = volMap[k] || {};
    const compIdx = typeof v.competition_index === 'number' ? v.competition_index : null;
    const difficulty = typeof kdMap[k] === 'number' ? kdMap[k] : compIdx;
    return {
      keyword: k,
      search_volume: typeof v.search_volume === 'number' ? v.search_volume : 0,
      cpc: typeof v.cpc === 'number' ? +v.cpc.toFixed(2) : 0,
      competition_index: compIdx,
      difficulty: typeof difficulty === 'number' ? Math.round(difficulty) : null,
      intent: intentMap[k] || guessIntent(k),
      estimated: false,
    };
  });

  return Response.json({ source: 'dataforseo', country, locationCode, tier, keywords: merged });
}
