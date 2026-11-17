-- Transactional outbox: events waiting to be published to the message broker.
--
-- The problem it solves: "change the order" happens in PostgreSQL and "tell the other services"
-- happens in RabbitMQ. No transaction covers both. Publishing right after the commit can lose
-- the event (the process dies in between); publishing before the commit can announce something
-- that is then rolled back.
--
-- The solution: the event is written to this table in the SAME transaction as the order change,
-- so both are saved or neither is. A background job then reads the rows that are not published
-- yet, sends them to the broker and marks them. If the job fails halfway it simply tries again:
-- an event can be published twice, but never lost (at-least-once delivery).
CREATE TABLE outbox_event (
    -- Publishing order. A sequence, not a timestamp: two events of the same order (placed, then
    -- paid) must leave in the order they were written.
    seq          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Identity of the event for consumers; it travels in the message so they can ignore a
    -- second delivery of the same event.
    event_id     uuid        NOT NULL,
    -- For example 'OrderPaid'.
    type         text        NOT NULL,
    -- Where the broker routes it, for example 'order.paid'.
    routing_key  text        NOT NULL,
    -- The message body, exactly as it will be sent.
    payload      jsonb       NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    -- NULL while the event waits to be published.
    published_at timestamptz,
    CONSTRAINT uq_outbox_event_event_id UNIQUE (event_id)
);

-- The job only ever asks for unpublished rows. A partial index holds just those, so it stays
-- tiny even when the table has millions of published events.
CREATE INDEX idx_outbox_event_unpublished ON outbox_event (seq)
    WHERE published_at IS NULL;
