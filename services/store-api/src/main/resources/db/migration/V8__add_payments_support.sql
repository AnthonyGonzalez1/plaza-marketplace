-- Payments: idempotent checkout, webhook deduplication and expiry of unpaid orders.

-- A key chosen by the client for one checkout attempt. If the same request arrives twice (a
-- double click, a retry after a network error), the second one must find the first order
-- instead of creating another. UNIQUE is what guarantees it, even when both arrive at the same
-- instant. NULL (no key sent) is allowed many times: NULL is never equal to another NULL.
ALTER TABLE orders ADD COLUMN idempotency_key text;
ALTER TABLE orders ADD CONSTRAINT uq_orders_idempotency_key UNIQUE (idempotency_key);

-- Every payment event that was already handled. The payment gateway may deliver the same event
-- more than once (at-least-once delivery); the primary key makes the second delivery fail to
-- insert, which is how the application knows it is a duplicate.
CREATE TABLE processed_webhook (
    event_id    uuid PRIMARY KEY,
    order_id    uuid        NOT NULL,
    status      text        NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fk_processed_webhook_order FOREIGN KEY (order_id) REFERENCES orders (id),
    CONSTRAINT ck_processed_webhook_status CHECK (status IN ('APPROVED', 'DECLINED'))
);

-- The job that cancels unpaid orders asks for "pending orders whose time ran out". A partial
-- index contains only the rows that match its WHERE: here the few pending orders, not the
-- ever-growing history of paid and cancelled ones. It stays small however many orders exist.
CREATE INDEX idx_orders_pending_expires_at ON orders (expires_at)
    WHERE status = 'PENDING_PAYMENT';
