package com.plaza.store.ordering;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** The rules of the order state machine. Plain unit test: no Spring, no database. */
class OrderStatusTest {

    @Test
    void pendingOrderCanBePaid() {
        assertThat(OrderStatus.PENDING_PAYMENT.canTransitionTo(OrderStatus.PAID)).isTrue();
    }

    @Test
    void paidOrderCannotBeCancelled() {
        assertThat(OrderStatus.PAID.canTransitionTo(OrderStatus.CANCELLED)).isFalse();
    }

    // Exercise S6 (docs/exercises/s6.md): cover the remaining 7 combinations of the 3 x 3 table
    // with one parameterized test.
}
