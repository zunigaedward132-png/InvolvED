import os
import json
from groq import Groq, APITimeoutError, APIStatusError

_client: Groq | None = None

SYSTEM_PROMPT = """You are a labor economist and career coach specializing in translating
student extracurricular experience into corporate competencies.

Given a student's casual description of an activity, extract structured signals.

Return ONLY valid JSON with these exact keys:
{
  "action_verb": "single strong verb (e.g. Coordinated, Analyzed, Led, Designed)",
  "quantifiable_metric": "a specific measurable outcome if present, else null",
  "competency_tags": ["array", "of", "2-5", "professional", "skill", "labels"],
  "linkedin_keywords": ["array", "of", "1-4", "LinkedIn-standard", "skill", "keywords"]
}

Examples of competency_tags: Project Management, Data Literacy, Public Speaking,
Event Coordination, Written Communication, Creative Problem Solving.

Examples of linkedin_keywords: Leadership, Marketing, Research, Communication,
Graphic Design, Data Analysis, Social Media Marketing.

Do not include any explanation outside the JSON object."""


def get_groq() -> Groq:
    global _client
    if _client is None:
        _client = Groq(api_key=os.environ["GROQ_API_KEY"])
    return _client


def analyze_activity(raw_text: str) -> dict:
    """
    Send student's activity text to Groq and get structured JSON back.
    Returns a dict with action_verb, quantifiable_metric, competency_tags, linkedin_keywords.
    Raises ValueError on parse failure, APITimeoutError / APIStatusError on Groq issues.
    """
    client = get_groq()

    completion = client.chat.completions.create(
        model="llama3-70b-8192",
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": raw_text},
        ],
        temperature=0.2,
        max_tokens=256,
        timeout=15.0,
    )

    raw_json = completion.choices[0].message.content
    result = json.loads(raw_json)

    # Normalise: ensure lists are actually lists
    for field in ("competency_tags", "linkedin_keywords"):
        if not isinstance(result.get(field), list):
            result[field] = []

    return result
