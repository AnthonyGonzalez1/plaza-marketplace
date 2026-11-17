package com.plaza.store.ordering;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.plaza.store.ordering.OrderResponse.OrderItemResponse;
import com.plaza.store.outbox.OutboxRepository;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/**
 * Writes order events to the outbox. Every method here must be called inside the transaction that
 * changed the order, so the event exists if and only if the change was committed.
 *
 * <p>The events carry the data a consumer needs (email, items, total), so the notification service
 * can write its email without calling this API back.
 */
@Component
public class OrderEvents {

    /** The message body. This is a contract with other services: change it with care. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record OrderEvent(
            UUID eventId, String type, Instant occurredAt, OrderData order, String reason) {}

    public record OrderData(
            UUID id,
            String email,
            OrderStatus status,
            BigDecimal total,
            String currency,
            List<OrderItemResponse> items) {}

    public static final String REASON_PAYMENT_DECLINED = "PAYMENT_DECLINED";
    public static final String REASON_EXPIRED = "EXPIRED";

    private final OutboxRepository outboxRepository;
    private final ObjectMapper objectMapper;

    public OrderEvents(OutboxRepository outboxRepository, ObjectMapper objectMapper) {
        this.outboxRepository = outboxRepository;
        this.objectMapper = objectMapper;
    }

    public void orderPlaced(OrderResponse order) {
        record("OrderPlaced", "order.placed", order, null);
    }

    public void orderPaid(OrderResponse order) {
        record("OrderPaid", "order.paid", order, null);
    }

    public void orderCancelled(OrderResponse order, String reason) {
        record("OrderCancelled", "order.cancelled", order, reason);
    }

    private void record(String type, String routingKey, OrderResponse order, String reason) {
        UUID eventId = UUID.randomUUID();
        OrderEvent event =
                new OrderEvent(
                        eventId,
                        type,
                        Instant.now().truncatedTo(ChronoUnit.SECONDS),
                        new OrderData(
                                order.id(),
                                order.email(),
                                order.status(),
                                order.total(),
                                order.currency(),
                                order.items()),
                        reason);
        outboxRepository.add(eventId, type, routingKey, objectMapper.writeValueAsString(event));
    }
}
