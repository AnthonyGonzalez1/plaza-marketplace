package com.plaza.store.payments;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/** Calls the payment gateway over HTTP (in this project, the payment-simulator service). */
@Component
public class HttpPaymentGateway implements PaymentGateway {

    private final RestClient restClient;

    public HttpPaymentGateway(@Value("${plaza.payments.gateway-url}") String gatewayUrl) {
        // Always set timeouts on calls to another service. Without them, a gateway that hangs
        // would keep our request threads waiting forever and take this API down with it.
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(2));
        requestFactory.setReadTimeout(Duration.ofSeconds(5));
        this.restClient =
                RestClient.builder().baseUrl(gatewayUrl).requestFactory(requestFactory).build();
    }

    @Override
    public void requestPayment(
            UUID orderId, BigDecimal amount, String currency, String simulateOutcome) {
        Map<String, Object> body = new HashMap<>();
        body.put("orderId", orderId);
        body.put("amount", amount);
        body.put("currency", currency);
        if (simulateOutcome != null) {
            body.put("simulateOutcome", simulateOutcome);
        }
        try {
            restClient
                    .post()
                    .uri("/payments")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    // Throws for 4xx and 5xx answers; the content of a 202 is not needed.
                    .toBodilessEntity();
        } catch (RestClientException gatewayFailed) {
            throw new PaymentGatewayUnavailableException(gatewayFailed);
        }
    }
}
