package com.plaza.store.payments;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * The external company that moves the money. An interface so the rest of the code does not know how
 * it is reached, and so tests can replace it with a fake instead of calling the network.
 */
public interface PaymentGateway {

    /**
     * Asks the gateway to charge an order. The gateway only confirms that it RECEIVED the request;
     * the result (approved or declined) arrives later through a webhook.
     *
     * @param simulateOutcome "APPROVED", "DECLINED" or null to let the gateway decide (the
     *     simulator supports this to demonstrate both paths)
     * @throws PaymentGatewayUnavailableException if the gateway cannot be reached or rejects the
     *     request
     */
    void requestPayment(UUID orderId, BigDecimal amount, String currency, String simulateOutcome);
}
