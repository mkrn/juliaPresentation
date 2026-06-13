// POST /api/idea
// Body: { description: string, country?: string (display name, default "United States") }
// Uses Gemini (with thinking) to return a broad idea, a refined niche, TAM + reachable
// market estimates, and 1-5 demand keywords. Keys stay server-side.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    broadIdea: { type: 'string' },
    nicheIdea: { type: 'string' },
    tam: {
      type: 'object',
      properties: {
        label: { type: 'string' },
        valueUsd: { type: 'number' },
        reasoning: { type: 'string' },
      },
      required: ['label', 'valueUsd', 'reasoning'],
    },
    reachableMarket: {
      type: 'object',
      properties: {
        label: { type: 'string' },
        valueUsd: { type: 'number' },
        reasoning: { type: 'string' },
      },
      required: ['label', 'valueUsd', 'reasoning'],
    },
    keywords: { type: 'array', items: { type: 'string' } },
  },
  required: ['broadIdea', 'nicheIdea', 'tam', 'reachableMarket', 'keywords'],
};

function buildPrompt(description, country) {
  return `You are a sharp, numerate startup market analyst. A founder wants to build the following:

"""${description}"""

Target market / country: ${country}.

Think it through, then return ONE JSON object with:
- broadIdea: 1-2 sentences naming the broad product category this belongs to.
- nicheIdea: 1-2 sentences refining it into a sharp, defensible niche worth going after first.
- tam: the Total Addressable Market for the BROAD category. Give { label (human string like "$4.2B / yr"), valueUsd (the annual figure as a plain number, e.g. 4200000000), reasoning (one sentence on how you sized it) }.
- reachableMarket: the realistic Serviceable Obtainable Market a small startup could reach in ${country}. Give { label, valueUsd (annual), reasoning }.
- keywords: 1 to 5 real, high-intent search queries a potential BUYER (not a researcher) would type into Google when ready to find/buy this. Lowercase, no quotes, the kind of phrase with real search volume. Prefer commercial/transactional intent.

Be realistic and specific to ${country}. Do not be promotional.`;
}

export async function POST(req) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'GEMINI_API_KEY is not configured.' }, { status: 500 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const description = (body.description || '').toString().trim();
  const country = (body.country || 'United States').toString().trim();
  if (!description) {
    return Response.json({ error: 'Please describe what you want to build.' }, { status: 400 });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const payload = {
    contents: [{ role: 'user', parts: [{ text: buildPrompt(description, country) }] }],
    generationConfig: {
      temperature: 0.6,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      thinkingConfig: { thinkingBudget: 4096 },
    },
  };

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return Response.json({ error: 'Could not reach Gemini.', detail: String(e) }, { status: 502 });
  }

  const raw = await res.text();
  if (!res.ok) {
    let msg = raw;
    try { msg = JSON.parse(raw)?.error?.message || raw; } catch {}
    return Response.json({ error: 'Gemini request failed.', detail: msg }, { status: res.status });
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'Gemini returned non-JSON envelope.' }, { status: 502 });
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') || '';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return Response.json({ error: 'Gemini returned unparseable content.', detail: text.slice(0, 400) }, { status: 502 });
  }

  // normalise keywords to 1-5 clean strings
  let keywords = Array.isArray(parsed.keywords) ? parsed.keywords : [];
  keywords = keywords.map((k) => String(k).toLowerCase().trim()).filter(Boolean).slice(0, 5);

  return Response.json({
    broadIdea: parsed.broadIdea || '',
    nicheIdea: parsed.nicheIdea || '',
    tam: parsed.tam || null,
    reachableMarket: parsed.reachableMarket || null,
    keywords,
    model: MODEL,
  });
}
