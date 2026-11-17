package com.plaza.store.payments;

import com.plaza.store.ordering.OrderResponse;
import com.plaza.store.ordering.OrderService;
import com.plaza.store.ordering.OrderStatus;
import com.plaza.store.shared.ConflictException;
import com.plaza.store.shared.InvalidRequestException;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PaymentService {

    /** What happened with a webhook; returned to the gateway and useful in logs and tests. */
    public enum WebhookResult {
        /** The order changed (to PAID or CANCELLED). */
        PROCESSED,
        /** This event had already been handled: nothing was done. */
        DUPLICATE,
        /** New event, but the order was not awaiting payment any more: nothing was done. */
        IGNORED
    }

    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);

    private final OrderService orderService;
    private final PaymentGateway paymentGateway;
    private final ProcessedWebhookRepository processedWebhooks;

    public PaymentService(
            OrderService orderService,
            PaymentGateway paymentGateway,
            ProcessedWebhookRepository processedWebhooks) {
        this.orderService = orderService;
        this.paymentGateway = paymentGateway;
        this.processedWebhooks = processedWebhooks;
    }

    /** Sends an order to the payment gateway. The result arrives later in {@link #handle}. */
    public void startPayment(UUID orderId, String simulateOutcome) {
        OrderResponse order = orderService.getOrder(orderId);
        if (!order.status().canTransitionTo(OrderStatus.PAID)) {
            throw new ConflictException(
                    "Order " + orderId + " is not awaiting payment: it is " + order.status(),
                    Map.of("orderStatus", order.status()));
        }
        paymentGateway.requestPayment(orderId, order.total(), order.currency(), simulateOutcome);
    }

    /**
     * Applies the result of a payment to its order, exactly once.
     *
     * <p>Recording the event and changing the order share one transaction. If changing the order
     * fails, the record of the event is rolled back too, so the gateway's retry is treated as new
     * and tried again. Without the shared transaction an event could be marked as handled while its
     * order never changed.
     */
    @Transactional
    public WebhookResult handle(PaymentEvent event) {
        OrderResponse order = orderService.getOrder(event.orderId());
        if (order.total().compareTo(event.amount()) != 0) {
            throw new InvalidRequestException(
                    "Payment amount does not match the total of order " + order.id());
        }

        if (!processedWebhooks.recordIfNew(event.eventId(), event.orderId(), event.status())) {
            log.info("Duplicate payment event {} ignored", event.eventId());
            return WebhookResult.DUPLICATE;
        }

        boolean changed =
                switch (event.status()) {
                    case "APPROVED" -> orderService.markPaid(event.orderId());
                    case "DECLINED" -> orderService.cancel(event.orderId());
                    default ->
                            throw new InvalidRequestException(
                                    "Unknown payment status: " + event.status());
                };
        if (!changed) {
            // For example: the payment was approved after the order expired and was cancelled.
            // A real shop would refund the money here; the simulator moves none.
            log.warn(
                    "Payment event {} ({}) arrived for order {} that was not awaiting payment",
                    event.eventId(),
                    event.status(),
                    event.orderId());
            return WebhookResult.IGNORED;
        }
        log.info("Order {} is now {}", event.orderId(), event.status());
        return WebhookResult.PROCESSED;
    }
}
