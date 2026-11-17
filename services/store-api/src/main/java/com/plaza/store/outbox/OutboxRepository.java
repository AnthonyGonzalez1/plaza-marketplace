package com.plaza.store.outbox;

import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** The outbox table (migration V9) in plain SQL. */
@Repository
public class OutboxRepository {

    /** One event waiting to be published. */
    public record PendingEvent(
            long seq, UUID eventId, String type, String routingKey, String payload) {}

    private final JdbcClient jdbc;

    public OutboxRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Saves an event. Call it inside the transaction that changes the data the event talks about:
     * that is the whole point of the pattern.
     */
    public void add(UUID eventId, String type, String routingKey, String payloadJson) {
        jdbc.sql(
                        """
                        INSERT INTO outbox_event (event_id, type, routing_key, payload)
                        VALUES (:eventId, :type, :routingKey, CAST(:payload AS jsonb))
                        """)
                .param("eventId", eventId)
                .param("type", type)
                .param("routingKey", routingKey)
                .param("payload", payloadJson)
                .update();
    }

    /**
     * The oldest unpublished events, locked for the current transaction.
     *
     * <p>FOR UPDATE locks the rows so nobody else publishes them at the same time. SKIP LOCKED
     * means "do not wait for rows somebody else has locked, just leave them out": with two
     * instances of the API, each one takes a different batch instead of queueing behind the other
     * or publishing the same events twice.
     */
    public List<PendingEvent> lockPending(int limit) {
        return jdbc.sql(
                        """
                        SELECT seq, event_id, type, routing_key, payload::text AS payload
                        FROM outbox_event
                        WHERE published_at IS NULL
                        ORDER BY seq
                        LIMIT :limit
                        FOR UPDATE SKIP LOCKED
                        """)
                .param("limit", limit)
                .query((row, rowNumber) ->
                        new PendingEvent(
                                row.getLong("seq"),
                                row.getObject("event_id", UUID.class),
                                row.getString("type"),
                                row.getString("routing_key"),
                                row.getString("payload")))
                .list();
    }

    public void markPublished(List<Long> seqs) {
        jdbc.sql("UPDATE outbox_event SET published_at = now() WHERE seq IN (:seqs)")
                .param("seqs", seqs)
                .update();
    }
}
