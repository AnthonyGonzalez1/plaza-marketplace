package com.plaza.store.payments;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.plaza.store.FakePaymentGateway;
import com.plaza.store.TestcontainersConfiguration;
import com.plaza.store.cart.CartService;
import com.plaza.store.ordering.CheckoutService;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Paying an order: the request to the gateway (a fake one) and the webhook that brings the result.
 * The webhooks are signed here with the same class the application uses to verify them.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class PaymentApiIntegrationTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcClient jdbc;
    @Autowired private CartService cartService;
    @Autowired private CheckoutService checkoutService;
    @Autowired private FakePaymentGateway paymentGateway;
    @Autowired private WebhookSignature webhookSignature;

    // Seed data: coffee costs 32000 with 20 in stock.
    private long coffee;
    private UUID orderId;

    @BeforeEach
    void createPendingOrderOfTwoCoffees() {
        coffee =
                jdbc.sql("SELECT id FROM product WHERE slug = 'cafe-molido-quindio-500g'")
                        .query(Long.class)
                        .single();
        UUID cartId = cartService.createCart().id();
        cartService.setQuantity(cartId, coffee, 2);
        orderId = checkoutService.checkout(cartId, "ana@example.com", null).id();
    }

    @AfterEach
    void restoreDatabase() {
        jdbc.sql("DELETE FROM processed_webhook").update();
        jdbc.sql("DELETE FROM order_item").update();
        jdbc.sql("DELETE FROM orders").update();
        jdbc.sql("UPDATE inventory SET available = 20 WHERE product_id = :id")
                .param("id", coffee)
                .update();
        paymentGateway.reset();
    }

    // ---- Asking for the payment ----

    @Test
    void payingSendsTheOrderToTheGatewayAndAnswers202() throws Exception {
        mockMvc.perform(post("/api/v1/orders/{id}/payments", orderId))
                .andExpect(status().isAccepted())
                .andExpect(content().string(""));

        assertThat(paymentGateway.requests()).hasSize(1);
        FakePaymentGateway.Request request = paymentGateway.requests().get(0);
        assertThat(request.orderId()).isEqualTo(orderId);
        assertThat(request.amount()).isEqualByComparingTo(new BigDecimal("64000"));
        assertThat(request.currency()).isEqualTo("COP");
        assertThat(request.outcome()).isNull();
        // Nothing changes yet: the result comes later, in the webhook.
        assertThat(statusOf(orderId)).isEqualTo("PENDING_PAYMENT");
    }

    @Test
    void theRequestedOutcomeIsPassedToTheSimulator() throws Exception {
        mockMvc.perform(
                        post("/api/v1/orders/{id}/payments", orderId)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"simulateOutcome\": \"DECLINED\"}"))
                .andExpect(status().isAccepted());

        assertThat(paymentGateway.requests().get(0).outcome()).isEqualTo("DECLINED");
    }

    @Test
    void unknownOutcomeReturns400() throws Exception {
        mockMvc.perform(
                        post("/api/v1/orders/{id}/payments", orderId)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"simulateOutcome\": \"MAYBE\"}"))
                .andExpect(status().isBadRequest());

        assertThat(paymentGateway.requests()).isEmpty();
    }

    @Test
    void payingAnOrderThatIsAlreadyPaidReturns409() throws Exception {
        sendWebhook(event(UUID.randomUUID(), "APPROVED", "64000.00"));

        mockMvc.perform(post("/api/v1/orders/{id}/payments", orderId))
                .andExpect(status().isConflict())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.orderStatus", is("PAID")));

        assertThat(paymentGateway.requests()).isEmpty();
    }

    @Test
    void payingAnUnknownOrderReturns404() throws Exception {
        mockMvc.perform(post("/api/v1/orders/{id}/payments", UUID.randomUUID()))
                .andExpect(status().isNotFound());
    }

    @Test
    void gatewayFailureReturns502AndLeavesTheOrderPending() throws Exception {
        paymentGateway.setUnavailable(true);

        mockMvc.perform(post("/api/v1/orders/{id}/payments", orderId))
                .andExpect(status().isBadGateway())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status", is(502)));

        assertThat(statusOf(orderId)).isEqualTo("PENDING_PAYMENT");
    }

    // ---- Receiving the result ----

    @Test
    void approvedWebhookMarksTheOrderAsPaid() throws Exception {
        sendWebhook(event(UUID.randomUUID(), "APPROVED", "64000.00"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result", is("PROCESSED")));

        mockMvc.perform(get("/api/v1/orders/{id}", orderId))
                .andExpect(jsonPath("$.status", is("PAID")));
        // The units stay sold.
        assertThat(stockOfCoffee()).isEqualTo(18);
    }

    @Test
    void declinedWebhookCancelsTheOrderAndReturnsTheStock() throws Exception {
        sendWebhook(event(UUID.randomUUID(), "DECLINED", "64000.00"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result", is("PROCESSED")));

        assertThat(statusOf(orderId)).isEqualTo("CANCELLED");
        assertThat(stockOfCoffee()).isEqualTo(20);
    }

    @Test
    void theSameWebhookTwiceChangesTheOrderOnce() throws Exception {
        // A declined payment is the dangerous one to repeat: handling it twice would return
        // the stock twice.
        String sameEvent = event(UUID.randomUUID(), "DECLINED", "64000.00");

        sendWebhook(sameEvent).andExpect(jsonPath("$.result", is("PROCESSED")));
        sendWebhook(sameEvent)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result", is("DUPLICATE")));

        assertThat(stockOfCoffee()).isEqualTo(20);
        assertThat(count("SELECT count(*) FROM processed_webhook")).isEqualTo(1);
    }

    @Test
    void webhookWithAWrongSignatureIsRejectedAndChangesNothing() throws Exception {
        String body = event(UUID.randomUUID(), "APPROVED", "64000.00");
        String forged = new WebhookSignature("not-the-real-secret").sign(bytes(body));

        mockMvc.perform(webhookRequest(body).header("X-Plaza-Signature", forged))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON));

        assertThat(statusOf(orderId)).isEqualTo("PENDING_PAYMENT");
        assertThat(count("SELECT count(*) FROM processed_webhook")).isZero();
    }

    @Test
    void webhookWithoutSignatureIsRejected() throws Exception {
        mockMvc.perform(webhookRequest(event(UUID.randomUUID(), "APPROVED", "64000.00")))
                .andExpect(status().isUnauthorized());

        assertThat(statusOf(orderId)).isEqualTo("PENDING_PAYMENT");
    }

    @Test
    void bodyChangedAfterSigningIsRejected() throws Exception {
        // Someone captures a real "DECLINED" webhook and edits it to "APPROVED".
        String original = event(UUID.randomUUID(), "DECLINED", "64000.00");
        String signatureOfOriginal = webhookSignature.sign(bytes(original));
        String tampered = original.replace("DECLINED", "APPROVED");

        mockMvc.perform(webhookRequest(tampered).header("X-Plaza-Signature", signatureOfOriginal))
                .andExpect(status().isUnauthorized());

        assertThat(statusOf(orderId)).isEqualTo("PENDING_PAYMENT");
    }

    @Test
    void approvalThatArrivesAfterTheOrderWasCancelledIsIgnored() throws Exception {
        sendWebhook(event(UUID.randomUUID(), "DECLINED", "64000.00"));

        // A different event (new id) for the same order: not a duplicate, but too late.
        sendWebhook(event(UUID.randomUUID(), "APPROVED", "64000.00"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.result", is("IGNORED")));

        assertThat(statusOf(orderId)).isEqualTo("CANCELLED");
        assertThat(stockOfCoffee()).isEqualTo(20);
    }

    @Test
    void webhookWithAnotherAmountReturns400() throws Exception {
        sendWebhook(event(UUID.randomUUID(), "APPROVED", "1.00"))
                .andExpect(status().isBadRequest());

        assertThat(statusOf(orderId)).isEqualTo("PENDING_PAYMENT");
    }

    @Test
    void webhookForAnUnknownOrderReturns404() throws Exception {
        String body =
                """
                {"eventId":"%s","paymentId":"%s","orderId":"%s","status":"APPROVED",\
                "amount":64000.00,"currency":"COP","occurredAt":"2026-11-16T20:00:02Z"}\
                """
                        .formatted(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());

        sendWebhook(body).andExpect(status().isNotFound());
    }

    private String event(UUID eventId, String status, String amount) {
        return """
        {"eventId":"%s","paymentId":"%s","orderId":"%s","status":"%s",\
        "amount":%s,"currency":"COP","occurredAt":"2026-11-16T20:00:02Z"}\
        """
                .formatted(eventId, UUID.randomUUID(), orderId, status, amount);
    }

    /** Sends the body signed with the real secret, like the gateway does. */
    private ResultActions sendWebhook(String body) throws Exception {
        return mockMvc.perform(
                webhookRequest(body)
                        .header("X-Plaza-Signature", webhookSignature.sign(bytes(body))));
    }

    private static org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder
            webhookRequest(String body) {
        return post("/api/v1/webhooks/payments")
                .contentType(MediaType.APPLICATION_JSON)
                .content(bytes(body));
    }

    private static byte[] bytes(String text) {
        return text.getBytes(StandardCharsets.UTF_8);
    }

    private String statusOf(UUID id) {
        return jdbc.sql("SELECT status FROM orders WHERE id = :id")
                .param("id", id)
                .query(String.class)
                .single();
    }

    private int stockOfCoffee() {
        return jdbc.sql("SELECT available FROM inventory WHERE product_id = :id")
                .param("id", coffee)
                .query(Integer.class)
                .single();
    }

    private long count(String sql) {
        return jdbc.sql(sql).query(Long.class).single();
    }
}
