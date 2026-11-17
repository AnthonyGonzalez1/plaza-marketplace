package com.plaza.store.payments;

import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class ProcessedWebhookRepository {

    private final JdbcClient jdbc;

    public ProcessedWebhookRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Records that an event is being handled.
     *
     * <p>"Have I seen this event?" is answered by trying to insert it, not by a SELECT first: two
     * deliveries of the same event at the same instant would both see "not yet" in a SELECT. The
     * primary key lets only one INSERT in. ON CONFLICT DO NOTHING turns the duplicate into "0 rows
     * inserted" instead of an error.
     *
     * @return true if the event is new, false if it had been recorded before
     */
    public boolean recordIfNew(UUID eventId, UUID orderId, String status) {
        int insertedRows =
                jdbc.sql(
                                """
                                INSERT INTO processed_webhook (event_id, order_id, status)
                                VALUES (:eventId, :orderId, :status)
                                ON CONFLICT (event_id) DO NOTHING
                                """)
                        .param("eventId", eventId)
                        .param("orderId", orderId)
                        .param("status", status)
                        .update();
        return insertedRows == 1;
    }
}
