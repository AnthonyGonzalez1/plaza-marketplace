# Catalog search: design and query plans

How `GET /api/v1/products?q=...` finds products, why it is built this way, and what PostgreSQL
actually does when it runs. The code is in `ProductSearchRepository` (hand-written SQL, see
ADR-0005) and the schema in migration `V5__add_product_full_text_search.sql`.

## 1. The problem with `LIKE`

The obvious first idea is `WHERE name ILIKE '%zapatos%'`. It has three problems:

- It matches characters, not words: `zapatos` does not find a product called "Zapato formal",
  and `cafe` does not find "Café".
- It cannot say which result is better: a product named "Zapato" and one that only mentions
  shoes in its description are equal.
- A pattern that starts with `%` cannot use a normal (B-tree) index, so every search reads every
  row.

PostgreSQL has full-text search built in, which solves the three without another service.

## 2. The building blocks

**`tsvector`: a document prepared for searching.** Text is split into words, lowercased, stop
words ("de", "para", "con") are dropped, and each word is reduced to its stem. Each stem keeps
its positions in the text:

```sql
SELECT to_tsvector('plaza_spanish', 'Lámparas de cerámica');
-- 'ceram':3 'lamp':1
```

**`tsquery`: what the buyer is looking for**, processed in the same way so both sides compare
stems with stems. `websearch_to_tsquery` accepts what people type in a search box and never
fails on odd input: several words mean "all of them", `"quotes"` mean a phrase, `-word`
excludes.

```sql
SELECT websearch_to_tsquery('plaza_spanish', 'zapatos de cuero');
-- 'zapat' & 'cuer'
```

**`@@`: the match operator.** `tsvector @@ tsquery` is true when the document satisfies the
query. "zapatos" finds "Zapato" because both become `zapat`.

**Text search configuration.** The first argument (`'plaza_spanish'`) says which language rules
to apply. `plaza_spanish` is PostgreSQL's `spanish` configuration plus the `unaccent`
dictionary, so "café", "cafe" and "CAFE" all become `caf`.

## 3. Design decisions

### A stored generated column

```sql
ALTER TABLE product
    ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('plaza_spanish', name), 'A')
        || setweight(to_tsvector('plaza_spanish', description), 'B')
    ) STORED;
```

- The `tsvector` is computed once, when the row is written, not on every search. Section 5 shows
  this alone makes a full scan about 20 times cheaper.
- `GENERATED ALWAYS` means PostgreSQL maintains it: no trigger, no application code that could
  forget to update it. Nobody can write to the column directly.
- `STORED` is written explicitly because PostgreSQL 18 makes generated columns *virtual* by
  default (computed when read), and a virtual column cannot be indexed.
- `setweight` labels the words of the name with `A` and those of the description with `B`.
  Matching does not care about the labels; ranking does.

### Accents: why `unaccent` lives inside the configuration

The expression of a generated column must be `IMMUTABLE` (same input, same output, forever).
`unaccent(text)` is only `STABLE`, because its result depends on a dictionary that can be
changed, so `to_tsvector('spanish', unaccent(name))` is rejected in a generated column. The
common workaround is to wrap `unaccent` in a function declared `IMMUTABLE`, which is a promise
PostgreSQL cannot check.

The approach used here is the one from the `unaccent` documentation: a text search
configuration that applies `unaccent` as its first dictionary and the Spanish stemmer second.

```sql
CREATE TEXT SEARCH CONFIGURATION plaza_spanish (COPY = spanish);
ALTER TEXT SEARCH CONFIGURATION plaza_spanish
    ALTER MAPPING FOR hword, hword_part, word
    WITH unaccent, spanish_stem;
```

`to_tsvector(configuration, text)` with an explicit configuration is `IMMUTABLE`, so the
generated column accepts it, and the query side uses the same configuration, so both sides are
always normalized identically.

The caveat is the same for both approaches: if the configuration or the `unaccent` rules are
ever changed, the vectors already stored are stale. The fix is a migration that changes the
configuration and rewrites the column (for example by dropping and re-adding it).

### The GIN index

```sql
CREATE INDEX idx_product_search_vector ON product USING gin (search_vector);
```

A B-tree index maps one value to its row and is good for `=`, `<`, `ORDER BY`. A `tsvector`
holds many words, and the question is "which rows contain this word?". GIN (Generalized
Inverted Index) is the index at the back of a book: for each stem, the list of rows where it
appears. For `'zapat' & 'cuer'` PostgreSQL reads two lists and intersects them.

