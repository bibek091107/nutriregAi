-- =============================================================================
-- NutriReg AI  ::  001_initial_schema.sql
-- =============================================================================
-- Target      : PostgreSQL 14+ (validated on PostgreSQL 18.6)
-- Extensions   : pgcrypto (optional on PG13+; gen_random_uuid() is core)
--                pgvector is NOT required by this migration -- see 002_add_embedding.sql
-- Conventions  : UUID PK, TIMESTAMPTZ, JSONB, snake_case
-- Enum strategy: CHECK constraints (see design doc section 7)
-- Idempotency  : NOT idempotent by design; this is migration 001.
--
-- Design rules enforced here:
--   * No denormalised display columns. product_name, title, severity,
--     assignee_name, source_title etc. are resolved through VIEWS (section 9).
--   * No counter columns. claim/document/ingredient/finding/citation counts are
--     computed in v_product_stats / v_regulatory_source_list.
--   * UPLOADING is never persisted; it is a client-side transient.
--   * compliance_items.passed is tri-state (TRUE / FALSE / NULL).
--   * Severity has no CRITICAL value. RiskLevel has a real NONE value.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Extensions
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

COMMENT ON EXTENSION pgcrypto IS
  'Provides gen_random_uuid() for UUID defaults. Core since PostgreSQL 13; the
   extension is created defensively so this script also runs on PG 12.';

-- =============================================================================
-- 2. REFERENCE DATA  (internal infrastructure)
-- =============================================================================
-- Single source of truth for the nine mandatory workflow stages and their order.
-- Referenced by: the product-creation trigger, the deferred nine-stage constraint
-- trigger, and v_product_workflow (ordering). The frontend never reads this table
-- directly; it always receives nine stages via v_product_workflow.

CREATE TABLE workflow_stage_definitions (
    stage_key      TEXT        NOT NULL,
    position       SMALLINT    NOT NULL,
    label          TEXT        NOT NULL,
    activated_when TEXT        NULL,
    CONSTRAINT workflow_stage_definitions_pkey PRIMARY KEY (stage_key),
    CONSTRAINT workflow_stage_definitions_stage_key_check CHECK (
        stage_key IN ('product_setup','ingredients','claims','documents',
                      'regulatory_analysis','risk_review','compliance_checklist',
                      'human_review','report')
    ),
    CONSTRAINT workflow_stage_definitions_position_check CHECK (position BETWEEN 1 AND 9),
    CONSTRAINT workflow_stage_definitions_position_key_uniq UNIQUE (position)
);

COMMENT ON TABLE workflow_stage_definitions IS
  'Canonical definition and ordering of the nine regulatory workflow stages.
   Internal reference data -- never exposed to the frontend.';

-- =============================================================================
-- 3. AUTH
-- =============================================================================

CREATE TABLE users (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name      TEXT        NOT NULL,
    email             TEXT        NOT NULL,
    organization_name TEXT        NULL,
    role              TEXT        NULL,
    password_hash     TEXT        NULL,
    is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_email_uniq UNIQUE (email),
    CONSTRAINT users_email_check CHECK (email = lower(btrim(email))),
    CONSTRAINT users_display_name_check CHECK (length(btrim(display_name)) > 0),
    -- Internal role vocabulary. The frontend contract treats role as an opaque
    -- string (SessionUser.role), so adding a role never breaks the client.
    CONSTRAINT users_role_check CHECK (
        role IS NULL OR role IN ('ADMIN','ANALYST','REVIEWER','VIEWER')
    )
);

COMMENT ON TABLE users IS
  'Application users. Deletion is soft (is_active) so regulatory history and audit
   trails survive. Serves GET /api/v1/auth/session -> {id, displayName, email,
   organizationName, role}.';
COMMENT ON COLUMN users.password_hash IS
  'NULL when authentication is delegated to an external IdP.';
COMMENT ON COLUMN users.is_active IS
  'Soft-delete flag. FALSE means the user cannot authenticate; rows are retained.';

CREATE TABLE sessions (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL,
    token_hash   TEXT        NOT NULL,
    expires_at   TIMESTAMPTZ NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at   TIMESTAMPTZ NULL,
    CONSTRAINT sessions_token_hash_uniq UNIQUE (token_hash),
    CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT sessions_token_hash_check CHECK (length(token_hash) = 64)
);

COMMENT ON TABLE sessions IS
  'Cookie-based sessions for GET /api/v1/auth/session and POST /api/v1/auth/logout.';
COMMENT ON COLUMN sessions.token_hash IS
  'SHA-256 hex digest of the opaque session token -- NEVER the raw token. The raw
   token exists only inside the HttpOnly cookie. A database dump therefore cannot
   be replayed as a live session. This column is never returned by any endpoint.
   NOTE: the column list in the design brief named this "session_token"; the name
   was changed to token_hash because the stored value is a digest, and storing raw
   tokens would leak live sessions in backups.';
COMMENT ON COLUMN sessions.revoked_at IS
  'Set on logout. Retaining the row (rather than deleting) gives an explicit
   revocation audit trail. Internal; never exposed to the frontend.';

-- =============================================================================
-- 4. PRODUCTS
-- =============================================================================

CREATE TABLE products (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT        NOT NULL,
    sku             TEXT        NULL,
    category        TEXT        NULL,
    target_market   TEXT        NULL,
    description     TEXT        NULL,
    status          TEXT        NOT NULL DEFAULT 'DRAFT',
    last_analysis_at TIMESTAMPTZ NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT products_name_check    CHECK (length(btrim(name)) BETWEEN 1 AND 160),
    CONSTRAINT products_sku_check     CHECK (sku IS NULL OR length(sku) <= 64),
    CONSTRAINT products_category_check CHECK (
        category IS NULL OR category IN ('FUNCTIONAL_FOOD','FUNCTIONAL_BEVERAGE',
            'DIETARY_SUPPLEMENT','SPORTS_NUTRITION','FORTIFIED_CEREAL','OTHER')
    ),
    CONSTRAINT products_target_market_check CHECK (
        target_market IS NULL OR target_market IN ('INDIA_FSSAI','USA_FDA',
            'EU_EFSA','UAE_MOIAT','OTHER')
    ),
    CONSTRAINT products_status_check CHECK (
        status IN ('DRAFT','NOT_STARTED','IN_PROGRESS','REVIEW_REQUIRED',
                   'NEEDS_ATTENTION','COMPLETED')
    )
);

COMMENT ON TABLE products IS
  'Formulation dossiers. Deliberately stores NO counters (claimCount, documentCount,
   ingredientCount, findingCount) and NO risk totals -- both are computed in
   v_product_stats so they can never drift.';

-- --- 4.1 Workflow stages -----------------------------------------------------

CREATE TABLE product_workflow_stages (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id   UUID        NOT NULL,
    stage_key    TEXT        NOT NULL,
    label        TEXT        NOT NULL,
    state        TEXT        NOT NULL DEFAULT 'PENDING',
    completed_at TIMESTAMPTZ NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT product_workflow_stages_product_id_stage_key_uniq
        UNIQUE (product_id, stage_key),
    CONSTRAINT product_workflow_stages_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
    CONSTRAINT product_workflow_stages_stage_key_fkey
        FOREIGN KEY (stage_key) REFERENCES workflow_stage_definitions (stage_key)
        ON UPDATE CASCADE,
    CONSTRAINT product_workflow_stages_state_check CHECK (
        state IN ('PENDING','ACTIVE','COMPLETED')
    ),
    -- completed_at is meaningful only for COMPLETED stages.
    CONSTRAINT product_workflow_stages_completed_at_check CHECK (
        (state = 'COMPLETED' AND completed_at IS NOT NULL)
        OR (state <> 'COMPLETED' AND completed_at IS NULL)
    )
);

COMMENT ON TABLE product_workflow_stages IS
  'The nine-stage regulatory workflow per product. Exactly nine rows per product,
   enforced by the deferred constraint trigger assert_nine_workflow_stages().
   Products with no row for a definition have a definition-integrity bug; a product
   with fewer than nine rows is rejected at COMMIT.';

