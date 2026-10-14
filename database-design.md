# NutriReg AI — Database Design

Version 1.0 · PostgreSQL 18 · Schema source of truth: `db/001_initial_schema.sql`

This document specifies the PostgreSQL foundation for NutriReg AI. It is derived
from the **frontend contract** in [`details.md`](./details.md): every enum token,
field name and response shape below is one the frontend already consumes, and
nothing here requires a frontend change.

| Artifact | Purpose |
| --- | --- |
| `db/001_initial_schema.sql` | Tables, constraints, indexes, triggers, views. Requires only vanilla PostgreSQL + `pgcrypto`. |
| `db/002_add_embedding.sql` | `pgvector` column and HNSW indexes. Parameterized by embedding dimension. |
| `db/seed_reference_data.sql` | The nine workflow stage definitions. No user or regulatory data. |
| `db/contract_test.sql` | 71 assertions proving constraints fire. Creates data, then rolls back. |
| `db/validation_queries.sql` | 13 read-only diagnostics for a live environment. |

```bash
psql -v ON_ERROR_STOP=1 -f db/001_initial_schema.sql
psql -v ON_ERROR_STOP=1 -f db/seed_reference_data.sql
psql -v ON_ERROR_STOP=1 -v embedding_dim=768 -f db/002_add_embedding.sql   # once the model is chosen
```

Verified on PostgreSQL 18.6 with pgvector 0.8.6: **71/71 assertions pass, 0 failures,
22 tables, 12 views, 104 indexes**, reproduced from an empty schema.

---

## 1. Architecture & technology decisions

**One relational core, not a document store.** The domain is compliance
reporting: an audit dossier whose value depends on being able to prove *which
regulation, which version, which finding, which reviewer*. A document store
would make every one of those questions a join across collections. PostgreSQL
gives them as ordinary foreign keys with enforced referential integrity.

**Choice of each technology, and why:**

| Decision | Choice | Rationale |
| --- | --- | --- |
| Primary keys | `UUID` v4, `gen_random_uuid()` | Documents, findings and chunks are created by an ingestion pipeline, not only by humans. Sequential integers leak row volume and force clients to hold IDs before the row exists. `UUID` also makes it safe to insert from several workers at once. |
| Timestamps | `TIMESTAMPTZ` | Regulations are dated across jurisdictions. `TIMESTAMP WITHOUT TIME ZONE` silently drops the offset, and a compliance record with the wrong instant is worse than no record. Stored in UTC, rendered per `target_market`. |
| Semi-structured data | `JSONB` | Reserved for genuinely open-ended, filterable attributes: `regulatory_chunks.metadata` (authority, version, dates) and `audit_logs.old_values` / `new_values`. GIN-indexed where queried. Not used for columns the contract fixes, so no JSON key can drift from a typed column. |
| Full-text search | `tsvector` + GIN, in `001` | Exact regulation numbers ("Regulation 2.3") must be findable **without** the embedding model. Keyword retrieval is a first-class path, not a degraded one. |
| Semantic search | `pgvector` + HNSW, in `002` | Deferred to its own migration because the dimension depends on the model. Cosine distance matches the normalised embeddings every current sentence-transformer produces. |
| Enums | `CHECK (col IN (...))` on `text` | `CREATE TYPE ... AS ENUM` requires `ALTER TYPE` to add a token and cannot be reordered or removed easily. `CHECK` on `text` is a one-line migration, and it lets the contract's tokens live in the schema visibly. See the caveat in §4. |
| Derived data | Views, never stored columns | See §1.1. |
| Migrations | Plain idempotent SQL, not Alembic | The backend is not written yet, so there is no ORM whose version stamp would drift from the schema. Files are numbered, runnable against an empty database, and re-runnable. |
| Identity | `pgcrypto` only | Used for `gen_random_uuid`; the schema stays installable on any stock PostgreSQL. |

### 1.1 The single hard rule: nothing displayable is stored twice

The frontend renders `findingCount`, `riskHigh`/`riskMedium`/`riskLow`,
`evidenceCount`, `citationCount`, `targetMarket` on a claim, and the product
name on every finding and review task. Each of these is **derived**:

- `riskHigh` = count of current-analysis findings where `severity = 'HIGH'`
  and `status <> 'RESOLVED'`.
- `evidenceCount` on a claim = `count(findings → evidence)` via `findings.claim_id`.
- `citationCount` on a source = `count(evidence)`.
- `targetMarket` on a claim = its parent `products.target_market`.

A stored counter is a value that must be updated inside the same transaction as
the row it summarises, forever, by every writer. Every one of those is a bug
waiting to happen, and a wrong `riskHigh` is a wrong compliance number — the
thing the product exists to get right.

`db/validation_queries.sql` **V6** enforces this: it fails if any of 39 specific
`(table, column)` denormalisations ever appears.

### 1.2 History versus current state

`analyses` is append-oriented: a re-run inserts a new row and flips
`is_current`. The previous run and its findings are retained, so
`GET /api/v1/products/{id}/analysis` (which has no history endpoint) always
resolves to one unambiguous current row while audit remains possible.

Every count in the application filters on `a.is_current`. This is what makes
re-running an analysis **not** inflate `findingCount` — asserted in
`contract_test.sql` as *"re-analysis does NOT inflate findingCount (1 -> 1)"*.

`analyses_one_current_per_product` is a partial unique index on
`(product_id) WHERE is_current`, so the invariant is enforced by the database
rather than by application discipline.

### 1.3 What is deliberately absent

- **No `product_versions` table.** The contract has no version endpoint. Re-analysis
  history lives in `analyses`, which is what the analysis endpoint exposes.
- **No `risks` table and no risk counter columns.** `riskHigh`/`riskMedium`/
  `riskLow` are computed from current findings.
