-- =============================================================================
-- NutriReg AI  ::  validation_queries.sql
-- =============================================================================
-- Read-only diagnostic queries that verify the schema honours the frontend
-- contract. Safe to run on any environment at any time: no INSERT, no UPDATE,
-- no DDL, no locks beyond an ACCESS SHARE.
--
-- These complement db/contract_test.sql, which proves constraints FIRE by
-- creating throwaway data and rolling back. The queries below verify the
-- steady-state invariants on whatever data actually exists.
--
--   psql -v ON_ERROR_STOP=1 -f 001_initial_schema.sql
--   psql -v ON_ERROR_STOP=1 -f seed_reference_data.sql
--   psql                  -f validation_queries.sql
--
-- Every query prints a check name, the observed value, and the expected value.
-- An empty result set for V1-V2 means the bootstrap is not installed.
-- =============================================================================

\set ON_ERROR_STOP on
\pset pager off
\pset format aligned

\echo ''
\echo '=========================================================================='
\echo ' NutriReg AI -- schema validation'
\echo '=========================================================================='

-- =============================================================================
-- V1. Exactly 21 required domain tables exist
-- =============================================================================
\echo ''
\echo '--- V1. Required domain tables (expect 21 rows, all present) ---------'
SELECT c.relname AS table_name,
       CASE WHEN c.relname = ANY (ARRAY[
              'products','ingredients','product_ingredients','claims',
              'documents','document_extractions','analyses','findings',
              'evidence','compliance_items','product_workflow_stages',
              'review_tasks','review_decisions','reports','audit_logs',
              'users','sessions','regulatory_sources','regulatory_documents',
              'regulatory_sections','regulatory_chunks'])
           THEN 'present' ELSE 'UNEXPECTED' END AS status
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r'
 ORDER BY c.relname;

\echo 'EXPECTED: 22 tables = 21 domain tables + 1 internal (workflow_stage_definitions)'

-- =============================================================================
-- V2. Workflow stage definitions: exactly 9, contiguous positions
-- =============================================================================
\echo ''
\echo '--- V2. Workflow stage definitions (expect 9, positions 1..9) -------'
SELECT position, stage_key, label
  FROM workflow_stage_definitions
 ORDER BY position;

SELECT count(*)                                                AS stage_count,
       count(DISTINCT position)                                AS distinct_positions,
       min(position)                                           AS min_position,
       max(position)                                           AS max_position,
       CASE WHEN count(*) = 9
             AND min(position) = 1 AND max(position) = 9
             AND count(DISTINCT position) = 9
            THEN 'OK' ELSE 'BROKEN' END                       AS verdict
  FROM workflow_stage_definitions;

-- =============================================================================
-- V3. Every product has exactly 9 workflow stages
-- =============================================================================
\echo ''
\echo '--- V3. Products without exactly 9 stages (expect 0 rows) ----------'
-- Ordering comes from workflow_stage_definitions, never from a stored
-- per-product ordinal: the reference table is the single source of truth.
SELECT p.id, p.name,
       count(s.*)                                                       AS stage_rows,
       string_agg(s.stage_key, ',' ORDER BY d.position)                 AS stages
  FROM products p
  LEFT JOIN product_workflow_stages s ON s.product_id = p.id
  LEFT JOIN workflow_stage_definitions d ON d.stage_key = s.stage_key
 GROUP BY p.id, p.name
HAVING count(s.*) <> 9
 ORDER BY p.name;

\echo 'EXPECTED: 0 rows'

-- =============================================================================
-- V4. Exactly one current analysis per product
-- =============================================================================
\echo ''
\echo '--- V4. Products without exactly 1 current analysis (expect 0) ----'
SELECT p.id, p.name, count(a.*) FILTER (WHERE a.is_current) AS current_analyses
  FROM products p
  LEFT JOIN analyses a ON a.product_id = p.id
 GROUP BY p.id, p.name
HAVING count(a.*) FILTER (WHERE a.is_current) <> 1
 ORDER BY p.name;

\echo 'EXPECTED: 0 rows'

-- =============================================================================
-- V5. No duplicate rows in the current-finding read model
--     (a join fan-out would inflate findingCount / riskHigh)
-- =============================================================================
\echo ''
\echo '--- V5. Duplicate rows from v_product_stats join (expect 0) --------'
SELECT id, finding_count
  FROM v_product_stats
 GROUP BY id, finding_count
HAVING count(*) > 1;

\echo 'EXPECTED: 0 rows (any row here means a view join is fanning out)'

