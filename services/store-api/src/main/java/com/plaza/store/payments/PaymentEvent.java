package com.plaza.store.payments;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Body of a payment webhook.
 *
 * @param eventId unique per event and repeated when the gateway delivers the same event again; this
 *     is what makes deduplication possible
 * @param status APPROVED or DECLINED
 */
public record PaymentEvent(
        UUID eventId,
        UUID paymentId,
        UUID orderId,
        String status,
        BigDecimal amount,
        String currency,
        Instant occurredAt) {}
