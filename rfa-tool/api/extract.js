const { getGroq, setCORS, readBody, EXTRACT_PROMPT } = require('./_groq');

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ detail: 'Method not allowed' }); return; }

  try {
    const { document_text } = await readBody(req);
    if (!document_text) { res.status(400).json({ detail: 'document_text is required' }); return; }

    const completion = await getGroq().chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: EXTRACT_PROMPT },
        { role: 'user', content: document_text.slice(0, 24000) },
      ],
      max_tokens: 2000,
      temperature: 0.1,
    });

    res.status(200).json(JSON.parse(completion.choices[0].message.content));
  } catch (e) {
    res.status(500).json({ detail: e.message });
  }
};
