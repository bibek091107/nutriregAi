-- =============================================================================
-- NutriReg AI  ::  contract_test.sql
-- =============================================================================
-- Behavioural verification of the schema against the frontend contract.
-- This script is meant to be RUN, then rolled back: it creates throwaway rows
-- to prove constraints fire, asserts behaviour, and leaves the database empty.
--
--   psql -v ON_ERROR_STOP=1 -f 001_initial_schema.sql
--   psql -v ON_ERROR_STOP=1 -f seed_reference_data.sql
--   psql -v ON_ERROR_STOP=1 -f contract_test.sql     -- rolls back at the end
--
-- Every assertion prints PASS or FAIL. A FAIL means the schema does not
-- guarantee what the frontend relies on.
-- =============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;

-- Reusable assertion harness -------------------------------------------------
CREATE OR REPLACE FUNCTION assert_true(label TEXT, condition BOOLEAN)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF condition THEN
        RAISE NOTICE 'PASS  %', label;
    ELSE
        RAISE WARNING 'FAIL  %', label;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION assert_rejects(label TEXT, stmt TEXT)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE stmt;
        RAISE WARNING 'FAIL  % (statement was accepted but must be rejected)', label;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'PASS  %  [%]', label, left(SQLERRM, 70);
    END;
END;
$$;

-- =============================================================================
-- 1. Product bootstrap: nine stages + a NOT_STARTED analysis
-- =============================================================================
INSERT INTO products (name, category, target_market, status)
VALUES ('Test Whey Isolate', 'SPORTS_NUTRITION', 'INDIA_FSSAI', 'DRAFT');

DO $$
DECLARE
    p_id      UUID;
    n_stages  INTEGER;
    n_setup   INTEGER;
    n_analyse INTEGER;
    a_status  TEXT;
    a_prog    SMALLINT;
BEGIN
    SELECT id INTO p_id FROM products WHERE name = 'Test Whey Isolate';

    SELECT count(*) INTO n_stages FROM product_workflow_stages WHERE product_id = p_id;
    SELECT count(*) INTO n_setup  FROM product_workflow_stages
     WHERE product_id = p_id AND stage_key = 'product_setup' AND state = 'COMPLETED';
    SELECT count(*) INTO n_analyse FROM analyses
     WHERE product_id = p_id AND is_current;

    SELECT status, progress INTO a_status, a_prog FROM analyses
     WHERE product_id = p_id AND is_current;

    PERFORM assert_true('product bootstrap creates exactly 9 workflow stages', n_stages = 9);
    PERFORM assert_true('product_setup is COMPLETED on creation',             n_setup = 1);
    PERFORM assert_true('exactly one current analysis is seeded',             n_analyse = 1);
    PERFORM assert_true('seeded analysis is NOT_STARTED at progress 0',
                a_status = 'NOT_STARTED' AND a_prog = 0);
END;
$$;

-- The 404 trap: GET /api/v1/products/{id}/analysis must never 404.
DO $$
DECLARE
    p_id UUID; got TEXT;
BEGIN
    SELECT id INTO p_id FROM products WHERE name = 'Test Whey Isolate';
    SELECT status INTO got FROM analyses WHERE product_id = p_id AND is_current;
    PERFORM assert_true('GET analysis can answer 200 for a never-analysed product',
                got IS NOT NULL);
END;
$$;

-- Ordering the frontend depends on
DO $$
DECLARE
    ordered TEXT;
BEGIN
    SELECT string_agg(stage_key, ',' ORDER BY position) INTO ordered
    FROM v_product_workflow
    WHERE product_id = (SELECT id FROM products WHERE name = 'Test Whey Isolate');
    PERFORM assert_true('workflow stage order matches the contract',
        ordered = 'product_setup,ingredients,claims,documents,regulatory_analysis,'
               || 'risk_review,compliance_checklist,human_review,report');
END;
$$;

-- =============================================================================
-- 2. Enum / CHECK constraints
-- =============================================================================
DO $$
DECLARE
    p_id UUID;
    ok   UUID := gen_random_uuid();
