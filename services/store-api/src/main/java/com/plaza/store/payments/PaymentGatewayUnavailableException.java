package com.plaza.store.payments;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * The payment gateway did not answer or answered with an error. Becomes a 502 Bad Gateway: "this
 * server is fine, but a server it depends on failed". The order stays pending, so the buyer can try
 * again.
 */
public class PaymentGatewayUnavailableException extends ResponseStatusException {

    public PaymentGatewayUnavailableException(Throwable cause) {
        super(
                HttpStatus.BAD_GATEWAY,
                "The payment service is not available. Please try again in a moment.",
                cause);
    }
}
