-- Full-text search over product name and description. See docs/sql/catalog-search.md.

-- unaccent removes accents ("café" -> "cafe") so buyers find products whether or not they type
-- the accent. It ships with PostgreSQL and is a "trusted" extension: the database owner can
-- install it without being superuser.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- A text search configuration decides how text becomes searchable words. This one is the
-- built-in "spanish" configuration with one extra step: every word first goes through unaccent
-- and then through the Spanish stemmer ("zapatos" -> "zapat", stop words like "de" removed).
--
-- Why a configuration and not unaccent(name) inside the generated column below: a generated
-- column only accepts IMMUTABLE expressions and unaccent() is only STABLE, so PostgreSQL
-- rejects it. to_tsvector(<configuration>, text) is IMMUTABLE, so putting unaccent inside the
-- configuration is the supported way to combine both.
CREATE TEXT SEARCH CONFIGURATION plaza_spanish (COPY = spanish);
ALTER TEXT SEARCH CONFIGURATION plaza_spanish
    ALTER MAPPING FOR hword, hword_part, word
    WITH unaccent, spanish_stem;

-- The searchable form of each product, computed by PostgreSQL on every INSERT/UPDATE and stored
-- in the row (STORED must be explicit: PostgreSQL 18 makes generated columns virtual by default,
-- and a virtual column cannot be indexed). Weight A (name) ranks above weight B (description).
ALTER TABLE product
    ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('plaza_spanish', name), 'A')
        || setweight(to_tsvector('plaza_spanish', description), 'B')
    ) STORED;

-- GIN is an inverted index: for every word, the list of rows that contain it. It answers
-- "search_vector @@ query" without reading every product.
CREATE INDEX idx_product_search_vector ON product USING gin (search_vector);
