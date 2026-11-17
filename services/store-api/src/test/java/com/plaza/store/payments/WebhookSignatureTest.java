package com.plaza.store.payments;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

/** Plain unit test: no Spring, no database. */
class WebhookSignatureTest {

    private static final byte[] BODY =
            "{\"orderId\":\"1\",\"status\":\"APPROVED\"}".getBytes(StandardCharsets.UTF_8);

    private final WebhookSignature signature = new WebhookSignature("test-secret");

    @Test
    void signsWithHmacSha256InHexadecimal() {
        // Known answer: HMAC-SHA256 of the text "hello" with the key "test-secret", computed
        // outside this code with: printf hello | openssl dgst -sha256 -hmac test-secret
        assertThat(signature.sign("hello".getBytes(StandardCharsets.UTF_8)))
                .isEqualTo(
                        "sha256=bcc889a40667cab715e1dc22ad280692cf4bf1c3a280eeeca60d8dbcd8e4b993");
    }

    @Test
    void acceptsTheSignatureOfTheSameBodyAndSecret() {
        assertThat(signature.isValid(BODY, signature.sign(BODY))).isTrue();
    }

    @Test
    void rejectsABodyThatWasAltered() {
        String signatureOfTheOriginal = signature.sign(BODY);
        byte[] altered =
                "{\"orderId\":\"2\",\"status\":\"APPROVED\"}".getBytes(StandardCharsets.UTF_8);

        assertThat(signature.isValid(altered, signatureOfTheOriginal)).isFalse();
    }

    @Test
    void rejectsASignatureMadeWithAnotherSecret() {
        String forged = new WebhookSignature("another-secret").sign(BODY);

        assertThat(signature.isValid(BODY, forged)).isFalse();
    }

    @Test
    void rejectsAMissingOrMalformedSignature() {
        assertThat(signature.isValid(BODY, null)).isFalse();
        assertThat(signature.isValid(BODY, "")).isFalse();
        assertThat(signature.isValid(BODY, "sha256=abc")).isFalse();
    }
}
