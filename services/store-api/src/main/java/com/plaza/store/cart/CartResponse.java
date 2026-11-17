package com.plaza.store.cart;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/** A cart as the API returns it. Prices are always the current ones from the catalog. */
public record CartResponse(
        UUID id, List<CartItemResponse> items, int totalItems, BigDecimal total, String currency) {

    public record CartItemResponse(
            long productId,
            String name,
            String imageUrl,
            BigDecimal unitPrice,
            int quantity,
            // Units in stock right now. The cart reserves nothing: checkout decides.
            int available,
            BigDecimal lineTotal) {}
}
