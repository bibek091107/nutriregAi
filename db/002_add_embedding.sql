-- =============================================================================
-- NutriReg AI  ::  002_add_embedding.sql
-- =============================================================================
-- Adds the pgvector column + HNSW index to regulatory_chunks.
--
-- This migration is intentionally SEPARATE from 001 because the embedding
-- dimension depends on the embedding model, which has not been selected yet.
-- Committing to a dimension (384 vs 768 vs 1536 vs 3072) in the base schema
-- would hard-code a product decision into the foundation, and pg_dump/restore
-- would then fail for any environment using a different model.
--
-- ---------------------------------------------------------------------------
-- HOW TO RUN (once the model is chosen)
-- ---------------------------------------------------------------------------
--   psql -v ON_ERROR_STOP=1 \
--        -v embedding_dim=768 \
--        -f 002_add_embedding.sql
--
--   embedding_dim must be one of: 384, 512, 768, 1024, 1536, 3072
--
-- Common defaults by model family:
--   384   all-MiniLM-L6-v2, bge-small-en-v1.5
--   512   mxbai-embed-large-v1
--   768   nomic-embed-text, mxbai-embed-base-v1
--   1024  multilingual-e5-large
--   1536  text-embedding-3-small / ada-002
--   3072  text-embedding-3-large
--
-- A dimension can be ADDED later (ALTER TYPE ... ADD VALUE, or a new column
-- rebuild), but REMOVING or changing it requires re-embedding every chunk. The
-- "HNSW vector index is dimension-locked" note below explains the consequence.
-- =============================================================================

\set ON_ERROR_STOP on

-- -----------------------------------------------------------------------------
-- 0. Guard: refuse to guess a dimension
-- -----------------------------------------------------------------------------
\if :{?embedding_dim}
\else
    \echo 'ERROR: embedding_dim not supplied.'
    \echo '       Example: psql -v embedding_dim=768 -f 002_add_embedding.sql'
    \quit
\endif

-- Validate the supplied dimension before touching the schema. COALESCE keeps the
-- result a real boolean even when the value is out of range, so \if never sees
-- an empty expression.
SELECT coalesce(:embedding_dim::int IN (384, 512, 768, 1024, 1536, 3072), false)
           AS _dimension_ok \gset

\if :_dimension_ok
\else
    \echo 'ERROR: embedding_dim must be one of 384, 512, 768, 1024, 1536, 3072'
    \quit
\endif

BEGIN;

-- COMMENT ON COLUMN only accepts a string literal, so the chosen dimension is
-- carried into PL/pgSQL through a transaction-local setting.
SET LOCAL nutrireg.embedding_dim = :embedding_dim;

-- -----------------------------------------------------------------------------
-- 1. Enable pgvector
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS vector;

\echo 'Applying embedding dimension:' :embedding_dim

-- -----------------------------------------------------------------------------
-- 2. The embedding column
-- -----------------------------------------------------------------------------
-- Refuse to run silently against an existing column of a different dimension.
-- ADD COLUMN IF NOT EXISTS would otherwise no-op, and an operator who passed the
-- wrong -v value would get a clean exit and a schema that does not match the
-- model they are about to use.
DO $mismatch$
DECLARE
    existing_dim INTEGER;
    wanted_dim   INTEGER := current_setting('nutrireg.embedding_dim')::int;
BEGIN
    SELECT a.atttypmod INTO existing_dim
      FROM pg_attribute a
     WHERE a.attrelid = 'regulatory_chunks'::regclass
       AND a.attname  = 'embedding'
       AND NOT a.attisdropped;

    IF existing_dim IS NOT NULL AND existing_dim <> wanted_dim THEN
        RAISE EXCEPTION
            'regulatory_chunks.embedding already exists at dimension %, but % was requested. '
            'Changing dimension requires a full re-embedding of the corpus: add a new column, '
            'backfill, then swap. Aborting to avoid a silent no-op.',
            existing_dim, wanted_dim;
    END IF;
