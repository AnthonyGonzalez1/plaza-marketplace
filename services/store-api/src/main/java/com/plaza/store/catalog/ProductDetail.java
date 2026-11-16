package com.plaza.store.catalog;

import com.plaza.store.catalog.ProductSummary.CategoryRef;
import com.plaza.store.catalog.ProductSummary.StoreRef;
import java.math.BigDecimal;

/** A single product page: the same fields as {@link ProductSummary} plus the description. */
public record ProductDetail(
        Long id,
        String name,
        String slug,
        String description,
        BigDecimal price,
        String currency,
        String imageUrl,
        int available,
        StoreRef store,
        CategoryRef category) {}
