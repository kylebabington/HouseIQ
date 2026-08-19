# Production behavior

HouseIQ is built so a failed AI call cannot quietly rewrite the
home. Persistent memory lives in CockroachDB. The model is a
reader and a proposer, not the source of truth.

HouseIQ's agent API runs on AWS ECS/Fargate, source documents are
stored in Amazon S3, and persistent agent memory lives in
CockroachDB Cloud.

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

Ask, upload, and public live-demo limits are process-local
(`express-rate-limit`). That is enough for a single ECS Express
Mode service.

The public judge endpoints (`POST /api/demo/live/ask` and
`POST /api/demo/live/audit`) are capped at 5 requests / 15 minutes
per IP. Authenticated Ask stays at 30 / 15 minutes.

Production multi-instance deployments would use a distributed
rate-limit store (Redis or equivalent). Redis is intentionally not
required for this hackathon build.

## AWS

HouseIQ's AWS story is:

- **Amazon ECS Express Mode (Fargate)** runs the Express agent
  API from a container image in Amazon ECR. Express Mode
  provisions HTTPS, load balancing, networking, autoscaling, and
  a public AWS URL. Do not hand-build ALB/VPC/task-definition
  YAML for this hackathon.
- **Amazon S3** stores original home documents (inspections,
  invoices, warranties, manuals, photos). The application never
  treats model output as a substitute for those files.
- **CockroachDB Cloud** holds durable memory, including the
  distributed vector index used by Ask and the MCP path used by
  Memory Auditor.

The frontend stays where it is. Only the Express backend moves
onto AWS.

```text
HouseIQ GitHub repo
        ↓
backend/Dockerfile
        ↓
Amazon ECR
        ↓
Amazon ECS Express Mode (Fargate)
        ↓
Express API
        │
        ├── CockroachDB Cloud  (memory)
        └── Amazon S3          (original documents)
```

App Runner is not used. It is closed to new AWS customers.
ECS Express Mode is the replacement: you supply a container image,
not a source-code build.

### Container image

`backend/Dockerfile` starts `node server.js`. The process reads
`PORT` (default `8080` in the image). Health checks hit `/` or
`/api/health`.

Build from `backend/`:

```bash
cd backend
docker build -t houseiq-api .
```

### First deploy (console)

1. Create an Amazon ECR repository named `houseiq-api`.
2. Push the image built above.
3. In the ECS console, open **Express mode → Create**.
4. Point it at the ECR image. Container port: `8080`.
   Health check path: `/api/health`.
5. Paste the environment variables below into the service.
   Prefer a **task role** with `s3:PutObject`, `s3:GetObject`,
   and `s3:DeleteObject` on the document bucket. Access keys
   (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`) are a
   documented hackathon compromise if the task role is not
   wired yet.

Walk the Express Mode screens one at a time. Do not invent extra
clusters, target groups, or task-definition files.

Later pushes can use
[`.github/workflows/backend-ecs-express.yml`](../.github/workflows/backend-ecs-express.yml)
(GitHub Actions → Docker build → ECR → `amazon-ecs-deploy-express-service`).
That workflow is **manual** (`workflow_dispatch`) until AWS roles
and GitHub secrets exist.

### Environment variables on the ECS service

| Variable | Notes |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `8080` (must match the container port) |
| `DATABASE_URL` | CockroachDB Cloud URL |
| `AUTH0_DOMAIN` | JWT issuer |
| `AUTH0_AUDIENCE` | API identifier |
| `FRONTEND_URL` | Production frontend origin (CORS) |
| `OPENAI_API_KEY` | Chat + embeddings |
| `OPENAI_CHAT_MODEL` | e.g. `gpt-4o-mini` |
| `COCKROACH_MCP_API_KEY` | Cloud service-account key |
| `COCKROACH_CLUSTER_ID` | Cluster UUID |
| `COCKROACH_MCP_DATABASE` | `houseiq` |
| `PUBLIC_DEMO_HOME_ID` | Indianapolis demo home UUID |
| `AWS_REGION` | S3 region |
| `AWS_S3_BUCKET_NAME` | Private document bucket |

Point the frontend `VITE_API_URL` at the Express Mode URL plus
`/api` (example: `https://houseiq-api.ecs.us-east-2.on.aws/api`).

CORS in `backend/server.js` allows `FRONTEND_URL` (comma-separated
if more than one origin). In production Express also trusts the
first proxy hop so IP rate limits see the client address.

Bedrock, Lambda document pipelines, and rewriting the frontend
onto AWS are out of scope for this pass.