- **No `created_by` on `products`.** The contract's `Product` model has no such
  field, so storing it would create data the API can never return.

---

## 2. Entity–relationship diagram

Legend: `1—<` one-to-many · `>—<` many-to-many (via junction) · `||—o|` one-to-zero-or-one ·
**bold FK** cascade delete · ~~strikethrough FK~~ set null on delete · `(I)` internal table.

```
                                   ┌──────────────┐
                                   │   (I)        │
                                   │ workflow_    │  stage_key PK
                                   │ stage_       │  position UQ
                                   │ definitions  │  label
                                   └──────┬───────┘
                                          │ 1 : 9  (exactly nine, always)
                                          ▼
┌──────────┐         ┌───────────────────────────────┐
│  users   │1      n│ product_workflow_stages      │   product_id → products CASCADE
│──────────│────────►│  (product_id, stage_key) UQ  │   stage_key  → (I) definitions
│ email UQ │         │  state  PENDING/ACTIVE/...   │
│ role     │         │  completed_at                │
│ pwd_hash │         └───────────────────────────────┘
└────┬─────┘
     │ 1
     │        ┌──────────────┐
     │      n │  sessions    │  token_hash UQ (never the raw token)
     └───────►│ expires_at   │  revoked_at
              └──────────────┘
              ┌──────────────┐
              │  audit_logs  │  append-only, survives every cascade
              └──────────────┘

┌═══════════════���════════════════════════════════════════════════════════════════┐
║ products  (root aggregate)                                                  ║
║  name · category · target_market · status · sku · description               ║
║  last_analysis_at                                                          ║
╚═══╤════════╤════════╤═════════╤═════════════╤════════════╤═══════════╤══════╝
    │ 1     │ 1        │ 1         │ 1           │ 1          │ 1         │ 1
    │      │          │           │             │            │           │
    │  n   │  n       │  n        n│  n          n│  n        n│  n       n│
    ▼      ▼          ▼            ▼             ▼            ▼           ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐
│claims  │ │ docum- │ │analyses│ │ findings │ │ review_  │ │reports │ │compliance│
│────────│ │ ents   │ │────────│ │──────────│ │ tasks    │ │────────│ │ _items   │
│ status │ │status  │ │status  │ │severity  │ │──────────│ │status  │ │──────────│
│ claim_ │ │ docum- │ │progress│ │ status   │ │finding_id│ │storage_ │ │ label    │
│ type   │ │ ent_   │ │is_     │ │ claim_id │ │  UQ      │ │ key     │ │ note     │
│ risk_  │ │ extract│ │ current│ │────┐     │ │assignee_ │ └──────────┘ │ passed   │
│ level  │ │ ions   │ └────────┘ └────┼─────┘ │  id     │              │ (3-state)│
│status_ │ │────────│                   │     └────┬────┘              └──────────┘
│ note   │ │product │                           │ 1
│  ⚠ no  │ │  id    │                           │ n
│ target │ │(null=  │                     ┌─────▼──────────┐
│ market │ │unfiled)│                     │  evidence      │  finding_id  → findings SET NULL
│  (⚠    │ └────────┘                     │────────────────│  source_id   → reg_sources RESTRICT
│ derived│   │  1                         │ status         │  reg_chunk_id→ reg_chunks SET NULL
│ )      │   │  n                         │ excerpt (snap) │  UQ(finding_id, reg_chunk_id)
└────────┘   ▼                            └────┬───────────┘
        ┌──────────────┐                        │ n
        │document_     │                        │
        │extractions   │◄─── SET NULL on        ▼
        └──────────────┘    document delete  ┌────────────────────┐
                                              │ regulatory_sources │
                                              │  authority · title │
                                              │  source_type       │
                                              │  jurisdiction      │
                                              │  version · url     │
                                              └─────────┬──────────┘
                                                        │ 1
                                                        │ n
                                              ┌─────────▼──────────┐
                                              │regulatory_documents│
                                              │ content_hash UQ    │
                                              └─────────┬──────────┘
                                                        │ 1
                                                        │ n
                                              ┌─────────▼──────────┐
                                              │ regulatory_sections│
                                              │ section_number     │
                                              └─────────┬──────────┘
                                                        │ 1
                                                        │ n
                                              ┌─────────▼──────────┐
                                              │ regulatory_chunks  │
                                              │ chunk_index        │
                                              │ search_vector ─┐   │
                                              │ metadata (JSONB) │   │
                                              │ embedding 002 ───┴──►│
                                              └────────────────────┘

┌────────────┐        ┌──────────────────────┐
│ ingredients │>──────<│ product_ingredients  │   UQ(product_id, ingredient_id)
│────────────│        │  amount_per_serving  │   is_active · status · risk_level
│ name       │        │  amount_unit         │   evaluated_at
│ cas_number │        └──────────────────────┘
│  (UQ, opt) │
└────────────┘
```

**Read this diagram for two load-bearing facts.** First, `products` is the only
aggregate root; deleting a product cascades to its claims, documents, analyses,
findings, workflow stages, review tasks and reports, and transitively to
review decisions — but **not** to `audit_logs`, which is deliberately
append-only. Second, `evidence` is the only bridge from a finding to the
regulation that justifies it, and it is a bridge, not a copy: it stores a
quoted `excerpt` and nothing else about the source.

---

## 3. Table specifications

21 required domain tables plus one internal reference table. `UUID` PK named
`id` on every table; `created_at` / `updated_at` on every mutable table.
"Derived" marks a value the API returns that is **not** stored here.

### 3.1 `products` — the aggregate root

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `name` | `text` | `NOT NULL` |
| `sku` | `text` | Optional dossier reference |
| `category` | `text` | `ProductCategory` enum, nullable (contract allows null) |
| `target_market` | `text` | `TargetMarket` enum, nullable |
| `description` | `text` | Free text |
| `status` | `text` | `ProductStatus`, default `DRAFT` |
| `last_analysis_at` | `timestamptz` | Most recent completed run, for dashboard ordering |