The cost is on writes: one product adds an entry for every distinct word. To soften that, GIN
puts new entries in a *pending list* and merges them later (autovacuum does it). Right after a
bulk load that list is long and the planner may avoid the index until it is merged; this is why
`ProductSearchIndexIntegrationTest` calls `gin_clean_pending_list` after inserting its rows.

### Ranking

```sql
ORDER BY ts_rank(p.search_vector, websearch_to_tsquery('plaza_spanish', :q)) DESC, p.id DESC
```

`ts_rank` gives a score from how often the query words appear and from their weights (by
default A counts 1.0 and B 0.4), so a product called "Zapato formal" ranks above a shoe-polish
kit that says "zapatos" in its description. The index does not help here: the rank has to be
computed for every *matching* row before the best 20 can be chosen. That is fine while searches
match hundreds of rows, and is the first thing to revisit if they start matching hundreds of
thousands.

`p.id DESC` at the end is the tie-break. Many products have the same rank (or the same price);
without a unique last sort key their relative order is undefined, and a product could show up on
two pages or on none.

### Filters, sort and pagination

- The `WHERE` clause is assembled from fixed fragments, one per filter that is present
  (`p.store_id = :storeId`, `p.price >= :minPrice`, ...). Values always travel as named
  parameters. The `ORDER BY` comes from the `ProductSort` enum, a whitelist. Nothing typed by the
  client is ever concatenated into the SQL.
- Pagination is `LIMIT :limit OFFSET :offset` plus a second `count(*)` query for `totalItems`.
  `OFFSET` is simple and lets the UI jump to any page, but the database still produces and
  throws away the skipped rows, so page 5,000 is slow. The alternative is keyset pagination
  ("rows after the last one I saw"), which is fast at any depth but cannot jump to page N. For a
  catalog that people browse a few pages deep, offset is the pragmatic choice.
- Supporting B-tree indexes: `idx_product_store_id`, `idx_product_category_id`,
  `idx_product_price (price, id)` and `idx_product_created_at (created_at DESC, id DESC)`. The
  last one matches the default listing (`newest`), so PostgreSQL can read the first page straight
  from the index without sorting.

## 4. The query

For `GET /api/v1/products?q=zapatos de cuero` the repository runs:

```sql
SELECT p.id, p.name, p.slug, p.price, p.image_url,
       COALESCE(i.available, 0) AS available,
       s.id AS store_id, s.name AS store_name, s.slug AS store_slug,
       c.id AS category_id, c.name AS category_name, c.slug AS category_slug
FROM product p
JOIN store s ON s.id = p.store_id
JOIN category c ON c.id = p.category_id
LEFT JOIN inventory i ON i.product_id = p.id
WHERE p.search_vector @@ websearch_to_tsquery('plaza_spanish', :q)
ORDER BY ts_rank(p.search_vector, websearch_to_tsquery('plaza_spanish', :q)) DESC, p.id DESC
LIMIT :limit OFFSET :offset
```

and, for the total:

```sql
SELECT count(*) FROM product p
WHERE p.search_vector @@ websearch_to_tsquery('plaza_spanish', :q)
```

## 5. Measurements

### Setup

The 60 seed products are useless for measuring: the table fits in a few 8 kB pages and reading
all of it is always the cheapest plan. The numbers below were taken on 2026-11-16 on a throwaway
`postgres:18` container (PostgreSQL 18.7, default settings: `shared_buffers = 128MB`,
`max_parallel_workers_per_gather = 2`) on a Windows 11 laptop with Docker Desktop:

- migrations `V1` to `V6` applied, then 100,000 extra products inserted using `generate_series`
  (script at the end of this document; the data is not committed);
- `product` table: 100,060 rows, 30 MB; GIN index: about 6.8 MB right after `CREATE INDEX`;
- the search `zapatos de cuero` matches **229** rows (0.23 % of the table);
- "before" = after `DROP INDEX idx_product_search_vector`; "after" = index created again;
  `ANALYZE product` both times;
- each statement was run three times with `EXPLAIN (ANALYZE, BUFFERS)` and the third run is
  shown, so all pages were already in memory (`shared hit`, no disk reads). The plans are
  pasted as printed; only the `Planning: Buffers` lines were removed.

These are single measurements on a laptop: read them as orders of magnitude, not as benchmarks.

### Results

