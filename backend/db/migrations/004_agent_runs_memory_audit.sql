-- Persist Memory Auditor runs separately from Ask, and keep the
-- MCP tool trace for later Agent Run Inspector work.

ALTER TABLE agent_runs
ADD COLUMN IF NOT EXISTS run_kind STRING
NOT NULL DEFAULT 'ask';

ALTER TABLE agent_runs
ADD COLUMN IF NOT EXISTS tool_trace JSONB
NOT NULL DEFAULT '[]'::JSONB;
