package com.plaza.store.ordering;

/**
 * The life of an order is a small state machine:
 *
 * <pre>
 * PENDING_PAYMENT --payment approved--------------> PAID
 * PENDING_PAYMENT --payment declined or expired---> CANCELLED
 * </pre>
 *
 * PAID and CANCELLED are final. The names must match the CHECK constraint on {@code orders.status}
 * (migration V7).
 */
public enum OrderStatus {
    /** Units are reserved and the order waits for its payment until {@code expiresAt}. */
    PENDING_PAYMENT,
    PAID,
    CANCELLED;

    /**
     * The rule of the state machine in one place. The SQL that changes the status enforces the same
     * rule with {@code WHERE status = 'PENDING_PAYMENT'}, which is what protects the data when two
     * changes arrive at the same time.
     */
    public boolean canTransitionTo(OrderStatus next) {
        return this == PENDING_PAYMENT && (next == PAID || next == CANCELLED);
    }
}
