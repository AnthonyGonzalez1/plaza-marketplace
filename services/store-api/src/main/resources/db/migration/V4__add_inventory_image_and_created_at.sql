-- Stock lives in its own table, one row per product. It changes on every sale, while the product
-- row (name, price, search data) rarely changes; keeping them apart keeps stock updates small.
CREATE TABLE inventory (
    product_id bigint PRIMARY KEY,
    available  int NOT NULL,
    CONSTRAINT fk_inventory_product FOREIGN KEY (product_id) REFERENCES product (id),
    -- The last line of defence against overselling: stock can never go below zero.
    CONSTRAINT ck_inventory_available_not_negative CHECK (available >= 0)
);

-- The products that already exist start with some stock.
INSERT INTO inventory (product_id, available)
SELECT id, 20 FROM product;

-- Optional picture of the product. NULL means "no image yet"; the web app shows a placeholder.
ALTER TABLE product ADD COLUMN image_url text;

-- When the product was published; used by the "newest" sort. Existing rows get the time of
-- this migration through the default.
ALTER TABLE product ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();

-- The default listing is "newest first, one page": this index returns the rows already in that
-- order, so PostgreSQL can stop after reading one page instead of sorting the whole table.
CREATE INDEX idx_product_created_at ON product (created_at DESC, id DESC);

-- Supports the price range filter (minPrice / maxPrice) and the price sorts.
CREATE INDEX idx_product_price ON product (price, id);
