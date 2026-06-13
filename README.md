# juliaPresentation — "Will the Math Math?"

An interactive business-idea evaluation deck. The slides are a self-contained HTML
presentation; a Next.js backend powers one live, interactive slide that runs the
real unit-economics math on **your** idea — keeping all API keys server-side.

## What the interactive slide does

1. **Describe an idea** → Gemini (with thinking) returns a broad idea, a sharp niche,
   a **TAM** + **reachable market** estimate (with reasoning), and 1–5 demand keywords.
2. **Pick a country** (default 🇺🇸 USA).
3. **Pull search demand** → DataForSEO returns per-keyword **search volume, difficulty,
   CPC, and intent** for that country.
4. **Tune the funnel**: marketing channel (Google CPC / Instagram / TikTok), landing-page
   conversion (1%–15%), pricing (one-time or subscription with LTV length & churn),
   target earnings/month, and expenses per sale.
5. **Read the verdict**: live **CAC**, **LTV**, **ad spend / month**, and **months to
   target** — with the LTV:CAC ratio color-coded against the 3:1 rule of thumb.

Search CPC is live from DataForSEO; social CPC is estimated by country cost-tier, and
social traffic gets a lower conversion multiplier (lower intent).

## Architecture

| Path | Role |
|------|------|
| `public/presentation.html` | The full deck (served at `/` via a rewrite). The interactive slide is `#playground`. |
| `app/api/idea/route.js` | Proxies Google **Gemini** (`generativeLanguage` v1beta), structured JSON + thinking. |
| `app/api/keywords/route.js` | Proxies **DataForSEO** (search volume/CPC + keyword difficulty + intent). Falls back to deterministic estimates if DataForSEO is unavailable. |
| `next.config.js` | Rewrites `/` → `/presentation.html`. |

The financial math runs client-side in the slide's `<script>`; only the two external
API calls go through the backend so keys never reach the browser.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in real keys
npm run dev                  # http://localhost:3000
```

## Environment variables

| Var | Used by |
|-----|---------|
| `GEMINI_API_KEY` | `/api/idea` |
| `GEMINI_MODEL` | `/api/idea` (default `gemini-2.5-flash`) |
| `DATAFORSEO_LOGIN` | `/api/keywords` |
| `DATAFORSEO_PASSWORD` | `/api/keywords` |

## Deploy

Deployed on Vercel. Set the four env vars in the project settings (Production),
then `vercel --prod`.
