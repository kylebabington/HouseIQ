# HouseIQ

**Your home's history, evidence, and next move.**

HouseIQ turns inspections, invoices, repairs, and conversations into an
evidence-backed memory of your home — then tells you what matters next and why.

HouseIQ doesn't just answer questions about homes. **It remembers your home.**
Every inspection, invoice, repair, and conversation makes that memory smarter —
and HouseIQ can show you exactly where it learned what it knows.

[Live Demo](#) · [Demo Video](#)

> Open **Explore demo home** on the landing page (no Auth0 required) to use the
> 1978 Indianapolis Ranch: ranked needs with inspection page citations, then a
> sample Ask answer with evidence.

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

Build the entire walkthrough around **one house**: the 1978 Indianapolis Ranch.
Sample files live in [`DOCS/`](DOCS/). Do not tour every tab.

### Scene 1 — HouseIQ knows almost nothing

When you buy a house, you're handed piles of paperwork. Five years later, nobody
remembers where anything is.

Create or seed the Ranch (signed-in: **Seed Indianapolis Ranch**), or open
**Explore demo home** for the public preview.

### Scene 2 — Upload the inspection

Upload [`DOCS/Fictitious_Home_Inspection_Report.pdf`](DOCS/Fictitious_Home_Inspection_Report.pdf)
as an *Inspection report*. HouseIQ reads it and shows **Proposed changes** —
for example service mast deterioration — with the evidence passage
(*Inspection · p.18*). Click **Accept**.

HouseIQ doesn't blindly trust its AI. It proposes what it learned, shows its
evidence, and the homeowner decides what becomes true.

### Scene 3 — Time passes

Six months later, the HVAC technician comes. Upload
[`DOCS/SAMPLE HVAC REPAIR INVOICE.txt`](DOCS/SAMPLE HVAC REPAIR INVOICE.txt)
as a *Repair invoice*.

HouseIQ recognizes that this isn't some unrelated furnace. It's information
about the furnace the house already knows about.

This is the important part: **HouseIQ isn't analyzing isolated documents. It's
building the memory of the house over time.**

### Scene 4 — Ask the killer question

Ask:

> What should I handle before winter?

HouseIQ uses location, climate, property profile, inspection findings, equipment,
maintenance history, and outstanding issues — then gives a ranked plan. Click the
evidence. Done.

### Scene 5 — End with the Passport

When you need someone else to work on the house, you don't have to explain five
years of history. Click **Generate Contractor Home Passport**. Show major systems,
current concerns, recent work, and evidence. Stop there.

## Architecture

- **Frontend** — React + Vite
- **Backend** — Express (Node.js)
- **Database** — CockroachDB (Postgres-compatible, with `pgvector`-style vector
  search for semantic memory retrieval)
- **Auth** — Auth0 (Authorization Code + PKCE on the frontend, JWT bearer
  validation on the backend)
- **AI** — OpenAI (chat completions with Structured Outputs for the agent,
  embeddings for memory search)
- **File storage** — Amazon S3 (private bucket for uploaded home documents)

## Running locally

```bash
git clone <this-repo-url>
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
| `OPENAI_API_KEY` | OpenAI API key used for chat completions and embeddings. |
| `OPENAI_CHAT_MODEL` | Chat model name, e.g. `gpt-4o-mini`. |
| `AWS_REGION` | AWS region for the S3 bucket, e.g. `us-east-2`. |
| `AWS_S3_BUCKET_NAME` | Private S3 bucket for uploaded home documents. |
| `AWS_ACCESS_KEY_ID` | Local-development-only AWS credential (use an IAM role in production). |
| `AWS_SECRET_ACCESS_KEY` | Local-development-only AWS credential (use an IAM role in production). |

#### `frontend/.env`

| Variable | Description |
|---|---|
| `VITE_AUTH0_DOMAIN` | Your Auth0 tenant domain. |
| `VITE_AUTH0_CLIENT_ID` | The Client ID of the Auth0 Single-Page Application. |
| `VITE_AUTH0_AUDIENCE` | Must exactly match `AUTH0_AUDIENCE` on the backend. |
| `VITE_API_URL` | Base URL of the backend API, e.g. `http://localhost:5000/api`. |

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

Public demo: `GET /api/demo/home`. Authenticated extras include
`GET /homes/:homeId/needs`, `GET /homes/:homeId/passport`,
`GET /homes/:homeId/agent-runs`, and `/homes/:homeId/members`.