BEGIN
    SELECT id INTO p_id FROM products WHERE name = 'Test Whey Isolate';

    PERFORM set_config('nutrireg.test_product', p_id::text, true);

    -- Bad enum tokens must be refused.
    PERFORM assert_rejects('invalid ProductCategory rejected',
        format($q$UPDATE products SET category = 'SUPPLEMENT' WHERE id = '%s'$q$, p_id));
    PERFORM assert_rejects('invalid TargetMarket rejected',
        format($q$UPDATE products SET target_market = 'UK_FDA' WHERE id = '%s'$q$, p_id));
    PERFORM assert_rejects('invalid ProductStatus rejected',
        format($q$UPDATE products SET status = 'ARCHIVED' WHERE id = '%s'$q$, p_id));

    -- Document rules
    PERFORM assert_rejects('zero-byte document rejected',
        format($q$INSERT INTO documents (file_name, storage_key, size_bytes)
               VALUES ('empty.pdf', %L, 0)$q$, 'k-' || ok));
    PERFORM assert_rejects('document over 25 MB rejected',
        format($q$INSERT INTO documents (file_name, storage_key, size_bytes)
               VALUES ('big.pdf', %L, 26214401)$q$, 'k-big' || ok));
    PERFORM assert_rejects('UPLOADING is never persistable',
        format($q$INSERT INTO documents (file_name, storage_key, size_bytes, status)
               VALUES ('u.pdf', %L, 100, 'UPLOADING')$q$, 'k-up' || ok));
    PERFORM assert_rejects('FAILED document requires failure_reason',
        format($q$INSERT INTO documents (file_name, storage_key, size_bytes, status)
               VALUES ('f.pdf', %L, 100, 'FAILED')$q$, 'k-f' || ok));

    -- Findings: no CRITICAL severity
    PERFORM assert_rejects('CRITICAL finding severity rejected',
        format($q$INSERT INTO findings (analysis_id, product_id, title, summary, severity)
               SELECT id, '%s', 't', 's', 'CRITICAL' FROM analyses
               WHERE product_id = '%s' AND is_current$q$, p_id, p_id));
    -- Findings: required fields
    PERFORM assert_rejects('finding with NULL severity rejected',
        format($q$INSERT INTO findings (analysis_id, product_id, title, summary)
               SELECT id, '%s', 't', 's' FROM analyses
               WHERE product_id = '%s' AND is_current$q$, p_id, p_id));
    PERFORM assert_rejects('finding with empty summary rejected',
        format($q$INSERT INTO findings (analysis_id, product_id, title, summary, severity)
               SELECT id, '%s', 't', '   ', 'LOW' FROM analyses
               WHERE product_id = '%s' AND is_current$q$, p_id, p_id));

    -- Analyses
    PERFORM assert_rejects('analysis progress above 100 rejected',
        format($q$UPDATE analyses SET progress = 101
               WHERE product_id = '%s' AND is_current$q$, p_id));
    PERFORM assert_rejects('COMPLETED analysis without completed_at rejected',
        format($q$UPDATE analyses SET status = 'COMPLETED', progress = 100
               WHERE product_id = '%s' AND is_current$q$, p_id));
    PERFORM assert_rejects('FAILED analysis without failure_reason rejected',
        format($q$UPDATE analyses SET status = 'FAILED', started_at = now(),
               completed_at = now() WHERE product_id = '%s' AND is_current$q$, p_id));
    PERFORM assert_rejects('second current analysis per product rejected',
        format($q$INSERT INTO analyses (product_id, status, is_current)
               VALUES ('%s', 'NOT_STARTED', TRUE)$q$, p_id));

    -- Workflow stage state
    PERFORM assert_rejects('unknown stage_key rejected',
        format($q$INSERT INTO product_workflow_stages (product_id, stage_key, label, state)
               VALUES ('%s', 'marketing_review', 'Marketing', 'PENDING')$q$, p_id));
    PERFORM assert_rejects('duplicate stage_key for a product rejected',
        format($q$INSERT INTO product_workflow_stages (product_id, stage_key, label, state)
               VALUES ('%s', 'claims', 'Claims', 'PENDING')$q$, p_id));
    PERFORM assert_rejects('COMPLETED stage without completed_at rejected',
        format($q$UPDATE product_workflow_stages SET state = 'COMPLETED',
               completed_at = NULL WHERE product_id = '%s' AND stage_key = 'claims'$q$, p_id));

    -- Ingredients / claims
    PERFORM assert_rejects('malformed CAS number rejected',
        format($q$INSERT INTO ingredients (name, cas_number) VALUES ('Water', 'ABC')$q$));
    PERFORM assert_rejects('invalid ClaimStatus rejected',
        format($q$INSERT INTO claims (product_id, text, status)
               VALUES ('%s', 'Builds muscle', 'VERIFIED')$q$, p_id));
    PERFORM assert_rejects('invalid ClaimType rejected',
        format($q$INSERT INTO claims (product_id, text, claim_type)
               VALUES ('%s', 'Builds muscle', 'PERFORMANCE')$q$, p_id));
    PERFORM assert_rejects('invalid RiskLevel CRITICAL rejected',
        format($q$INSERT INTO claims (product_id, text, risk_level)
               VALUES ('%s', 'Builds muscle', 'CRITICAL')$q$, p_id));

    -- Compliance items: tri-state and categories
    PERFORM assert_rejects('failed compliance item without a note rejected',
        format($q$INSERT INTO compliance_items (product_id, label, passed)
               VALUES ('%s', 'Labelling check', FALSE)$q$, p_id));
    PERFORM assert_rejects('unknown compliance category rejected',
        format($q$INSERT INTO compliance_items (product_id, label, category)
               VALUES ('%s', 'Check', 'Marketing')$q$, p_id));
