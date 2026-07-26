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

This walks through HouseIQ's core loop: give it a document, then ask it a question
and watch it use what it just learned. Sample fixtures live in [`DOCS/`](DOCS/).

1. **Sign in** and create a home (e.g. "1978 Ranch", built 1978).
2. **Upload a document.** Under "Upload a home document," choose *Inspection report*
   and select `DOCS/sample-inspection.txt` (or the PDF version,
   `DOCS/Fictitious_Home_Inspection_Report.pdf`). HouseIQ extracts facts and creates
   issues, assets, and memories automatically — watch the "What HouseIQ updated"
   list populate.
3. **Upload a second document.** Choose *Repair invoice* and select
   `DOCS/SAMPLE HVAC REPAIR INVOICE.txt`. HouseIQ links this to what it already
   knows about the home's HVAC system.
4. **Ask HouseIQ a question.** Use the compact "Ask HouseIQ" shortcut under the home
   header (or scroll to "Tell HouseIQ what is happening") and ask something like:

   > What should I do before winter?

   HouseIQ answers using the home profile, the documents you just uploaded, and any
   open issues — and shows exactly what context it used to answer.
5. **Click an action chip** in the response (e.g. "Issue Created: ...") to jump
   straight to that record in the dashboard below.
6. **Keep the conversation going.** Ask a follow-up in the same session — HouseIQ
   keeps the full turn history on screen and remembers the last couple of turns of
   context.

## API testing

A ready-to-use Postman collection (with automatic Auth0 token handling) lives in
[`postman/`](postman/). See [`postman/README.md`](postman/README.md) for setup.
