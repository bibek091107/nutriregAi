-- =============================================================================
-- NutriReg AI  ::  seed_reference_data.sql
-- =============================================================================
-- Run immediately AFTER 001_initial_schema.sql and BEFORE the first product.
--
-- Contains ONLY static reference data:
--   * the nine workflow stage definitions (required by the product bootstrap
--     trigger and the nine-stage constraint trigger)
--   * the internal user role vocabulary (documentation only; no user is created)
--
-- It deliberately creates NO users, products, ingredients, claims, documents,
-- findings, analyses, evidence, reviews, reports or audit rows. Those are
-- produced by the application. A seeded dossier would be indistinguishable from
-- real regulatory data and is therefore a correctness hazard.
--
-- Idempotent: safe to re-run.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Workflow stage definitions (internal reference data, not exposed via API)
-- -----------------------------------------------------------------------------
INSERT INTO workflow_stage_definitions (stage_key, position, label, activated_when)
VALUES
    ('product_setup',         1, 'Product Setup',        'Created with the product dossier'),
    ('ingredients',           2, 'Ingredients',          'Ingredient register extracted from documents'),
    ('claims',                3, 'Claims',               'Claim statements registered for evaluation'),
    ('documents',             4, 'Documents',            'Activated when the first document is attached'),
    ('regulatory_analysis',   5, 'Regulatory Analysis',  'Activated when an analysis run is started'),
    ('risk_review',           6, 'Risk Review',          'Activated when an analysis completes'),
    ('compliance_checklist',  7, 'Compliance Checklist', 'Activated when the analysis produces checklist items'),
    ('human_review',          8, 'Human Review',         'Activated when findings are routed to reviewers'),
    ('report',                9, 'Report',               'Activated when an audit report is requested')
ON CONFLICT (stage_key) DO UPDATE
   SET position       = EXCLUDED.position,
       label          = EXCLUDED.label,
       activated_when = EXCLUDED.activated_when;

-- -----------------------------------------------------------------------------
-- 2. Guard: the constraint trigger requires exactly nine definitions
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    n INTEGER;
BEGIN
    SELECT count(*) INTO n FROM workflow_stage_definitions;
    IF n <> 9 THEN
        RAISE EXCEPTION 'expected 9 workflow stage definitions, found %', n;
    END IF;
    RAISE NOTICE 'workflow_stage_definitions: 9 rows ready';
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. User role vocabulary (reference only -- creates no user)
-- -----------------------------------------------------------------------------
-- users.role is constrained to these tokens. The frontend treats role as an
-- opaque string (SessionUser.role), so this vocabulary is internal and may be
-- extended without breaking the client.
COMMENT ON COLUMN users.role IS
  'Internal application role: ADMIN | ANALYST | REVIEWER | VIEWER, or NULL.
   The frontend contract treats role as an opaque string.';

COMMIT;

-- =============================================================================
-- Verification (read-only)
-- =============================================================================
-- SELECT position, stage_key, label FROM workflow_stage_definitions ORDER BY position;
-- SELECT count(*) AS stage_definitions FROM workflow_stage_definitions;  -- expect 9
