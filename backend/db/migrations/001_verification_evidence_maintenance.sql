-- Numbered migration mirror of schema.sql append (Phase 0–1).
-- Prefer runSchema.js for greenfield; apply this for incremental DBs.

ALTER TABLE memories
ADD COLUMN IF NOT EXISTS verification_status STRING NOT NULL DEFAULT 'accepted';

ALTER TABLE home_issues
ADD COLUMN IF NOT EXISTS verification_status STRING NOT NULL DEFAULT 'accepted';

ALTER TABLE home_projects
ADD COLUMN IF NOT EXISTS verification_status STRING NOT NULL DEFAULT 'accepted';

ALTER TABLE home_assets
ADD COLUMN IF NOT EXISTS verification_status STRING NOT NULL DEFAULT 'accepted';

ALTER TABLE memories ADD COLUMN IF NOT EXISTS evidence_passage STRING;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS evidence_page INT;
ALTER TABLE home_issues ADD COLUMN IF NOT EXISTS evidence_passage STRING;
ALTER TABLE home_issues ADD COLUMN IF NOT EXISTS evidence_page INT;
ALTER TABLE home_projects ADD COLUMN IF NOT EXISTS evidence_passage STRING;
ALTER TABLE home_projects ADD COLUMN IF NOT EXISTS evidence_page INT;
ALTER TABLE home_assets ADD COLUMN IF NOT EXISTS evidence_passage STRING;
ALTER TABLE home_assets ADD COLUMN IF NOT EXISTS evidence_page INT;
ALTER TABLE home_assets ADD COLUMN IF NOT EXISTS last_service_date DATE;

CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  home_id UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  page_number INT,
  chunk_index INT NOT NULL DEFAULT 0,
  content STRING NOT NULL,
  char_offset INT NOT NULL DEFAULT 0,
  embedding VECTOR(1536),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks (document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_home_id ON document_chunks (home_id);

CREATE TABLE IF NOT EXISTS maintenance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES home_assets(id) ON DELETE SET NULL,
  event_type STRING NOT NULL DEFAULT 'service',
  completed_at DATE,
  next_due_at DATE,
  contractor STRING,
  cost DECIMAL,
  notes STRING,
  source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  created_by STRING,
  verification_status STRING NOT NULL DEFAULT 'accepted',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_events_home_id ON maintenance_events (home_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_events_asset_id ON maintenance_events (asset_id);

CREATE TABLE IF NOT EXISTS home_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  email STRING NOT NULL,
  role STRING NOT NULL DEFAULT 'viewer',
  token_hash STRING NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  invited_by STRING NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT home_invites_role_check CHECK (role IN ('member', 'viewer'))
);

CREATE INDEX IF NOT EXISTS idx_home_invites_home_id ON home_invites (home_id);
CREATE INDEX IF NOT EXISTS idx_home_invites_token_hash ON home_invites (token_hash);
CREATE INDEX IF NOT EXISTS idx_home_invites_email ON home_invites (email);
