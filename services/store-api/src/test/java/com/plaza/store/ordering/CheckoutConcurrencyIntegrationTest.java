package com.plaza.store.ordering;

import static org.assertj.core.api.Assertions.assertThat;

import com.plaza.store.TestcontainersConfiguration;
import com.plaza.store.cart.CartService;
import com.plaza.store.shared.ConflictException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * The promise of the project: the last units are never sold twice. Many buyers check out the same
 * product at the same instant against a real PostgreSQL, and the numbers must add up exactly.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class CheckoutConcurrencyIntegrationTest {

    private static final int UNITS_IN_STOCK = 10;
    private static final int BUYERS = 50;

    @Autowired private CheckoutService checkoutService;
    @Autowired private CartService cartService;
    @Autowired private JdbcClient jdbc;

    private long productId;
    private int originalStock;

    @BeforeEach
    void putTenUnitsInStock() {
        productId =
                jdbc.sql("SELECT id FROM product WHERE slug = 'cafe-molido-quindio-500g'")
                        .query(Long.class)
                        .single();
        originalStock = stock();
        setStock(UNITS_IN_STOCK);
    }

    @AfterEach
    void restoreDatabase() {
        jdbc.sql("DELETE FROM processed_webhook").update();
        jdbc.sql("DELETE FROM order_item").update();
        jdbc.sql("DELETE FROM orders").update();
        setStock(originalStock);
    }

    @Test
    void fiftyBuyersForTenUnitsSellExactlyTen() throws Exception {
        // Each buyer has a cart with one unit, prepared before the race starts.
        List<UUID> carts = new ArrayList<>();
        for (int i = 0; i < BUYERS; i++) {
            UUID cartId = cartService.createCart().id();
            cartService.setQuantity(cartId, productId, 1);
            carts.add(cartId);
        }

        // One thread per buyer. They all wait at the latch and are released at once, so the
        // checkouts really overlap instead of running one after another.
        ExecutorService pool = Executors.newFixedThreadPool(BUYERS);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Boolean>> results = new ArrayList<>();
        for (UUID cartId : carts) {
            Callable<Boolean> buyer =
                    () -> {
                        start.await();
                        try {
                            checkoutService.checkout(cartId, "buyer@example.com", null);
                            return true;
                        } catch (ConflictException outOfStock) {
                            return false;
                        }
                    };
            results.add(pool.submit(buyer));
        }
        start.countDown();

        int succeeded = 0;
        int rejected = 0;
        for (Future<Boolean> result : results) {
            // get() also rethrows any unexpected exception of a buyer, failing the test.
            if (result.get(60, TimeUnit.SECONDS)) {
                succeeded++;
            } else {
                rejected++;
            }
        }
        pool.shutdown();

        assertThat(succeeded).as("orders created").isEqualTo(UNITS_IN_STOCK);
        assertThat(rejected).as("buyers told there is no stock").isEqualTo(BUYERS - UNITS_IN_STOCK);
        assertThat(stock()).as("units left").isZero();
        assertThat(count("SELECT count(*) FROM orders")).isEqualTo(UNITS_IN_STOCK);
        assertThat(count("SELECT COALESCE(sum(quantity), 0) FROM order_item"))
                .as("units sold")
                .isEqualTo(UNITS_IN_STOCK);
    }

    private int stock() {
        return jdbc.sql("SELECT available FROM inventory WHERE product_id = :id")
                .param("id", productId)
                .query(Integer.class)
                .single();
    }

    private void setStock(int available) {
        jdbc.sql("UPDATE inventory SET available = :available WHERE product_id = :id")
                .param("available", available)
                .param("id", productId)
                .update();
    }

    private long count(String sql) {
        return jdbc.sql(sql).query(Long.class).single();
    }
}
