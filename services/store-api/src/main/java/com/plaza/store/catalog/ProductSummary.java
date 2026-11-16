package com.plaza.store.catalog;

import java.math.BigDecimal;

/** A product as shown in a list. This is the JSON shape of the REST contract. */
public record ProductSummary(
        Long id,
        String name,
        String slug,
        BigDecimal price,
        String currency,
        String imageUrl,
        int available,
        StoreRef store,
        CategoryRef category) {

    /** The store a product belongs to, reduced to what a product card needs. */
    public record StoreRef(Long id, String name, String slug) {}

    /** The category of a product. */
    public record CategoryRef(Long id, String name, String slug) {}
}
