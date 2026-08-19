# HouseIQ

**Your home's history, evidence, and next move.**

HouseIQ turns inspections, invoices, repairs, and conversations into an
evidence-backed memory of your home — then tells you what matters next and why.

HouseIQ doesn't just answer questions about homes. **It remembers your home.**
Every inspection, invoice, repair, and conversation makes that memory smarter —
and HouseIQ can show you exactly where it learned what it knows.

[Live Demo](#) · [Demo Video](#)

Paste the production frontend URL and the ~3 minute video URL after
ECS Express Mode is serving the API and the walkthrough is recorded.
Until then, clone locally and use the judge path below.

License: [MIT](LICENSE)

> **Judge path (no signup):** open **Explore demo home** → **Ask HouseIQ** →
> **Run live memory query** (CockroachDB vector) → **Memory Auditor** →
> **Run live MCP audit**. Both live buttons ignore whatever you type; the
> questions are hardcoded on the server.

## Hackathon Technologies

### CockroachDB Distributed Vector Indexing

Ask embeds the homeowner's question and retrieves memories with CockroachDB
vector distance:

`memories.embedding <=> $query::VECTOR(1536)`

That query is the memory lookup. It is not an application-side cosine loop.
The Agent Run Inspector shows how many memories were searched and which
ones cleared the similarity cutoff. **Why HouseIQ knows this** lists those
rows with source document and score.

### CockroachDB Managed MCP

The Memory Auditor is a second agent. It does **not** use the Ask/RAG path.
It connects to CockroachDB Cloud Managed MCP
(`https://cockroachlabs.cloud/mcp`) with a service-account API key and
`mcp-cluster-id`, then inspects `home_assets`, `memories`, `home_issues`,
`maintenance_events`, `documents`, and `record_evidence` through
home-scoped `SELECT`s.

Example:

> What evidence supports what HouseIQ believes about the furnace?

The MCP tool trace is stored on `agent_runs` (`run_kind = memory_audit`).

### Amazon S3

Original inspections, invoices, warranties, manuals, and photos are stored
in a private S3 bucket. HouseIQ cites those files; it does not replace them
with model output. Failed S3 uploads do not complete ingestion.

### AWS ECS/Fargate (Express Mode)

HouseIQ's agent API runs on AWS ECS/Fargate, source documents are stored in
Amazon S3, and persistent agent memory lives in CockroachDB Cloud.

The backend image is `backend/Dockerfile` → Amazon ECR → Amazon ECS
Express Mode. The frontend stays where it is. See
[`DOCS/PRODUCTION.md`](DOCS/PRODUCTION.md) for env vars, health checks, CORS,
and the task-role vs access-key note.

### Why CockroachDB Matters

HouseIQ's durable memory is independent of the LLM. Models can change, but
the verified history of the home remains.

## The problem

When you buy a house, you're handed piles of paperwork. Five years later, nobody
remembers where anything is — or why the furnace, the roof, or the crawlspace
matters this winter.

## How HouseIQ works

1. **Upload** an inspection, invoice, or photo.
2. **Review proposed changes** with the source passage. HouseIQ does not blindly
   trust its AI — the homeowner decides what becomes true.
3. **Memory densifies over time.** The next document is not a one-off analysis;
   it attaches to systems the house already knows.
4. **See what matters next.** A ranked plan uses location, climate, equipment,
   inspection findings, and maintenance history — with evidence you can open.

Judges should remember three things: HouseIQ learns. HouseIQ remembers. HouseIQ
tells you what matters next — with evidence.

## Signature demo

Build the entire walkthrough around **one house**: the Indianapolis demo home.
The 15-year record lives in
[`DOCS/HouseIQ_Starter_Upload_Batch_36/`](DOCS/HouseIQ_Starter_Upload_Batch_36/).
See [`DOCS/DEMO.md`](DOCS/DEMO.md) for upload order. Do not tour every tab.

### Scene 1 — Homes forget

Homes accumulate decades of repairs, inspections, and maintenance, but
homeowners rarely have a usable memory of any of it.

Create or seed the house (signed-in: **Seed Indianapolis Ranch**), or open
**Explore demo home** for the public preview.

### Scene 2 — Show the history

Upload the batch in order (2012 inspection through 2025 HVAC inspection).
HouseIQ should keep **one furnace** and **one air conditioner**, with later
invoices attached as evidence — not a new furnace every service year.

### Scene 3 — Add a 2026 document

Upload [`DOCS/SAMPLE HVAC REPAIR INVOICE.txt`](DOCS/SAMPLE HVAC REPAIR INVOICE.txt)
as a *Repair invoice*. HouseIQ should recognize the existing Carrier AC.

### Scene 4 — Ask the killer question

Ask:

> What major expenses should I prepare for over the next three years?

Open **Why HouseIQ knows this**. Show vector-retrieved memories and sources.

### Scene 5 — Memory Auditor (CockroachDB MCP)

Ask the Memory Auditor:

> What evidence supports what HouseIQ believes about the furnace?

Show the MCP tool trace hitting CockroachDB. The model is not HouseIQ's
memory. CockroachDB is.

## Architecture

See the diagram in [`DOCS/ARCHITECTURE.md`](DOCS/ARCHITECTURE.md).

- **Frontend** — React + Vite
- **Backend** — Express (Node.js) on Amazon ECS Express Mode (Fargate)
- **Database** — CockroachDB Cloud (distributed vector index on `memories`)
- **MCP** — CockroachDB Cloud Managed MCP (Memory Auditor)
- **Auth** — Auth0 (Authorization Code + PKCE on the frontend, JWT bearer
  validation on the backend)
- **AI** — OpenAI (chat completions with Structured Outputs for the agent,
  embeddings for memory search)
- **File storage** — Amazon S3 (private bucket for uploaded home documents)

## Running locally

```bash
git clone https://github.com/kylebabington/HouseIQ.git
cd HouseIQ

cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Fill in the values in the tables below, then:

```bash
cd backend && npm install && npm run db:schema
cd ../frontend && npm install

# terminal 1
cd backend && npm run dev

# terminal 2
cd frontend && npm run dev
```

The backend runs at `http://localhost:5000` and the frontend at
`http://localhost:5173` by default. Open the app and click **Explore demo home**
to see the Ranch without signing in.

### Required environment variables

#### `backend/.env`

| Variable | Description |
|---|---|
| `PORT` | Port the Express server listens on (default `5000`). |
| `DATABASE_URL` | CockroachDB connection string. |
| `AUTH0_DOMAIN` | Your Auth0 tenant domain, e.g. `your-tenant.us.auth0.com`. Used to validate incoming JWTs. |
| `AUTH0_AUDIENCE` | The Identifier of the HouseIQ API registered in Auth0. Must match `VITE_AUTH0_AUDIENCE` on the frontend. |
| `FRONTEND_URL` | Origin allowed by CORS, e.g. `http://localhost:5173`. |
| `PUBLIC_DEMO_HOME_ID` | UUID of the Indianapolis home shown by Explore demo home. |
| `OPENAI_API_KEY` | OpenAI API key used for chat completions and embeddings. |
| `OPENAI_CHAT_MODEL` | Chat model name, e.g. `gpt-4o-mini`. |
| `AWS_REGION` | AWS region for the S3 bucket, e.g. `us-east-2`. |
| `AWS_S3_BUCKET_NAME` | Private S3 bucket for uploaded home documents. |
| `AWS_ACCESS_KEY_ID` | Local-development-only AWS credential (use an IAM role in production). |
| `AWS_SECRET_ACCESS_KEY` | Local-development-only AWS credential (use an IAM role in production). |
| `COCKROACH_MCP_URL` | CockroachDB Cloud MCP endpoint (default `https://cockroachlabs.cloud/mcp`). |
| `COCKROACH_MCP_API_KEY` | Cloud service-account API key (not the SQL user in `DATABASE_URL`). |
| `COCKROACH_CLUSTER_ID` | Cluster UUID from the Cloud console overview URL. |
| `COCKROACH_MCP_DATABASE` | Database the Memory Auditor should inspect (default `houseiq`). |

#### `frontend/.env`

| Variable | Description |
|---|---|
| `VITE_AUTH0_DOMAIN` | Your Auth0 tenant domain. |
| `VITE_AUTH0_CLIENT_ID` | The Client ID of the Auth0 Single-Page Application. |
| `VITE_AUTH0_AUDIENCE` | Must exactly match `AUTH0_AUDIENCE` on the backend. |
| `VITE_API_URL` | Base URL of the backend API, e.g. `http://localhost:5000/api` locally or the ECS Express Mode URL plus `/api` in production. |

## Household sharing notes

- Roles: `owner` (full), `member` (read/write except delete home / manage
  members), `viewer` (read profile/records/documents + ask; no edits/uploads).
  Read and Ask routes require `viewer+`; writes require `member+`; home delete
  and household management require `owner`.
- Invites store an email; `POST /api/homes/members/redeem` attaches the signed-in
  user when their Auth0 access token includes a matching `email` claim.
- Access tokens often omit email unless Auth0 is configured to add it — document
  that limitation for demos.

## API testing

A ready-to-use Postman collection (with automatic Auth0 token handling) lives in
[`postman/`](postman/). See [`postman/README.md`](postman/README.md) for setup.

Public demo: `GET /api/demo/home`. Live judge buttons (no login):
`POST /api/demo/live/ask` and `POST /api/demo/live/audit`. Authenticated
extras include `GET /homes/:homeId/needs`, `GET /homes/:homeId/passport`,
`GET /homes/:homeId/agent-runs`, `POST /homes/:homeId/memory-audit`,
and `/homes/:homeId/members`.

Cockroach MCP smoke check (requires `.env` keys):

```bash
cd backend && npm run mcp:smoke
```

Populate the Indianapolis demo home from the 15-year batch (API must be
running; caller must own `PUBLIC_DEMO_HOME_ID`):

```bash
cd backend && npm run demo:seed-history
```

Failure behavior and the ECS/Fargate + S3 + CockroachDB production shape
are documented in [`DOCS/PRODUCTION.md`](DOCS/PRODUCTION.md).
The 15-year upload script for judges is [`DOCS/DEMO.md`](DOCS/DEMO.md).
