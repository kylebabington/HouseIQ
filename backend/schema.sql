-- backend/schema.sql


-- ---------------------------------------------------------
-- HOMES
-- ---------------------------------------------------------
--
-- Every home belongs to exactly one authenticated Auth0 user.
--
-- owner_auth0_id stores the stable Auth0 sub claim.
--
-- Examples:
--
-- google-oauth2|111906979750891104809
-- auth0|abc123xyz
--
-- This field is NOT NULL because HouseIQ must never create
-- an ownerless home.
--
 CREATE TABLE IF NOT EXISTS homes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  owner_auth0_id STRING NOT NULL,

  name STRING NOT NULL,
  year_built INT,
  notes STRING,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------
-- HOME ASSETS
-- ---------------------------------------------------------
--
-- Appliances, systems, equipment, tools, vehicles, etc.
--
CREATE TABLE IF NOT EXISTS home_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  home_id UUID NOT NULL
    REFERENCES homes(id)
    ON DELETE CASCADE,

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


-- ---------------------------------------------------------
-- MEMORIES
-- ---------------------------------------------------------
--
-- Permanent long-term facts about a home.
--
CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  home_id UUID NOT NULL
    REFERENCES homes(id)
    ON DELETE CASCADE,

  asset_id UUID
    REFERENCES home_assets(id)
    ON DELETE SET NULL,

  title STRING NOT NULL,
  category STRING NOT NULL DEFAULT 'general',
  content STRING NOT NULL,

  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

  embedding VECTOR(1536),

  importance INT NOT NULL DEFAULT 3,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------
-- HOME ISSUES
-- ---------------------------------------------------------
--
-- Problems that need tracking.
--
CREATE TABLE IF NOT EXISTS home_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  home_id UUID NOT NULL
    REFERENCES homes(id)
    ON DELETE CASCADE,

  asset_id UUID
    REFERENCES home_assets(id)
    ON DELETE SET NULL,

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


-- ---------------------------------------------------------
-- HOME PROJECTS
-- ---------------------------------------------------------
--
-- Bigger pieces of repair, maintenance, or improvement work.
--
CREATE TABLE IF NOT EXISTS home_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  home_id UUID NOT NULL
    REFERENCES homes(id)
    ON DELETE CASCADE,

  issue_id UUID
    REFERENCES home_issues(id)
    ON DELETE SET NULL,

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


-- ---------------------------------------------------------
-- PROJECT TASKS
-- ---------------------------------------------------------
--
-- Individual steps inside a home project.
--
CREATE TABLE IF NOT EXISTS project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  project_id UUID NOT NULL
    REFERENCES home_projects(id)
    ON DELETE CASCADE,

  task_order INT NOT NULL,

  title STRING NOT NULL,
  description STRING,

  status STRING NOT NULL DEFAULT 'todo',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------
-- DOCUMENTS
-- ---------------------------------------------------------
--
-- Uploaded inspection reports, invoices, receipts, manuals,
-- warranties, and other home-related files.
--
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  home_id UUID NOT NULL
    REFERENCES homes(id)
    ON DELETE CASCADE,

  document_type STRING NOT NULL DEFAULT 'general',

  file_name STRING,
  source_url STRING,

  extracted_text STRING,
  summary STRING,

  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------
-- AGENT RUNS
-- ---------------------------------------------------------
--
-- Records each HouseIQ AI interaction.
--
CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  home_id UUID NOT NULL
    REFERENCES homes(id)
    ON DELETE CASCADE,

  user_question STRING NOT NULL,

  answer STRING,

  status STRING NOT NULL DEFAULT 'completed',

  confidence STRING NOT NULL DEFAULT 'medium',

  needs_more_info BOOL NOT NULL DEFAULT false,

  clarifying_questions JSONB
    NOT NULL
    DEFAULT '[]'::JSONB,

  memories_used JSONB
    NOT NULL
    DEFAULT '[]'::JSONB,

  actions_taken JSONB
    NOT NULL
    DEFAULT '[]'::JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------
-- MIGRATIONS FOR EXISTING DATABASES
-- ---------------------------------------------------------
--
-- CREATE TABLE IF NOT EXISTS does not modify tables that
-- already exist.
--
-- These statements safely update older HouseIQ databases.
--


-- Add Auth0 ownership to databases created before ownership
-- was introduced.
--
-- This statement must come before SET NOT NULL.
--
ALTER TABLE homes
ADD COLUMN IF NOT EXISTS owner_auth0_id STRING;


-- Make ownership mandatory.
--
-- This will fail if any existing home still has:
--
-- owner_auth0_id IS NULL
--
-- Existing homes must be backfilled before running this.
--
ALTER TABLE homes
ALTER COLUMN owner_auth0_id
SET NOT NULL;


-- Add agent-run fields introduced after the first deployment.
--
ALTER TABLE agent_runs
ADD COLUMN IF NOT EXISTS memories_used JSONB
NOT NULL DEFAULT '[]'::JSONB;

ALTER TABLE agent_runs
ADD COLUMN IF NOT EXISTS actions_taken JSONB
NOT NULL DEFAULT '[]'::JSONB;


-- ---------------------------------------------------------
-- STANDARD INDEXES
-- ---------------------------------------------------------


-- Used by:
--
-- SELECT ...
-- FROM homes
-- WHERE owner_auth0_id = $1
--
CREATE INDEX IF NOT EXISTS idx_homes_owner_auth0_id
ON homes (owner_auth0_id);


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


CREATE INDEX IF NOT EXISTS idx_project_tasks_project_id
ON project_tasks (project_id);


CREATE INDEX IF NOT EXISTS idx_documents_home_id
ON documents (home_id);


CREATE INDEX IF NOT EXISTS idx_agent_runs_home_id
ON agent_runs (home_id);


-- ---------------------------------------------------------
-- VECTOR INDEX
-- ---------------------------------------------------------
--
-- Supports semantic memory search using OpenAI embeddings.
--
CREATE VECTOR INDEX IF NOT EXISTS idx_memories_embedding
ON memories (embedding);