-- =============================================================================
-- 5. INGREDIENTS
-- =============================================================================
-- ingredients is a global catalogue. product_ingredients is the join carrying all
-- per-product evaluation data (amount, status, risk). This avoids duplicating
-- name/CAS per product and keeps the catalogue reusable across dossiers.

CREATE TABLE ingredients (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT        NOT NULL,
    cas_number TEXT        NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ingredients_name_check CHECK (length(btrim(name)) > 0),
    CONSTRAINT ingredients_cas_number_check CHECK (cas_number IS NULL OR cas_number ~ '^[0-9]{2,7}-[0-9]{2}-[0-9]$')
);

COMMENT ON TABLE ingredients IS
  'Global ingredient catalogue. Not created through the frontend -- rows arrive from
   document extraction, so no POST endpoint exists for this table.';

CREATE TABLE product_ingredients (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id        UUID        NOT NULL,
    ingredient_id     UUID        NOT NULL,
    amount_per_serving NUMERIC(12,4) NULL,
    amount_unit       TEXT        NULL,
    is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
    status            TEXT        NOT NULL DEFAULT 'PENDING_ANALYSIS',
    risk_level        TEXT        NULL,
    status_note       TEXT        NULL,
    evaluated_at      TIMESTAMPTZ NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT product_ingredients_product_id_ingredient_id_uniq
        UNIQUE (product_id, ingredient_id),
    CONSTRAINT product_ingredients_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
    CONSTRAINT product_ingredients_ingredient_id_fkey
        FOREIGN KEY (ingredient_id) REFERENCES ingredients (id) ON DELETE RESTRICT,
    CONSTRAINT product_ingredients_amount_check CHECK (amount_per_serving IS NULL OR amount_per_serving >= 0),
    CONSTRAINT product_ingredients_status_check CHECK (
        status IN ('PENDING_ANALYSIS','COMPLIANT','REVIEW_REQUIRED','NON_COMPLIANT')
    ),
    -- NONE is a distinct, meaningful value ("evaluated, no risk"). It must never
    -- be normalised into LOW.
    CONSTRAINT product_ingredients_risk_level_check CHECK (
        risk_level IS NULL OR risk_level IN ('NONE','LOW','MEDIUM','HIGH')
    ),
    -- A risk level implies the ingredient has been evaluated.
    CONSTRAINT product_ingredients_risk_requires_evaluation_check CHECK (
        risk_level IS NULL OR evaluated_at IS NOT NULL
    )
);

COMMENT ON TABLE product_ingredients IS
  'Per-product ingredient evaluation. Serves ProductIngredient via
   v_product_ingredient_list (which joins ingredients for name/cas_number and
   products for product_name).';

-- =============================================================================
-- 6. CLAIMS
-- =============================================================================

CREATE TABLE claims (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id       UUID        NOT NULL,
    text             TEXT        NOT NULL,
    claim_type       TEXT        NULL,
    status           TEXT        NOT NULL DEFAULT 'PENDING_ANALYSIS',
    risk_level       TEXT        NULL,
    disclaimer       TEXT        NULL,
    status_note      TEXT        NULL,
    last_reviewed_at TIMESTAMPTZ NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT claims_product_id_fkey FOREIGN KEY (product_id)
        REFERENCES products (id) ON DELETE CASCADE,
    CONSTRAINT claims_text_check CHECK (length(btrim(text)) > 0),
    CONSTRAINT claims_claim_type_check CHECK (
        claim_type IS NULL OR claim_type IN ('NUTRIENT_FUNCTION','HEALTH',
            'NUTRITIONAL_CONTENT','STRUCTURAL_FUNCTION','OTHER')
    ),
    CONSTRAINT claims_status_check CHECK (
        status IN ('PENDING_ANALYSIS','SUPPORTED','QUALIFIER_REQUIRED',
                   'NOT_SUPPORTED','PROHIBITED')
    ),
    CONSTRAINT claims_risk_level_check CHECK (
        risk_level IS NULL OR risk_level IN ('NONE','LOW','MEDIUM','HIGH')
    )
);

COMMENT ON TABLE claims IS
  'Product claims. target_market is intentionally NOT stored: the frontend never
   sends it on create and always displays the parent product market. Use
   v_claim_list to obtain target_market and evidence_count.';
COMMENT ON COLUMN claims.text IS
  'The claim statement. Matches the frontend Claim.text field.';

-- =============================================================================
-- 7. DOCUMENTS
-- =============================================================================

CREATE TABLE documents (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id        UUID        NULL,
    file_name         TEXT        NOT NULL,
    document_type     TEXT        NULL,
    storage_key       TEXT        NOT NULL,
    size_bytes        BIGINT      NOT NULL,
    status            TEXT        NOT NULL DEFAULT 'UPLOADED',
    extraction_status TEXT        NULL,
    notes             TEXT        NULL,
    failure_reason    TEXT        NULL,
    uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT documents_storage_key_uniq UNIQUE (storage_key),
    -- product_id is nullable: the frontend allows uploading an unfiled document.
    CONSTRAINT documents_product_id_fkey FOREIGN KEY (product_id)
        REFERENCES products (id) ON DELETE CASCADE,
    CONSTRAINT documents_file_name_check CHECK (length(btrim(file_name)) > 0),
    CONSTRAINT documents_document_type_check CHECK (
        document_type IS NULL OR document_type IN ('PRODUCT_SPEC',
            'CERTIFICATE_OF_ANALYSIS','LAB_REPORT','SAFETY_SHEET',
            'LABEL_ARTWORK','OTHER')
    ),
    -- UPLOADING is intentionally absent: it is a browser-side transient and is
    -- never persisted.
    CONSTRAINT documents_status_check CHECK (
        status IN ('UPLOADED','PROCESSING','PROCESSED','FAILED')
    ),
    CONSTRAINT documents_extraction_status_check CHECK (
        extraction_status IS NULL OR extraction_status IN ('PENDING','RUNNING','COMPLETE','FAILED')
    ),
    -- Upload contract mirrored from the frontend (25 MB ceiling, non-empty file).
    CONSTRAINT documents_size_bytes_check CHECK (size_bytes > 0 AND size_bytes <= 26214400),
    -- A failed document must explain itself; the UI renders failure_reason.
    CONSTRAINT documents_failure_reason_check CHECK (
        status <> 'FAILED' OR (failure_reason IS NOT NULL AND btrim(failure_reason) <> '')
    )
);

COMMENT ON TABLE documents IS
  'Object-storage pointers for uploaded dossiers. Binary content is never stored in
   PostgreSQL; storage_key is the object key. Feeds the 4-second client poll, so
   status/extraction_status must advance asynchronously.';
COMMENT ON COLUMN documents.storage_key IS
  'Opaque object-storage key. Any downloadUrl served to the frontend is derived
   from this at request time (e.g. a presigned URL); it is not stored.';
COMMENT ON CONSTRAINT documents_size_bytes_check ON documents IS
  '25 MB = 26214400 bytes, matching MAX_UPLOAD_BYTES in src/lib/api/client.ts.';

-- --- 7.1 Document extractions ------------------------------------------------
-- Extraction progress is a SEPARATE lifecycle from document status. A document can
-- be PROCESSED with extraction_status = FAILED, and vice versa.