| Statement | Plan | Pages read | Execution time |
|---|---|---|---|
| `count(*)` computing `to_tsvector(...)` on the fly (no stored column) | Parallel Seq Scan | 4,072 | 265 ms |
| `count(*)` on `search_vector`, **no index** | Seq Scan | 3,848 | 12.7 ms |
| `count(*)` on `search_vector`, **GIN index** | Bitmap Index Scan | 241 | 0.85 ms |
| Search page (joins, rank, `LIMIT 20`), **no index** | Parallel Seq Scan (2 workers) | 4,000 | 8.7 ms (9.0 and 9.0 on two more runs) |
| Search page (joins, rank, `LIMIT 20`), **GIN index** | Bitmap Index Scan | 952 | 1.8 ms (1.8 and 1.9 on two more runs) |

What they say, honestly:

- The big win at this size is **storing the vector**: parsing and stemming 100,000 documents on
  every search costs 265 ms even with three processes; comparing against stored vectors costs
  about 13 ms.
- The **GIN index** then makes the search page about 5 times faster (8.7 ms to 1.8 ms) and the
  count about 15 times faster (12.7 ms to 0.85 ms). The absolute saving is a few milliseconds
  because 100,000 short rows is still a small table that fits in memory.
- The difference that matters is the shape: without the index the work grows with the **size of
  the table** (3,848 pages read, 99,831 rows discarded, and it already needs two extra worker
  processes to stay under 10 ms); with the index it grows with the **number of matches** (12
  index pages plus the 229 pages that hold matching rows). At ten times the data the first
  would take roughly ten times longer and the second about the same.

### Before: no index

```
 Limit  (cost=5372.46..5508.06 rows=20 width=167) (actual time=7.303..8.644 rows=20.00 loops=1)
   Buffers: shared hit=4000
   ->  Nested Loop Left Join  (cost=5372.46..6877.63 rows=222 width=167) (actual time=7.302..8.641 rows=20.00 loops=1)
         Buffers: shared hit=4000
         ->  Nested Loop  (cost=5372.17..5432.26 rows=222 width=283) (actual time=7.291..8.579 rows=20.00 loops=1)
               Join Filter: (p.category_id = c.id)
               Rows Removed by Join Filter: 60
               Buffers: shared hit=3940
               ->  Nested Loop  (cost=5372.17..5410.38 rows=222 width=258) (actual time=7.284..8.564 rows=20.00 loops=1)
                     Join Filter: (p.store_id = s.id)
                     Buffers: shared hit=3939
                     ->  Gather Merge  (cost=5372.17..5398.02 rows=222 width=223) (actual time=7.273..8.548 rows=20.00 loops=1)
                           Workers Planned: 2
                           Workers Launched: 2
                           Buffers: shared hit=3938
                           ->  Sort  (cost=4372.15..4372.38 rows=92 width=223) (actual time=5.397..5.398 rows=43.67 loops=3)
                                 Sort Key: (ts_rank(p.search_vector, '''zapat'' & ''cuer'''::tsquery)) DESC, p.id DESC
                                 Sort Method: quicksort  Memory: 48kB
                                 Buffers: shared hit=3938
                                 Worker 0:  Sort Method: quicksort  Memory: 39kB
                                 Worker 1:  Sort Method: quicksort  Memory: 38kB
                                 ->  Parallel Seq Scan on product p  (cost=0.00..4369.15 rows=92 width=223) (actual time=0.059..5.320 rows=76.33 loops=3)
                                       Filter: (search_vector @@ '''zapat'' & ''cuer'''::tsquery)
                                       Rows Removed by Filter: 33277
                                       Buffers: shared hit=3848
                     ->  Materialize  (cost=0.00..1.06 rows=4 width=43) (actual time=0.000..0.000 rows=1.00 loops=20)
                           Storage: Memory  Maximum Storage: 17kB
                           Buffers: shared hit=1
                           ->  Seq Scan on store s  (cost=0.00..1.04 rows=4 width=43) (actual time=0.005..0.006 rows=1.00 loops=1)
                                 Buffers: shared hit=1
               ->  Materialize  (cost=0.00..1.10 rows=7 width=33) (actual time=0.000..0.000 rows=4.00 loops=20)
                     Storage: Memory  Maximum Storage: 17kB
                     Buffers: shared hit=1
                     ->  Seq Scan on category c  (cost=0.00..1.07 rows=7 width=33) (actual time=0.002..0.003 rows=7.00 loops=1)
                           Buffers: shared hit=1
         ->  Index Scan using inventory_pkey on inventory i  (cost=0.29..6.51 rows=1 width=12) (actual time=0.003..0.003 rows=1.00 loops=20)
               Index Cond: (product_id = p.id)
               Index Searches: 20
               Buffers: shared hit=60
 Planning Time: 1.327 ms
 Execution Time: 8.709 ms
```

