-- First schema: stores and the products they sell.

CREATE TABLE store (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        text        NOT NULL,
    -- URL-friendly identifier, e.g. "cafe-la-palma". Unique across the marketplace.
    slug        text        NOT NULL,
    description text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_store_slug UNIQUE (slug)
);

CREATE TABLE product (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    store_id    bigint         NOT NULL,
    name        text           NOT NULL,
    slug        text           NOT NULL,
    description text           NOT NULL,
    -- Exact decimal type for money (never float). Currency is COP for now.
    price       numeric(12, 2) NOT NULL,
    CONSTRAINT fk_product_store FOREIGN KEY (store_id) REFERENCES store (id),
    CONSTRAINT ck_product_price_positive CHECK (price > 0),
    -- Two stores may use the same product slug, but one store cannot repeat it.
    CONSTRAINT uq_product_store_slug UNIQUE (store_id, slug)
);

-- PostgreSQL does not create an index for a foreign key column. "Products of a store" is a
-- frequent filter, and the index also keeps the FK check cheap when a store is deleted.
CREATE INDEX idx_product_store_id ON product (store_id);
