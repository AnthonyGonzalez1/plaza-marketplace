package com.plaza.store.ordering;

import static org.assertj.core.api.Assertions.assertThat;

import com.plaza.store.TestcontainersConfiguration;
import com.plaza.store.cart.CartService;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * The job that cancels unpaid orders. Scheduling is off in tests, so the job runs only when a test
 * calls it; an order is made "old" by moving its dates into the past.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class ExpiredOrderJobIntegrationTest {

    @Autowired private ExpiredOrderJob job;
    @Autowired private OrderService orderService;
    @Autowired private CartService cartService;
    @Autowired private CheckoutService checkoutService;
    @Autowired private JdbcClient jdbc;

    // Seed data: 20 coffees in stock.
    private long coffee;

    @BeforeEach
    void findProduct() {
        coffee =
                jdbc.sql("SELECT id FROM product WHERE slug = 'cafe-molido-quindio-500g'")
                        .query(Long.class)
                        .single();
    }

    @AfterEach
    void restoreDatabase() {
        jdbc.sql("DELETE FROM processed_webhook").update();
        jdbc.sql("DELETE FROM order_item").update();
        jdbc.sql("DELETE FROM orders").update();
        jdbc.sql("UPDATE inventory SET available = 20 WHERE product_id = :id")
                .param("id", coffee)
                .update();
    }

    @Test
    void cancelsAnUnpaidOrderAfterItsPaymentWindowAndReturnsTheStock() {
        UUID orderId = orderOfCoffees(3);
        assertThat(stock()).isEqualTo(17);
        makeItExpired(orderId);

        job.cancelExpiredOrders();

        assertThat(statusOf(orderId)).isEqualTo("CANCELLED");
        assertThat(stock()).isEqualTo(20);
    }

    @Test
    void leavesAnOrderThatStillHasTimeToBePaid() {
        UUID orderId = orderOfCoffees(3);

        job.cancelExpiredOrders();

        assertThat(statusOf(orderId)).isEqualTo("PENDING_PAYMENT");
        assertThat(stock()).isEqualTo(17);
    }

    @Test
    void neverCancelsAPaidOrder() {
        UUID orderId = orderOfCoffees(3);
        orderService.markPaid(orderId);
        makeItExpired(orderId);

        job.cancelExpiredOrders();

        assertThat(statusOf(orderId)).isEqualTo("PAID");
        assertThat(stock()).isEqualTo(17);
    }

    @Test
    void returnsTheUnitsOfSeveralOrdersOfTheSameProduct() {
        // 2 + 5 units of the same product in two orders: both must come back (7), not only one.
        UUID first = orderOfCoffees(2);
        UUID second = orderOfCoffees(5);
        assertThat(stock()).isEqualTo(13);
        makeItExpired(first);
        makeItExpired(second);

        assertThat(orderService.cancelExpiredOrders()).isEqualTo(2);

        assertThat(stock()).isEqualTo(20);
    }

    @Test
    void runningTheJobAgainReturnsNothingTwice() {
        makeItExpired(orderOfCoffees(3));

        job.cancelExpiredOrders();
        job.cancelExpiredOrders();

        assertThat(stock()).isEqualTo(20);
    }

    private UUID orderOfCoffees(int quantity) {
        UUID cartId = cartService.createCart().id();
        cartService.setQuantity(cartId, coffee, quantity);
        return checkoutService.checkout(cartId, "ana@example.com", null).id();
    }

    // Both dates move, because the table requires expires_at to be after created_at.
    private void makeItExpired(UUID orderId) {
        jdbc.sql(
                        """
                        UPDATE orders
                        SET created_at = now() - interval '1 hour',
                            expires_at = now() - interval '45 minutes'
                        WHERE id = :id
                        """)
                .param("id", orderId)
                .update();
    }

    private String statusOf(UUID orderId) {
        return jdbc.sql("SELECT status FROM orders WHERE id = :id")
                .param("id", orderId)
                .query(String.class)
                .single();
    }

    private int stock() {
        return jdbc.sql("SELECT available FROM inventory WHERE product_id = :id")
                .param("id", coffee)
                .query(Integer.class)
                .single();
    }
}
