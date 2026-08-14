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
-- HOME PROFILES
-- ---------------------------------------------------------
--
-- Stores structured physical facts about a home.
--
-- The homes table handles identity and ownership.
-- The home_profiles table handles detailed property data.
--
-- Each home can have at most one profile because home_id is
-- declared UNIQUE.
--
CREATE TABLE IF NOT EXISTS home_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  home_id UUID NOT NULL UNIQUE
    REFERENCES homes(id)
    ON DELETE CASCADE,

  -- General property information
  property_type STRING,
  square_feet INT,
  bedrooms INT,
  full_bathrooms INT,
  half_bathrooms INT,
  stories DECIMAL,

  -- Building structure and exterior
  foundation_type STRING,
  basement_type STRING,
  exterior_material STRING,
  roof_material STRING,

  -- Heating, cooling, and utilities
  heating_type STRING,
  cooling_type STRING,
  water_heater_type STRING,
  water_source STRING,
  sewer_type STRING,
  electrical_service_amps INT,

  -- Garage and lot
  garage_type STRING,
  garage_spaces INT,
  lot_size_acres DECIMAL,

  -- Location for seasonal / climate context
  postal_code STRING,
  city STRING,
  state STRING,

  -- Tracks progress through the future onboarding flow.
  onboarding_status STRING
    NOT NULL
    DEFAULT 'not_started',

  onboarding_step STRING,

  -- Flexible storage for source tracking, confidence,
  -- estimates, and future profile fields.
  metadata JSONB
    NOT NULL
    DEFAULT '{}'::JSONB,

  created_at TIMESTAMPTZ
    NOT NULL
    DEFAULT now(),

  updated_at TIMESTAMPTZ
    NOT NULL
    DEFAULT now(),

  -- Basic range checks prevent obviously invalid data from
  -- reaching the database.
  CONSTRAINT home_profiles_square_feet_check
    CHECK (
      square_feet IS NULL
      OR square_feet > 0
    ),

  CONSTRAINT home_profiles_bedrooms_check
    CHECK (
      bedrooms IS NULL
      OR bedrooms >= 0
    ),

  CONSTRAINT home_profiles_full_bathrooms_check
    CHECK (
      full_bathrooms IS NULL
      OR full_bathrooms >= 0
    ),

  CONSTRAINT home_profiles_half_bathrooms_check
    CHECK (
      half_bathrooms IS NULL
      OR half_bathrooms >= 0
    ),

  CONSTRAINT home_profiles_stories_check
    CHECK (
      stories IS NULL
      OR stories > 0
    ),

  CONSTRAINT home_profiles_electrical_amps_check
    CHECK (
      electrical_service_amps IS NULL
      OR electrical_service_amps > 0
    ),

  CONSTRAINT home_profiles_garage_spaces_check
    CHECK (
      garage_spaces IS NULL
      OR garage_spaces >= 0
    ),

  CONSTRAINT home_profiles_lot_size_check
    CHECK (
      lot_size_acres IS NULL
      OR lot_size_acres > 0
    ),

  CONSTRAINT home_profiles_onboarding_status_check
    CHECK (
      onboarding_status IN (
        'not_started',
        'in_progress',
        'completed'
      )
    )
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


-- Home profile lot size is stored in acres (decimal), not
-- square feet. Add the acres column for existing tables, then
-- drop the legacy square-foot column when present.
--
-- Do not backfill via a DO/IF block that references
-- lot_size_sq_ft: CockroachDB still resolves that column at
-- plan time, so the block fails when the legacy column is
-- already gone (or never existed). DROP COLUMN IF EXISTS is
-- enough for current databases.
--
ALTER TABLE home_profiles
ADD COLUMN IF NOT EXISTS lot_size_acres DECIMAL;

ALTER TABLE home_profiles
DROP COLUMN IF EXISTS lot_size_sq_ft;


-- Provenance: which document or agent run created a record.
-- Added via ALTER so CREATE TABLE order stays free of
-- forward references to documents / agent_runs.
--
ALTER TABLE memories
ADD COLUMN IF NOT EXISTS source_document_id UUID
REFERENCES documents(id)
ON DELETE SET NULL;

ALTER TABLE memories
ADD COLUMN IF NOT EXISTS source_agent_run_id UUID
REFERENCES agent_runs(id)
ON DELETE SET NULL;

ALTER TABLE home_issues
ADD COLUMN IF NOT EXISTS source_document_id UUID
REFERENCES documents(id)
ON DELETE SET NULL;

ALTER TABLE home_issues
ADD COLUMN IF NOT EXISTS source_agent_run_id UUID
REFERENCES agent_runs(id)
ON DELETE SET NULL;

ALTER TABLE home_projects
ADD COLUMN IF NOT EXISTS source_document_id UUID
REFERENCES documents(id)
ON DELETE SET NULL;

ALTER TABLE home_projects
ADD COLUMN IF NOT EXISTS source_agent_run_id UUID
REFERENCES agent_runs(id)
ON DELETE SET NULL;

ALTER TABLE home_assets
ADD COLUMN IF NOT EXISTS source_document_id UUID
REFERENCES documents(id)
ON DELETE SET NULL;

ALTER TABLE home_assets
ADD COLUMN IF NOT EXISTS source_agent_run_id UUID
REFERENCES agent_runs(id)
ON DELETE SET NULL;


-- Location fields for climate / seasonal localization.
--
ALTER TABLE home_profiles
ADD COLUMN IF NOT EXISTS postal_code STRING;

