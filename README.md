# juliaPresentation — "Will the Math Math?"

An interactive business-idea evaluation deck. The slides are a self-contained HTML
presentation; a Next.js backend powers one live, interactive slide that runs the
real unit-economics math on **your** idea — keeping all API keys server-side.

## What the interactive slide does

1. **Enter one keyword** buyers search + a country (default 🇺🇸 USA), hit **Analyze**.
2. **Gemini** returns a one-sentence **broad** and **niche** target-audience description.
3. **Google Ads** (Keyword Planner) returns **search volume**, **competition**, and the
   **top-of-page CPC bid range** (low–high). A slider — defaulting to the middle of that
   range — sets the CPC used in the math.
4. **Tune the funnel**: marketing channel (Google CPC / Instagram / TikTok), landing-page
   conversion (1%–15%), pricing (one-time or subscription with LTV length & churn),
   and expenses per sale.
5. **Read the verdict**: live **CAC** and **LTV**, with the LTV:CAC ratio color-coded
   against the 3:1 rule of thumb.

Search CPC is your chosen bid within the Google Ads low–high range; social CPC is
estimated by country cost-tier, and social traffic gets a lower conversion multiplier.

## Architecture

| Path | Role |
|------|------|
| `public/presentation.html` | The full deck (served at `/` via a rewrite). The interactive slide is `#playground`. |
| `app/api/idea/route.js` | Proxies Google **Gemini** (`generativeLanguage` v1beta), structured JSON + thinking. |
| `app/api/keywords/route.js` | Proxies the **Google Ads API** (Keyword Planner historical metrics: volume, competition, low/high top-of-page bid). Falls back to deterministic estimates if Google Ads is unavailable. |
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
| `GOOGLE_ADS_DEVELOPER_TOKEN` · `GOOGLE_ADS_CLIENT_ID` · `GOOGLE_ADS_CLIENT_SECRET` · `GOOGLE_ADS_REFRESH_TOKEN` · `GOOGLE_ADS_MANAGER_ID` · `GOOGLE_ADS_CUSTOMER_ID` | `/api/keywords` |

## Deploy

Deployed on Vercel. Set the four env vars in the project settings (Production),
then `vercel --prod`.
