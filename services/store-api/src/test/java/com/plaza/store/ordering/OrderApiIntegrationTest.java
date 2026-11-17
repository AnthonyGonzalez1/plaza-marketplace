package com.plaza.store.ordering;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.plaza.store.TestcontainersConfiguration;
import com.plaza.store.cart.CartService;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
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
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Checkout through the whole application: cart in Redis, stock and order in PostgreSQL. The tests
 * share the database with the catalog tests, so each one puts the stock back when it ends.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class OrderApiIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcClient jdbc;
    @Autowired private CartService cartService;
    @Autowired private CheckoutService checkoutService;

    // Seed data: coffee costs 32000 with 20 in stock; the basket costs 230000 with 1 in stock.
    private long coffee;
    private long basket;

    @BeforeEach
    void findProducts() {
        coffee = productId("cafe-molido-quindio-500g");
        basket = productId("canasto-de-werregue-pequeno");
    }

    @AfterEach
    void restoreDatabase() {
        jdbc.sql("DELETE FROM processed_webhook").update();
        jdbc.sql("DELETE FROM order_item").update();
        jdbc.sql("DELETE FROM orders").update();
        setStock(coffee, 20);
        setStock(basket, 1);
        jdbc.sql("UPDATE product SET price = 32000 WHERE id = :id").param("id", coffee).update();
    }

    @Test
    void checkoutCreatesAPendingOrderAndReservesTheStock() throws Exception {
        UUID cartId = cartWith(coffee, 2, basket, 1);
        Instant before = Instant.now();

        String body =
                checkout(cartId, "ana@example.com")
                        .andExpect(status().isCreated())
                        .andExpect(jsonPath("$.status", is("PENDING_PAYMENT")))
                        .andExpect(jsonPath("$.email", is("ana@example.com")))
                        .andExpect(jsonPath("$.total", is(294000.00)))
                        .andExpect(jsonPath("$.currency", is("COP")))
                        .andExpect(jsonPath("$.items", hasSize(2)))
                        .andExpect(jsonPath("$.items[0].name", is("Café molido Quindío 500 g")))
                        .andExpect(jsonPath("$.items[0].unitPrice", is(32000.00)))
                        .andExpect(jsonPath("$.items[0].quantity", is(2)))
                        .andExpect(jsonPath("$.items[0].lineTotal", is(64000.00)))
                        .andReturn()
                        .getResponse()
                        .getContentAsString();

        String orderId = JsonPath.read(body, "$.id");
        // The payment window is 15 minutes from now.
        Instant expiresAt = Instant.parse(JsonPath.read(body, "$.expiresAt"));
        assertThat(expiresAt)
                .isBetween(
                        before.plus(14, ChronoUnit.MINUTES), before.plus(16, ChronoUnit.MINUTES));

        assertThat(stockOf(coffee)).isEqualTo(18);
        assertThat(stockOf(basket)).isZero();

        mockMvc.perform(get("/api/v1/orders/{id}", orderId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(orderId)))
                .andExpect(jsonPath("$.items", hasSize(2)));
    }

    @Test
    void checkoutReturnsTheLocationOfTheNewOrder() throws Exception {
        String body =
                checkout(cartWith(coffee, 1), "ana@example.com")
                        .andExpect(status().isCreated())
                        .andExpect(header().exists("Location"))
                        .andReturn()
                        .getResponse()
                        .getContentAsString();

        String orderId = JsonPath.read(body, "$.id");
        mockMvc.perform(get("/api/v1/orders/{id}", orderId)).andExpect(status().isOk());
    }

    @Test
    void checkoutDeletesTheCart() throws Exception {
        UUID cartId = cartWith(coffee, 1);

        checkout(cartId, "ana@example.com").andExpect(status().isCreated());

        mockMvc.perform(get("/api/v1/carts/{id}", cartId)).andExpect(status().isNotFound());
        // Sending the same checkout again cannot buy twice: the cart is gone.
        checkout(cartId, "ana@example.com").andExpect(status().isBadRequest());
        assertThat(stockOf(coffee)).isEqualTo(19);
    }

    @Test
    void notEnoughStockReturns409AndReservesNothing() throws Exception {
        // 2 baskets wanted, 1 in stock. The coffee comes first and is reserved before the
        // basket fails: the rollback must give those 5 units back.
        UUID cartId = cartWith(coffee, 5, basket, 2);

        checkout(cartId, "ana@example.com")
                .andExpect(status().isConflict())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status", is(409)))
                .andExpect(jsonPath("$.detail", is("Not enough stock for product " + basket)))
                .andExpect(jsonPath("$.productId", is((int) basket)));

        assertThat(stockOf(coffee)).isEqualTo(20);
        assertThat(stockOf(basket)).isEqualTo(1);
        assertThat(count("orders")).isZero();
        assertThat(count("order_item")).isZero();
        // The buyer keeps the cart to fix the quantity.
        mockMvc.perform(get("/api/v1/carts/{id}", cartId)).andExpect(status().isOk());
    }

    @Test
    void orderKeepsThePricePaidWhenTheCatalogPriceChanges() throws Exception {
        String body =
                checkout(cartWith(coffee, 1), "ana@example.com")
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        String orderId = JsonPath.read(body, "$.id");

        jdbc.sql("UPDATE product SET price = 99000 WHERE id = :id").param("id", coffee).update();

        mockMvc.perform(get("/api/v1/orders/{id}", orderId))
                .andExpect(jsonPath("$.items[0].unitPrice", is(32000.00)))
                .andExpect(jsonPath("$.total", is(32000.00)));
    }

    @Test
    void emptyCartReturns400() throws Exception {
        UUID emptyCart = cartService.createCart().id();

        checkout(emptyCart, "ana@example.com")
                .andExpect(status().isBadRequest())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(
                        jsonPath(
                                "$.detail",
                                is("Cart " + emptyCart + " is empty or does not exist")));
    }

    @Test
    void invalidEmailReturns400AndReservesNothing() throws Exception {
        checkout(cartWith(coffee, 1), "not-an-email")
                .andExpect(status().isBadRequest())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON));

        assertThat(stockOf(coffee)).isEqualTo(20);
    }

    @Test
    void unknownOrderReturns404ProblemDetail() throws Exception {
        UUID unknown = UUID.randomUUID();
        mockMvc.perform(get("/api/v1/orders/{id}", unknown))
                .andExpect(status().isNotFound())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail", is("Order " + unknown + " not found")));
    }

    @Test
    void databaseRejectsAnUnknownOrderStatus() {
        // The CHECK constraint protects the data even from code that bypasses the application.
        assertThatThrownBy(() ->
                        jdbc.sql(
                                        """
                                        INSERT INTO orders (email, status, total, expires_at)
                                        VALUES ('a@b.co', 'SHIPPED', 1000, now() + interval '15 minutes')
                                        """)
                                .update())
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("ck_orders_status");
    }

    @Test
    void sameIdempotencyKeyReturnsTheSameOrderAndReservesOnce() throws Exception {
        UUID cartId = cartWith(coffee, 2);
        String key = UUID.randomUUID().toString();

        String first =
                checkoutWithKey(cartId, key)
                        .andExpect(status().isCreated())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();
        // The retry: the browser never saw the first answer and sends the request again.
        String second =
                checkoutWithKey(cartId, key)
                        .andExpect(status().isCreated())
                        .andReturn()
                        .getResponse()
                        .getContentAsString();

        assertThat((String) JsonPath.read(second, "$.id")).isEqualTo(JsonPath.read(first, "$.id"));
        assertThat(count("orders")).isEqualTo(1);
        assertThat(stockOf(coffee)).isEqualTo(18);
    }

    @Test
    void sameKeyInParallelCreatesOneOrder() throws Exception {
        // A double click: several identical requests at the same instant. Only the UNIQUE
        // constraint can stop this; a "does the key exist?" check passes for all of them.
        UUID cartId = cartWith(coffee, 2);
        String key = UUID.randomUUID().toString();
        int requests = 8;

        ExecutorService pool = Executors.newFixedThreadPool(requests);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<UUID>> results = new ArrayList<>();
        for (int i = 0; i < requests; i++) {
            results.add(
                    pool.submit(() -> {
                        start.await();
                        return checkoutService.checkout(cartId, "ana@example.com", key).id();
                    }));
        }
        start.countDown();

        Set<UUID> orderIds = new HashSet<>();
        for (Future<UUID> result : results) {
            orderIds.add(result.get(60, TimeUnit.SECONDS));
        }
        pool.shutdown();

        assertThat(orderIds).as("every request got the same order").hasSize(1);
        assertThat(count("orders")).isEqualTo(1);
        assertThat(stockOf(coffee)).isEqualTo(18);
    }

    @Test
    void idempotencyKeyThatIsTooLongReturns400() throws Exception {
        checkoutWithKey(cartWith(coffee, 1), "x".repeat(101)).andExpect(status().isBadRequest());

        assertThat(stockOf(coffee)).isEqualTo(20);
    }

    private ResultActions checkoutWithKey(UUID cartId, String key) throws Exception {
        return mockMvc.perform(
                post("/api/v1/orders")
                        .header("Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(
                                "{\"cartId\": \"%s\", \"email\": \"ana@example.com\"}"
                                        .formatted(cartId)));
    }

    private ResultActions checkout(UUID cartId, String email) throws Exception {
        return mockMvc.perform(
                post("/api/v1/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(
                                "{\"cartId\": \"%s\", \"email\": \"%s\"}"
                                        .formatted(cartId, email)));
    }

    private UUID cartWith(long productId, int quantity) {
        UUID cartId = cartService.createCart().id();
        cartService.setQuantity(cartId, productId, quantity);
        return cartId;
    }

    private UUID cartWith(long firstProduct, int firstQuantity, long secondProduct, int quantity) {
        UUID cartId = cartWith(firstProduct, firstQuantity);
        cartService.setQuantity(cartId, secondProduct, quantity);
        return cartId;
    }

    private long productId(String slug) {
        return jdbc.sql("SELECT id FROM product WHERE slug = :slug")
                .param("slug", slug)
                .query(Long.class)
                .single();
    }

    private int stockOf(long productId) {
        return jdbc.sql("SELECT available FROM inventory WHERE product_id = :id")
                .param("id", productId)
                .query(Integer.class)
                .single();
    }

    private void setStock(long productId, int available) {
        jdbc.sql("UPDATE inventory SET available = :available WHERE product_id = :id")
                .param("available", available)
                .param("id", productId)
                .update();
    }

    private long count(String table) {
        // The table name comes from this test class, never from outside.
        return jdbc.sql("SELECT count(*) FROM " + table).query(Long.class).single();
    }
}
