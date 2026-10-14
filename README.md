# NutriReg AI — Frontend

Regulatory compliance workspace for functional foods, nutraceuticals, and supplements.
The interface is a faithful implementation of the approved Stitch export: same design
tokens, typography, spacing, shell, and component language. The screens are wired to a
real backend over HTTP — there is no mock server, no fixture data, and no fabricated
regulatory output anywhere in this codebase.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 15.1.6, App Router, React 19 |
| Language | TypeScript 5.7 (strict) |
| Styling | Tailwind CSS 3.4 with the Stitch theme in `tailwind.config.ts` |
| Transport | `fetch` through a single client (`src/lib/api/client.ts`) |
| Design source | Stitch export, `~/Downloads/stitch_nutrireg_ai_platform` |

## Getting started

The frontend is only half the system: it renders whatever the NutriReg API returns.
Both processes must be running, in two terminals.

### One-time setup

```bash
# 1. PostgreSQL (18.x, Homebrew)
createdb nutrireg
psql -d nutrireg -f db/001_initial_schema.sql
psql -d nutrireg -f db/seed_reference_data.sql

# 2. Python backend
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt

# 3. Frontend
npm install
cp .env.example .env.local        # NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Load the statutory corpus

The API serves the FSSAI regulations that `backend/app/rag/pipeline.py` already
extracted. If the database was just created, load them:

```bash
cd backend
.venv/bin/python -m app.api.ingest_regulatory
```

Ingestion is idempotent — `regulatory_documents.content_hash` is the pipeline's own
SHA-256, so re-running after an unchanged extraction does nothing. Use `--force` to
re-ingest deliberately. Expect roughly 196 sources, 1,269 sections, and 4,245 chunks;
four identical-byte duplicate files are suppressed at ingest, which is why the count
is lower than the 4,443 the pipeline reports.

### Run

```bash
# Terminal 1 — API on :8000
cd backend
DEV_LOGIN_ENABLED=true .venv/bin/python -m uvicorn app.api.main:app --port 8000

# Terminal 2 — Next.js on :3000
npm run dev
```

Open <http://localhost:3000>. The API is healthy at <http://localhost:8000/health>.

`DEV_LOGIN_ENABLED=true` is required only because the app has no sign-in screen (see
[Authentication](#authentication)); the endpoint refuses to run without it.

### If a screen says "Backend unavailable"

Run the preflight check, which reports the actual cause instead of the UI's generic
message:

```bash
cd backend && .venv/bin/python -m app.api.doctor
```

It verifies the API is listening, that a real CORS preflight from your page's origin
succeeds, that the database has the corpus loaded, and that dev login is enabled.

The usual cause is a port collision. `npm run dev` **increments the port** when 3000 is
already taken, so the app ends up on 3001 while the API only allows 3000, and the
browser discards every response as a CORS failure — which the UI reports as
"Backend unavailable". A stale server from an earlier session is the usual reason a
port is still held.

To see what is holding the ports, and optionally free them:

```bash
./scripts/free-ports.sh          # report only
./scripts/free-ports.sh --kill   # stop NutriReg's own processes
```

Only processes matching NutriReg's commands are stopped; anything else on those ports
is reported and left alone.

Then start each server on an explicit port, so it can never drift:

```bash
# Terminal 1
cd backend
DEV_LOGIN_ENABLED=true .venv/bin/python -m uvicorn app.api.main:app --port 8000

# Terminal 2
npm run dev -- --port 3000
```

If you do end up on another port, tell the API to accept it:

```bash
CORS_ORIGINS="http://localhost:3000,http://localhost:3001" \
  .venv/bin/python -m uvicorn app.api.main:app --port 8000
```

The API prints its allowed origins on startup, so a mismatch is visible immediately
rather than only in the browser console.

### Getting a session

The app has no login page by design — it never fabricates a user. The API does expose
a local-only endpoint for development, so obtain a session once and reuse the cookie:

```bash
curl -s -X POST http://localhost:8000/api/v1/auth/dev-login \
  -H 'Content-Type: application/json' \
  -d '{"displayName":"Local User","email":"local@nutrireg.app",
       "organizationName":"NutriReg","role":"ADMIN"}' \
  -c /tmp/nutrireg_cookies.txt
```

`/tmp/nutrireg_cookies.txt` is a curl cookie jar, and a browser will not read it. To
use the session in Chrome, copy the token into the browser's cookie store for
`localhost` — DevTools → Application → Cookies → `http://localhost:8000` — setting
`nutrireg_session` with `HttpOnly` ticked. The token is the last field of the line
starting `#HttpOnly_localhost` in the jar.