-- =============================================================================
-- V6. Stored counters do not exist (nothing duplicated)
-- =============================================================================
\echo ''
\echo '--- V6. Forbidden denormalised columns (expect 0 rows) ------------'
-- Each (table, column) pair below is display data that is DERIVED by a join or
-- aggregation and must never be stored. Entity attributes that happen to share
-- a name (products.status, findings.severity, claims.risk_level) are legitimate
-- and deliberately absent from this list.
SELECT * FROM (VALUES
    ('products',                 'risk_level'),        -- derived: current findings
    ('products',                 'risk_high'),
    ('products',                 'risk_medium'),
    ('products',                 'risk_low'),
    ('products',                 'finding_count'),
    ('products',                 'claim_count'),
    ('products',                 'document_count'),
    ('products',                 'ingredient_count'),
    ('products',                 'analysis_status'),    -- derived: current analysis
    ('products',                 'readiness'),
    ('products',                 'readiness_status'),
    ('claims',                   'target_market'),      -- derived: parent product
    ('claims',                   'evidence_count'),
    ('claims',                   'product_name'),
    ('findings',                 'product_name'),
    ('findings',                 'product_category'),
    ('findings',                 'target_market'),
    ('evidence',                 'source_title'),
    ('evidence',                 'source_url'),
    ('evidence',                 'citation'),
    ('evidence',                 'authority'),
    ('evidence',                 'jurisdiction'),
    ('evidence',                 'version'),
    ('review_tasks',             'title'),
    ('review_tasks',             'severity'),
    ('review_tasks',             'product_name'),
    ('review_tasks',             'assignee_name'),
    ('review_tasks',             'decision'),           -- derived: review_decisions
    ('regulatory_documents',     'authority'),
    ('regulatory_documents',     'source_url'),
    ('regulatory_sections',      'authority'),
    ('regulatory_sections',      'source_url'),
    ('regulatory_chunks',        'authority'),
    ('regulatory_chunks',        'source_url'),
    ('regulatory_chunks',        'jurisdiction'),
    ('regulatory_chunks',        'version'),
    ('product_workflow_stages',  'position'),           -- canonical order is in the reference table
    ('product_workflow_stages',  'product_name'),
    ('product_ingredients',      'product_name')
) AS forbidden(table_name, column_name)
 WHERE EXISTS (
       SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name  = forbidden.table_name
          AND c.column_name = forbidden.column_name)
 ORDER BY table_name, column_name;

\echo 'EXPECTED: 0 rows. Any hit means display data has been duplicated into storage'
\echo '          and can now drift from its source of truth.'

-- =============================================================================
-- V7. findingCount == open high-risk count, straight from the source tables
-- =============================================================================
\echo ''
\echo '--- V7. v_product_stats risk counts vs live recomputation ----------'
SELECT s.id, s.name,
       s.finding_count                                       AS view_finding_count,
       (SELECT count(*) FROM findings f
          JOIN analyses a ON a.id = f.analysis_id
         WHERE f.product_id = s.id AND a.is_current)         AS live_finding_count,
       s.risk_high                                           AS view_high,
       (SELECT count(*) FROM findings f
          JOIN analyses a ON a.id = f.analysis_id
         WHERE f.product_id = s.id AND a.is_current
           AND f.severity = 'HIGH' AND f.status <> 'RESOLVED') AS live_high
  FROM v_product_stats s
 WHERE s.finding_count <> (SELECT count(*) FROM findings f
                             JOIN analyses a ON a.id = f.analysis_id
                            WHERE f.product_id = s.id AND a.is_current)
    OR s.risk_high <> (SELECT count(*) FROM findings f
                         JOIN analyses a ON a.id = f.analysis_id
                        WHERE f.product_id = s.id AND a.is_current
                          AND f.severity = 'HIGH' AND f.status <> 'RESOLVED')
 ORDER BY s.name;

\echo 'EXPECTED: 0 rows (view counts are computed, not stored)'

-- =============================================================================
-- V8. Claim target_market is derived from the parent product
-- =============================================================================
\echo ''
\echo '--- V8. claims.target_market must not be a stored column ----------'
SELECT table_name, column_name
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'claims'
   AND column_name = 'target_market';

\echo 'EXPECTED: 0 rows. The value comes from v_claim_list -> products.'

SELECT c.id, c.text, c.target_market, p.name AS product_name
  FROM v_claim_list c
  JOIN products p ON p.id = c.product_id
 ORDER BY p.name, c.text
 LIMIT 20;

-- =============================================================================
-- V9. Citation chain is complete and traceable
-- =============================================================================
\echo ''
\echo '--- V9. Evidence with an unresolvable citation (expect 0 rows) -----'
SELECT e.id, e.finding_id, e.regulatory_chunk_id
  FROM evidence e
 WHERE e.regulatory_chunk_id IS NOT NULL
   AND NOT EXISTS (
        SELECT 1 FROM regulatory_chunks ch
          JOIN regulatory_sections sec ON sec.id = ch.section_id
          JOIN regulatory_documents doc ON doc.id = sec.regulatory_document_id
          JOIN regulatory_sources src ON src.id = doc.source_id
        WHERE ch.id = e.regulatory_chunk_id);

