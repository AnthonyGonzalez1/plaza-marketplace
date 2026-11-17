package com.plaza.store.cart;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Repository;

/**
 * Carts live in Redis, not in PostgreSQL: they change on every click, most are abandoned, and
 * losing one is harmless. Redis keeps them in memory and deletes them by itself when they expire.
 *
 * <p>Each cart is one Redis hash (a small map stored under one key):
 *
 * <pre>
 * cart:3f2a...   createdAt    -> 2026-11-16T20:00:00Z
 *                product:12   -> 2        (2 units of product 12)
 *                product:40   -> 1
 * </pre>
 *
 * A hash instead of one JSON text because Redis changes a single field atomically: two browser tabs
 * changing different products at the same time cannot overwrite each other.
 */
@Repository
public class CartRepository {

    private static final String KEY_PREFIX = "cart:";
    private static final String ITEM_PREFIX = "product:";
    // Redis deletes a hash when its last field is removed. This field keeps an empty cart alive.
    private static final String CREATED_AT = "createdAt";

    private final StringRedisTemplate redis;
    private final Duration ttl;

    public CartRepository(StringRedisTemplate redis, @Value("${plaza.cart.ttl}") Duration ttl) {
        this.redis = redis;
        this.ttl = ttl;
    }

    public UUID create() {
        UUID cartId = UUID.randomUUID();
        redis.opsForHash().put(key(cartId), CREATED_AT, Instant.now().toString());
        refreshExpiry(cartId);
        return cartId;
    }

    public boolean exists(UUID cartId) {
        return Boolean.TRUE.equals(redis.hasKey(key(cartId)));
    }

    /** Product id -> quantity, ordered by product id. Empty if the cart has no items. */
    public Map<Long, Integer> findItems(UUID cartId) {
        Map<Long, Integer> items = new TreeMap<>();
        redis.opsForHash()
                .entries(key(cartId))
                .forEach((field, value) -> {
                    String name = (String) field;
                    if (name.startsWith(ITEM_PREFIX)) {
                        long productId = Long.parseLong(name.substring(ITEM_PREFIX.length()));
                        items.put(productId, Integer.valueOf((String) value));
                    }
                });
        return items;
    }

    public void setQuantity(UUID cartId, long productId, int quantity) {
        redis.opsForHash().put(key(cartId), ITEM_PREFIX + productId, String.valueOf(quantity));
        refreshExpiry(cartId);
    }

    public void removeItem(UUID cartId, long productId) {
        redis.opsForHash().delete(key(cartId), ITEM_PREFIX + productId);
        refreshExpiry(cartId);
    }

    public void delete(UUID cartId) {
        redis.delete(key(cartId));
    }

    // Every change pushes the expiry forward: a cart dies after a period of inactivity, not a
    // fixed time after it was created.
    private void refreshExpiry(UUID cartId) {
        redis.expire(key(cartId), ttl);
    }

    private static String key(UUID cartId) {
        return KEY_PREFIX + cartId;
    }
}