Derived: `findingCount`, `riskHigh/Medium/Low`, `ingredientCount`, `claimCount`,
`documentCount`, readiness, analysis status. See `v_product_stats`, §7.

### 3.2 `ingredients` and `product_ingredients`

`ingredients` is a global catalogue: `name` `NOT NULL` and `cas_number` optional
with a **partial unique index** (`WHERE cas_number IS NOT NULL`), so the same
substance cannot be registered twice under a CAS number while unnamed entries do
not collide. `cas_number` is CHECKed against `^[0-9]{2,7}-[0-9]{2}-[0-9]$`.

**The catalogue is deliberately just these two columns.** The contract has no
`POST /ingredients` endpoint and no ingredient-creation UI — ingredients arrive
from document extraction — and `ProductIngredient` returns only
`id, productId, productName, name, casNumber, amountPerServing, amountUnit,
isActive, status, riskLevel, statusNote, evaluatedAt`. Columns such as
`category`, `safety_profile` or `region_restrictions` would be speculative: no
endpoint could return them, and they would be dead weight on the highest-volume
write path in the ingestion pipeline. They belong in a later migration if and
when the contract grows a field for them.

`product_ingredients` is the junction and carries the entire per-product
assessment: `amount_per_serving numeric(12,4)`, `amount_unit`, `is_active`
(drives `ingredientCount`), `status` (`IngredientComplianceStatus`),
`risk_level` (`NONE|LOW|MEDIUM|HIGH`, nullable — unevaluated is distinct from
`NONE`), `status_note`, `evaluated_at`. `UNIQUE (product_id, ingredient_id)`.

### 3.3 `claims`

`text` `NOT NULL` (the statement), `claim_type`, `status` (`ClaimStatus`),
`risk_level` (nullable — an unanalysed claim has no risk, distinct from `NONE`),
`disclaimer`, `status_note`, `last_reviewed_at`.

**`target_market` is absent by design** and resolved through `v_claim_list`.
`findings.claim_id` supplies `evidenceCount`.

### 3.4 `documents` and `document_extractions`

`documents`: `product_id` **nullable** — a file can be uploaded to the library
before it is attached to a dossier, which the contract's `GET /api/v1/documents`
(global list) implies. `file_name`, `storage_key` (unique object key),
`size_bytes` CHECKed `> 0 AND <= 26214400` (25 MB), `document_type`,
`status`, `extraction_status` (a **separate axis** from `status`),
`notes`, `failure_reason`, `uploaded_at`.

`UPLOADING` is not a member of the CHECK: the multipart POST returns `201` with a
persisted record already in a settled state, so the client never observes it.

`document_extractions` is a **child table with its own lifecycle**, so text
extraction and PDF processing progress independently of document status.
`extraction_status` ∈ `PENDING|RUNNING|COMPLETE|FAILED`; `extracted_text`,
`error_message`, `started_at`, `completed_at`. Retries accumulate as history;
`document_extractions_one_inflight_idx` (partial unique on `document_id WHERE
extraction_status IN ('PENDING','RUNNING')`) prevents a double-queued retry
while permitting unlimited completed attempts.

### 3.5 `analyses`

`product_id`, `status` (`AnalysisStatus`), `progress smallint` CHECKed
`0..100`, `is_current`, `started_at`, `completed_at`, `failure_reason`.

`analyses_one_current_per_product` is a partial unique index
(`product_id WHERE is_current`). Every product is seeded with one
`NOT_STARTED`, `progress 0`, `is_current TRUE` row by the bootstrap trigger, so
`GET /api/v1/products/{id}/analysis` can always answer `200` and never `404`.

### 3.6 `findings`

`analysis_id` (→ `analyses`, CASCADE), `product_id` (→ `products`, CASCADE —
denormalised for fast product-scoped queries and guaranteed consistent by the
application writing both in one transaction), `claim_id` (nullable, supplies
`Claim.evidenceCount`), `title`, `summary` (both non-blank), `severity`
(`HIGH|MEDIUM|LOW` — **`CRITICAL` is refused**), `status` (`FindingStatus`),
`category`, `statutory_reference`, `corrective_action`, `detected_at`.

### 3.7 `evidence`

`finding_id` (→ `findings`, **SET NULL** — evidence outlives a re-analysis),
`source_id` (→ `regulatory_sources`, **RESTRICT** — a cited source is never
deleted out from under a finding), `regulatory_chunk_id` (→ `regulatory_chunks`,
**SET NULL** — a chunk may be re-chunked), `status` (`EvidenceStatus`),
`excerpt`.

`excerpt` is the only source data held here: an immutable snapshot of the quoted
text, so a historical finding still reads correctly after the underlying
regulation is re-ingested. Authority, title, URL, jurisdiction and version are
always joined, never copied. `UNIQUE (finding_id, regulatory_chunk_id)`
prevents the same citation being attached twice.

### 3.8 `product_workflow_stages`

`product_id`, `stage_key` (FK → internal definitions), `label` (denormalised so a
dossier preserves the wording it was created with), `state`
(`StageState`), `completed_at`. `UNIQUE (product_id, stage_key)`. No
`position` column — ordering comes from the reference table (§1.3).

### 3.9 `review_tasks` and `review_decisions`

`review_tasks`: `finding_id` **UNIQUE** (one task per finding), `product_id`,
`assignee_id` (→ `users`, SET NULL), `status`, `requested_at`, `decided_at`,
`decision_note`.