END;
$$;

-- Compliance tri-state: NULL must be storable and must not be coerced to FALSE.
DO $$
DECLARE
    p_id UUID; c_pass BOOLEAN; c_total INT;
BEGIN
    SELECT id INTO p_id FROM products WHERE name = 'Test Whey Isolate';
    INSERT INTO compliance_items (product_id, label, passed, note, category) VALUES
        (p_id, 'Composition', TRUE,  NULL, 'Product Composition'),
        (p_id, 'Labelling',   FALSE, 'Missing mandatory declaration.', 'Labelling'),
        (p_id, 'Safety',      NULL,  NULL, 'Safety Documentation');
    SELECT passed INTO c_pass FROM compliance_items
     WHERE product_id = p_id AND label = 'Safety';
    PERFORM assert_true('compliance_items.passed preserves NULL (not yet determined)',
                c_pass IS NULL);
END;
$$;

-- Review task / decision rules
DO $$
DECLARE
    p_id UUID; u_id UUID; f_id UUID; rt_id UUID;
BEGIN
    SELECT id INTO p_id FROM products WHERE name = 'Test Whey Isolate';
    INSERT INTO users (display_name, email, role)
    VALUES ('Dr Test Reviewer', 'reviewer@example.org', 'REVIEWER') RETURNING id INTO u_id;

    UPDATE analyses SET status = 'COMPLETED', progress = 100,
           started_at = now(), completed_at = now()
     WHERE product_id = p_id AND is_current;

    INSERT INTO findings (analysis_id, product_id, title, summary, severity, status)
    SELECT id, p_id, 'Undeclared Ayurvedic herb', 'Kava is not permitted in India.',
           'HIGH', 'OPEN'
      FROM analyses WHERE product_id = p_id AND is_current
    RETURNING id INTO f_id;

    INSERT INTO review_tasks (finding_id, product_id, assignee_id, status)
    VALUES (f_id, p_id, u_id, 'PENDING') RETURNING id INTO rt_id;

    -- decided states need decided_at
    PERFORM assert_rejects('APPROVED review task without decided_at rejected',
        format($q$UPDATE review_tasks SET status = 'APPROVED' WHERE id = '%s'$q$, rt_id));
    -- one task per finding
    PERFORM assert_rejects('second review task for the same finding rejected',
        format($q$INSERT INTO review_tasks (finding_id, product_id)
               VALUES ('%s', '%s')$q$, f_id, p_id));
    -- invalid decision token
    PERFORM assert_rejects('invalid ReviewDecision token rejected',
        format($q$INSERT INTO review_decisions (review_task_id, reviewer_id, decision)
               VALUES ('%s', '%s', 'MAYBE')$q$, rt_id, u_id));
