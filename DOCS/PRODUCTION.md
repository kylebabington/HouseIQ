# Production behavior

HouseIQ is built so a failed AI call cannot quietly rewrite the
home. Persistent memory lives in CockroachDB. The model is a
reader and a proposer, not the source of truth.

## LLM fails

Ask and document analysis stop. No memories, assets, issues, or
projects are written. If an Ask transaction had already begun, it
is rolled back. A failed `agent_runs` row is stored outside that
transaction so the failure is still visible in the Agent Run
Inspector.

Memory Auditor runs are the same: a failed MCP/LLM turn does not
create or update home records.

## Embedding call fails

Ask never performs ungrounded retrieval. The embedding is required
before CockroachDB vector search. If `createEmbedding` throws, the
request fails, no memories are ranked, and no answer is produced
from an empty or invented context.

## S3 upload fails

Document ingestion is not marked complete. The original file is
the source of truth for later evidence. If the private S3 put
fails, HouseIQ does not treat the upload as a finished document
with accepted facts.

## Agent invents something

AI-generated facts remain `proposed` until the homeowner accepts
them. Proposed memories, issues, projects, and assets do not
become Ask context until verification status is `accepted`.

## Unauthorized user requests another house

Access is denied as `404 Home not found`. HouseIQ does not confirm
whether the house exists. Ownership and household membership are
checked before Ask, Memory Auditor, documents, and records.

## Rate limits

Ask and upload limits are process-local (`express-rate-limit`).
That is enough for a single backend instance.

Production multi-instance deployments would use a distributed
rate-limit store (Redis or equivalent). Redis is intentionally not
required for this hackathon build.

## AWS

Amazon S3 stores original home documents (inspections, invoices,
warranties, manuals, photos). The application never treats model
output as a substitute for those files.

The API, CockroachDB Cloud, and S3 are the current production
shape. Moving extraction onto Lambda or the chat layer onto Bedrock
would strengthen the AWS story later; it is not required for S3 to
already power part of the application.