CREATE TABLE document_extractions (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id       UUID        NOT NULL,
    extracted_text    TEXT        NULL,
    extraction_status TEXT        NOT NULL DEFAULT 'PENDING',
    error_message     TEXT        NULL,
    started_at        TIMESTAMPTZ NULL,
    completed_at      TIMESTAMPTZ NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT document_extractions_document_id_fkey FOREIGN KEY (document_id)
        REFERENCES documents (id) ON DELETE CASCADE,
    CONSTRAINT document_extractions_extraction_status_check CHECK (
        extraction_status IN ('PENDING','RUNNING','COMPLETE','FAILED')
    ),
    -- Failure reasons are mandatory so operators can act on them.
    CONSTRAINT document_extractions_error_message_check CHECK (
        extraction_status <> 'FAILED' OR (error_message IS NOT NULL AND btrim(error_message) <> '')
    ),
    -- completed_at is only meaningful once a terminal state is reached.
    CONSTRAINT document_extractions_completed_at_check CHECK (
        extraction_status NOT IN ('COMPLETE','FAILED') OR completed_at IS NOT NULL
    )
    -- NOTE: no UNIQUE (document_id, created_at) here. Extraction retries are
    -- meant to accumulate, and two retries inside the same transaction share a
    -- now() timestamp, so that rule would reject legitimate work. The real
    -- invariant is "at most one attempt in flight per document", enforced by the
    -- partial unique index document_extractions_one_inflight_idx below.
);

COMMENT ON TABLE document_extractions IS
  'Text extraction attempts per document. Multiple rows per document are allowed
   (retries); the current attempt is the most recent. Kept separate from
   documents.status so the two lifecycles never overwrite each other.';

-- =============================================================================
-- 8. ANALYSES
-- =============================================================================
-- Every product owns exactly one is_current analysis row from creation time
-- (status NOT_STARTED). This is what lets GET /api/v1/products/{id}/analysis
-- return 200 + a valid object instead of 404 for a brand-new product.
-- Historical runs are retained with is_current = FALSE.

CREATE TABLE analyses (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id     UUID        NOT NULL,
    status         TEXT        NOT NULL DEFAULT 'NOT_STARTED',
    progress       SMALLINT    NOT NULL DEFAULT 0,
    is_current     BOOLEAN     NOT NULL DEFAULT TRUE,
    started_at     TIMESTAMPTZ NULL,
    completed_at   TIMESTAMPTZ NULL,
    failure_reason TEXT        NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT analyses_product_id_fkey FOREIGN KEY (product_id)
        REFERENCES products (id) ON DELETE CASCADE,
    CONSTRAINT analyses_status_check CHECK (
        status IN ('NOT_STARTED','QUEUED','PROCESSING','COMPLETED','FAILED')
    ),
    -- progress is an integer percentage, never a fraction.
    CONSTRAINT analyses_progress_check CHECK (progress BETWEEN 0 AND 100),
    -- Terminal states must be fully described.
    CONSTRAINT analyses_terminal_state_check CHECK (
        (status IN ('COMPLETED','FAILED') AND completed_at IS NOT NULL)
        OR status NOT IN ('COMPLETED','FAILED')
    ),
    CONSTRAINT analyses_failure_reason_check CHECK (
        status <> 'FAILED' OR (failure_reason IS NOT NULL AND btrim(failure_reason) <> '')
    ),
    -- An analysis that has begun must record when.
    CONSTRAINT analyses_started_at_check CHECK (
        status IN ('NOT_STARTED') OR started_at IS NOT NULL
    ),
    -- A completed analysis cannot be less than 100% done.
    CONSTRAINT analyses_completed_progress_check CHECK (
        status <> 'COMPLETED' OR progress = 100
    )
);

COMMENT ON TABLE analyses IS
  'Analysis run history. The row with is_current = TRUE is what the frontend sees
   as "the" analysis for a product; older rows are retained for auditability and
   referenced by their findings. Re-running supersedes rather than duplicates.';
COMMENT ON COLUMN analyses.is_current IS
  'Internal marker. At most one current analysis per product (partial unique
   index). Not exposed to the frontend -- the API simply returns the current row.';

-- =============================================================================
-- 9. FINDINGS
-- =============================================================================

CREATE TABLE findings (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id         UUID        NOT NULL,
    product_id          UUID        NOT NULL,
    claim_id            UUID        NULL,
    title               TEXT        NOT NULL,
    summary             TEXT        NOT NULL,
    severity            TEXT        NOT NULL,
    status              TEXT        NOT NULL DEFAULT 'OPEN',
    category            TEXT        NULL,
    statutory_reference TEXT        NULL,
    corrective_action   TEXT        NULL,
    detected_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT findings_analysis_id_fkey FOREIGN KEY (analysis_id)
        REFERENCES analyses (id) ON DELETE CASCADE,
    CONSTRAINT findings_product_id_fkey FOREIGN KEY (product_id)
        REFERENCES products (id) ON DELETE CASCADE,
    -- Nullable because a finding may be about a product-level issue (composition,
    -- labelling) rather than any single claim. This FK is what makes
    -- Claim.evidenceCount computable without a denormalised counter.
    CONSTRAINT findings_claim_id_fkey FOREIGN KEY (claim_id)
        REFERENCES claims (id) ON DELETE SET NULL,
    CONSTRAINT findings_title_check   CHECK (length(btrim(title)) > 0),
    CONSTRAINT findings_summary_check CHECK (length(btrim(summary)) > 0),
    -- There is no CRITICAL severity in the frontend contract.
    CONSTRAINT findings_severity_check CHECK (severity IN ('HIGH','MEDIUM','LOW')),
    CONSTRAINT findings_status_check CHECK (
        status IN ('OPEN','IN_PROGRESS','RESOLVED','UNRESOLVED')
    )
);

COMMENT ON TABLE findings IS
  'Regulatory findings produced by an analysis. product_name is never stored; the
   API resolves it via products.name. Counts in v_product_stats consider ONLY
   findings belonging to the current analysis, so re-running a product does not
   inflate findingCount.';
COMMENT ON COLUMN findings.claim_id IS
  'Optional link to the claim a finding concerns. Required to compute
   Claim.evidenceCount as evidence belonging to findings of that claim. Nullable
   for product-level findings. Internal; not a new API field.';

-- =============================================================================
-- 10. REGULATORY KNOWLEDGE BASE (RAG)
-- =============================================================================

CREATE TABLE regulatory_sources (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    authority       TEXT        NOT NULL,
    title           TEXT        NOT NULL,
    document_title  TEXT        NULL,
    source_type     TEXT        NULL,
    jurisdiction    TEXT        NULL,
    version         TEXT        NULL,
    effective_date  DATE        NULL,
    last_indexed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    source_url      TEXT        NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT regulatory_sources_authority_check CHECK (length(btrim(authority)) > 0),
    CONSTRAINT regulatory_sources_title_check     CHECK (length(btrim(title)) > 0),
    CONSTRAINT regulatory_sources_source_type_check CHECK (
        source_type IS NULL OR source_type IN
        ('ACT','REGULATION','GUIDANCE','STANDARD','NOTIFICATION')
    ),
    -- Rendered by the frontend as an external link; must be absolute HTTPS.
    CONSTRAINT regulatory_sources_source_url_check CHECK (
        source_url IS NULL OR source_url ~ '^https://'
    )
);

COMMENT ON TABLE regulatory_sources IS
  'Statutory sources as exposed to the frontend. citationCount is NOT stored -- it
   is computed in v_regulatory_source_list from the evidence chain.';

CREATE TABLE regulatory_documents (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id          UUID        NOT NULL,
    title              TEXT        NOT NULL,
    document_version   TEXT        NULL,
    publication_date   DATE        NULL,
    effective_date     DATE        NULL,
    file_storage_key   TEXT        NULL,
    content_hash       TEXT        NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT regulatory_documents_source_id_fkey FOREIGN KEY (source_id)
        REFERENCES regulatory_sources (id) ON DELETE RESTRICT,
    CONSTRAINT regulatory_documents_file_storage_key_uniq UNIQUE (file_storage_key),
    -- content_hash makes ingestion idempotent: re-ingesting the same bytes is a
    -- no-op, which is what preserves citation immutability across re-indexing.
    CONSTRAINT regulatory_documents_content_hash_uniq UNIQUE (content_hash),
    CONSTRAINT regulatory_documents_title_check CHECK (length(btrim(title)) > 0)
);