ALTER TABLE home_profiles
ADD COLUMN IF NOT EXISTS city STRING;

ALTER TABLE home_profiles
ADD COLUMN IF NOT EXISTS state STRING;


-- ---------------------------------------------------------
-- HOME MEMBERS (household sharing)
-- ---------------------------------------------------------
--
-- A home can have multiple members with roles.
-- The homes.owner_auth0_id column remains the canonical
-- owner; home_members mirrors access for shared users.
--
CREATE TABLE IF NOT EXISTS home_members (
  home_id UUID NOT NULL
    REFERENCES homes(id)
    ON DELETE CASCADE,

  member_auth0_id STRING NOT NULL,

  role STRING NOT NULL,

  invited_email STRING,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (home_id, member_auth0_id),

  CONSTRAINT home_members_role_check
    CHECK (role IN ('owner', 'member', 'viewer'))
);

CREATE INDEX IF NOT EXISTS idx_home_members_member_auth0_id
ON home_members (member_auth0_id);

-- Backfill owner rows for existing homes.
INSERT INTO home_members (home_id, member_auth0_id, role)
SELECT id, owner_auth0_id, 'owner'
FROM homes
WHERE owner_auth0_id IS NOT NULL
ON CONFLICT DO NOTHING;


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

-- Used when loading the one-to-one profile for a home.
CREATE INDEX IF NOT EXISTS idx_home_profiles_home_id
ON home_profiles (home_id);


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


-- ---------------------------------------------------------
-- VERIFICATION STATUS (propose-before-commit)
-- ---------------------------------------------------------
--
-- AI-created records start as `proposed` until a member accepts.
-- Manual creates default to `accepted`.

ALTER TABLE memories
ADD COLUMN IF NOT EXISTS verification_status STRING NOT NULL DEFAULT 'accepted';

ALTER TABLE home_issues
ADD COLUMN IF NOT EXISTS verification_status STRING NOT NULL DEFAULT 'accepted';

ALTER TABLE home_projects
ADD COLUMN IF NOT EXISTS verification_status STRING NOT NULL DEFAULT 'accepted';

ALTER TABLE home_assets
ADD COLUMN IF NOT EXISTS verification_status STRING NOT NULL DEFAULT 'accepted';

ALTER TABLE memories
ADD COLUMN IF NOT EXISTS evidence_passage STRING;

ALTER TABLE memories
ADD COLUMN IF NOT EXISTS evidence_page INT;

ALTER TABLE home_issues
ADD COLUMN IF NOT EXISTS evidence_passage STRING;

ALTER TABLE home_issues
ADD COLUMN IF NOT EXISTS evidence_page INT;

ALTER TABLE home_projects
ADD COLUMN IF NOT EXISTS evidence_passage STRING;

ALTER TABLE home_projects
ADD COLUMN IF NOT EXISTS evidence_page INT;

ALTER TABLE home_assets
ADD COLUMN IF NOT EXISTS evidence_passage STRING;

ALTER TABLE home_assets
ADD COLUMN IF NOT EXISTS evidence_page INT;

ALTER TABLE home_assets
ADD COLUMN IF NOT EXISTS last_service_date DATE;


-- ---------------------------------------------------------
-- DOCUMENT CHUNKS (page-level evidence)
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  document_id UUID NOT NULL
    REFERENCES documents(id)
    ON DELETE CASCADE,

  home_id UUID NOT NULL
    REFERENCES homes(id)
    ON DELETE CASCADE,

  page_number INT,
  chunk_index INT NOT NULL DEFAULT 0,
  content STRING NOT NULL,
  char_offset INT NOT NULL DEFAULT 0,

  embedding VECTOR(1536),

  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id
ON document_chunks (document_id);

CREATE INDEX IF NOT EXISTS idx_document_chunks_home_id
ON document_chunks (home_id);


-- ---------------------------------------------------------
-- MAINTENANCE EVENTS
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS maintenance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  home_id UUID NOT NULL
    REFERENCES homes(id)
    ON DELETE CASCADE,

  asset_id UUID
    REFERENCES home_assets(id)
    ON DELETE SET NULL,

  event_type STRING NOT NULL DEFAULT 'service',
  completed_at DATE,
  next_due_at DATE,
  contractor STRING,
  cost DECIMAL,
  notes STRING,

  source_document_id UUID
    REFERENCES documents(id)
    ON DELETE SET NULL,

  created_by STRING,
  verification_status STRING NOT NULL DEFAULT 'accepted',

  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_events_home_id
ON maintenance_events (home_id);

CREATE INDEX IF NOT EXISTS idx_maintenance_events_asset_id
ON maintenance_events (asset_id);


-- ---------------------------------------------------------
-- HOME INVITES (tokenized household invitations)
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS home_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  home_id UUID NOT NULL
    REFERENCES homes(id)
    ON DELETE CASCADE,

  email STRING NOT NULL,
  role STRING NOT NULL DEFAULT 'viewer',
  token_hash STRING NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  invited_by STRING NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT home_invites_role_check
    CHECK (role IN ('member', 'viewer'))
);

CREATE INDEX IF NOT EXISTS idx_home_invites_home_id
ON home_invites (home_id);

CREATE INDEX IF NOT EXISTS idx_home_invites_token_hash
ON home_invites (token_hash);

CREATE INDEX IF NOT EXISTS idx_home_invites_email
ON home_invites (email);

