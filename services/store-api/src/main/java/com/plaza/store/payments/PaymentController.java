package com.plaza.store.payments;

import com.plaza.store.payments.PaymentService.WebhookResult;
import com.plaza.store.shared.InvalidRequestException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

@RestController
@Tag(name = "Payments")
public class PaymentController {

    /** Optional body of "pay this order". */
    public record StartPaymentRequest(
            @Pattern(regexp = "APPROVED|DECLINED", message = "must be APPROVED or DECLINED")
                    String simulateOutcome) {}

    private final PaymentService paymentService;
    private final WebhookSignature webhookSignature;
    private final ObjectMapper objectMapper;

    public PaymentController(
            PaymentService paymentService,
            WebhookSignature webhookSignature,
            ObjectMapper objectMapper) {
        this.paymentService = paymentService;
        this.webhookSignature = webhookSignature;
        this.objectMapper = objectMapper;
    }

    // 202 Accepted, not 200 or 201: the request was received and passed on, but its result does
    // not exist yet. The client learns it by reading the order again a moment later.
    @PostMapping("/api/v1/orders/{orderId}/payments")
    @ResponseStatus(HttpStatus.ACCEPTED)
    @Operation(
            summary = "Pay an order through the payment gateway",
            description =
                    "Answers 202: the result arrives later and changes the order status to PAID or"
                            + " CANCELLED. 409 if the order is not awaiting payment, 502 if the"
                            + " gateway is not available.")
    public void startPayment(
            @PathVariable UUID orderId,
            @Valid @RequestBody(required = false) StartPaymentRequest request) {
        paymentService.startPayment(orderId, request == null ? null : request.simulateOutcome());
    }

    // The body arrives as raw bytes, not as an object: the signature must be checked against
    // exactly what was sent, and only a body that passes the check is parsed.
    @PostMapping("/api/v1/webhooks/payments")
    @Operation(
            summary = "Called by the payment gateway with the result of a payment",
            description =
                    "Requires a valid X-Plaza-Signature header (HMAC-SHA256 of the body). Safe to"
                            + " call more than once with the same event.")
    public Map<String, WebhookResult> receivePaymentEvent(
            @RequestBody byte[] body,
            @RequestHeader(value = "X-Plaza-Signature", required = false) String signature) {
        if (!webhookSignature.isValid(body, signature)) {
            // 401: we do not know who is calling. Nothing about the body is revealed.
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid webhook signature");
        }
        PaymentEvent event;
        try {
            event = objectMapper.readValue(body, PaymentEvent.class);
        } catch (JacksonException invalidJson) {
            throw new InvalidRequestException("The webhook body is not a valid payment event");
        }
        if (event.eventId() == null
                || event.orderId() == null
                || event.status() == null
                || event.amount() == null) {
            throw new InvalidRequestException(
                    "eventId, orderId, status and amount are required in a payment event");
        }
        // Any 2xx tells the gateway "received, stop retrying", also for duplicates.
        return Map.of("result", paymentService.handle(event));
    }
}