How to read it (plans are read from the most indented line outwards):

- `Parallel Seq Scan on product`: three processes (`loops=3`: the leader and 2 workers) read
  the whole table. Each one discarded 33,277 rows (`Rows Removed by Filter`) to keep about 76.
  `Buffers: shared hit=3848` is the entire table, page by page.
- `Sort` + `Gather Merge`: each process sorts its matches by rank and the leader merges them.
- The joins to `store`, `category` and `inventory` run only for the 20 rows that survive the
  `Limit`, which is why they are cheap.

### After: GIN index

```
 Limit  (cost=2289.74..2289.79 rows=20 width=167) (actual time=1.716..1.719 rows=20.00 loops=1)
   Buffers: shared hit=952
   ->  Sort  (cost=2289.74..2290.32 rows=232 width=167) (actual time=1.715..1.717 rows=20.00 loops=1)
         Sort Key: (ts_rank(p.search_vector, '''zapat'' & ''cuer'''::tsquery)) DESC, p.id DESC
         Sort Method: top-N heapsort  Memory: 35kB
         Buffers: shared hit=952
         ->  Nested Loop Left Join  (cost=31.84..2283.56 rows=232 width=167) (actual time=0.200..1.608 rows=229.00 loops=1)
               Buffers: shared hit=946
               ->  Nested Loop  (cost=31.55..787.06 rows=232 width=283) (actual time=0.193..0.967 rows=229.00 loops=1)
                     Buffers: shared hit=259
                     ->  Nested Loop  (cost=31.41..780.08 rows=232 width=258) (actual time=0.187..0.899 rows=229.00 loops=1)
                           Buffers: shared hit=245
                           ->  Bitmap Heap Scan on product p  (cost=31.27..773.86 rows=232 width=223) (actual time=0.180..0.819 rows=229.00 loops=1)
                                 Recheck Cond: (search_vector @@ '''zapat'' & ''cuer'''::tsquery)
                                 Heap Blocks: exact=229
                                 Buffers: shared hit=241
                                 ->  Bitmap Index Scan on idx_product_search_vector  (cost=0.00..31.21 rows=232 width=0) (actual time=0.162..0.162 rows=229.00 loops=1)
                                       Index Cond: (search_vector @@ '''zapat'' & ''cuer'''::tsquery)
                                       Index Searches: 1
                                       Buffers: shared hit=12
                           ->  Memoize  (cost=0.14..0.21 rows=1 width=43) (actual time=0.000..0.000 rows=1.00 loops=229)
                                 Cache Key: p.store_id
                                 Cache Mode: logical
                                 Hits: 227  Misses: 2  Evictions: 0  Overflows: 0  Memory Usage: 1kB
                                 Buffers: shared hit=4
                                 ->  Index Scan using store_pkey on store s  (cost=0.13..0.20 rows=1 width=43) (actual time=0.002..0.002 rows=1.00 loops=2)
                                       Index Cond: (id = p.store_id)
                                       Index Searches: 2
                                       Buffers: shared hit=4
                     ->  Memoize  (cost=0.14..0.21 rows=1 width=33) (actual time=0.000..0.000 rows=1.00 loops=229)
                           Cache Key: p.category_id
                           Cache Mode: logical
                           Hits: 222  Misses: 7  Evictions: 0  Overflows: 0  Memory Usage: 1kB
                           Buffers: shared hit=14
                           ->  Index Scan using category_pkey on category c  (cost=0.13..0.20 rows=1 width=33) (actual time=0.001..0.001 rows=1.00 loops=7)
                                 Index Cond: (id = p.category_id)
                                 Index Searches: 7
                                 Buffers: shared hit=14
               ->  Index Scan using inventory_pkey on inventory i  (cost=0.29..6.45 rows=1 width=12) (actual time=0.002..0.002 rows=1.00 loops=229)
                     Index Cond: (product_id = p.id)
                     Index Searches: 229
                     Buffers: shared hit=687
 Planning Time: 1.305 ms
 Execution Time: 1.787 ms
```

- `Bitmap Index Scan on idx_product_search_vector`: the GIN index returns the location of the
  229 matching rows after reading 12 index pages. Nothing is discarded.
- `Bitmap Heap Scan`: with that list (a bitmap of pages), PostgreSQL fetches the rows from the
  table: 229 pages, one per match (`Heap Blocks: exact=229`), instead of 3,848.
- `Sort ... top-N heapsort`: because of `LIMIT 20` it only keeps the best 20 while it goes
  through the 229 rows.
