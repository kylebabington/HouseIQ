-- backend/schema.sql

-- Main home profile
CREATE TABLE IF NOT EXISTS homes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name STRING NOT NULL,
  year_built INT,
  notes STRING,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Appliances, systems, equipment, tools, vehicles, etc.
CREATE TABLE IF NOT EXISTS home_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  home_id UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,

  asset_type STRING NOT NULL,
  name STRING NOT NULL,

  brand STRING,
  model STRING,
  serial_number STRING,
  install_date DATE,
  purchase_date DATE,
  warranty_expiration DATE,

  location STRING,
  notes STRING,

  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Permanent long-term memory
CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  home_id UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,

  asset_id UUID REFERENCES home_assets(id) ON DELETE SET NULL,

  title STRING NOT NULL,
  category STRING NOT NULL DEFAULT 'general',
  content STRING NOT NULL,

  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

  embedding VECTOR(1536),

  importance INT NOT NULL DEFAULT 3,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Problems that need tracking
CREATE TABLE IF NOT EXISTS home_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  home_id UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,

  asset_id UUID REFERENCES home_assets(id) ON DELETE SET NULL,

  title STRING NOT NULL,
  description STRING NOT NULL,

  status STRING NOT NULL DEFAULT 'open',
  priority STRING NOT NULL DEFAULT 'medium',

  category STRING NOT NULL DEFAULT 'general',

  suspected_cause STRING,
  recommended_next_step STRING,

  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bigger pieces of work
CREATE TABLE IF NOT EXISTS home_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  home_id UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,

  issue_id UUID REFERENCES home_issues(id) ON DELETE SET NULL,

  title STRING NOT NULL,
  description STRING NOT NULL,

  status STRING NOT NULL DEFAULT 'planned',
  priority STRING NOT NULL DEFAULT 'medium',

  estimated_cost_low INT,
  estimated_cost_high INT,

  diy_difficulty STRING,
  safety_notes STRING,

  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Steps inside projects
CREATE TABLE IF NOT EXISTS project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  project_id UUID NOT NULL REFERENCES home_projects(id) ON DELETE CASCADE,

  task_order INT NOT NULL,
  title STRING NOT NULL,
  description STRING,

  status STRING NOT NULL DEFAULT 'todo',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Uploaded inspection reports, invoices, receipts, manuals, etc.
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  home_id UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,

  document_type STRING NOT NULL DEFAULT 'general',

  file_name STRING,
  source_url STRING,

  extracted_text STRING,

  summary STRING,

  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every AI run gets recorded
CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  home_id UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,

  user_question STRING NOT NULL,

  answer STRING,

  status STRING NOT NULL DEFAULT 'completed',

  confidence STRING NOT NULL DEFAULT 'medium',

  needs_more_info BOOL NOT NULL DEFAULT false,

  clarifying_questions JSONB NOT NULL DEFAULT '[]'::JSONB,

  memories_used JSONB NOT NULL DEFAULT '[]'::JSONB,

  actions_taken JSONB NOT NULL DEFAULT '[]'::JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backfill columns added after initial deploy
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS memories_used JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS actions_taken JSONB NOT NULL DEFAULT '[]'::JSONB;

CREATE INDEX IF NOT EXISTS idx_memories_home_id
ON memories (home_id);

CREATE INDEX IF NOT EXISTS idx_memories_category
ON memories (category);

CREATE INDEX IF NOT EXISTS idx_home_assets_home_id
ON home_assets (home_id);

CREATE INDEX IF NOT EXISTS idx_home_issues_home_id
ON home_issues (home_id);

CREATE INDEX IF NOT EXISTS idx_home_projects_home_id
ON home_projects (home_id);

CREATE INDEX IF NOT EXISTS idx_documents_home_id
ON documents (home_id);

CREATE VECTOR INDEX IF NOT EXISTS idx_memories_embedding
ON memories (embedding);