END;
$$;

-- =============================================================================
-- 3. Decision side effects (the mapping the backend must apply)
-- =============================================================================
DO $$
DECLARE
    rt_id UUID; u_id UUID; f_id UUID; got TEXT; fs TEXT;
BEGIN
    SELECT id, finding_id INTO rt_id, f_id FROM review_tasks
     WHERE status = 'PENDING' LIMIT 1;
    SELECT id INTO u_id FROM users WHERE email = 'reviewer@example.org';

    INSERT INTO review_decisions (review_task_id, reviewer_id, decision, note)
    VALUES (rt_id, u_id, 'REQUEST_MORE_EVIDENCE', 'Please attach the COA.');

    UPDATE review_tasks SET status = 'IN_REVIEW', decision_note = 'Please attach the COA.'
     WHERE id = rt_id;
    UPDATE findings SET status = 'IN_PROGRESS' WHERE id = f_id;

    SELECT status INTO got FROM review_tasks WHERE id = rt_id;
    SELECT status INTO fs  FROM findings  WHERE id = f_id;
    PERFORM assert_true('REQUEST_MORE_EVIDENCE maps review task -> IN_REVIEW', got = 'IN_REVIEW');
    PERFORM assert_true('REQUEST_MORE_EVIDENCE maps finding -> IN_PROGRESS',   fs  = 'IN_PROGRESS');

    PERFORM assert_rejects('review_decisions is immutable (UPDATE blocked)',
        format($q$UPDATE review_decisions SET note = 'tampered' WHERE review_task_id = '%s'$q$, rt_id));
END;
$$;

-- =============================================================================
-- 4. Derived read models (the anti-duplication guarantee)
-- =============================================================================
DO $$
DECLARE
    p_id UUID; c_count BIGINT; claim_ev BIGINT; src_cit BIGINT; v_name TEXT;
BEGIN
    SELECT id INTO p_id FROM products WHERE name = 'Test Whey Isolate';

    INSERT INTO claims (product_id, text, claim_type, status, risk_level)
    VALUES (p_id, 'Supports muscle recovery', 'HEALTH', 'PENDING_ANALYSIS', NULL);

    -- Claim.evidenceCount must come from evidence, not a stored column.
    SELECT count(*) INTO c_count FROM v_claim_list WHERE product_id = p_id;
    PERFORM assert_true('v_claim_list resolves claim rows', c_count = 1);

    SELECT target_market INTO v_name FROM v_claim_list WHERE product_id = p_id;
    PERFORM assert_true('claim target_market is derived from the parent product',
                v_name = 'INDIA_FSSAI');

    -- citationCount computed through evidence
    INSERT INTO regulatory_sources (authority, title, source_type, jurisdiction, source_url)
    VALUES ('FSSAI', 'Food Safety and Standards (Prohibition and Restrictions) Regulations',
            'REGULATION', 'INDIA', 'https://www.fssai.gov.in/example');
    SELECT citation_count INTO src_cit FROM v_regulatory_source_list LIMIT 1;
    PERFORM assert_true('citationCount starts at 0 without stored duplication', src_cit = 0);

    PERFORM assert_rejects('non-HTTPS statutory source_url rejected',
        $q$INSERT INTO regulatory_sources (authority, title, source_url)
          VALUES ('FDA', 'Some Act', 'http://insecure.example')$q$);
END;
$$;

-- Review task read model resolves title/severity/assignee by join
DO $$
DECLARE
    r RECORD; c_ok BOOLEAN;