- A detail worth noticing: here the joins run for all 229 matches, before the `Limit`
  (687 of the 952 pages are the `inventory` lookups). The planner estimated this plan as the
  cheapest overall, and it is 5 times faster than the previous one, but it shows where the time
  would go if a search matched tens of thousands of rows.

### When the index is not used, and that is correct

Every generated product contains the word "producto". Searching for it matches 100,000 rows:

```
 Aggregate  (cost=5348.77..5348.78 rows=1 width=8) (actual time=16.965..16.978 rows=1.00 loops=1)
   Buffers: shared hit=3848
   ->  Seq Scan on product p  (cost=0.00..5098.75 rows=100007 width=0) (actual time=0.020..14.100 rows=100000.00 loops=1)
         Filter: (search_vector @@ '''product'''::tsquery)
         Rows Removed by Filter: 60
 Execution Time: 17.004 ms
```

The index exists and PostgreSQL ignores it: if almost every row matches, reading the table once
from start to end is cheaper than going through the index and then to every page anyway. An
index helps when it lets the database *skip* most of the table. The planner decides with the
statistics collected by `ANALYZE`, per query and per value.

## 6. How the tests cover it

- `ProductSearchApiIntegrationTest`: word search, Spanish stemming ("zapatos" finds "Zapato"),
  accents and case, several words, every filter, every sort, pagination limits and validation
  errors, against PostgreSQL 18 in Testcontainers.
- `ProductSearchIndexIntegrationTest`: inserts 20,000 rows inside a rolled-back transaction, runs
  `EXPLAIN` on the exact statement the repository builds and asserts that the plan contains
  `Bitmap Index Scan on idx_product_search_vector`. It fails if someone changes the query in a
  way the index cannot serve.
- `SchemaIntegrationTest.searchVectorIsGeneratedByTheDatabase`: the column is filled by
  PostgreSQL, without accents and with weights.

## 7. Known limits

- No typo tolerance: "zapto" finds nothing. The usual next step is the `pg_trgm` extension
  (trigram similarity) as a fallback when full-text search returns no rows.
- No prefix search while typing ("zap" does not find "zapato"); `to_tsquery('zap:*')` supports
  it but needs the input to be sanitized by hand.
- Words that the Spanish stemmer treats as different stay different (for example, a product
  described only in English).
- A query made only of stop words ("de la") matches nothing.

## 8. Reproducing the measurements

Start a database with the schema (`docker compose up -d`), open `psql`
(`docker compose exec postgres psql -U plaza -d plaza`) and run:

```sql
INSERT INTO product (store_id, category_id, name, slug, description, price, created_at)
SELECT
    (SELECT id FROM store ORDER BY id LIMIT 1 OFFSET n % 4),
    (SELECT id FROM category ORDER BY id LIMIT 1 OFFSET n % 7),
    initcap(noun) || ' de ' || material || ' ' || color || ' ' || n,
    'gen-' || n,
    'Producto de prueba numero ' || n || ': ' || noun || ' en ' || material || ', color ' || color || '.',
    1000 + (n * 37) % 250000,
    now() - make_interval(mins => n)
FROM (
    SELECT n,
        (ARRAY['zapato','ruana','mochila','sombrero','bufanda','cafetera','canasto','hamaca','billetera','cinturon',
               'bolso','gorro','poncho','cobija','guante','sandalia','bota','mocasin','taza','olla',
               'cuchara','mantel','cojin','lampara','florero','collar','arete','pulsera','llavero','camisa',
               'pantalon','falda','vestido','chaqueta','media','tapete','cortina','bandeja','jarra','silla'])[1 + n % 40] AS noun,
        (ARRAY['cuero','lana','algodon','fique','ceramica','madera','iraca','bambu','lino','plata','cobre'])[1 + n % 11] AS material,
        (ARRAY['negro','blanco','rojo','azul','verde','amarillo','cafe','gris','morado'])[1 + n % 9] AS color
    FROM generate_series(1, 100000) AS n
) AS g;
INSERT INTO inventory (product_id, available) SELECT id, 10 FROM product WHERE slug LIKE 'gen-%';
VACUUM ANALYZE;

-- Before: without the index
DROP INDEX idx_product_search_vector;
EXPLAIN (ANALYZE, BUFFERS) <the query of section 4 with 'zapatos de cuero', LIMIT 20 OFFSET 0>;

-- After: with the index
CREATE INDEX idx_product_search_vector ON product USING gin (search_vector);
ANALYZE product;
EXPLAIN (ANALYZE, BUFFERS) <the same query>;
```

When finished, throw the data away with `docker compose down -v` (the next `up` starts again
from the migrations).
