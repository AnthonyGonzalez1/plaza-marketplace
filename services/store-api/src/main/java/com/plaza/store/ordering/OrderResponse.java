package com.plaza.store.ordering;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** An order as the API returns it. Names and prices are the ones saved at purchase time. */
public record OrderResponse(
        UUID id,
        OrderStatus status,
        String email,
        BigDecimal total,
        String currency,
        Instant createdAt,
        Instant expiresAt,
        List<OrderItemResponse> items) {

    public record OrderItemResponse(
            long productId,
            String name,
            BigDecimal unitPrice,
            int quantity,
            BigDecimal lineTotal) {}
}