END;
$mismatch$;

-- Added NULLable: existing chunks survive without re-embedding, and the
-- background ingestion job backfills them. The application treats
-- embedding IS NULL as "not yet embedded" and skips it in vector search.
ALTER TABLE regulatory_chunks
    ADD COLUMN IF NOT EXISTS embedding vector(:embedding_dim);

DO $comment$
DECLARE
    dim TEXT := current_setting('nutrireg.embedding_dim');
BEGIN
    EXECUTE format(
        'COMMENT ON COLUMN regulatory_chunks.embedding IS %L',
        'Dense semantic embedding, dimension ' || dim
        || '. NULL means not yet embedded; the RAG retriever filters on '
        || 'embedding IS NOT NULL. Changing the dimension requires a full '
        || 're-embedding of the corpus.');
END;
$comment$;

-- -----------------------------------------------------------------------------
-- 3. HNSW index
-- -----------------------------------------------------------------------------
-- HNSW over IVFFlat because:
--   * no training step / no data required before the index is usable
--   * better recall at the same memory budget as the corpus grows
--   * m=16, ef_construction=64 are the documented pgvector defaults
--
-- vector_cosine_ops matches the cosine-similarity metric the retriever uses.
-- NOTE: the HNSW index is bound to the column's dimension, so changing
-- embedding_dim later requires DROP INDEX + rebuild + full re-embedding.
CREATE INDEX IF NOT EXISTS regulatory_chunks_embedding_hnsw_idx
    ON regulatory_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- -----------------------------------------------------------------------------
-- 4. Partial index on embedded chunks only
-- -----------------------------------------------------------------------------
-- The main table holds every chunk, including the large not-yet-embedded
-- backfill backlog. Restricting the index to embedded rows keeps it small and
-- avoids polluting recall with NULL-heavy pages during the backfill window.
CREATE INDEX IF NOT EXISTS regulatory_chunks_embedding_embedded_idx
    ON regulatory_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
    WHERE embedding IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 5. Hybrid-retrieval support
-- -----------------------------------------------------------------------------
-- pgvector keyword search uses the plain tsvector built in 001, which already
-- carries a GIN index (regulatory_chunks_search_vector_idx). Nothing to add
-- here: this migration only introduces the vector side of the hybrid query.
--
-- The RAG retriever combines both result sets with RRF (reciprocal rank fusion):
--     vector rank  from  embedding <=> query_embedding
--     keyword rank from  ts_rank(search_vector, plainto_tsquery(...))
--     score        =   sum(1 / (60 + rank))
-- so a chunk is findable by meaning (vector) OR by exact regulation number
-- (keyword), whichever phrasing the query favours.

-- -----------------------------------------------------------------------------
-- 6. Post-migration verification
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    actual_dim INTEGER;
    idx_count INTEGER;
BEGIN
    SELECT atttypmod INTO actual_dim
      FROM pg_attribute
     WHERE attrelid = 'regulatory_chunks'::regclass
       AND attname  = 'embedding'
       AND NOT attisdropped;

    IF actual_dim IS NULL THEN
        RAISE EXCEPTION 'embedding column was not created';
    END IF;

    SELECT count(*) INTO idx_count
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
     WHERE i.indrelid = 'regulatory_chunks'::regclass
       AND c.relname = 'regulatory_chunks_embedding_hnsw_idx';

    IF idx_count <> 1 THEN
        RAISE EXCEPTION 'HNSW index missing';
    END IF;

    RAISE NOTICE 'OK  vector extension active, dimension = %, HNSW index present', actual_dim;
END;
$$;

COMMIT;

\echo ''
\echo '002_add_embedding.sql complete. Backfill with:'
\echo '  UPDATE regulatory_chunks SET embedding = <call model> WHERE embedding IS NULL;'