`review_decisions`: the immutable decision ledger — `review_task_id` (CASCADE),
`reviewer_id` (→ `users`, RESTRICT), `decision` (`ReviewDecision`), `note`,
`created_at`. An `UPDATE` trigger rejects mutation. `DELETE` is deliberately
**permitted** so the CASCADE from `review_tasks` works; `audit_logs`, which has
no inbound FK, is fully append-only for `UPDATE` *and* `DELETE`.

### 3.10 `compliance_items`

`product_id`, `analysis_id` (nullable — the checklist can predate a run),
`label`, `note`, `category`, and the tri-state `passed boolean`:

- `TRUE` — satisfied
- `FALSE` — not satisfied; `note` becomes mandatory
- `NULL` — not yet determined

`NULL` is meaningfully distinct from `FALSE` and is never coerced: the dashboard
readiness buckets depend on it. `category` is CHECKed to the contract's five
values.

### 3.11 `reports`

`product_id`, `title`, `status` (`ReportStatus`), `storage_key` (artefact),
`generated_at`, `failure_reason`. `READY` requires both an artefact and a
timestamp; `FAILED` requires a reason.

### 3.12 `users` and `sessions`

`users`: `display_name`, `email` (unique, case-normalised), `organization_name`,
`role`, `password_hash`, `is_active`.

`sessions`: `user_id`, **`token_hash`** (unique) — the raw cookie value is never
stored, so a database disclosure cannot be replayed as a session — `expires_at`,
`last_used_at`, `revoked_at`. Partial index on `user_id WHERE revoked_at IS NULL`.

### 3.13 `regulatory_sources` → `regulatory_documents` → `regulatory_sections` → `regulatory_chunks`

Append-only ingestion chain, four levels, because the contract cites a chunk with
its section number, document title, authority, jurisdiction and version, and all
five must be resolvable.

- `regulatory_sources`: `authority`, `title`, `document_title`, `source_type`,
  `jurisdiction`, `version`, `effective_date`, `last_indexed_at`, `source_url`
  (CHECKed HTTPS — regulatory citations must not be plaintext fetchable).
- `regulatory_documents`: `source_id`, `title`, `document_version`,
  `publication_date`, `effective_date`, `file_storage_key`, `content_hash`
  (**unique** — re-ingesting unchanged text is a no-op).
- `regulatory_sections`: `regulatory_document_id`, `section_number`, `title`,
  `page_start`, `page_end`, `content`. `UNIQUE (regulatory_document_id, section_number)`.
- `regulatory_chunks`: `section_id`, `chunk_index`, `content`, `page_number`,
  `metadata JSONB NOT NULL` (default `{}`, CHECKed to be a JSON object),
  `search_vector tsvector` GENERATED, `embedding vector(<dim>)` from `002`.
  `UNIQUE (section_id, chunk_index)`.

### 3.14 `(I) workflow_stage_definitions` — internal

`stage_key` PK, `position` (unique), `label`, `activated_when`. Exists so the
stage list has exactly one definition: the bootstrap trigger materialises the
nine rows per product, and a deferred constraint trigger asserts the count is
exactly nine. Adding a tenth definition without creating a tenth row per product
becomes impossible. Not exposed by any endpoint — the contract's stage list is
unchanged.

---

## 4. Constraints

127 table constraints: 22 primary keys, 12 unique, 27 foreign keys and 66
checks, plus 129 `NOT NULL` column constraints and one deferred constraint
trigger. The full inventory is in `db/001_initial_schema.sql`; the design rules:

**Enums as CHECK constraints.** Every enum from `details.md` §2 is a `CHECK (col
IN (...))`, with the exact contract tokens. The value must be one the frontend
can render, and a check makes that a database guarantee rather than a validation
convention. `CRITICAL` is absent from every severity/risk CHECK; a stray
`CRITICAL` from an LLM extraction step is rejected at the boundary.

**Conditional requirements follow the state machine**, not a flat NOT NULL:

| Rule | Reason |
| --- | --- |
| `documents`: `status = 'FAILED'` ⇒ `failure_reason` non-blank | A failure with no reason is unactionable. |
| `analyses`: `status = 'COMPLETED'` ⇒ `completed_at` set | A completed run has an end. |
| `analyses`: `status = 'FAILED'` ⇒ `failure_reason` non-blank | Same. |
| `analyses`: `0 <= progress <= 100` | The progress bar trusts this. |
| `review_tasks`: `status IN (APPROVED, REJECTED)` ⇒ `decided_at` set | A decision without a timestamp cannot be audited. |
| `compliance_items`: `passed IS FALSE` ⇒ `note` non-blank | A failed check needs a reason, per the contract. |
| `reports`: `status = 'READY'` ⇒ `storage_key` + `generated_at` | A "ready" report with no artefact is a broken download. |
| `product_workflow_stages`: `state = 'COMPLETED'` ⇒ `completed_at` set | Progress display requires it. |
| `document_extractions`: terminal status ⇒ `completed_at` set | Same. |
| `findings`: `summary` non-blank | An empty summary is not a finding. |

**Cross-row invariants** cannot be expressed as CHECK, so they are triggers or
partial unique indexes:

| Invariant | Mechanism |
| --- | --- |
| Every product has exactly 9 workflow stages | `AFTER INSERT ... DEFERRABLE INITIALLY DEFERRED` constraint trigger |
| At most one current analysis per product | Partial unique index |
| One review task per finding | `UNIQUE (finding_id)` |
| At most one in-flight extraction per document | Partial unique index |
| CAS numbers unique when present | Partial unique index |
| Stage ordering is canonical | No stored ordinal; FK to the reference table |

**Delete policy** — chosen so a cascade can never destroy evidence:

| Relationship | Action | Reason |
| --- | --- | --- |
| `products` → claims, documents, analyses, findings, workflow stages, review tasks, reports, compliance items | `CASCADE` | The aggregate dies with its root. |
| `analyses` → findings | `CASCADE` | Findings have no meaning without their run. |
| `review_tasks` → review decisions | `CASCADE` | A decision without its task is meaningless. |
| `findings` → evidence | `SET NULL` | Evidence outlives a re-analysis. |
| `regulatory_documents` → sections → chunks | `CASCADE` | Re-chunking replaces the whole subtree. |
| `evidence` → `regulatory_chunks` | `SET NULL` | Chunking may change; the citation survives. |
| `evidence` → `regulatory_sources` | `RESTRICT` | **A cited regulation cannot be deleted.** |
| `users` → review decisions | `RESTRICT` | A decision must keep its author. |
| `users` → review tasks | `SET NULL` | An unassigned task is valid. |
| `audit_logs` | no FK; `user_id` SET NULL | History survives everything. |

---

## 5. Indexes

104 indexes. Written for the queries the contract actually issues, and verified
by `EXPLAIN` against seeded data.

**Every foreign key is indexed.** PostgreSQL does not create these
automatically, and an unindexed FK turns every parent delete into a sequential
scan of the child — the classic cause of an "innocuous" `DELETE` locking an
application for minutes.

**Partial indexes for the hot, selective queries:**

| Index | Query it serves |
| --- | --- |
| `documents_active_poll_idx` `(uploaded_at DESC) WHERE status IN ('UPLOADED','PROCESSING')` | The 4-second document polling loop — touches only in-flight rows. |
| `analyses_active_idx` `WHERE status IN ('QUEUED','PROCESSING')` | Worker queue pickup. |
| `analyses_one_current_per_product` `(product_id) WHERE is_current` | Invariant + the current-analysis lookup. |
| `review_tasks_open_idx` `(requested_at DESC) WHERE status IN ('PENDING','IN_REVIEW')` | The review queue, oldest first. |
| `compliance_items_failed_idx` `(product_id) WHERE passed IS FALSE` | Readiness: only failed items matter. |
| `findings_open_high_idx` `(product_id, analysis_id) WHERE severity='HIGH' AND status <> 'RESOLVED'` | `riskHigh` and the dashboard risk badge. |
| `reports_in_flight_idx` `WHERE status IN ('PENDING','GENERATING')` | In-flight report guard. |
| `sessions_active_idx` `(user_id) WHERE revoked_at IS NULL` | Session validation without scanning dead sessions. |
| `regulatory_chunks_embedding_embedded_idx` `WHERE embedding IS NOT NULL` | Keeps the HNSW index small while the backfill backlog exists. |

**Filter indexes on the list endpoints:** `products (target_market, status)`,
`claims (product_id, status, claim_type, risk_level)`,
`documents (product_id, status, extraction_status)`,
`regulatory_sources (authority, jurisdiction, source_type)`,
`ingredients (lower(name))` for case-insensitive search,
`users (lower(email))`.

**Composite ordering for list endpoints:** list routes order by `created_at DESC`
with filters, so leading-column-plus-sort indexes are used rather than a bare
column index the planner cannot combine.

**`regulatory_chunks`:** GIN on `search_vector`; GIN `jsonb_path_ops` plus
expression indexes on `metadata->>'jurisdiction'` and `metadata->>'authority'`
for metadata-filtered retrieval; HNSW on `embedding` (§9).

**Deliberately not indexed:** low-cardinality columns on small tables
(`products.status`), and any column only used inside an aggregate — an index on a
column used solely by `count()` in a view is pure write amplification.

---

## 6. Triggers and stored logic

Three functions. The schema stays computable without an application server, and
every invariant is testable with plain SQL.

### 6.1 `initialise_new_product()` — `AFTER INSERT ON products`

Materialises the child rows the contract assumes exist:

1. Refuses the insert unless `workflow_stage_definitions` holds exactly 9 rows,
   with a message naming the seed file — a missing seed otherwise surfaces as an
   opaque foreign-key violation.
2. Inserts the 9 `product_workflow_stages` from the reference table, ordered by
   `position`, with `product_setup` = `COMPLETED` (and `completed_at = now()`) and
   the other 8 = `PENDING`.
3. Inserts the `NOT_STARTED`, `progress 0`, `is_current TRUE` analysis.

### 6.2 `assert_nine_workflow_stages()` — deferred constraint trigger

`AFTER INSERT ON products ... DEFERRABLE INITIALLY DEFERRED`. Checks at
`COMMIT` that the product has all nine stage keys, so a product can never be
persisted with a partial workflow — and the check runs once per transaction
rather than nine times per row.

### 6.3 `set_updated_at()` — 16 `BEFORE UPDATE` triggers

Maintains `updated_at` so a client can show "edited 3 minutes ago" without an
`audit_logs` read. Applied to all 16 mutable tables. Excluded:
`review_decisions` and `audit_logs` (immutable, so their timestamps never
change), `regulatory_sections` (ingest-only) and `workflow_stage_definitions`
(static reference data).

### 6.4 `forbid_mutation()` — append-only enforcement

- `audit_logs`: `BEFORE UPDATE OR DELETE` → always raises. Nothing cascades into
  it, so it can be fully immutable.
- `review_decisions`: `BEFORE UPDATE` only. `DELETE` must stay legal because
  `review_tasks → review_decisions ON DELETE CASCADE` depends on it. Blocking
  both operations would have made product deletion impossible — caught by
  `contract_test.sql`, which asserts both *"review_decisions is immutable"* and
  *"review_decisions cascaded via review_tasks"*.

The exception uses `SQLSTATE 2F004` (invalid authorization) rather than a
generic error, so a rejected mutation is distinguishable in application logs.

---

## 7. Views — the API read models

