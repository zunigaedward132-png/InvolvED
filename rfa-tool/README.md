# IRC RFA Drafting Assistant

Standalone tool — fully independent of the InvolvED app in this repo (no shared code, config, or routes).

## What it does
1. Upload a grant opportunity PDF (RFA/RFP/NOFO) — text is extracted in-browser (pdf.js), then sent to AI to produce a structured outline (funder, deadline, amounts, eligibility, required sections, evaluation criteria).
2. Maintain a list of IRC's current programs/active grants, and run an AI match check against the new opportunity (score, rationale, strengths, gaps, recommendation).
3. Generate an editable AI draft for each required section, using the opportunity + selected program + your own context notes.
4. Export the full draft as Markdown.

Programs and in-progress drafts are saved to browser `localStorage` — no database required.

## Deploy (Vercel)
Deploy this folder (`rfa-tool/`) as its **own Vercel project**, with this directory set as the project root:

1. New Vercel project → import this repo → set **Root Directory** to `rfa-tool`.
2. Add environment variable `GROQ_API_KEY` (get a free key at console.groq.com).
3. Deploy. Vercel auto-detects `api/extract.js`, `api/match.js`, `api/draft-section.js` as serverless functions — no `vercel.json` needed.

## Run locally
```
cd rfa-tool
npm install
npx vercel dev
```
