-- Orders created by checkout. "order" is a reserved word in SQL, hence the plural name.

CREATE TABLE orders (
    -- A UUID instead of a sequence: buyers have no account yet, so the id in the URL is the only
    -- thing that protects an order page, and sequential ids (1, 2, 3...) could be guessed.
    -- uuidv7() (new in PostgreSQL 18) starts with a timestamp, so new ids are always added at the
    -- end of the primary key index, unlike fully random UUIDs that scatter all over it.
    id         uuid PRIMARY KEY DEFAULT uuidv7(),
    email      text           NOT NULL,
    status     text           NOT NULL DEFAULT 'PENDING_PAYMENT',
    -- Sum of the items, stored so it is never recomputed with newer prices.
    total      numeric(12, 2) NOT NULL,
    created_at timestamptz    NOT NULL DEFAULT now(),
    -- Until when the reserved units wait for the payment. After that the order can be
    -- cancelled and the stock returned (the job that does it arrives with payments).
    expires_at timestamptz    NOT NULL,
    -- The database rejects any status outside this list, whatever the application does.
    CONSTRAINT ck_orders_status CHECK (status IN ('PENDING_PAYMENT', 'PAID', 'CANCELLED')),
    CONSTRAINT ck_orders_total_positive CHECK (total > 0),
    CONSTRAINT ck_orders_expires_after_created CHECK (expires_at > created_at)
);

CREATE TABLE order_item (
    order_id     uuid           NOT NULL,
    product_id   bigint         NOT NULL,
    -- Snapshot: name and price are copied at the moment of the purchase. If the seller renames
    -- the product or changes its price tomorrow, this order still shows what the buyer paid.
    product_name text           NOT NULL,
    unit_price   numeric(12, 2) NOT NULL,
    quantity     int            NOT NULL,
    -- One line per product in an order; the same product twice is one line with quantity 2.
    CONSTRAINT pk_order_item PRIMARY KEY (order_id, product_id),
    CONSTRAINT fk_order_item_order FOREIGN KEY (order_id) REFERENCES orders (id),
    CONSTRAINT fk_order_item_product FOREIGN KEY (product_id) REFERENCES product (id),
    CONSTRAINT ck_order_item_quantity_positive CHECK (quantity > 0),
    CONSTRAINT ck_order_item_unit_price_positive CHECK (unit_price > 0)
);

-- The primary key (order_id, product_id) already serves "items of an order". This index covers
-- the other direction: the foreign key check on product and, later, "sales of a product".
CREATE INDEX idx_order_item_product_id ON order_item (product_id);
