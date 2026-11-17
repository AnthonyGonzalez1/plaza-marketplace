package com.plaza.store.ordering;

import com.plaza.store.ordering.OrderResponse.OrderItemResponse;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Orders and their items in plain SQL (see ADR-0005). */
@Repository
public class OrderRepository {

    private static final String CURRENCY = "COP";

    // Cancels orders and gives their units back in ONE statement, so both things succeed or fail
    // together. Each WITH block (a "CTE") is a step that feeds the next one:
    //   cancelled: mark the orders and remember which ones (RETURNING id).
    //   returned:  add up the units of those orders per product. The sum matters: UPDATE ... FROM
    //              applies only ONE matching row to each inventory row, so two cancelled orders
    //              of the same product must arrive as a single row with the total.
    //   restocked: give the units back.
    // The status condition makes it safe against a payment confirmed at the same moment: both
    // statements want the same order row, one waits for the other, and the loser finds the status
    // already changed and does nothing.
    // %s is replaced by one of two fixed conditions of this class, never by client input.
    private static final String CANCEL_AND_RESTOCK =
            """
            WITH cancelled AS (
                UPDATE orders
                SET status = 'CANCELLED'
                WHERE status = 'PENDING_PAYMENT'
                  AND %s
                RETURNING id
            ), returned AS (
                SELECT oi.product_id, sum(oi.quantity) AS quantity
                FROM order_item oi
                JOIN cancelled c ON c.id = oi.order_id
                GROUP BY oi.product_id
            ), restocked AS (
                UPDATE inventory i
                SET available = i.available + r.quantity
                FROM returned r
                WHERE i.product_id = r.product_id
            )
            SELECT id FROM cancelled
            """;

    private final JdbcClient jdbc;

    public OrderRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Inserts the order in PENDING_PAYMENT (the column default) and returns its new id. */
    public UUID insertOrder(
            String email, BigDecimal total, OffsetDateTime expiresAt, String idempotencyKey) {
        // RETURNING gives back columns of the inserted row, here the id the database generated,
        // without a second query.
        return jdbc.sql(
                        """
                        INSERT INTO orders (email, total, expires_at, idempotency_key)
                        VALUES (:email, :total, :expiresAt, :idempotencyKey)
                        RETURNING id
                        """)
                .param("idempotencyKey", idempotencyKey)
                .param("email", email)
                .param("total", total)
                .param("expiresAt", expiresAt)
                .query(UUID.class)
                .single();
    }

    public void insertItem(
            UUID orderId, long productId, String productName, BigDecimal unitPrice, int quantity) {
        jdbc.sql(
                        """
                        INSERT INTO order_item (order_id, product_id, product_name, unit_price, quantity)
                        VALUES (:orderId, :productId, :productName, :unitPrice, :quantity)
                        """)
                .param("orderId", orderId)
                .param("productId", productId)
                .param("productName", productName)
                .param("unitPrice", unitPrice)
                .param("quantity", quantity)
                .update();
    }

    public Optional<UUID> findIdByIdempotencyKey(String idempotencyKey) {
        return jdbc.sql("SELECT id FROM orders WHERE idempotency_key = :key")
                .param("key", idempotencyKey)
                .query(UUID.class)
                .optional();
    }

    /**
     * PENDING_PAYMENT -> PAID. The status is part of the WHERE, so the change only happens if the
     * order is still pending: a payment that arrives after the order was cancelled changes nothing.
     *
     * @return true if the order was marked as paid
     */
    public boolean markPaid(UUID orderId) {
        int updatedRows =
                jdbc.sql(
                                """
                                UPDATE orders
                                SET status = 'PAID'
                                WHERE id = :orderId
                                  AND status = 'PENDING_PAYMENT'
                                """)
                        .param("orderId", orderId)
                        .update();
        return updatedRows == 1;
    }

    /**
     * PENDING_PAYMENT -> CANCELLED for one order, giving its units back to the stock.
     *
     * @return true if the order was cancelled, false if it was not pending any more
     */
    public boolean cancelAndRestock(UUID orderId) {
        return !jdbc.sql(CANCEL_AND_RESTOCK.formatted("id = :orderId"))
                .param("orderId", orderId)
                .query(UUID.class)
                .list()
                .isEmpty();
    }

    /**
     * Cancels every pending order whose payment window is over and returns their units.
     *
     * @return the ids of the orders that were cancelled
     */
    public List<UUID> cancelExpiredAndRestock() {
        return jdbc.sql(CANCEL_AND_RESTOCK.formatted("expires_at < now()"))
                .query(UUID.class)
                .list();
    }

    public Optional<OrderResponse> findById(UUID orderId) {
        List<OrderItemResponse> items =
                jdbc.sql(
                                """
                                SELECT product_id, product_name, unit_price, quantity,
                                       unit_price * quantity AS line_total
                                FROM order_item
                                WHERE order_id = :orderId
                                ORDER BY product_id
                                """)
                        .param("orderId", orderId)
                        .query((row, rowNumber) ->
                                new OrderItemResponse(
                                        row.getLong("product_id"),
                                        row.getString("product_name"),
                                        row.getBigDecimal("unit_price"),
                                        row.getInt("quantity"),
                                        row.getBigDecimal("line_total")))
                        .list();

        return jdbc.sql(
                        """
                        SELECT id, status, email, total, created_at, expires_at
                        FROM orders
                        WHERE id = :orderId
                        """)
                .param("orderId", orderId)
                .query((row, rowNumber) ->
                        new OrderResponse(
                                row.getObject("id", UUID.class),
                                OrderStatus.valueOf(row.getString("status")),
                                row.getString("email"),
                                row.getBigDecimal("total"),
                                CURRENCY,
                                row.getObject("created_at", OffsetDateTime.class).toInstant(),
                                row.getObject("expires_at", OffsetDateTime.class).toInstant(),
                                items))
                .optional();
    }
}
