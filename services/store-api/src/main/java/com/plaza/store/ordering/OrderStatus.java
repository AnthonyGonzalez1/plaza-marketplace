package com.plaza.store.ordering;

/** Must match the CHECK constraint on {@code orders.status} (migration V7). */
public enum OrderStatus {
    /** Units are reserved and the order waits for its payment until {@code expiresAt}. */
    PENDING_PAYMENT,
    PAID,
    CANCELLED
}