COMMENT ON TABLE regulatory_documents IS
  'Internal RAG table. A source may have several documents/versions; treat these
   rows as APPEND-ONLY. Never UPDATE title/version/effective_date in place -- add a
   new row instead. This is what guarantees that a historical evidence citation
   still resolves to the text it was retrieved against. Not exposed to the API.';

CREATE TABLE regulatory_sections (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    regulatory_document_id UUID       NOT NULL,
    section_number        TEXT        NOT NULL,
    title                 TEXT        NULL,
    page_start            INTEGER     NULL,
    page_end              INTEGER     NULL,
    content               TEXT        NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT regulatory_sections_regulatory_document_id_fkey
        FOREIGN KEY (regulatory_document_id)
        REFERENCES regulatory_documents (id) ON DELETE CASCADE,
    CONSTRAINT regulatory_sections_regulatory_document_id_section_number_uniq
        UNIQUE (regulatory_document_id, section_number),
    CONSTRAINT regulatory_sections_page_range_check CHECK (
        (page_start IS NULL AND page_end IS NULL)
        OR (page_start IS NOT NULL AND page_end IS NOT NULL AND page_end >= page_start)
    )
);

COMMENT ON TABLE regulatory_sections IS
  'Logical sections of a regulatory document. Retains section number, title, page
   span and raw content for citation and display. Internal RAG table.';

