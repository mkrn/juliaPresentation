// POST /api/idea
// Body: { keyword: string, country?: string (display name, default "United States") }
// Uses Gemini to describe the target audience for a single search keyword as two
// terse one-sentence descriptions (broad + niche). Keys stay server-side.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    broadAudience: { type: 'string' },
    nicheAudience: { type: 'string' },
  },
  required: ['broadAudience', 'nicheAudience'],
};

function buildPrompt(keyword, country) {
  return `A founder is considering a product around the search keyword "${keyword}" in this market: ${country}.

Return ONE JSON object with exactly two fields, each a single concise sentence:
- broadAudience: the broad target audience that searches this keyword.
- nicheAudience: the sharpest niche segment within that audience worth winning first.

Be specific to ${country}. One sentence each — name the people directly. Do NOT begin with "The broad/niche audience…", do NOT restate the keyword, no lists, no labels, no filler.`;
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

  const keyword = (body.keyword || '').toString().trim();
  const country = (body.country || 'United States').toString().trim();
  if (!keyword) {
    return Response.json({ error: 'Please provide a keyword.' }, { status: 400 });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const payload = {
    contents: [{ role: 'user', parts: [{ text: buildPrompt(keyword, country) }] }],
    generationConfig: {
      temperature: 0.4,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
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

  return Response.json({
    broadAudience: (parsed.broadAudience || '').toString().trim(),
    nicheAudience: (parsed.nicheAudience || '').toString().trim(),
    model: MODEL,
  });
}