BEGIN
    SELECT title, severity, assignee_name, product_name INTO r
    FROM v_review_task_list LIMIT 1;
    c_ok := (r.title = 'Undeclared Ayurvedic herb')
        AND (r.severity = 'HIGH')
        AND (r.assignee_name = 'Dr Test Reviewer')
        AND (r.product_name = 'Test Whey Isolate');
    PERFORM assert_true('v_review_task_list resolves title/severity/assignee/product by join', c_ok);
END;
$$;

-- =============================================================================
-- 5. Analysis supersession (re-run must not duplicate findings)
-- =============================================================================
DO $$
DECLARE
    p_id UUID; old_an UUID; new_an UUID; before_count BIGINT; after_count BIGINT;
    hist BIGINT;
BEGIN
    SELECT id INTO p_id FROM products WHERE name = 'Test Whey Isolate';
    SELECT id INTO old_an FROM analyses WHERE product_id = p_id AND is_current;

    SELECT finding_count INTO before_count FROM v_product_stats WHERE id = p_id;
    PERFORM assert_true('finding_count reflects the current analysis', before_count = 1);

    -- Re-run: old run retained as history, new run becomes current.
    UPDATE analyses SET is_current = FALSE WHERE id = old_an;
    INSERT INTO analyses (product_id, status, progress, is_current, started_at)
    VALUES (p_id, 'PROCESSING', 40, TRUE, now()) RETURNING id INTO new_an;

    INSERT INTO findings (analysis_id, product_id, title, summary, severity, status)
    VALUES (new_an, p_id, 'Missing allergen declaration', 'No nut declaration found.',
            'MEDIUM', 'OPEN');

    SELECT finding_count INTO after_count FROM v_product_stats WHERE id = p_id;
    SELECT count(*) INTO hist FROM findings WHERE product_id = p_id;

    PERFORM assert_true('re-analysis does NOT inflate findingCount (1 -> 1)', after_count = 1);
    PERFORM assert_true('previous findings remain historically identifiable', hist = 2);
END;
$$;

-- =============================================================================
-- 6. Dashboard summary (flat, single row, buckets sum to productCount)
-- =============================================================================
DO $$
DECLARE
    s RECORD; sums BIGINT;
BEGIN
    SELECT * INTO s FROM v_dashboard_summary;
    RAISE NOTICE '      dashboard: products=%, activeAnalyses=%, highRisk=%, pendingReviews=%, ready=%, reviewRequired=%, missing=%',
        s.product_count, s.active_analysis_count, s.high_risk_count,
        s.pending_review_count, s.readiness_ready, s.readiness_review_required,
        s.readiness_missing_information;

    sums := s.readiness_ready + s.readiness_review_required + s.readiness_missing_information;
    PERFORM assert_true('readiness buckets sum to productCount', sums = s.product_count);
    PERFORM assert_true('readiness jsonb matches the flat columns',
        (s.readiness ->> 'ready')::BIGINT = s.readiness_ready
    AND (s.readiness ->> 'reviewRequired')::BIGINT = s.readiness_review_required
    AND (s.readiness ->> 'missingInformation')::BIGINT = s.readiness_missing_information);
    PERFORM assert_true('pendingReviewCount counts PENDING and IN_REVIEW', s.pending_review_count = 1);
END;
$$;

-- =============================================================================
-- 7. Delete behaviour
-- =============================================================================
DO $$
DECLARE
    src_id UUID; p_id UUID; n BIGINT;