CREATE TABLE regulatory_chunks (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id       UUID        NOT NULL,
    chunk_index      INTEGER     NOT NULL,
    content          TEXT        NOT NULL,
    page_number      INTEGER     NULL,
    metadata         JSONB       NOT NULL DEFAULT '{}'::jsonb,
    -- NOTE: the embedding column is intentionally absent. Its type is vector(N)
    -- and N depends on the embedding model, which is not yet fixed. Apply
    -- 002_add_embedding.sql once the model is chosen. See design doc section 8.
    -- Full-text vector for the BM25 / keyword retrieval path. Generated from
    -- content so it can never drift from the indexed text.
    search_vector    tsvector
                      GENERATED ALWAYS AS
                      (to_tsvector('english', coalesce(content, ''))) STORED,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT regulatory_chunks_section_id_chunk_index_uniq
        UNIQUE (section_id, chunk_index),
    CONSTRAINT regulatory_chunks_chunk_index_check CHECK (chunk_index >= 0),
    CONSTRAINT regulatory_chunks_page_number_check CHECK (page_number IS NULL OR page_number > 0),
    CONSTRAINT regulatory_chunks_section_id_fkey FOREIGN KEY (section_id)
        REFERENCES regulatory_sections (id) ON DELETE CASCADE,
    -- metadata carries the retrieval filters (jurisdiction, authority,
    -- source_type, version, effective_date) denormalised at ingest time.
    CONSTRAINT regulatory_chunks_metadata_is_object_check
        CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE regulatory_chunks IS
  'Embedding-ready retrieval units. Powers hybrid search: tsvector (keyword/BM25),
   vector (semantic, added in 002) and metadata (filters).';

-- =============================================================================
-- 11. EVIDENCE
-- =============================================================================

CREATE TABLE evidence (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    finding_id           UUID        NULL,
    source_id            UUID        NOT NULL,
    regulatory_chunk_id  UUID        NULL,
    status               TEXT        NOT NULL DEFAULT 'PENDING',
    excerpt              TEXT        NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- A finding's evidence disappears with the finding (same lifecycle).
    CONSTRAINT evidence_finding_id_fkey FOREIGN KEY (finding_id)
        REFERENCES findings (id) ON DELETE CASCADE,
    -- RESTRICT: a statutory source referenced as evidence is never deleted, so
    -- the regulatory citation history cannot be destroyed.
    CONSTRAINT evidence_source_id_fkey FOREIGN KEY (source_id)
        REFERENCES regulatory_sources (id) ON DELETE RESTRICT,
    -- SET NULL: re-indexing or purging RAG internals must not delete evidence.
    -- The row survives with source_id intact and loses only the chunk pointer.
    CONSTRAINT evidence_regulatory_chunk_id_fkey FOREIGN KEY (regulatory_chunk_id)
        REFERENCES regulatory_chunks (id) ON DELETE SET NULL,
    CONSTRAINT evidence_status_check CHECK (
        status IN ('PENDING','RELEVANT','PARTIALLY_RELEVANT','NOT_RELEVANT')
    ),
    -- The same chunk cannot be cited twice for the same finding.
    CONSTRAINT evidence_finding_id_regulatory_chunk_id_uniq
        UNIQUE (finding_id, regulatory_chunk_id)
);

COMMENT ON TABLE evidence IS
  'Citation linking a finding to statutory text. No source metadata is duplicated
   here: v_evidence_citation resolves the full citation through
   evidence -> regulatory_chunks -> regulatory_sections -> regulatory_documents
   -> regulatory_sources. The immutable part of a citation (the quoted text) is
   already snapshotted in excerpt.';
COMMENT ON COLUMN evidence.excerpt IS
  'The exact quoted text at citation time. This IS the citation snapshot: combined
   with append-only regulatory_documents, a historical citation remains faithful
   even after the knowledge base is re-indexed.';

-- =============================================================================
-- 12. COMPLIANCE ITEMS
-- =============================================================================

CREATE TABLE compliance_items (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id  UUID        NOT NULL,
    analysis_id UUID        NULL,
    label       TEXT        NOT NULL,
    note        TEXT        NULL,
    passed      BOOLEAN     NULL,
    category    TEXT        NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT compliance_items_product_id_fkey FOREIGN KEY (product_id)
        REFERENCES products (id) ON DELETE CASCADE,
    CONSTRAINT compliance_items_analysis_id_fkey FOREIGN KEY (analysis_id)
        REFERENCES analyses (id) ON DELETE CASCADE,
    CONSTRAINT compliance_items_label_check CHECK (length(btrim(label)) > 0),
    -- Tri-state by design: NULL means "not yet determined". It must never be
    -- coerced to FALSE, which the UI would render as a failure.
    CONSTRAINT compliance_items_category_check CHECK (
        category IS NULL OR category IN ('Product Composition','Labelling',
            'Claims & Advertising','Safety Documentation','Process & Records')
    ),
    -- A failing check must explain itself.
    CONSTRAINT compliance_items_failure_note_check CHECK (
        passed IS DISTINCT FROM FALSE OR (note IS NOT NULL AND btrim(note) <> '')
    )
);

COMMENT ON TABLE compliance_items IS
  'Read-only compliance checklist regenerated by the analysis engine. No UPDATE
   endpoint exists in the frontend contract; there is no PATCH path in the API.';

-- =============================================================================
-- 13. HUMAN REVIEW
-- =============================================================================

CREATE TABLE review_tasks (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    finding_id    UUID        NOT NULL,
    product_id    UUID        NOT NULL,
    assignee_id   UUID        NULL,
    status        TEXT        NOT NULL DEFAULT 'PENDING',
    requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at    TIMESTAMPTZ NULL,
    decision_note TEXT        NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- One review task per finding; a re-analysis creates a NEW finding and
    -- therefore a new task, superseding (not duplicating) the old one.
    CONSTRAINT review_tasks_finding_id_uniq UNIQUE (finding_id),
    CONSTRAINT review_tasks_finding_id_fkey FOREIGN KEY (finding_id)
        REFERENCES findings (id) ON DELETE CASCADE,
    CONSTRAINT review_tasks_product_id_fkey FOREIGN KEY (product_id)
        REFERENCES products (id) ON DELETE CASCADE,
    -- RESTRICT: a user is soft-deleted (is_active = FALSE) rather than removed,
    -- so assignment history is never broken by user deletion.
    CONSTRAINT review_tasks_assignee_id_fkey FOREIGN KEY (assignee_id)
        REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT review_tasks_status_check CHECK (
        status IN ('PENDING','IN_REVIEW','APPROVED','REJECTED','ESCALATED','CANCELLED')
    ),
    -- Decided states must carry a timestamp; open states must not.
    CONSTRAINT review_tasks_decided_at_check CHECK (
        (status IN ('PENDING','IN_REVIEW') AND decided_at IS NULL)
        OR (status IN ('APPROVED','REJECTED','ESCALATED','CANCELLED') AND decided_at IS NOT NULL)
    )
);

COMMENT ON TABLE review_tasks IS
  'Human verification tasks. product_name, title, severity and assignee_name are
   never stored -- v_review_task_list resolves them through joins. assignee_id
   must use the same id space as users.id, otherwise the frontend "Assigned to Me"
   tab is always empty.';

CREATE TABLE review_decisions (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    review_task_id UUID        NOT NULL,
    reviewer_id    UUID        NOT NULL,
    decision       TEXT        NOT NULL,
    note           TEXT        NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT review_decisions_review_task_id_fkey FOREIGN KEY (review_task_id)
        REFERENCES review_tasks (id) ON DELETE CASCADE,
    -- The decision maker is resolved from the session; the frontend never sends it.
    CONSTRAINT review_decisions_reviewer_id_fkey FOREIGN KEY (reviewer_id)
        REFERENCES users (id) ON DELETE RESTRICT,
    CONSTRAINT review_decisions_decision_check CHECK (
        decision IN ('APPROVE','REJECT','REQUEST_MORE_EVIDENCE','ESCALATE')
    )
);

COMMENT ON TABLE review_decisions IS
  'Append-only decision ledger. review_tasks.status/decision_note are a
   denormalised projection of the latest decision, kept for the single-field
   display the frontend requires; this table is the authoritative audit record.
   reviewer_id always comes from the authenticated session, never from the client.';

-- =============================================================================
-- 14. REPORTS
-- =============================================================================

CREATE TABLE reports (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id     UUID        NOT NULL,
    title          TEXT        NOT NULL,
    status         TEXT        NOT NULL DEFAULT 'PENDING',
    storage_key    TEXT        NULL,
    generated_at   TIMESTAMPTZ NULL,
    failure_reason TEXT        NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT reports_product_id_fkey FOREIGN KEY (product_id)
        REFERENCES products (id) ON DELETE CASCADE,
    CONSTRAINT reports_title_check CHECK (length(btrim(title)) > 0),
    CONSTRAINT reports_status_check CHECK (
        status IN ('PENDING','GENERATING','READY','FAILED')
    ),
    -- A report is downloadable only when the artefact exists.
    CONSTRAINT reports_ready_requires_artefact_check CHECK (
        status <> 'READY' OR (storage_key IS NOT NULL AND generated_at IS NOT NULL)
    ),
    CONSTRAINT reports_failure_reason_check CHECK (
        status <> 'FAILED' OR (failure_reason IS NOT NULL AND btrim(failure_reason) <> '')
    )
);

COMMENT ON TABLE reports IS
  'Generated audit dossiers. The PDF lives in object storage; storage_key points
   at it. downloadUrl is DERIVED per request (presigned URL) and deliberately not
   persisted, so it cannot go stale or leak a long-lived URL.';

-- =============================================================================
-- 15. AUDIT LOG
-- =============================================================================

CREATE TABLE audit_logs (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NULL,
    entity_type TEXT        NOT NULL,
    entity_id   UUID        NULL,
    action      TEXT        NOT NULL,
    old_values  JSONB       NULL,
    new_values  JSONB       NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- SET NULL: audit rows outlive the user. actor_id is preserved in new_values
    -- if a hard reference is ever needed.
    CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT audit_logs_entity_type_check CHECK (
        entity_type IN ('product','document','analysis','finding','review_task',
                        'report','claim','ingredient','user','compliance_item',
                        'regulatory_source')
    ),
    CONSTRAINT audit_logs_action_check CHECK (length(btrim(action)) > 0),
    CONSTRAINT audit_logs_old_values_check CHECK (
        old_values IS NULL OR jsonb_typeof(old_values) = 'object'
    ),
    CONSTRAINT audit_logs_new_values_check CHECK (
        new_values IS NULL OR jsonb_typeof(new_values) = 'object'
    )
);

COMMENT ON TABLE audit_logs IS
  'Append-only audit trail. entity_type/entity_id are polymorphic and deliberately
   carry NO foreign key, so audit history survives deletion of any entity. The
   application writes these rows; there is deliberately no database trigger,
   because a trigger cannot know the acting user.';

-- =============================================================================
-- 16. TRIGGERS
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION set_updated_at() IS
  'Maintains updated_at on every mutable table.';

-- --- 16.1 updated_at maintenance --------------------------------------------
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'users','products','product_workflow_stages','ingredients','product_ingredients',
        'claims','documents','document_extractions','analyses','findings',
        'regulatory_sources','regulatory_documents','evidence','compliance_items',
        'review_tasks','reports'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON %I
             FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
    END LOOP;
END;
$$;

-- --- 16.2 Product bootstrap: nine stages + initial analysis ------------------
CREATE OR REPLACE FUNCTION initialise_new_product() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    definition_count INTEGER;
BEGIN
    SELECT count(*) INTO definition_count FROM workflow_stage_definitions;

    -- Fail loudly and early if reference data is missing, rather than surfacing
    -- an opaque foreign-key violation on workflow_stage_definitions.
    IF definition_count <> 9 THEN
        RAISE EXCEPTION
            'workflow_stage_definitions must contain exactly 9 rows (found %). '
            'Run db/seed_reference_data.sql before creating products.', definition_count
            USING ERRCODE = '23514';
    END IF;

    -- The nine mandatory stages. product_setup is COMPLETED on creation; the rest
    -- start PENDING. The documents stage is promoted to ACTIVE by the backend
    -- when the first document is attached.
    INSERT INTO product_workflow_stages
        (product_id, stage_key, label, state, completed_at)
    SELECT NEW.id,
           w.stage_key,
           w.label,
           CASE WHEN w.stage_key = 'product_setup' THEN 'COMPLETED' ELSE 'PENDING' END,
           CASE WHEN w.stage_key = 'product_setup' THEN now() ELSE NULL END
    FROM workflow_stage_definitions w;

    -- Seed the NOT_STARTED analysis so GET /api/v1/products/{id}/analysis can
    -- always answer 200 with a valid object instead of 404.
    INSERT INTO analyses (product_id, status, progress, is_current)
    VALUES (NEW.id, 'NOT_STARTED', 0, TRUE);

    RETURN NEW;
END;
$$;

CREATE TRIGGER products_initialise
    AFTER INSERT ON products
    FOR EACH ROW EXECUTE FUNCTION initialise_new_product();

-- --- 16.3 Exactly nine stages (deferred) -------------------------------------
CREATE OR REPLACE FUNCTION assert_nine_workflow_stages() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    expected_count INTEGER;
    actual_count   INTEGER;
BEGIN
    SELECT count(*) INTO expected_count FROM workflow_stage_definitions;
    SELECT count(*) INTO actual_count
    FROM product_workflow_stages WHERE product_id = NEW.id;

    IF actual_count <> expected_count THEN
        RAISE EXCEPTION
            'product % must have exactly % workflow stages, found %',
            NEW.id, expected_count, actual_count
            USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER products_require_nine_workflow_stages
    AFTER INSERT ON products
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION assert_nine_workflow_stages();

-- --- 16.4 At most one current analysis per product ---------------------------
-- Enforced by a partial unique index (created with the indexes below), which is
-- cheaper and clearer than a trigger. Guarded here by a matching function used
-- by the backend to supersede runs.

-- --- 16.5 Append-only ledgers ------------------------------------------------
-- review_decisions is immutable for UPDATE, but DELETE must be permitted so that
-- ON DELETE CASCADE from review_tasks (and therefore from products) can run.
-- audit_logs has no inbound foreign key, so it is fully append-only.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% is append-only; % is not permitted',
        TG_TABLE_NAME, TG_OP
        USING ERRCODE = '2F004';
END;
$$;

CREATE TRIGGER review_decisions_no_update
    BEFORE UPDATE ON review_decisions
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER audit_logs_append_only
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- =============================================================================
-- 17. INDEXES
-- =============================================================================

-- 17.1 Products ---------------------------------------------------------------
CREATE INDEX products_status_idx        ON products (status);
CREATE INDEX products_target_market_idx ON products (target_market);
CREATE INDEX products_last_analysis_idx  ON products (last_analysis_at DESC NULLS LAST);

-- 17.2 Workflow stages --------------------------------------------------------
-- product_workflow_stages (product_id, stage_key) is already indexed by its
-- UNIQUE constraint. Ordering for the API comes from workflow_stage_definitions.
CREATE INDEX product_workflow_stages_state_idx ON product_workflow_stages (state);

-- 17.3 Ingredients ------------------------------------------------------------
CREATE INDEX ingredients_name_idx ON ingredients (lower(name));
-- CAS numbers are unique across the catalogue when present, which makes
-- extraction de-duplication a cheap lookup.
CREATE UNIQUE INDEX ingredients_cas_number_uniq
    ON ingredients (cas_number) WHERE cas_number IS NOT NULL;
CREATE INDEX product_ingredients_product_id_idx   ON product_ingredients (product_id);
CREATE INDEX product_ingredients_ingredient_id_idx ON product_ingredients (ingredient_id);
CREATE INDEX product_ingredients_status_idx       ON product_ingredients (status);
-- Serves the dashboard readiness buckets and the ingredient table filter.
CREATE INDEX product_ingredients_product_active_idx
    ON product_ingredients (product_id) WHERE is_active;

-- 17.4 Claims -----------------------------------------------------------------
CREATE INDEX claims_product_id_idx ON claims (product_id);
CREATE INDEX claims_status_idx    ON claims (status);
CREATE INDEX claims_claim_type_idx ON claims (claim_type);
-- Supports filtering the claims matrix by risk without a full scan.
CREATE INDEX claims_risk_level_idx ON claims (risk_level);
CREATE INDEX findings_claim_id_idx ON findings (claim_id) WHERE claim_id IS NOT NULL;

-- 17.5 Documents --------------------------------------------------------------
CREATE INDEX documents_product_id_idx        ON documents (product_id);
CREATE INDEX documents_status_idx            ON documents (status);
CREATE INDEX documents_extraction_status_idx ON documents (extraction_status);
-- Hot path: the document vault polls every 4s while anything is in flight.
CREATE INDEX documents_active_poll_idx
    ON documents (uploaded_at DESC)
    WHERE status IN ('UPLOADED','PROCESSING');
CREATE INDEX document_extractions_document_id_idx ON document_extractions (document_id);
-- The current attempt is the newest; this index also serves the "latest
-- extraction for this document" lookup the read path needs.
CREATE INDEX document_extractions_current_idx
    ON document_extractions (document_id, created_at DESC);
-- At most one attempt in flight per document, so a retry cannot be double-queued.
-- In-flight tokens are PENDING and RUNNING (the contract's extractionStatus enum);
-- terminal states are COMPLETE and FAILED.
CREATE UNIQUE INDEX document_extractions_one_inflight_idx
    ON document_extractions (document_id)
    WHERE extraction_status IN ('PENDING','RUNNING');

-- 17.6 Analyses ---------------------------------------------------------------
CREATE INDEX analyses_product_id_idx ON analyses (product_id);
CREATE INDEX analyses_status_idx    ON analyses (status);
-- At most one current analysis per product. Also the lookup path for
-- GET /api/v1/products/{id}/analysis.
CREATE UNIQUE INDEX analyses_one_current_per_product
    ON analyses (product_id) WHERE is_current;
-- Dashboard activeAnalysisCount.
CREATE INDEX analyses_active_idx
    ON analyses (status) WHERE status IN ('QUEUED','PROCESSING');

-- 17.7 Findings ---------------------------------------------------------------
CREATE INDEX findings_analysis_id_idx ON findings (analysis_id);
CREATE INDEX findings_product_id_idx  ON findings (product_id);
CREATE INDEX findings_severity_idx    ON findings (severity);
CREATE INDEX findings_status_idx      ON findings (status);
-- Serves the dashboard highRiskCount definition exactly:
-- severity = HIGH AND status <> RESOLVED, current analysis only.
CREATE INDEX findings_open_high_idx
    ON findings (product_id, analysis_id)
    WHERE severity = 'HIGH' AND status <> 'RESOLVED';

-- 17.8 Evidence ---------------------------------------------------------------
CREATE INDEX evidence_finding_id_idx          ON evidence (finding_id);
CREATE INDEX evidence_source_id_idx           ON evidence (source_id);
CREATE INDEX evidence_regulatory_chunk_id_idx ON evidence (regulatory_chunk_id)
    WHERE regulatory_chunk_id IS NOT NULL;
-- citationCount per source.
CREATE INDEX evidence_citation_count_idx ON evidence (source_id) WHERE source_id IS NOT NULL;
-- Claim.evidenceCount.
CREATE INDEX evidence_by_finding_chunk_idx ON evidence (finding_id, regulatory_chunk_id);

-- 17.9 Compliance items --------------------------------------------------------
CREATE INDEX compliance_items_product_id_idx  ON compliance_items (product_id);
CREATE INDEX compliance_items_analysis_id_idx ON compliance_items (analysis_id);
CREATE INDEX compliance_items_category_idx    ON compliance_items (category);
-- Dashboard readiness buckets: outstanding failures only.
CREATE INDEX compliance_items_failed_idx
    ON compliance_items (product_id) WHERE passed IS FALSE;

-- 17.10 Review queue -----------------------------------------------------------
CREATE INDEX review_tasks_product_id_idx  ON review_tasks (product_id);
CREATE INDEX review_tasks_assignee_id_idx ON review_tasks (assignee_id);
CREATE INDEX review_tasks_status_idx      ON review_tasks (status);
-- finding_id is already uniquely indexed by review_tasks_finding_id_uniq.
-- Dashboard pendingReviewCount and the default PENDING queue tab.
CREATE INDEX review_tasks_open_idx
    ON review_tasks (requested_at DESC)
    WHERE status IN ('PENDING','IN_REVIEW');
CREATE INDEX review_decisions_review_task_id_idx ON review_decisions (review_task_id);
CREATE INDEX review_decisions_reviewer_id_idx    ON review_decisions (reviewer_id);

-- 17.11 Reports ----------------------------------------------------------------
CREATE INDEX reports_product_id_idx ON reports (product_id);
CREATE INDEX reports_status_idx    ON reports (status);
CREATE INDEX reports_in_flight_idx ON reports (product_id)
    WHERE status IN ('PENDING','GENERATING');

-- 17.12 Regulatory knowledge base ----------------------------------------------
CREATE INDEX regulatory_sources_authority_idx    ON regulatory_sources (authority);
CREATE INDEX regulatory_sources_jurisdiction_idx ON regulatory_sources (jurisdiction);
CREATE INDEX regulatory_sources_source_type_idx  ON regulatory_sources (source_type);
CREATE INDEX regulatory_documents_source_id_idx   ON regulatory_documents (source_id);
CREATE INDEX regulatory_documents_effective_idx   ON regulatory_documents (effective_date);
CREATE INDEX regulatory_sections_regulatory_document_id_idx
    ON regulatory_sections (regulatory_document_id);
CREATE INDEX regulatory_chunks_section_id_idx ON regulatory_chunks (section_id);
-- Hybrid retrieval: BM25 / keyword path.
CREATE INDEX regulatory_chunks_search_vector_idx
    ON regulatory_chunks USING GIN (search_vector);
-- Hybrid retrieval: metadata filters (jurisdiction, authority, version, dates).
CREATE INDEX regulatory_chunks_metadata_idx
    ON regulatory_chunks USING GIN (metadata jsonb_path_ops);
-- Common equality filter expressed directly in the JSONB index.
CREATE INDEX regulatory_chunks_metadata_jurisdiction_idx
    ON regulatory_chunks ((metadata ->> 'jurisdiction'))
    WHERE metadata ? 'jurisdiction';
CREATE INDEX regulatory_chunks_metadata_authority_idx
    ON regulatory_chunks ((metadata ->> 'authority'))
    WHERE metadata ? 'authority';

-- 17.13 Audit -----------------------------------------------------------------
CREATE INDEX audit_logs_user_id_idx     ON audit_logs (user_id);
CREATE INDEX audit_logs_entity_type_idx ON audit_logs (entity_type);
CREATE INDEX audit_logs_entity_id_idx   ON audit_logs (entity_id);
CREATE INDEX audit_logs_created_at_idx  ON audit_logs (created_at DESC);
-- Point lookups always filter entity + id together.
CREATE INDEX audit_logs_entity_ref_idx  ON audit_logs (entity_type, entity_id);

-- 17.14 Sessions ---------------------------------------------------------------
CREATE INDEX sessions_user_id_idx    ON sessions (user_id);
-- Periodic sweep for expired rows.
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);
CREATE INDEX sessions_active_idx
    ON sessions (user_id) WHERE revoked_at IS NULL;

-- =============================================================================
-- 18. VIEWS  (API read models -- this is where joins replace denormalisation)
-- =============================================================================
-- Every view maps 1:1 onto a documented frontend response object. The FastAPI
-- serializers should read these and nothing else, so no display value can drift
-- from its source table.

-- --- 18.1 Product (GET /api/v1/products, /api/v1/products/{id}) ---------------
-- Supplies status, stages (via v_product_workflow), risks and all four counts.
-- risks/finding_count consider ONLY the current analysis.
CREATE VIEW v_product_stats AS
SELECT
    p.id,
    p.name,
    p.sku,
    p.category,
    p.target_market,
    p.description,
    p.status,
    p.last_analysis_at,
    p.created_at,
    p.updated_at,
    (SELECT count(*) FROM claims c
      WHERE c.product_id = p.id)                       AS claim_count,
    (SELECT count(*) FROM documents d
      WHERE d.product_id = p.id)                       AS document_count,
    (SELECT count(*) FROM product_ingredients pi
      WHERE pi.product_id = p.id AND pi.is_active)     AS ingredient_count,
    -- Findings are scoped to the CURRENT analysis, so re-running a product
    -- replaces the finding set instead of accumulating duplicates.
    (SELECT count(*) FROM findings f
      JOIN analyses a ON a.id = f.analysis_id
      WHERE f.product_id = p.id AND a.is_current)     AS finding_count,
    (SELECT count(*) FROM findings f
      JOIN analyses a ON a.id = f.analysis_id
      WHERE f.product_id = p.id AND a.is_current
        AND f.severity = 'HIGH' AND f.status <> 'RESOLVED')   AS risk_high,
    (SELECT count(*) FROM findings f
      JOIN analyses a ON a.id = f.analysis_id
      WHERE f.product_id = p.id AND a.is_current
        AND f.severity = 'MEDIUM' AND f.status <> 'RESOLVED') AS risk_medium,
    (SELECT count(*) FROM findings f
      JOIN analyses a ON a.id = f.analysis_id
      WHERE f.product_id = p.id AND a.is_current
        AND f.severity = 'LOW' AND f.status <> 'RESOLVED')    AS risk_low
FROM products p;

COMMENT ON VIEW v_product_stats IS
  'Product read model. Emits claim_count, document_count, ingredient_count,
   finding_count and risk_high/medium/low as computed columns. The frontend maps
   these to claimCount, documentCount, ingredientCount, findingCount and risks.';

-- --- 18.2 Workflow (nine ordered stages) -------------------------------------
CREATE VIEW v_product_workflow AS
SELECT
    s.product_id,
    s.stage_key,
    s.label,
    s.state,
    s.completed_at,
    w.position
FROM product_workflow_stages s
JOIN workflow_stage_definitions w ON w.stage_key = s.stage_key;

COMMENT ON VIEW v_product_workflow IS
  'The nine workflow stages in the exact order the frontend contract requires.
   Query per product ordered by position: always nine rows for a valid product.';

-- --- 18.3 Product ingredients ------------------------------------------------
CREATE VIEW v_product_ingredient_list AS
SELECT
    pi.id,
    pi.product_id,
    p.name                                   AS product_name,
    i.name,
    i.cas_number,
    pi.amount_per_serving,
    pi.amount_unit,
    pi.is_active,
    pi.status,
    pi.risk_level,
    pi.status_note,
    pi.evaluated_at
FROM product_ingredients pi
JOIN products p    ON p.id = pi.product_id
JOIN ingredients i ON i.id = pi.ingredient_id;

COMMENT ON VIEW v_product_ingredient_list IS
  'Direct shape of the frontend ProductIngredient object, including productName
   and the catalogue ingredient name/cas_number resolved by join.';

-- --- 18.4 Claims -------------------------------------------------------------
CREATE VIEW v_claim_list AS
SELECT
    c.id,
    c.product_id,
    p.name                                   AS product_name,
    c.text,
    c.claim_type,
    -- target_market is derived from the parent product, never stored on claims.
    p.target_market,
    c.status,
    c.risk_level,
    c.disclaimer,
    c.status_note,
    c.last_reviewed_at,
    (SELECT count(*) FROM findings f
       JOIN evidence e ON e.finding_id = f.id
      WHERE f.claim_id = c.id)                AS evidence_count
FROM claims c
JOIN products p ON p.id = c.product_id;

COMMENT ON VIEW v_claim_list IS
  'Direct shape of the frontend Claim object. evidence_count is computed through
   findings.claim_id -> evidence, so it can never disagree with the evidence table.';

-- --- 18.5 Documents ----------------------------------------------------------
CREATE VIEW v_document_list AS
SELECT
    d.id,
    d.product_id,
    p.name                                   AS product_name,
    d.file_name,
    d.document_type,
    d.size_bytes,
    d.status,
    d.extraction_status,
    d.failure_reason,
    d.notes,
    d.uploaded_at
FROM documents d
LEFT JOIN products p ON p.id = d.product_id;

COMMENT ON VIEW v_document_list IS
  'Direct shape of the frontend VaultDocument object. product_id is nullable, so
   the join is a LEFT JOIN to keep unfiled documents visible.';

-- --- 18.6 Findings -----------------------------------------------------------
CREATE VIEW v_finding_list AS
SELECT
    f.id,
    f.analysis_id,
    f.product_id,
    p.name                                   AS product_name,
    f.claim_id,
    f.title,
    f.summary,
    f.severity,
    f.status,
    f.category,
    f.statutory_reference,
    f.corrective_action,
    f.detected_at,
    a.is_current
FROM findings f
JOIN products p ON p.id = f.product_id
JOIN analyses a ON a.id = f.analysis_id;

COMMENT ON VIEW v_finding_list IS
  'Direct shape of the frontend Finding object. is_current lets the API return
   historical findings when asked and current findings by default.';

-- --- 18.7 Evidence (full citation) -------------------------------------------
CREATE VIEW v_evidence_citation AS
SELECT
    e.id,
    e.finding_id,
    e.status,
    e.excerpt,
    e.created_at,
    -- source
    s.id                                        AS source_id,
    s.authority,
    s.title                                     AS source_title,
    s.jurisdiction,
    s.source_url,
    s.source_type,
    -- document
    rd.id                                       AS regulatory_document_id,
    COALESCE(rd.title, s.document_title)        AS document_title,
    rd.document_version                         AS version,
    rd.effective_date,
    -- section
    rs.id                                       AS section_id,
    rs.section_number,
    rs.title                                    AS section_title,
    -- chunk
    ch.id                                       AS regulatory_chunk_id,
    ch.chunk_index,
    COALESCE(ch.page_number, rs.page_start)     AS page
FROM evidence e
JOIN regulatory_sources s
  ON s.id = e.source_id
LEFT JOIN regulatory_chunks ch
  ON ch.id = e.regulatory_chunk_id
LEFT JOIN regulatory_sections rs
  ON rs.id = ch.section_id
LEFT JOIN regulatory_documents rd
  ON rd.id = rs.regulatory_document_id;

COMMENT ON VIEW v_evidence_citation IS
  'Direct shape of the frontend Evidence object. Every citation field is resolved
   by join; none is duplicated in the evidence table. COALESCE fallbacks cover
   evidence that has a source but no chunk pointer yet.';

-- --- 18.8 Review tasks -------------------------------------------------------
CREATE VIEW v_review_task_list AS
SELECT
    rt.id,
    rt.finding_id,
    rt.product_id,
    p.name                                   AS product_name,
    f.title                                  AS title,
    f.severity                               AS severity,
    rt.status,
    rt.assignee_id,
    u.display_name                           AS assignee_name,
    rt.requested_at,
    rt.decided_at,
    rt.decision_note
FROM review_tasks rt
JOIN products p ON p.id = rt.product_id
JOIN findings f ON f.id = rt.finding_id
LEFT JOIN users u ON u.id = rt.assignee_id;

COMMENT ON VIEW v_review_task_list IS
  'Direct shape of the frontend ReviewTask object. title and severity come from the
   finding, assignee_name from users -- none are duplicated. LEFT JOIN on users so
   an unassigned task is still returned.';

-- --- 18.9 Compliance items ---------------------------------------------------
CREATE VIEW v_compliance_item_list AS
SELECT
    ci.id,
    ci.product_id,
    ci.analysis_id,
    p.name                                   AS product_name,
    ci.label,
    ci.note,
    ci.passed,
    ci.category
FROM compliance_items ci
JOIN products p ON p.id = ci.product_id;

COMMENT ON VIEW v_compliance_item_list IS
  'Direct shape of the frontend ComplianceItem object. passed is passed through
   unchanged, preserving the TRUE / FALSE / NULL tri-state.';

-- --- 18.10 Reports -----------------------------------------------------------
CREATE VIEW v_report_list AS
SELECT
    r.id,
    r.product_id,
    p.name                                   AS product_name,
    r.title,
    r.status,
    r.storage_key,
    r.generated_at,
    r.failure_reason
FROM reports r
JOIN products p ON p.id = r.product_id;

COMMENT ON VIEW v_report_list IS
  'Direct shape of the frontend ComplianceReport object, minus downloadUrl which is
   derived per request from storage_key (presigned URL) and never persisted.';

-- --- 18.11 Statutory sources (with citationCount) ----------------------------
CREATE VIEW v_regulatory_source_list AS
SELECT
    s.id,
    s.authority,
    s.title,
    s.document_title,
    s.source_type,
    s.jurisdiction,
    s.version,
    s.effective_date,
    s.last_indexed_at,
    s.source_url,
    (SELECT count(*) FROM evidence e
      WHERE e.source_id = s.id)               AS citation_count
FROM regulatory_sources s;

COMMENT ON VIEW v_regulatory_source_list IS
  'Direct shape of the frontend StatutorySource object. citation_count is computed
   from evidence so it can never disagree with actual citations.';

-- --- 18.12 Dashboard summary (flat, single row) ------------------------------
-- GET /api/v1/dashboard/summary must be a FLAT object. readiness_ready,
-- readiness_review_required and readiness_missing_information are guaranteed to
-- sum to product_count by construction (every product falls into exactly one
-- bucket via the CASE, with ELSE covering the remainder).
CREATE VIEW v_dashboard_summary AS
WITH current_findings AS (
    SELECT f.severity, f.status
    FROM findings f
    JOIN analyses a ON a.id = f.analysis_id
    WHERE a.is_current
),
product_state AS (
    SELECT
        p.id,
        p.status,
        (SELECT count(*) FROM documents d
          WHERE d.product_id = p.id)                              AS document_count,
        (SELECT count(*) FROM product_ingredients pi
          WHERE pi.product_id = p.id AND pi.is_active)            AS ingredient_count,
        EXISTS (SELECT 1 FROM analyses a2
                 WHERE a2.product_id = p.id
                   AND a2.is_current
                   AND a2.status = 'COMPLETED')                  AS analysis_complete,
        EXISTS (SELECT 1 FROM findings f
                 JOIN analyses a3 ON a3.id = f.analysis_id
                 WHERE f.product_id = p.id
                   AND a3.is_current
                   AND f.severity = 'HIGH'
                   AND f.status <> 'RESOLVED')                   AS has_open_high_risk,
        EXISTS (SELECT 1 FROM review_tasks rt
                 WHERE rt.product_id = p.id
                   AND rt.status IN ('PENDING','IN_REVIEW'))      AS has_open_review
    FROM products p
),
bucketed AS (
    SELECT
        ps.*,
        CASE
            WHEN ps.document_count = 0
              OR ps.ingredient_count = 0
              OR NOT ps.analysis_complete
                THEN 'missing_information'
            WHEN ps.has_open_high_risk
              OR ps.has_open_review
              OR ps.status IN ('REVIEW_REQUIRED','NEEDS_ATTENTION')
                THEN 'review_required'
            ELSE 'ready'
        END AS bucket
    FROM product_state ps
)
SELECT
    (SELECT count(*) FROM products)                                       AS product_count,
    (SELECT count(*) FROM analyses
      WHERE status IN ('QUEUED','PROCESSING'))                           AS active_analysis_count,
    (SELECT count(*) FROM current_findings
      WHERE severity = 'HIGH' AND status <> 'RESOLVED')                   AS high_risk_count,
    (SELECT count(*) FROM review_tasks
      WHERE status IN ('PENDING','IN_REVIEW'))                           AS pending_review_count,
    count(*) FILTER (WHERE bucket = 'ready')                              AS readiness_ready,
    count(*) FILTER (WHERE bucket = 'review_required')                    AS readiness_review_required,
    count(*) FILTER (WHERE bucket = 'missing_information')                AS readiness_missing_information,
    -- Ready-to-serve nested object, matching DashboardSummary.readiness.
    jsonb_build_object(
        'ready',               count(*) FILTER (WHERE bucket = 'ready'),
        'reviewRequired',      count(*) FILTER (WHERE bucket = 'review_required'),
        'missingInformation',  count(*) FILTER (WHERE bucket = 'missing_information')
    )                                                                     AS readiness
FROM bucketed;

COMMENT ON VIEW v_dashboard_summary IS
  'Single flat row backing GET /api/v1/dashboard/summary. readiness is exposed both
   as flat columns and as a jsonb object matching the contract. The three readiness
   buckets are mutually exclusive and exhaustive, so they always sum to
   product_count.';

-- =============================================================================
-- 19. COLUMN COMMENTS FOR THE AUDIT-RELEVANT ENUMS
-- =============================================================================
COMMENT ON COLUMN products.status IS
  'DRAFT | NOT_STARTED | IN_PROGRESS | REVIEW_REQUIRED | NEEDS_ATTENTION | COMPLETED';
COMMENT ON COLUMN findings.severity IS
  'HIGH | MEDIUM | LOW. There is deliberately no CRITICAL value in the frontend contract.';
COMMENT ON COLUMN compliance_items.passed IS
  'TRUE | FALSE | NULL, where NULL means not yet determined. Never coerce NULL to FALSE.';
COMMENT ON COLUMN documents.status IS
  'UPLOADED | PROCESSING | PROCESSED | FAILED. UPLOADING is transient and never persisted.';
COMMENT ON COLUMN analyses.progress IS
  'Integer 0-100, never a fraction.';

COMMIT;

-- =============================================================================
-- End of 001_initial_schema.sql
-- Next: 002_add_embedding.sql (requires a decided embedding model + dimension)
-- =============================================================================
