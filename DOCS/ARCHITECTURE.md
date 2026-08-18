# Architecture

HouseIQ's durable memory is CockroachDB. The LLM proposes; the
database remembers.

```text
                    User
                      │
                      ▼
                React Frontend
                      │
                      ▼
                Express API
                 /         \
                /           \
               ▼             ▼
          AI Agent          Amazon S3
               │          Original docs
               ▼
       CockroachDB Cloud
       ┌───────────────┐
       │ Homes         │
       │ Assets        │
       │ Memories      │
       │ Issues        │
       │ Maintenance   │
       │ Agent Runs    │
       │ Embeddings    │
       └───────┬───────┘
               │
       Distributed Vector
             Index
               │
               ▼
       Relevant memories


       CockroachDB MCP
               │
               ▼
       Memory Auditor Agent
```

## Two retrieval paths

**Ask** uses CockroachDB distributed vector indexing
(`memories.embedding <=> query_vector`) to retrieve relevant
memories, then loads the home profile, assets, and issues.

**Memory Auditor** does not use that RAG path. It connects to
CockroachDB Cloud Managed MCP (`https://cockroachlabs.cloud/mcp`)
and inspects memories, assets, maintenance events, issues,
documents, and `record_evidence` with home-scoped `SELECT`s.

## Why this split exists

Vector search answers "what is relevant to this question?"
MCP answers "what does HouseIQ currently believe, and where did
that belief come from?" Judges can watch both.