Note the host must be `localhost`, not `127.0.0.1`: a cookie is host-scoped, and the
CORS allow-list only covers `localhost:3000` and `127.0.0.1:3000`.

If you skip this, the app renders its designed signed-out state on every screen. That
is correct behaviour, not a failure.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build (includes lint and type checks) |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint via `next lint` |
| `npm run typecheck` | `tsc --noEmit` |

> Do not run `npm run build` and `npm run dev` at the same time. Both write to
> `.next`, and the dev server's chunk manifest breaks until it is restarted.

### Tests

```bash
# Schema and view contract, 71 assertions, rolls back so it is safe on a live database
psql -d nutrireg -f db/contract_test.sql

# API request models pinned to the database's CHECK constraints
cd backend && .venv/bin/python -m pytest tests/test_contract.py -q
```

`tests/test_contract.py` reads the live `pg_constraint` definitions, so widening a
CHECK constraint without updating the matching `Literal` in the API fails the suite.

`NEXT_PUBLIC_API_URL` is the only required frontend variable. When it is unset, every
screen renders its designed "backend unavailable" or empty state rather than
substituting placeholder records. This is deliberate: an empty workspace is a real
state, a fake one is not.

## Routes

| Route | Purpose |
| --- | --- |
| `/dashboard` | Workspace summary, risk distribution, recent findings |
| `/products` | Formulations ledger and nine-stage workflow inspector |
| `/products/new` | Product creation (shares its form with the Products dialog) |
| `/products/[id]` | Product dossier, analysis run, and per-product workflow |
| `/ingredients` | Formulation register and compliance status |
| `/claims` | Claims matrix with evidence and substantiation status |
| `/documents` | Document vault with real multipart upload and processing state |
| `/readiness` | Regulatory readiness roll-up for a product |
| `/compliance` | Item-by-item compliance checklist, read-only |
| `/evidence` | Evidence excerpts attached to findings |
| `/reviews` | Human review queue with approve/reject/escalate decisions |
| `/sources` | Statutory source register from the backend index |
| `/reports` | Generated audit dossiers |
| `/settings` | Account, API connection, and browser-local preferences |

## Architecture

```
src/
  app/(workspace)/      routes; the (workspace) group supplies the shell
  components/
    shell/              AppShell, Sidebar, TopHeader
    ui/                 Button, Badge, Modal, Panel, EmptyState, ErrorState, …
    products/           ProductForm, ProductSelect, WorkflowStepper, NewProductModal
    documents/          UploadDocumentModal
    reviews/            ReviewDecisionPanel
  lib/
    api/                client.ts (transport), types.ts (models), service modules
    auth/session.tsx    auth-ready session provider
    hooks/useResource   async loading / success / empty / error state
    export.ts           CSV export of already-fetched records
    format.ts, presentation.ts, routes.ts
```

### Data layer rules

1. **One client.** Every request goes through `apiRequest` in `src/lib/api/client.ts`,
   which resolves `NEXT_PUBLIC_API_URL`, applies the JSON envelope, and converts
   failures into an `ApiError` with operator-facing copy. Uploads are the one
   exception: they use `uploadWithProgress` in the same file, because reporting
   real progress needs `XMLHttpRequest`. Both paths set credentials so the session
   cookie survives the cross-origin hop.
2. **Failures are values.** `ApiError` carries a `kind` (`not-configured`, `network`,
   `not-found`, `client`, `server`, `parse`, `aborted`). Screens render an
   `ErrorState`; they never invent fallback records.
3. **No regulatory logic in the client.** Risk levels, claim statuses, findings, and
   checklist outcomes are displayed exactly as the backend reports them. The frontend
   does not classify, score, or infer compliance.
4. **Empty is a real state.** `useResource` distinguishes `empty` from `success` so a
   backend with no records renders a designed empty state, not a zero-filled table.

### Uploads

`src/lib/api/products.ts` posts `multipart/form-data` to the document endpoint with
`XMLHttpRequest` so real progress is reported. Client-side validation in
`UploadDocumentModal` enforces the same contract as the API: PDF, DOCX, XLSX, PNG,
JPG/JPEG, up to 25 MB. Extraction and processing status is polled from the backend.

### Authentication

`SessionProvider` calls `/api/v1/auth/session`. If the backend exposes no session
endpoint, the app resolves to `anonymous` and the shell shows a signed-out state. No
demo user is fabricated, and review decisions are attributed by the API.

The session travels in an `HttpOnly`, `SameSite=Lax` cookie. Because the API and the
Next.js dev server are different origins, **both** request paths must opt into
credentials or the browser drops the cookie and every call returns 401:

