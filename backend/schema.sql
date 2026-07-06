-- backend/schema.sql

CREATE TABLE IF NOT EXISTS homes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name STRING NOT NULL,

  year_built INT,

  notes STRING,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS home_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  home_id UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,

  asset_type STRING NOT NULL,
  name STRING NOT NULL,

  brand STRING,
  model STRING,
  serial_number STRING,
  install_date DATE,

  location STRING,

  notes STRING,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  home_id UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,

  asset_id UUID REFERENCES home_assets(id) ON DELETE SET NULL,

  title STRING NOT NULL,

  category STRING NOT NULL DEFAULT 'general',

  content STRING NOT NULL,

  -- This will store searchable memory metadata.
  -- Example:
  -- {
  --   "room": "west bedroom",
  --   "urgency": "medium",
  --   "source": "manual_entry",
  --   "weather_related": true
  -- }
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- 1536 is a common embedding size for many embedding models.
  -- Later, if Bedrock model uses a different dimension, we will adjust this.
  embedding VECTOR(1536),

  importance INT NOT NULL DEFAULT 3,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  home_id UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,

  user_question STRING NOT NULL,

  answer STRING,

  status STRING NOT NULL DEFAULT 'completed',

  memories_used JSONB NOT NULL DEFAULT '[]'::JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memories_home_id
ON memories (home_id);

CREATE INDEX IF NOT EXISTS idx_memories_category
ON memories (category);

CREATE INDEX IF NOT EXISTS idx_home_assets_home_id
ON home_assets (home_id);

-- This is the hackathon-important index.
-- It makes semantic memory retrieval scalable.
CREATE VECTOR INDEX IF NOT EXISTS idx_memories_embedding
ON memories (embedding);