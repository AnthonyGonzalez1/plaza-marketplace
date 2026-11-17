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

    private final JdbcClient jdbc;

    public OrderRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Inserts the order in PENDING_PAYMENT (the column default) and returns its new id. */
    public UUID insertOrder(String email, BigDecimal total, OffsetDateTime expiresAt) {
        // RETURNING gives back columns of the inserted row, here the id the database generated,
        // without a second query.
        return jdbc.sql(
                        """
                        INSERT INTO orders (email, total, expires_at)
                        VALUES (:email, :total, :expiresAt)
                        RETURNING id
                        """)
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