- `apiRequest` sets `credentials: "include"`
- `uploadWithProgress` sets `xhr.withCredentials = true`

The cookie is not marked `Secure`, since local development is plain HTTP. That is the
one concession to local development and would need revisiting behind TLS.

## Accessibility and responsiveness

Skip link, labelled landmarks, keyboard-dismissable modal with focus management, visible
focus rings, `aria-current` navigation state, and `aria-busy`/`role="alert"` on async
regions. Layouts are verified at 1440px, 1280px, 768px, and 390px.

## Backend contract

Endpoints consumed by the frontend:

```
GET    /api/v1/dashboard/summary
GET    /api/v1/auth/session
POST   /api/v1/auth/logout
GET    /api/v1/products
POST   /api/v1/products
GET    /api/v1/products/{id}
PATCH  /api/v1/products/{id}
GET    /api/v1/products/{id}/ingredients
GET    /api/v1/products/{id}/claims
GET    /api/v1/products/{id}/documents
GET    /api/v1/products/{id}/findings
GET    /api/v1/products/{id}/compliance-items
GET    /api/v1/products/{id}/reports
POST   /api/v1/products/{id}/reports
POST   /api/v1/products/{id}/analysis
GET    /api/v1/products/{id}/analysis
GET    /api/v1/findings
GET    /api/v1/claims
GET    /api/v1/evidence
GET    /api/v1/reviews
POST   /api/v1/reviews/{id}/decision
GET    /api/v1/statutory-sources
GET    /api/v1/statutory-sources/{id}
GET    /api/v1/documents
POST   /api/v1/documents
DELETE /api/v1/documents/{id}
```

List endpoints may return either a bare array or `{ "items": [...] }`; the service layer
accepts both. Report `downloadUrl` values are rendered only when the backend reports
`READY`, and always open with `rel="noopener noreferrer"`.

## Database

PostgreSQL 18 schema in [`db/`](./db), designed from the contract in
[`details.md`](./details.md). Full rationale in
[`database-design.md`](./database-design.md).

```bash
psql -v ON_ERROR_STOP=1 -f db/001_initial_schema.sql   # 22 tables, 12 views, 104 indexes
psql -v ON_ERROR_STOP=1 -f db/seed_reference_data.sql # 9 workflow stages, no sample data
psql -v ON_ERROR_STOP=1 -v embedding_dim=768 -f db/002_add_embedding.sql  # needs pgvector
```

`002` is parameterised by embedding dimension and refuses to guess one — the
dimension depends on the embedding model, which has not been selected yet. The
default rule is that no dimension is committed until that choice is made.

| File | Purpose |
| --- | --- |
| `db/001_initial_schema.sql` | Tables, 127 constraints, indexes, triggers, views. Needs only stock PostgreSQL + `pgcrypto`. |
| `db/002_add_embedding.sql` | `pgvector` column and HNSW indexes, parameterised by dimension. |
| `db/seed_reference_data.sql` | The nine workflow stage definitions. Static reference data only — no users, products, or regulatory records. |
| `db/contract_test.sql` | 71 assertions that create throwaway data, prove the constraints fire, then roll back. |
| `db/validation_queries.sql` | 13 read-only diagnostics for a live environment. |

The schema stores no duplicated display data. `findingCount`, `riskHigh` /
`riskMedium` / `riskLow`, `evidenceCount`, `citationCount`, and a claim's
`targetMarket` are all derived through views, because a stored counter must be
updated in lockstep with every writer that changes the rows it summarises, and a
wrong risk count is a wrong compliance answer. `validation_queries.sql` fails if
any of 39 specific denormalised columns is ever added.

## Known constraints

These controls are present in the approved design but have no client-side endpoint in
the current API surface, so they render **disabled with an explanatory tooltip** rather
than pretending to work:

- **Preview** (document vault) — no document file endpoint is exposed.
- **Link Finding** (document vault) — no document-to-finding linking endpoint.
- **Manage Categories** (document vault) — `document_type` is an API-owned enum.
- **Add Ingredient** — ingredient creation is not exposed; ingredients arrive via
  document extraction.
- **Add Source** (statutory sources) — ingestion is performed by the backend index.

CSV exports, review filters, and the review decision actions are fully implemented
client-side over records the API has already returned.

Query parameters on `/readiness`, `/evidence`, `/sources`, and `/reviews` are sent by the
UI but not yet applied to the loaded data, and product analysis is fetched on load and on
manual refresh rather than polled. The database supports filtering and lookup for all of
these; the gap is in the client.