12 views. These are the shapes the contract returns, so the FastAPI layer becomes
`SELECT * FROM v_x WHERE …` plus a `LIMIT`/`OFFSET` rather than a hand-written
join per endpoint. Each resolves display data by join instead of storing it
(§1.1).

| View | Serves |
| --- | --- |
| `v_product_stats` | Product list/detail: `findingCount`, `riskHigh/Medium/Low`, `ingredientCount`, `claimCount`, `documentCount`, all scoped to `is_current`. |
| `v_product_workflow` | The 9 stages in canonical `position` order, resolved through the reference table. |
| `v_product_ingredient_list` | Ingredients with name and compliance status joined. |
| `v_claim_list` | Claims with `target_market` **derived** from the parent product and `evidence_count` via `findings.claim_id`. |
| `v_document_list` | Documents with `extraction_status` and `extraction` state flattened. |
| `v_finding_list` | Findings with severity, status and product context. |
| `v_evidence_citation` | Evidence with the full citation chain resolved: authority, title, version, jurisdiction, source URL, section number, page. |
| `v_review_task_list` | Review tasks with `title`, `severity`, `assigneeName`, `productName` joined — none stored on the task. |
| `v_compliance_item_list` | Checklist items with the tri-state `passed`. |
| `v_report_list` | Reports with artefact metadata. |
| `v_regulatory_source_list` | Sources with `citationCount` computed from `evidence`. |
| `v_dashboard_summary` | Always exactly one row. |

`v_dashboard_summary` deserves a note. The contract's readiness summary is
simultaneously three flat integers *and* a nested `readiness` object, which
invites divergence. The view computes each bucket once and then derives the JSONB
from those same aliases, so the two representations cannot disagree —
`contract_test.sql` asserts both *"readiness buckets sum to productCount"* and
*"readiness jsonb matches the flat columns"*.

`active_analysis_count` counts `QUEUED` + `PROCESSING`; `pending_review_count`
counts `PENDING` + `IN_REVIEW`; `high_risk_count` counts open HIGH findings in
current analyses only.

---

## 8. Seed and reference data

`db/seed_reference_data.sql` contains **only** the nine workflow stage
definitions, and is idempotent.

It creates no users, products, ingredients, claims, documents, findings,
analyses, evidence, reviews or reports. A seeded dossier would be
indistinguishable from real regulatory data — the most dangerous possible state
for a compliance product, and one that would make the UI look functional before a
single real analysis had run. Reference data is a fixed vocabulary; everything
else is produced by the application.

| `position` | `stage_key` | `label` |
| --- | --- | --- |
| 1 | `product_setup` | Product Setup |
| 2 | `ingredients` | Ingredients |
| 3 | `claims` | Claims |
| 4 | `documents` | Documents |
| 5 | `regulatory_analysis` | Regulatory Analysis |
| 6 | `risk_review` | Risk Review |
| 7 | `compliance_checklist` | Compliance Checklist |
| 8 | `human_review` | Human Review |
| 9 | `report` | Report |

The order is the contract's `WorkflowStageKey` sequence and is asserted in
`contract_test.sql` as an exact string match.

---

## 9. Vector and retrieval strategy

### 9.1 Why the dimension is not committed

`002_add_embedding.sql` is parameterised and **refuses to guess**:

```bash
psql -v embedding_dim=768 -f db/002_add_embedding.sql     # 384|512|768|1024|1536|3072
```

Without the variable, or with an unsupported value, it exits with a clear message
and writes nothing — verified. Committing a dimension in `001` would hard-code a
product decision into the schema and make `pg_dump`/`pg_restore` fail in any
environment using a different model. A dimension can be *added* later; changing
one requires re-embedding the entire corpus, so the choice belongs to whoever
picks the model.

### 9.2 Why HNSW and not IVFFlat

IVFFlat needs a representative training pass before it is useful, which stalls a
fresh deployment and degrades badly while the corpus is small. HNSW is usable
immediately, gives better recall at equal memory, and at pgvector 0.8.6 supports
incremental inserts. `m = 16, ef_construction = 64` are the documented
defaults; `vector_cosine_ops` matches the cosine distance the retriever uses.

Two indexes exist deliberately: a full HNSW index and a partial one on
`WHERE embedding IS NOT NULL`. During the initial backfill most rows are NULL, and
a NULL-heavy index wastes pages and dilutes recall; the partial index stays
dense. The full index remains the safety net once the backfill completes.

### 9.3 Hybrid retrieval

Two paths, fused with Reciprocal Rank Fusion
(`score = Σ 1/(60 + rank)`):

| Path | Index | Finds |
| --- | --- | --- |
| Vector | HNSW on `embedding` | Paraphrases: "kava-like substance" → a Kava prohibition. |
| Keyword | GIN on `search_vector` | Exact references: "Regulation 2.3", "FSSAI". |

Neither alone is adequate. Vector search misses a query that quotes a section
number; keyword search misses a paraphrase. RRF needs no score calibration
between the two, which matters because a cosine distance and a `ts_rank` are not
comparable quantities.

`search_vector` is a **GENERATED** column (`to_tsvector('english', content)`),
so it cannot drift from `content`. The `002` migration adds no keyword index —
`001` already provides it — precisely so retrieval degrades gracefully when
pgvector is absent.

`metadata JSONB` carries `authority`, `jurisdiction`, `version` and dates so a
retrieval can be scoped to the applicable market and version before ranking.
`evidence.excerpt` preserves the quoted wording, so a finding stays readable
after the regulation is re-ingested at a newer version.

**Verified end-to-end:** cosine search ranks the semantically matching chunk
first (distance 0.42 vs 1.00 for non-matching chunks), RRF fusion combines both
lists, and a wrong-dimension vector is rejected with *"expected 768 dimensions,
not 2"*.

### 9.4 Backfill

```sql
UPDATE regulatory_chunks SET embedding = <model call>
 WHERE embedding IS NULL AND section_id = <batch>;
```

