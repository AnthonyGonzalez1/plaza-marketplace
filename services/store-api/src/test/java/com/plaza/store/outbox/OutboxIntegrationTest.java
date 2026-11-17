package com.plaza.store.outbox;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.jayway.jsonpath.JsonPath;
import com.plaza.store.TestcontainersConfiguration;
import com.plaza.store.cart.CartService;
import com.plaza.store.ordering.CheckoutService;
import com.plaza.store.ordering.OrderService;
import com.plaza.store.shared.ConflictException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.AmqpAdmin;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * The outbox pattern end to end with a real PostgreSQL and a real RabbitMQ: events are written with
 * the order change, and the relay delivers them to a queue. Scheduling is off in tests, so the
 * relay runs only when a test calls it.
 */
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class OutboxIntegrationTest {

    private static final String TEST_QUEUE = "test.order-events";

    @Autowired private OutboxRelay relay;
    @Autowired private OrderService orderService;
    @Autowired private CartService cartService;
    @Autowired private CheckoutService checkoutService;
    @Autowired private JdbcClient jdbc;
    @Autowired private AmqpAdmin amqpAdmin;
    @Autowired private RabbitTemplate rabbitTemplate;
    @Autowired private TopicExchange plazaEventsExchange;

    // Seed data: coffee costs 32000 with 20 in stock.
    private long coffee;

    @BeforeEach
    void prepare() {
        coffee =
                jdbc.sql("SELECT id FROM product WHERE slug = 'cafe-molido-quindio-500g'")
                        .query(Long.class)
                        .single();
        // Other test classes leave events behind: start from an empty outbox and an empty queue.
        jdbc.sql("DELETE FROM outbox_event").update();
        // A durable queue of this test (RabbitMQ 4 rejects transient shared queues) that plays
        // the role of a consumer, bound like the notification
        // service binds its own: every routing key that starts with "order.".
        Queue queue = new Queue(TEST_QUEUE, true, false, false);
        amqpAdmin.declareQueue(queue);
        Binding binding = BindingBuilder.bind(queue).to(plazaEventsExchange).with("order.*");
        amqpAdmin.declareBinding(binding);
        amqpAdmin.purgeQueue(TEST_QUEUE, false);
    }

    @AfterEach
    void restoreDatabase() {
        jdbc.sql("DELETE FROM outbox_event").update();
        jdbc.sql("DELETE FROM processed_webhook").update();
        jdbc.sql("DELETE FROM order_item").update();
        jdbc.sql("DELETE FROM orders").update();
        jdbc.sql("UPDATE inventory SET available = 20 WHERE product_id = :id")
                .param("id", coffee)
                .update();
    }

    // ---- First half: the event is written together with the change ----

    @Test
    void checkoutWritesAnOrderPlacedEvent() {
        UUID orderId = orderOfCoffees(2);

        assertThat(pendingTypes()).containsExactly("OrderPlaced");
        String payload = pendingPayloads().get(0);
        assertThat((String) JsonPath.read(payload, "$.type")).isEqualTo("OrderPlaced");
        assertThat((String) JsonPath.read(payload, "$.order.id")).isEqualTo(orderId.toString());
        assertThat((String) JsonPath.read(payload, "$.order.email")).isEqualTo("ana@example.com");
        assertThat((String) JsonPath.read(payload, "$.order.status")).isEqualTo("PENDING_PAYMENT");
        assertThat(((Number) JsonPath.read(payload, "$.order.total")).intValue()).isEqualTo(64000);
        assertThat((Integer) JsonPath.read(payload, "$.order.items[0].quantity")).isEqualTo(2);
        assertThat((String) JsonPath.read(payload, "$.eventId")).isNotBlank();
    }

    @Test
    void failedCheckoutLeavesNoEvent() {
        // 21 coffees wanted, 20 in stock: the transaction is rolled back, and the event with it.
        UUID cartId = cartService.createCart().id();
        cartService.setQuantity(cartId, coffee, 21);

        assertThatThrownBy(() -> checkoutService.checkout(cartId, "ana@example.com", null))
                .isInstanceOf(ConflictException.class);

        assertThat(pendingTypes()).isEmpty();
    }

    @Test
    void payingWritesAnOrderPaidEvent() {
        UUID orderId = orderOfCoffees(2);

        orderService.markPaid(orderId);

        assertThat(pendingTypes()).containsExactly("OrderPlaced", "OrderPaid");
        String paid = pendingPayloads().get(1);
        assertThat((String) JsonPath.read(paid, "$.order.status")).isEqualTo("PAID");
        // "reason" only exists in cancellations.
        assertThat(paid).doesNotContain("reason");
    }

    @Test
    void aChangeThatDoesNotHappenWritesNoEvent() {
        UUID orderId = orderOfCoffees(2);
        orderService.markPaid(orderId);

        // Already paid: both calls change nothing, so they must not announce anything.
        orderService.markPaid(orderId);
        orderService.cancel(orderId);

        assertThat(pendingTypes()).containsExactly("OrderPlaced", "OrderPaid");
    }

    @Test
    void decliningWritesAnOrderCancelledEventWithItsReason() {
        UUID orderId = orderOfCoffees(2);

        orderService.cancel(orderId);

        assertThat(pendingTypes()).containsExactly("OrderPlaced", "OrderCancelled");
        String cancelled = pendingPayloads().get(1);
        assertThat((String) JsonPath.read(cancelled, "$.reason")).isEqualTo("PAYMENT_DECLINED");
        assertThat((String) JsonPath.read(cancelled, "$.order.status")).isEqualTo("CANCELLED");
    }

    @Test
    void expiryWritesOneEventPerCancelledOrder() {
        UUID first = orderOfCoffees(1);
        UUID second = orderOfCoffees(1);
        jdbc.sql(
                        """
                        UPDATE orders
                        SET created_at = now() - interval '1 hour',
                            expires_at = now() - interval '45 minutes'
                        WHERE id IN (:ids)
                        """)
                .param("ids", List.of(first, second))
                .update();

        orderService.cancelExpiredOrders();

        assertThat(pendingTypes())
                .containsExactly("OrderPlaced", "OrderPlaced", "OrderCancelled", "OrderCancelled");
        assertThat((String) JsonPath.read(pendingPayloads().get(2), "$.reason"))
                .isEqualTo("EXPIRED");
    }

    // ---- Second half: the relay delivers the events to the broker ----

    @Test
    void relayPublishesPendingEventsInOrderAndMarksThem() {
        UUID orderId = orderOfCoffees(2);
        orderService.markPaid(orderId);

        assertThat(relay.publishPending()).isEqualTo(2);

        Message placed = rabbitTemplate.receive(TEST_QUEUE, 5_000);
        Message paid = rabbitTemplate.receive(TEST_QUEUE, 5_000);
        assertThat(placed).isNotNull();
        assertThat(paid).isNotNull();
        assertThat(placed.getMessageProperties().getType()).isEqualTo("OrderPlaced");
        assertThat(placed.getMessageProperties().getReceivedRoutingKey()).isEqualTo("order.placed");
        assertThat(paid.getMessageProperties().getType()).isEqualTo("OrderPaid");
        assertThat(paid.getMessageProperties().getReceivedRoutingKey()).isEqualTo("order.paid");
        assertThat(paid.getMessageProperties().getContentType()).isEqualTo("application/json");

        String body = new String(paid.getBody(), StandardCharsets.UTF_8);
        assertThat((String) JsonPath.read(body, "$.order.id")).isEqualTo(orderId.toString());
        // The message id is the event id: what a consumer uses to detect a repeated delivery.
        assertThat(paid.getMessageProperties().getMessageId())
                .isEqualTo(JsonPath.read(body, "$.eventId"));

        assertThat(pendingTypes()).isEmpty();
    }

    @Test
    void relayPublishesEachEventOnce() {
        orderOfCoffees(2);
        relay.publishPending();
        rabbitTemplate.receive(TEST_QUEUE, 5_000);

        assertThat(relay.publishPending()).isZero();

        assertThat(rabbitTemplate.receive(TEST_QUEUE, 500)).isNull();
    }

    private UUID orderOfCoffees(int quantity) {
        UUID cartId = cartService.createCart().id();
        cartService.setQuantity(cartId, coffee, quantity);
        return checkoutService.checkout(cartId, "ana@example.com", null).id();
    }

    private List<String> pendingTypes() {
        return jdbc.sql("SELECT type FROM outbox_event WHERE published_at IS NULL ORDER BY seq")
                .query(String.class)
                .list();
    }

    private List<String> pendingPayloads() {
        return jdbc.sql(
                        """
                        SELECT payload::text FROM outbox_event
                        WHERE published_at IS NULL ORDER BY seq
                        """)
                .query(String.class)
                .list();
    }
}