BEGIN
    SELECT id INTO p_id FROM products WHERE name = 'Test Whey Isolate';
    SELECT id INTO src_id FROM regulatory_sources LIMIT 1;

    -- Handed to the following block: the product no longer exists once deleted,
    -- but the cascade assertions still need its id.
    PERFORM set_config('contract_test.product_id', p_id::text, true);
    PERFORM set_config('contract_test.audit_before',
        (SELECT count(*)::text FROM audit_logs), true);

    INSERT INTO regulatory_documents (source_id, title, content_hash)
    VALUES (src_id, 'Reg 2011', 'hash-1');
    PERFORM assert_rejects('deleting a source referenced by evidence is refused',
        format($q$DELETE FROM regulatory_sources WHERE id = '%s'$q$, src_id));

    -- Audit history survives user deletion.
    INSERT INTO audit_logs (entity_type, entity_id, action, new_values)
    VALUES ('product', p_id, 'product.created', '{"n":1}'::jsonb);
    PERFORM assert_rejects('audit_logs is fully append-only (DELETE blocked)',
        $q$DELETE FROM audit_logs WHERE action = 'product.created'$q$);

    -- Cascade chain: deleting a product removes its dependent rows.
    SELECT count(*) INTO n FROM product_workflow_stages WHERE product_id = p_id;
    PERFORM assert_true('product had 9 stages before deletion', n = 9);

    DELETE FROM products WHERE id = p_id;
    SELECT count(*) INTO n FROM product_workflow_stages WHERE product_id = p_id;
    PERFORM assert_true('product cascade removed its 9 workflow stages', n = 0);
END;
$$;

DO $$
DECLARE n BIGINT; p_id UUID; audit_before BIGINT;
BEGIN
    -- The product was deleted in the previous block; its id and the pre-delete
    -- audit count are passed through transaction-local settings.
    p_id := current_setting('contract_test.product_id')::UUID;
    audit_before := current_setting('contract_test.audit_before')::BIGINT;

    -- Counts are relative to this test, not global: the database may already
    -- hold real ingested data and real dossiers, and asserting a global zero
    -- would make this suite fail for the wrong reason.
    SELECT count(*) INTO n FROM findings WHERE product_id = p_id;
    PERFORM assert_true('findings cascaded with the product', n = 0);
    SELECT count(*) INTO n FROM review_tasks WHERE product_id = p_id;
    PERFORM assert_true('review_tasks cascaded with the product', n = 0);
    SELECT count(*) INTO n FROM review_decisions rd
      WHERE NOT EXISTS (SELECT 1 FROM review_tasks rt WHERE rt.id = rd.review_task_id);
    PERFORM assert_true('review_decisions cascaded via review_tasks', n = 0);
    SELECT count(*) INTO n FROM analyses WHERE product_id = p_id;
    PERFORM assert_true('analyses cascaded with the product', n = 0);
    SELECT count(*) INTO n FROM audit_logs;
    PERFORM assert_true('audit log SURVIVED product deletion', n = audit_before + 1);
    SELECT count(*) INTO n FROM products WHERE id = p_id;
    PERFORM assert_true('product deleted', n = 0);
END;
$$;

-- =============================================================================
-- 8. Full-text retrieval path
-- =============================================================================
DO $$
DECLARE
    sec UUID; ch UUID; n BIGINT; d_id UUID;
BEGIN
    SELECT id INTO d_id FROM regulatory_documents LIMIT 1;
    INSERT INTO regulatory_sections (regulatory_document_id, section_number, title,
                                     page_start, page_end, content)
    VALUES (d_id, '2.3', 'Prohibited substances', 12, 13,
            'Kava and other prohibited psychotropic substances shall not be used.')
    RETURNING id INTO sec;
    -- The id comes from RETURNING, not from a re-query on section_number: the
    -- ingested corpus already contains sections numbered 2.3, and selecting by
    -- number would attach the test's chunks to a real regulatory section.

    INSERT INTO regulatory_chunks (section_id, chunk_index, content, page_number, metadata)
    VALUES (sec, 0, 'Kava shall not be used in any food product in India.',
            12, '{"jurisdiction":"INDIA","authority":"FSSAI","version":"2026"}'::jsonb)
    RETURNING id INTO ch;

    SELECT count(*) INTO n FROM regulatory_chunks
     WHERE search_vector @@ plainto_tsquery('english', 'Kava shall not be used');
    PERFORM assert_true('tsvector keyword retrieval works (BM25 path)', n >= 1);

    SELECT count(*) INTO n FROM regulatory_chunks
     WHERE metadata ->> 'jurisdiction' = 'INDIA';
    PERFORM assert_true('JSONB metadata filtering works', n >= 1);

    PERFORM assert_rejects('duplicate (section_id, chunk_index) rejected',
        format($q$INSERT INTO regulatory_chunks (section_id, chunk_index, content)
               VALUES ('%s', 0, 'dupe')$q$, sec));
    PERFORM assert_rejects('non-object metadata rejected',
        format($q$INSERT INTO regulatory_chunks (section_id, chunk_index, content, metadata)
               VALUES ('%s', 9, 'x', '"a string"'::jsonb)$q$, sec));
