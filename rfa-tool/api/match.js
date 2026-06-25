const { getGroq, setCORS, readBody, MATCH_PROMPT } = require('./_groq');

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ detail: 'Method not allowed' }); return; }

  try {
    const { opportunity, programs } = await readBody(req);
    if (!opportunity || !Array.isArray(programs)) {
      res.status(400).json({ detail: 'opportunity and programs are required' });
      return;
    }

    const completion = await getGroq().chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: MATCH_PROMPT },
        { role: 'user', content: JSON.stringify({ opportunity, programs }) },
      ],
      max_tokens: 1200,
      temperature: 0.2,
    });

    res.status(200).json(JSON.parse(completion.choices[0].message.content));
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
};
