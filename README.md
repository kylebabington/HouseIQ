# HouseIQ

**Agentic home memory.** HouseIQ remembers everything about your home — every repair,
system, project, problem, and maintenance detail — so you don't have to.

## Stack

- **Frontend** — React + Vite
- **Backend** — Express (Node.js)
- **Database** — CockroachDB (Postgres-compatible, with `pgvector`-style vector search
  for semantic memory retrieval)
- **Auth** — Auth0 (Authorization Code + PKCE on the frontend, JWT bearer validation
  on the backend)
- **AI** — OpenAI (chat completions with Structured Outputs for the agent, embeddings
  for memory search)
- **File storage** — Amazon S3 (private bucket for uploaded home documents)

## Setup

### 1. Clone and configure environment variables

```bash
git clone <this-repo-url>
cd HouseIQ

cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Fill in the values described below.

### 2. Install dependencies

```bash
cd backend
npm install

cd ../frontend
npm install
```

### 3. Create the database schema

```bash
cd backend
npm run db:schema
```

### 4. Run the app

In one terminal:

```bash
cd backend
npm run dev
```

In another terminal:

```bash
cd frontend
npm run dev
```

The backend runs at `http://localhost:5000` and the frontend at
`http://localhost:5173` by default.

## Required environment variables

### `backend/.env`

| Variable | Description |
|---|---|
| `PORT` | Port the Express server listens on (default `5000`). |
| `DATABASE_URL` | CockroachDB connection string. |
| `AUTH0_DOMAIN` | Your Auth0 tenant domain, e.g. `your-tenant.us.auth0.com`. Used to validate incoming JWTs. |
| `AUTH0_AUDIENCE` | The Identifier of the HouseIQ API registered in Auth0. Must match `VITE_AUTH0_AUDIENCE` on the frontend. |
| `FRONTEND_URL` | Origin allowed by CORS, e.g. `http://localhost:5173`. |
| `OPENAI_API_KEY` | OpenAI API key used for chat completions and embeddings. |
| `OPENAI_CHAT_MODEL` | Chat model name, e.g. `gpt-4o-mini`. |
| `AWS_REGION` | AWS region for the S3 bucket, e.g. `us-east-2`. |
| `AWS_S3_BUCKET_NAME` | Private S3 bucket for uploaded home documents. |
| `AWS_ACCESS_KEY_ID` | Local-development-only AWS credential (use an IAM role in production). |
| `AWS_SECRET_ACCESS_KEY` | Local-development-only AWS credential (use an IAM role in production). |

### `frontend/.env`

| Variable | Description |
|---|---|
| `VITE_AUTH0_DOMAIN` | Your Auth0 tenant domain. |
| `VITE_AUTH0_CLIENT_ID` | The Client ID of the Auth0 Single-Page Application. |
| `VITE_AUTH0_AUDIENCE` | Must exactly match `AUTH0_AUDIENCE` on the backend. |
| `VITE_API_URL` | Base URL of the backend API, e.g. `http://localhost:5000/api`. |

## Signature demo script

This walks through HouseIQ's core loop: densify what the home knows, then watch
HouseIQ retrieve better than a binder. Sample fixtures live in [`DOCS/`](DOCS/).

1. **Sign in** and create a home (e.g. "1978 Ranch", built 1978).
2. **Complete (or skip) the onboarding gate.** ZIP / property basics unlock Ask
   and sharpen the "What your house needs" board.
3. **Upload a document or photo.** Under "Upload a home document or photo," choose
   *Inspection report* and select `DOCS/sample-inspection.txt` (or the PDF /
   a photo of a page). HouseIQ extracts facts and creates issues, assets, and
   memories — with provenance back to the source file.
4. **Check the needs board** above Ask — ranked priorities appear from open
   issues, equipment age, and local season *before* you ask.
5. **Upload a second document.** Choose *Repair invoice* and select
   `DOCS/SAMPLE HVAC REPAIR INVOICE.txt`. HouseIQ links this to what it already
   knows about the home's HVAC system.
6. **Ask HouseIQ a question** (once basics are known), e.g.:

   > What should I do before winter?

   HouseIQ answers using the home profile, documents, and open issues — and
   shows what context it used. Advice is also saved under **Advice history**.
7. **Click an action chip** or a needs-board row to jump to that record.
8. **Optional:** Share the home (Profile tab) by invite email; the invitee
   redeems on next sign-in when their token includes that email. Search memories
   with "Find anything about this home."

## Household sharing notes

- Roles: `owner` (full), `member` (read/write except delete home / manage
  members), `viewer` (read + ask).
- Invites store an email; `POST /api/homes/members/redeem` attaches the signed-in
  user when their Auth0 access token includes a matching `email` claim.
- Access tokens often omit email unless Auth0 is configured to add it — document
  that limitation for demos.

## API testing

A ready-to-use Postman collection (with automatic Auth0 token handling) lives in
[`postman/`](postman/). See [`postman/README.md`](postman/README.md) for setup.
New routes include `GET /homes/:homeId/needs`, `GET /homes/:homeId/agent-runs`,
and `/homes/:homeId/members`.