END;
$$;

-- =============================================================================
-- 9. Reports and documents
-- =============================================================================
DO $$
DECLARE
    p2 UUID; rid UUID;
BEGIN
    INSERT INTO products (name, category, target_market)
    VALUES ('Second Test Product', 'FUNCTIONAL_FOOD', 'EU_EFSA') RETURNING id INTO p2;

    INSERT INTO reports (product_id, title, status)
    VALUES (p2, 'Audit Dossier', 'PENDING') RETURNING id INTO rid;

    PERFORM assert_rejects('READY report without an artefact is rejected',
        format($q$UPDATE reports SET status = 'READY', generated_at = now()
               WHERE id = '%s'$q$, rid));
    PERFORM assert_rejects('FAILED report without a reason is rejected',
        format($q$UPDATE reports SET status = 'FAILED' WHERE id = '%s'$q$, rid));

    -- Unfiled documents (nullable product_id) are legal
    INSERT INTO documents (product_id, file_name, storage_key, size_bytes)
    VALUES (NULL, 'unfiled.pdf', 'obj/unfiled-1', 4096);
    PERFORM assert_true('unfiled document (product_id NULL) accepted', true);

    INSERT INTO document_extractions (document_id, extracted_text, extraction_status,
                                     started_at, completed_at)
    SELECT id, 'Some extracted text', 'COMPLETE', now(), now()
      FROM documents WHERE storage_key = 'obj/unfiled-1';
    PERFORM assert_true('document_extractions lifecycle is independent of document status', true);

    PERFORM assert_rejects('COMPLETE extraction without completed_at rejected',
        $q$INSERT INTO document_extractions (document_id, extraction_status)
          SELECT id, 'COMPLETE' FROM documents WHERE storage_key = 'obj/unfiled-1'$q$);

    -- Retries accumulate; only concurrent in-flight attempts are forbidden.
    INSERT INTO document_extractions (document_id, extracted_text, extraction_status, started_at, completed_at)
    SELECT id, 'first attempt', 'COMPLETE', now(), now()
      FROM documents WHERE storage_key = 'obj/unfiled-1';
    INSERT INTO document_extractions (document_id, extracted_text, extraction_status, started_at, completed_at)
    SELECT id, 'second attempt', 'COMPLETE', now(), now()
      FROM documents WHERE storage_key = 'obj/unfiled-1';
    PERFORM assert_true('repeated extraction attempts are allowed (retry history)', true);

    INSERT INTO document_extractions (document_id, extraction_status, started_at)
    SELECT id, 'RUNNING', now() FROM documents WHERE storage_key = 'obj/unfiled-1';
    PERFORM assert_rejects('second concurrent in-flight extraction rejected',
        $q$INSERT INTO document_extractions (document_id, extraction_status, started_at)
          SELECT id, 'RUNNING', now() FROM documents WHERE storage_key = 'obj/unfiled-1'$q$);
    PERFORM assert_true('a completed attempt plus one RUNNING attempt is allowed', true);
    PERFORM assert_rejects('invalid extractionStatus token PROCESSING rejected',
        $q$INSERT INTO document_extractions (document_id, extraction_status)
          SELECT id, 'PROCESSING' FROM documents WHERE storage_key = 'obj/unfiled-1'$q$);
END;
$$;

DO $$
DECLARE n BIGINT;
BEGIN
    SELECT count(*) INTO n FROM v_dashboard_summary;
    PERFORM assert_true('v_dashboard_summary returns exactly one row', n = 1);
END;
$$;

-- =============================================================================
-- Done -- roll everything back so the database is left untouched.
-- =============================================================================
ROLLBACK;

\echo ''
\echo 'contract_test complete: all assertions above must read PASS.'
