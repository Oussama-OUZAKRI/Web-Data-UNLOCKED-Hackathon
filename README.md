# RiftSignal AI

Agent-first vendor risk intelligence for the Bright Data web-data hackathon.

## What it does

RiftSignal AI investigates a vendor from public web evidence, extracts risk signals, scores risk and confidence, and writes a procurement/compliance memo that explains why the findings matter.

The upgraded flow is a bounded autonomous agent:

- OpenRouter-hosted LLM chooses whether to search, fetch, continue, or finish.
- Bright Data SERP API discovers candidate sources.
- Bright Data Web Unlocker fetches page content.
- Bright Data browser-zone fallback is used through the REST request endpoint when Web Unlocker returns too little or blocked content. This is labeled honestly in the UI and is not presented as full browser automation.
- The UI shows run mode, stop reason, budget usage, tool usage, and agent trace.

## Stack

- Next.js full-stack app
- OpenRouter through the Vercel AI SDK for planning, extraction, and memo generation
- Bright Data SERP API for discovery
- Bright Data Web Unlocker for page fetches
- Bright Data browser-zone fallback as a REST fallback for difficult pages
- Seeded demo cache for reliable hackathon presentation

## Environment

Create `.env.local` when using live integrations:

```bash
OPENROUTER_API_KEY=
OPENROUTER_MODEL=anthropic/claude-sonnet-4
BRIGHTDATA_API_KEY=
BRIGHTDATA_SERP_ZONE=
BRIGHTDATA_UNLOCKER_ZONE=
BRIGHTDATA_BROWSER_ZONE=
```

Implementation note: the app uses the AI SDK OpenAI-compatible transport with `baseURL=https://openrouter.ai/api/v1`, so requests go to OpenRouter, not OpenAI.

The app works without credentials using the demo vendor cache. Demo runs are labeled **Demo Cache** and `liveDataUsed: false`.

Use **Refresh live data** after adding OpenRouter and Bright Data credentials. Live runs are bounded by:

- 4 agent iterations
- 6 SERP searches
- 12 page fetches
- 90 seconds soft runtime
- 8 final evidence sources

## Scripts

```bash
npm run dev
npm run build
npm run test
```
