package com.plaza.store;

import com.plaza.store.payments.PaymentGateway;
import com.plaza.store.payments.PaymentGatewayUnavailableException;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Stands in for the real payment gateway in the tests: it remembers what it was asked instead of
 * calling the network, and can be told to fail.
 */
public class FakePaymentGateway implements PaymentGateway {

    public record Request(UUID orderId, BigDecimal amount, String currency, String outcome) {}

    private final List<Request> requests = new ArrayList<>();
    private boolean unavailable;

    @Override
    public synchronized void requestPayment(
            UUID orderId, BigDecimal amount, String currency, String simulateOutcome) {
        if (unavailable) {
            throw new PaymentGatewayUnavailableException(new RuntimeException("gateway is down"));
        }
        requests.add(new Request(orderId, amount, currency, simulateOutcome));
    }

    public synchronized List<Request> requests() {
        return List.copyOf(requests);
    }

    public synchronized void setUnavailable(boolean unavailable) {
        this.unavailable = unavailable;
    }

    /** Back to a working gateway with no remembered requests. Call it after each test. */
    public synchronized void reset() {
        requests.clear();
        unavailable = false;
    }
}
