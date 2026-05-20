const { createClient } = require('@supabase/supabase-js');
const Groq = require('groq-sdk');
const bcrypt = require('bcryptjs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
}

module.exports = async (req, res) => {
  setCORS(res);
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const path = req.url.split('?')[0];
  const method = req.method;
  const body = req.body || {};

  try {
    // ── AUTH ──────────────────────────────────────────────

    if (path.includes('/auth/register') && method === 'POST') {
      const { first_name, last_name, password, role = 'member' } = body;
      if (!first_name || !last_name || !password) { res.status(400).json({ detail: 'Fill in all fields' }); return; }
      const name = `${first_name.trim()} ${last_name.trim()}`;
      const { data: existing } = await supabase.from('users').select('id').eq('name', name);
      if (existing?.length) { res.status(409).json({ detail: 'An account with that name already exists' }); return; }
      const password_hash = await bcrypt.hash(password, 12);
      const { data, error } = await supabase.from('users').insert({ name, role, password_hash }).select();
      if (error) { res.status(500).json({ detail: error.message }); return; }
      const user = { ...data[0] };
      delete user.password_hash;
      res.status(200).json(user); return;
    }

    if (path.includes('/auth/login') && method === 'POST') {
      const { first_name, last_name, password } = body;
      const name = `${first_name.trim()} ${last_name.trim()}`;
      const { data } = await supabase.from('users').select('*').eq('name', name);
      if (!data?.length) { res.status(401).json({ detail: 'Name or password is incorrect' }); return; }
      const user = data[0];
      const valid = await bcrypt.compare(password, user.password_hash || '');
      if (!valid) { res.status(401).json({ detail: 'Name or password is incorrect' }); return; }
      const safe = { ...user };
      delete safe.password_hash;
      res.status(200).json(safe); return;
    }

    // ── CHAT ──────────────────────────────────────────────

    if (path.includes('/chat') && method === 'POST') {
      const { system, messages, max_tokens = 512 } = body;
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: system }, ...messages],
        max_tokens,
        temperature: 0.5,
      });
      res.status(200).json({ content: completion.choices[0].message.content }); return;
    }

    // ── ACTIVITIES ────────────────────────────────────────

    if (path.includes('/activities') && method === 'POST') {
      const { user_id, title, raw_submission, category = 'general' } = body;
      const { data: actData, error: actErr } = await supabase
        .from('activities').insert({ user_id, title, category, raw_submission, status: 'pending_analysis' }).select();
      if (actErr) { res.status(500).json({ detail: actErr.message }); return; }
      const activity = actData[0];

      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'Extract structured signals from this student activity. Return ONLY valid JSON with keys: action_verb, quantifiable_metric, competency_tags (array 2-5 items), linkedin_keywords (array 1-4 items).' },
          { role: 'user', content: raw_submission },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 256,
        temperature: 0.2,
      });
      const metrics = JSON.parse(completion.choices[0].message.content);
      const { data: metData } = await supabase.from('ai_metrics').insert({
        activity_id: activity.id,
        action_verb: metrics.action_verb,
        quantifiable_metric: metrics.quantifiable_metric,
        competency_tags: metrics.competency_tags || [],
        linkedin_keywords: metrics.linkedin_keywords || [],
      }).select();
      await supabase.from('activities').update({ status: 'verified' }).eq('id', activity.id);
      res.status(201).json({ ...activity, status: 'verified', ai_metrics: metData[0] }); return;
    }

    // ── ATTENDANCE ────────────────────────────────────────

    if (path.includes('/attendance/checkin-name') && method === 'POST') {
      const { code, first_name, last_name } = body;
      if (!first_name || !last_name || !code) { res.status(400).json({ detail: 'Missing required fields' }); return; }
      const name = `${first_name.trim()} ${last_name.trim()}`;
      const { data: userData } = await supabase.from('users').select('id').eq('name', name).single();
      if (!userData) { res.status(404).json({ detail: 'Name not found. Check your spelling or create an account first.' }); return; }
      const { data: evData } = await supabase.from('attendance_events').select('*').eq('code', code.toUpperCase());
      if (!evData?.length) { res.status(404).json({ detail: 'Event not found — check the code' }); return; }
      const ev = evData[0];
      if (!ev.is_open) { res.status(400).json({ detail: 'This event is closed' }); return; }
      const { data: dup } = await supabase.from('attendance_records').select('id').eq('event_id', ev.id).eq('user_id', userData.id);
      if (dup?.length) { res.status(409).json({ detail: 'Already checked in to this event' }); return; }
      await supabase.from('attendance_records').insert({ event_id: ev.id, user_id: userData.id });
      res.status(200).json({ message: 'Checked in!', event: ev.name }); return;
    }

    if (path.endsWith('/attendance/checkin') && method === 'POST') {
      const { code, user_id } = body;
      const { data: evData } = await supabase.from('attendance_events').select('*').eq('code', code.toUpperCase());
      if (!evData?.length) { res.status(404).json({ detail: 'Event not found — check the code' }); return; }
      const ev = evData[0];
      if (!ev.is_open) { res.status(400).json({ detail: 'This event is closed' }); return; }
      const { data: dup } = await supabase.from('attendance_records').select('id').eq('event_id', ev.id).eq('user_id', user_id);
      if (dup?.length) { res.status(409).json({ detail: 'Already checked in to this event' }); return; }
      await supabase.from('attendance_records').insert({ event_id: ev.id, user_id });
      res.status(200).json({ message: 'Checked in!', event: ev.name }); return;
    }

    if (path.match(/\/attendance\/events\/[^/]+\/summary/) && method === 'GET') {
      const eventId = path.split('/attendance/events/')[1].replace('/summary', '');
      const { data: ev } = await supabase.from('attendance_events').select('*').eq('id', eventId).single();
      const { data: records } = await supabase.from('attendance_records').select('*, users(name, role)').eq('event_id', eventId).order('checked_in_at');
      res.status(200).json({ event: ev, attendees: records || [], count: records?.length || 0 }); return;
    }

    if (path.match(/\/attendance\/events\/[^/]+\/toggle/) && method === 'PATCH') {
      const eventId = path.split('/attendance/events/')[1].replace('/toggle', '');
      const { data: existing } = await supabase.from('attendance_events').select('is_open').eq('id', eventId).single();
      const { data } = await supabase.from('attendance_events').update({ is_open: !existing.is_open }).eq('id', eventId).select();
      res.status(200).json(data[0]); return;
    }

    if (path.includes('/attendance/events') && method === 'POST') {
      const { name, date, location, created_by } = body;
      const code = Math.random().toString(36).slice(2, 8).toUpperCase();
      const { data, error } = await supabase.from('attendance_events').insert({ name, date, location, created_by, code, is_open: true }).select();
      if (error) { res.status(500).json({ detail: error.message }); return; }
      res.status(200).json(data[0]); return;
    }

    if (path.includes('/attendance/events') && method === 'GET') {
      const { data } = await supabase.from('attendance_events').select('*').order('created_at', { ascending: false });
      res.status(200).json(data || []); return;
    }

    // ── USERS ─────────────────────────────────────────────

    if (path.match(/\/users\/[^/]+$/) && method === 'PATCH') {
      const userId = path.split('/users/')[1];
      const { role } = body;
      if (!['member', 'officer', 'advisor'].includes(role)) { res.status(400).json({ detail: 'Invalid role' }); return; }
      const { data, error } = await supabase.from('users').update({ role }).eq('id', userId).select('id, name, role, email, created_at');
      if (error) { res.status(500).json({ detail: error.message }); return; }
      if (!data?.length) { res.status(404).json({ detail: 'User not found' }); return; }
      res.status(200).json(data[0]); return;
    }

    if (path.match(/\/users\/[^/]+$/) && method === 'DELETE') {
      const userId = path.split('/users/')[1];
      const { error } = await supabase.from('users').delete().eq('id', userId);
      if (error) { res.status(500).json({ detail: error.message }); return; }
      res.status(200).json({ message: 'User deleted' }); return;
    }

    if ((path.endsWith('/users') || path.endsWith('/users/')) && method === 'GET') {
      const { data } = await supabase.from('users').select('id, name, role, email, created_at').order('created_at');
      res.status(200).json(data || []); return;
    }

    res.status(404).json({ detail: 'Not Found' });

  } catch (e) {
    console.error(e);
    res.status(500).json({ detail: e.message });
  }
};
