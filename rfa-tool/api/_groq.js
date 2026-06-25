const Groq = require('groq-sdk');

let _client;
function getGroq() {
  if (!_client) _client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _client;
}

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

const EXTRACT_PROMPT = `You are a grants analyst for the International Rescue Committee (IRC), a humanitarian nonprofit.
Given the raw text of a grant opportunity document (RFA/RFP/NOFO), extract structured information.
Return ONLY valid JSON with these exact keys:
{
  "funder": "string or null",
  "opportunity_title": "string or null",
  "deadline": "string or null",
  "total_funding_amount": "string or null",
  "award_ceiling": "string or null",
  "eligibility_summary": "string or null",
  "focus_areas": ["array of strings"],
  "required_sections": [{"name": "string", "description": "string", "max_length": "string or null"}],
  "submission_requirements": ["array of strings"],
  "evaluation_criteria": ["array of strings"]
}
If a field is not present in the text, use null (or an empty array for list fields). Do not invent information.`;

const MATCH_PROMPT = `You are a grants strategist for the International Rescue Committee (IRC).
You are given a grant "opportunity" (extracted from a funder's RFA) and a list of IRC's current "programs"
(each with name, focus_areas, populations_served, geography, status).
Assess how well the opportunity fits IRC's existing work. Return ONLY valid JSON with these exact keys:
{
  "match_score": 0-100 integer,
  "best_fit_program": "name of the best-matching program, or null if none fit",
  "rationale": "2-4 sentence explanation",
  "strengths": ["array of strings - why this is a good fit"],
  "gaps": ["array of strings - risks, mismatches, or missing capacity"],
  "recommendation": "pursue | pursue with caution | do not pursue"
}`;

const DRAFT_PROMPT = `You are a professional grant writer for the International Rescue Committee (IRC), a global humanitarian
and refugee-assistance nonprofit. You are drafting one section of a response to a funder's RFA.
Write in a concrete, evidence-based, professional tone consistent with IRC's rights-based, data-driven voice.
You will receive the section name/description, the funder's opportunity details, the IRC program (if any) being
proposed, and any other context. Do not invent specific statistics, dates, or dollar amounts that were not
provided — use bracketed placeholders like [INSERT METRIC] or [INSERT BUDGET FIGURE] where a real figure is needed.
Return ONLY the drafted section text (plain prose, no JSON, no headers, no preamble or explanation).`;

module.exports = { getGroq, setCORS, readBody, EXTRACT_PROMPT, MATCH_PROMPT, DRAFT_PROMPT };
