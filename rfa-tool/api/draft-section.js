const { getGroq, setCORS, readBody, DRAFT_PROMPT } = require('./_groq');

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ detail: 'Method not allowed' }); return; }

  try {
    const { section_name, section_description, opportunity, program, other_context } = await readBody(req);
    if (!section_name) { res.status(400).json({ detail: 'section_name is required' }); return; }

    const completion = await getGroq().chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: DRAFT_PROMPT },
        { role: 'user', content: JSON.stringify({ section_name, section_description, opportunity, program, other_context }) },
      ],
      max_tokens: 1200,
      temperature: 0.4,
    });

    res.status(200).json({ content: completion.choices[0].message.content });
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
};