\echo 'EXPECTED: 0 rows (every cited chunk resolves to authority + version + URL)'

\echo ''
\echo '--- V9b. Regulatory sources with a missing version ---------------'
SELECT id, authority, title, source_url
  FROM regulatory_sources
 WHERE version IS NULL OR btrim(version) = ''
 ORDER BY authority;

\echo 'EXPECTED: 0 rows once sources are ingested (version is required)'

-- =============================================================================
-- V10. Tri-state compliance is preserved, never coerced
-- =============================================================================
\echo ''
\echo '--- V10. Compliance distribution (TRUE / FALSE / NULL buckets) ----'
SELECT
    count(*) FILTER (WHERE passed  IS TRUE)  AS passed,
    count(*) FILTER (WHERE passed  IS FALSE) AS failed,
    count(*) FILTER (WHERE passed  IS NULL)  AS not_yet_determined,
    CASE WHEN count(*) FILTER (WHERE passed IS FALSE AND note IS NULL) = 0
         THEN 'OK' ELSE 'BROKEN' END          AS failed_without_note_check
  FROM compliance_items;

\echo 'EXPECTED: not_yet_determined is preserved as NULL, and every FALSE has a note.'

-- =============================================================================
-- V11. Review task / decision consistency
-- =============================================================================
\echo ''
\echo '--- V11. Review tasks whose state contradicts their decisions ------'
SELECT rt.id, rt.status AS task_status,
       d.decision, f.status AS finding_status
  FROM review_tasks rt
  LEFT JOIN review_decisions d
         ON d.review_task_id = rt.id
  JOIN findings f ON f.id = rt.finding_id
 WHERE (rt.status IN ('APPROVED','REJECTED') AND d.decision IS NULL)
    OR (rt.status = 'PENDING'   AND d.decision IS NOT NULL)
    OR (rt.status = 'IN_REVIEW' AND d.decision IS NOT NULL)
    OR (rt.decided_at IS NULL     AND rt.status IN ('APPROVED','REJECTED'))
    OR (rt.decided_at IS NOT NULL AND rt.status IN ('PENDING','IN_REVIEW'))
 ORDER BY rt.id;

\echo 'EXPECTED: 0 rows (a decided task always has a decision row)'

-- =============================================================================
-- V12. Audit integrity: no orphaned or mutated history
-- =============================================================================
\echo ''
\echo '--- V12. Append-only ledgers (read-only integrity snapshot) --------'
SELECT 'audit_logs'       AS ledger, count(*) AS rows, max(created_at) AS last_event FROM audit_logs
UNION ALL
SELECT 'review_decisions' AS ledger, count(*) AS rows, max(created_at) AS last_event FROM review_decisions;

\echo 'EXPECTED: monotonically increasing counts; review_decisions never decrease.'

-- =============================================================================
-- V13. Dashboard summary invariants
-- =============================================================================
\echo ''
\echo '--- V13. Dashboard summary invariants -----------------------------'
SELECT product_count,
       active_analysis_count,
       high_risk_count,
       pending_review_count,
       readiness_ready,
       readiness_review_required,
       readiness_missing_information,
       (readiness_ready + readiness_review_required + readiness_missing_information)
                                                         AS readiness_sum,
       CASE WHEN readiness_ready + readiness_review_required
                 + readiness_missing_information = product_count
            THEN 'OK' ELSE 'BROKEN' END      AS buckets_match_product_count,
       CASE WHEN (readiness ->> 'ready')::BIGINT = readiness_ready
             AND (readiness ->> 'reviewRequired')::BIGINT = readiness_review_required
             AND (readiness ->> 'missingInformation')::BIGINT = readiness_missing_information
            THEN 'OK' ELSE 'BROKEN' END      AS jsonb_matches_flat_columns
  FROM v_dashboard_summary;

\echo 'EXPECTED: 1 row, buckets_match_product_count = OK, jsonb_matches_flat_columns = OK'

-- =============================================================================
-- Appendix: index inventory
-- =============================================================================
\echo ''
\echo '--- Appendix A. Index inventory -----------------------------------'
SELECT tablename,
       indexname,
       indexdef
  FROM pg_indexes
 WHERE schemaname = 'public'
 ORDER BY tablename, indexname;

\echo ''
\echo '--- Appendix B. Optional vector index (002) -----------------------'
SELECT c.relname AS index_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relkind = 'i'
   AND c.relname LIKE '%embedding%';

\echo '(empty is expected until 002_add_embedding.sql has been applied)'
