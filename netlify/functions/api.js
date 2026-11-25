const { createClient } = require('@supabase/supabase-js');
const Groq = require('groq-sdk');
const bcrypt = require('bcryptjs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

function ok(body, status = 200) {
  return { statusCode: status, headers, body: JSON.stringify(body) };
}
function err(detail, status = 400) {
  return { statusCode: status, headers, body: JSON.stringify({ detail }) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const path = event.path;
  const method = event.httpMethod;
  const body = event.body ? JSON.parse(event.body) : {};

  try {
    // ── AUTH ──────────────────────────────────────────────

    if (path.includes('/auth/register') && method === 'POST') {
      const { first_name, last_name, password, role = 'member' } = body;
      if (!first_name || !last_name || !password) return err('Fill in all fields');
      const name = `${first_name.trim()} ${last_name.trim()}`;
      const { data: existing } = await supabase.from('users').select('id').eq('name', name);
      if (existing?.length) return err('An account with that name already exists', 409);
      const password_hash = await bcrypt.hash(password, 12);
      const { data, error } = await supabase.from('users').insert({ name, role, password_hash }).select();
      if (error) return err(error.message, 500);
      const user = { ...data[0] };
      delete user.password_hash;
      return ok(user);
    }

    if (path.includes('/auth/login') && method === 'POST') {
      const { first_name, last_name, password } = body;
      const name = `${first_name.trim()} ${last_name.trim()}`;
      const { data } = await supabase.from('users').select('*').eq('name', name);
      if (!data?.length) return err('Name or password is incorrect', 401);
      const user = data[0];
      const valid = await bcrypt.compare(password, user.password_hash || '');
      if (!valid) return err('Name or password is incorrect', 401);
      const safe = { ...user };
      delete safe.password_hash;
      return ok(safe);
    }

    // ── CHAT ──────────────────────────────────────────────

    if (path.includes('/chat') && method === 'POST') {
      const { system, messages, max_tokens = 512 } = body;
      const completion = await groq.chat.completions.create({
        model: 'openai/gpt-oss-120b',
        messages: [{ role: 'system', content: system }, ...messages],
        max_tokens,
        temperature: 0.5,
      });
      return ok({ content: completion.choices[0].message.content });
    }

    // ── ACTIVITIES ────────────────────────────────────────

    if (path.includes('/activities') && method === 'POST') {
      const { user_id, title, raw_submission, category = 'general' } = body;
      const { data: actData, error: actErr } = await supabase
        .from('activities').insert({ user_id, title, category, raw_submission, status: 'pending_analysis' }).select();
      if (actErr) return err(actErr.message, 500);
      const activity = actData[0];

      const completion = await groq.chat.completions.create({
        model: 'openai/gpt-oss-120b',
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
      return ok({ ...activity, status: 'verified', ai_metrics: metData[0] }, 201);
    }

    // ── ATTENDANCE ────────────────────────────────────────

    // Check-in by name (no password — for QR code scanning)
    if (path.includes('/attendance/checkin-name') && method === 'POST') {
      const { code, first_name, last_name } = body;
      if (!first_name || !last_name || !code) return err('Missing required fields');
      const name = `${first_name.trim()} ${last_name.trim()}`;
      const { data: userData } = await supabase.from('users').select('id').eq('name', name).single();
      if (!userData) return err('Name not found. Check your spelling or create an account first.', 404);
      const { data: evData } = await supabase.from('attendance_events').select('*').eq('code', code.toUpperCase());
      if (!evData?.length) return err('Event not found — check the code', 404);
      const ev = evData[0];
      if (!ev.is_open) return err('This event is closed', 400);
      const { data: dup } = await supabase.from('attendance_records').select('id').eq('event_id', ev.id).eq('user_id', userData.id);
      if (dup?.length) return err('Already checked in to this event', 409);
      await supabase.from('attendance_records').insert({ event_id: ev.id, user_id: userData.id });
      return ok({ message: 'Checked in!', event: ev.name });
    }

    if (path.endsWith('/attendance/checkin') && method === 'POST') {
      const { code, user_id } = body;
      const { data: evData } = await supabase.from('attendance_events').select('*').eq('code', code.toUpperCase());
      if (!evData?.length) return err('Event not found — check the code', 404);
      const ev = evData[0];
      if (!ev.is_open) return err('This event is closed', 400);
      const { data: dup } = await supabase.from('attendance_records').select('id').eq('event_id', ev.id).eq('user_id', user_id);
      if (dup?.length) return err('Already checked in to this event', 409);
      await supabase.from('attendance_records').insert({ event_id: ev.id, user_id });
      return ok({ message: 'Checked in!', event: ev.name });
    }

    if (path.match(/\/attendance\/events\/[^/]+\/summary/) && method === 'GET') {
      const eventId = path.split('/attendance/events/')[1].replace('/summary', '');
      const { data: ev } = await supabase.from('attendance_events').select('*').eq('id', eventId).single();
      const { data: records } = await supabase.from('attendance_records').select('*, users(name, role)').eq('event_id', eventId).order('checked_in_at');
      return ok({ event: ev, attendees: records || [], count: records?.length || 0 });
    }

    if (path.match(/\/attendance\/events\/[^/]+\/toggle/) && method === 'PATCH') {
      const eventId = path.split('/attendance/events/')[1].replace('/toggle', '');
      const { data: existing } = await supabase.from('attendance_events').select('is_open').eq('id', eventId).single();
      const { data } = await supabase.from('attendance_events').update({ is_open: !existing.is_open }).eq('id', eventId).select();
      return ok(data[0]);
    }

    if (path.includes('/attendance/events') && method === 'POST') {
      const { name, date, location, created_by } = body;
      const code = Math.random().toString(36).slice(2, 8).toUpperCase();
      const { data, error } = await supabase.from('attendance_events').insert({ name, date, location, created_by, code, is_open: true }).select();
      if (error) return err(error.message, 500);
      return ok(data[0]);
    }

    if (path.includes('/attendance/events') && method === 'GET') {
      const { data } = await supabase.from('attendance_events').select('*').order('created_at', { ascending: false });
      return ok(data || []);
    }

    // ── USERS ─────────────────────────────────────────────

    if (path.match(/\/users\/[^/]+$/) && method === 'PATCH') {
      const userId = path.split('/users/')[1];
      const { role } = body;
      if (!['member', 'officer', 'advisor'].includes(role)) return err('Invalid role');
      const { data, error } = await supabase.from('users').update({ role }).eq('id', userId).select('id, name, role, email, created_at');
      if (error) return err(error.message, 500);
      if (!data?.length) return err('User not found', 404);
      return ok(data[0]);
    }

    if (path.match(/\/users\/[^/]+$/) && method === 'DELETE') {
      const userId = path.split('/users/')[1];
      const { error } = await supabase.from('users').delete().eq('id', userId);
      if (error) return err(error.message, 500);
      return ok({ message: 'User deleted' });
    }

    if ((path.endsWith('/users') || path.endsWith('/users/')) && method === 'GET') {
      const { data } = await supabase.from('users').select('id, name, role, email, created_at').order('created_at');
      return ok(data || []);
    }

    return err('Not Found', 404);

  } catch (e) {
    console.error(e);
    return err(e.message, 500);
  }
};