Batched, because a single-statement update over a large corpus holds one
transaction and defeats the partial index. `NULL` means "not yet embedded" and
the retriever filters on it.

---

## 10. Performance and growth

**Read paths are indexed for the contract's own filters** (§5) — the partial
indexes for polling, worker pickup, the review queue and readiness are the four
places a dashboard would otherwise degrade into sequential scans.

**`regulatory_chunks` is the only table that will grow without bound.** The
ingestion chain is append-only, so `scaling` is a matter of moving the leaf
chunk/section/document tables out of the hot set. `documents` and
`document_extractions` are the second candidates: `audit_logs` is third.

**When partitioning becomes necessary.** `audit_logs` is the first candidate and
is the easiest to reason about, because it is append-only, queried by
`created_at`, and referenced by nothing:

```sql
ALTER TABLE audit_logs PARTITION BY RANGE (created_at);
-- monthly partitions; the append-only trigger is already correct on the parent
```

Do not partition earlier. Partitioning adds planning overhead, complicates
uniqueness, and breaks nothing here below roughly 10–50 M rows per table. The
prerequisite — an immutable, time-ordered, append-only table — is already
satisfied, so the migration later is additive.

`analyses` and `findings` should **not** be partitioned: re-analysis appends rows
and queries almost always filter by `product_id` or the current `analysis_id`,
not by time.

**Connection pooling.** The application talks to PostgreSQL through PgBouncer in
transaction mode. Session-level state must therefore be avoided — no
`SET` without `SET LOCAL`, no advisory locks held across a transaction boundary,
and `LISTEN`/`NOTIFY` replaced by a 1–2 s polling loop (which the frontend's
document polling already models). Every function here is `plpgsql` and
transaction-scoped, so it is pooling-safe.

**Write amplification** is the reason the sparse column count is deliberate.
104 indexes on 22 tables is a lot of index maintenance per write; each one is
justified by a specific query, and no index exists purely "in case".

---

## 11. Security

**No credential material in the schema.** `users.password_hash` holds a hash;
`sessions.token_hash` holds a hash. The raw session cookie is never persisted, so
a database disclosure cannot be replayed as a live session. Store tokens as
`digest()` output with a server-side pepper rather than a bare hash, so a leaked
dump cannot be attacked offline.

**Row-level security is available but not enabled by default.** RLS on
`products`, `documents`, `review_tasks` and `sessions`, keyed to a
`SET LOCAL app.current_user_id` set per transaction, is the right way to enforce
reviewer scoping when the organisation model requires it. It is left off because
the contract's `SessionUser` has no organisation claim yet, and enabling RLS
without that claim would either deny everything or silently do nothing. Enabling
it later is a one-line `ALTER TABLE … ENABLE ROW LEVEL SECURITY` plus policies —
no data migration.

**Least privilege at the database level.** The application role needs
`SELECT/INSERT/UPDATE` on the domain tables, `INSERT`-only on `review_decisions`
and `audit_logs` (enforced again by trigger), no `DELETE` on the append-only
ledgers, and no DDL. `gen_random_uuid()` needs no superuser, so `pgcrypto` does
not force a privileged role.

**Encrypted-at-rest columns** (`evidence.excerpt`, `regulatory_chunks.content`)
are the one place `pgcrypto` is worth using: `pgp_sym_encrypt` with a key held
outside the database. Not applied by default because it makes the corpus
unsearchable without a decryption pass in the retriever, and the regulatory text
itself is public — the sensitivity is in the *analysis*, which lives in
`findings` and is not encrypted.

**Input validation.** File size is bounded at the column (`<= 25 MB`), `cas_number`
and `source_url` are CHECKed, and `source_url` must be HTTPS. Document content
itself is not validated at the column level; file-type verification, antivirus
scanning and path-traversal rejection belong in the upload handler, which is the
only component that can act on a stream before it reaches the database.

**No secrets in migrations.** `002` and the seed contain no keys, URLs requiring
credentials, or environment-specific paths.

---

## 12. Migrations, backup and restore

**Migrations are numbered, plain SQL, and re-runnable.** Each is one transaction
(`BEGIN`/`COMMIT`) that either fully applies or leaves the schema untouched —
verified by aborting `002` mid-run and confirming no partial column existed.
Files:

| File | Requires | Contents |
| --- | --- | --- |
| `001_initial_schema.sql` | PostgreSQL 18, `pgcrypto` | 22 tables, 127 table constraints, 104 indexes, 4 functions, 20 triggers, 12 views |
| `002_add_embedding.sql` | `pgvector`, `-v embedding_dim=N` | `embedding` column, 2 HNSW indexes |
| `seed_reference_data.sql` | after `001` | 9 stage definitions |

Apply in order. `seed_reference_data.sql` must run before the first product, or
the bootstrap trigger raises a message naming the file.

**Why not Alembic.** The backend does not exist yet, so there is no ORM model
for an autogenerated revision to match, and a version table would be a second
source of truth that can silently diverge from the SQL. When the FastAPI models
land, either keep these files as the source of truth, or regenerate them from
models into the same numbered layout — not both.

**Backup.** `pg_dump -Fc` for a logical backup, plus WAL archiving for
point-in-time recovery. A compliance product's audit trail is worth more than
its data, so PITR is the default, not the upgrade path. The extension situation
must be recorded alongside the dump, because a restore needs `pgcrypto` and
`pgvector` present **at the same versions** — `vector` carries a hard dimension
typmod, and a dump taken at dimension 768 will not restore against a 1536 column.

```bash
pg_dump -Fc -f nutrireg.dump          # backup
pg_restore -d nutrireg --clean nutrireg.dump
```

