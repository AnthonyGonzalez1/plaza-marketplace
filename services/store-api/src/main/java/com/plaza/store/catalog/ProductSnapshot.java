package com.plaza.store.catalog;

import java.math.BigDecimal;

/**
 * What the cart and checkout need to know about a product right now: its name, its current price
 * and how many units can still be sold.
 */
public record ProductSnapshot(
        long id, String name, BigDecimal price, String imageUrl, int available) {}
