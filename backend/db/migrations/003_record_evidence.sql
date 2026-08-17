-- Canonical records may collect evidence from many documents.
-- Likely duplicates are grouped with merged_into_id; they are
-- not deleted. Questionable pairs are flagged for review.

ALTER TABLE memories
ADD COLUMN IF NOT EXISTS merged_into_id UUID
REFERENCES memories(id)
ON DELETE SET NULL;

ALTER TABLE home_issues
ADD COLUMN IF NOT EXISTS merged_into_id UUID
REFERENCES home_issues(id)
ON DELETE SET NULL;

ALTER TABLE home_projects
ADD COLUMN IF NOT EXISTS merged_into_id UUID
REFERENCES home_projects(id)
ON DELETE SET NULL;

ALTER TABLE home_assets
ADD COLUMN IF NOT EXISTS merged_into_id UUID
REFERENCES home_assets(id)
ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS record_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  record_kind STRING NOT NULL,
  record_id UUID NOT NULL,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  chunk_id UUID REFERENCES document_chunks(id) ON DELETE SET NULL,
  passage STRING,
  page INT,
  match_confidence STRING NOT NULL DEFAULT 'exact',
  review_status STRING NOT NULL DEFAULT 'attached',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT record_evidence_kind_check
    CHECK (record_kind IN ('memory', 'issue', 'project', 'asset')),
  CONSTRAINT record_evidence_confidence_check
    CHECK (match_confidence IN ('exact', 'likely', 'questionable')),
  CONSTRAINT record_evidence_review_check
    CHECK (review_status IN ('attached', 'flagged'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_record_evidence_unique
ON record_evidence (record_kind, record_id, document_id);

CREATE INDEX IF NOT EXISTS idx_record_evidence_home_id
ON record_evidence (home_id);

CREATE INDEX IF NOT EXISTS idx_record_evidence_record
ON record_evidence (record_kind, record_id);

CREATE TABLE IF NOT EXISTS record_duplicate_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  record_kind STRING NOT NULL,
  record_id UUID NOT NULL,
  canonical_record_id UUID NOT NULL,
  score DECIMAL,
  reason STRING,
  status STRING NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT record_duplicate_flags_kind_check
    CHECK (record_kind IN ('memory', 'issue', 'project', 'asset')),
  CONSTRAINT record_duplicate_flags_status_check
    CHECK (status IN ('open', 'same', 'distinct'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_record_duplicate_flags_pair
ON record_duplicate_flags (record_kind, record_id, canonical_record_id);

CREATE INDEX IF NOT EXISTS idx_record_duplicate_flags_home
ON record_duplicate_flags (home_id, status);