**Restore verification** is a restore into a scratch database followed by
`contract_test.sql` and `validation_queries.sql`. A backup that has never been
restored is a hypothesis.

---

## 13. Mapping to the frontend API

Every contract endpoint has a query path. Field names and enum tokens in
`details.md` are reproduced exactly; nothing in this schema requires a frontend
change.

| Endpoint | Tables / view | Notes |
| --- | --- | --- |
| `GET /api/v1/auth/session` | `users`, `sessions` | `token_hash` lookup, `revoked_at IS NULL AND expires_at > now()` |
| `POST /api/v1/auth/logout` | `sessions` | Set `revoked_at` |
| `GET /api/v1/dashboard/summary` | `v_dashboard_summary` | One row; readiness buckets computed once, JSONB derived from the same aliases |
| `GET /api/v1/findings` | `v_finding_list` | Filters on severity/status/product |
| `GET /api/v1/products` | `v_product_stats` | Derived counts; `target_market`/`status` filters indexed |
| `GET /api/v1/products/{id}` | `v_product_stats` | Same row, single key |
| `POST /api/v1/products` | `products` | Trigger creates 9 stages + `NOT_STARTED` analysis |
| `PATCH /api/v1/products/{id}` | `products` | Partial update |
| `GET /api/v1/products/{id}/ingredients` | `v_product_ingredient_list` | Joined from `ingredients` + `product_ingredients` |
| `GET /api/v1/claims` | `v_claim_list` | `target_market` derived; `evidenceCount` via `findings.claim_id` |
| `POST /api/v1/products/{id}/claims` | `claims` | Product-scoped path |
| `GET /api/v1/documents` | `v_document_list` | Global list; includes unfiled (`product_id IS NULL`) |
| `GET /api/v1/products/{id}/documents` | `v_document_list` | Product-scoped |
| `POST /api/v1/documents` | `documents`, `document_extractions` | Multipart; returns `201` in a settled state, never `UPLOADING` |
| `DELETE /api/v1/documents/{id}` | `documents` | Cascade to extractions |
| `POST /api/v1/products/{id}/analysis` | `analyses` | Flips `is_current`; history retained |
| `GET /api/v1/products/{id}/analysis` | `analyses` | Always one current row ⇒ never `404` |
| `GET /api/v1/products/{id}/findings` | `v_finding_list` | Scoped to `is_current` |
| `GET /api/v1/evidence` | `v_evidence_citation` | Full citation chain joined |
| `GET /api/v1/reviews` | `v_review_task_list` | `title`/`severity`/`assigneeName`/`productName` joined |
| `POST /api/v1/reviews/{id}` | `review_decisions` | Immutable insert + task/finding state transition |
| `GET /api/v1/reports` | `v_report_list` | — |
| `POST /api/v1/reports` | `reports` | — |
| `GET /api/v1/reports/{id}/download` | `reports` | `READY` requires `storage_key` |
| `GET /api/v1/compliance` | `v_compliance_item_list` | Tri-state `passed` preserved |
| `GET /api/v1/statutory-sources` | `v_regulatory_source_list` | `citationCount` computed from `evidence` |

### 13.1 Response-shape guarantees

- **List envelope.** Views return display-ready rows, so
  `{data: [...], pagination: {...}}` is assembled once in a dependency.
- **Never 404 on analysis.** The bootstrap row guarantees a current analysis.
- **Never 404 on review filters.** Unmatched filters return an empty `data`
  array, not an error.
- **`CRITICAL` cannot appear.** No CHECK admits it, so a stray value from an
  extraction step fails at the boundary instead of reaching a UI that cannot
  render it.
- **Tri-state compliance survives.** `NULL` reaches the client as `null`, never
  coerced to `false`.

### 13.2 Deliberate non-mappings

`audit_logs` and `sessions` have no endpoint — internal by design, and
`validation_queries.sql` V12 is how an auditor inspects the ledger without an
API. `workflow_stage_definitions` is internal; the contract's stage list comes
from `v_product_workflow` per product, unchanged. `product_ingredients.amount_per_serving`
and `amount_unit` are stored because they are part of the ingredient model, but
no endpoint returns them yet.

### 13.3 Known frontend limitations, unchanged here

The database supports these; the frontend does not yet consume them. Left alone
deliberately, since this task forbids frontend changes:

- `/readiness`, `/evidence`, `/sources` and `/reviews` do not read their
  incoming query parameters. The indexes in §5 are already in place for when
  they do.
- Product analysis is fetched on load and on manual refresh, not polled. The
  documents list does poll every 4 s.
- Document preview, document link, document category, ingredient creation and
  source ingestion are disabled with truthful tooltips.

---

## Verification summary

| Check | Result |
| --- | --- |
| `001` on an empty schema | Applies cleanly, fully transactional |
| `seed_reference_data.sql` | 9 rows; re-running is a no-op |
| `002 -v embedding_dim=768` | Column, 2 HNSW indexes, GIN tsvector all created |
| `002` with no / bad dimension | Refuses with a clear message, writes nothing |
| **Contract enum conformance** | **All 18 enums in `details.md` §2 match the schema token-for-token.** The one deliberate difference: `documents.status` omits `UPLOADING`, which `details.md` §2.10 itself requires ("a transient client-side state … should not be persisted"). `claims.risk_level` and `product_ingredients.risk_level` both preserve `NONE` as distinct from `LOW`, per §2.20. |
| `contract_test.sql` | **71 PASS · 0 FAIL · 0 ERROR**, rolls back to an empty database |
| `validation_queries.sql` | 13 checks, exit 0, all invariants OK |
| Vector retrieval | Cosine ranking, RRF fusion and dimension guard all verified |
| Objects created | 22 tables · 12 views · 104 indexes · 20 triggers · 4 functions |
| Frontend impact | **None** — no contract field, token or shape was changed |
