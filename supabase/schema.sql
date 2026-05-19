-- InvolvED Database Schema
-- Run this in your Supabase SQL Editor (supabase.com → Project → SQL Editor)

-- ── USERS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  email       TEXT        UNIQUE,
  role        TEXT        NOT NULL DEFAULT 'member'
                          CHECK (role IN ('member', 'officer', 'advisor')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── ACTIVITIES ─────────────────────────────────────────
-- One row per task submission or event sign-up a student logs
CREATE TABLE IF NOT EXISTS activities (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT        NOT NULL,
  category       TEXT        CHECK (category IN ('research','creative','leadership','administrative','tech','general')),
  raw_submission TEXT,                          -- student's freeform description
  status         TEXT        NOT NULL DEFAULT 'pending_analysis'
                             CHECK (status IN ('pending_analysis','verified','rejected')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── AI METRICS ─────────────────────────────────────────
-- Groq-extracted structured signals for each verified activity
CREATE TABLE IF NOT EXISTS ai_metrics (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id          UUID        NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  action_verb          TEXT,                   -- e.g. "Coordinated", "Analyzed"
  quantifiable_metric  TEXT,                   -- e.g. "45% engagement increase"
  competency_tags      TEXT[]      NOT NULL DEFAULT '{}',  -- e.g. ["Project Management","Data Literacy"]
  linkedin_keywords    TEXT[]      NOT NULL DEFAULT '{}',  -- mapped LinkedIn skill keywords
  raw_groq_response    JSONB,                  -- full Groq JSON for audit/debug
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── INDEXES ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_activities_user_id     ON activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_status      ON activities(status);
CREATE INDEX IF NOT EXISTS idx_ai_metrics_activity_id ON ai_metrics(activity_id);

-- ── UPDATED_AT TRIGGER ─────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_activities_updated_at
  BEFORE UPDATE ON activities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── ROW LEVEL SECURITY (optional, enable in Supabase dashboard) ──
-- ALTER TABLE users     ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE ai_metrics ENABLE ROW LEVEL SECURITY;
