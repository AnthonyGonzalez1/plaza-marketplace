package com.plaza.store.payments;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Proves that a webhook really comes from the payment gateway.
 *
 * <p>The webhook URL is public: anyone on the internet could send "order X was paid". So the
 * gateway and this API share a secret, and the gateway sends, next to the body, an HMAC: a
 * fingerprint computed from the body AND the secret. This class computes the same fingerprint with
 * its copy of the secret. Equal fingerprints mean the sender knows the secret and the body was not
 * altered on the way. The secret itself never travels.
 */
@Component
public class WebhookSignature {

    private static final String ALGORITHM = "HmacSHA256";
    private static final String PREFIX = "sha256=";

    private final byte[] secret;

    public WebhookSignature(@Value("${plaza.payments.webhook-secret}") String secret) {
        this.secret = secret.getBytes(StandardCharsets.UTF_8);
    }

    /** The header value the gateway must send for this body: "sha256=" + HMAC in hexadecimal. */
    public String sign(byte[] body) {
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(new SecretKeySpec(secret, ALGORITHM));
            return PREFIX + HexFormat.of().formatHex(mac.doFinal(body));
        } catch (GeneralSecurityException impossible) {
            // HmacSHA256 exists in every Java runtime.
            throw new IllegalStateException(impossible);
        }
    }

    /**
     * @param body the exact bytes received, before any JSON parsing: parsing and writing JSON again
     *     can change spaces or number formats, and then the fingerprint no longer matches
     * @param signatureHeader value of the X-Plaza-Signature header, may be null
     */
    public boolean isValid(byte[] body, String signatureHeader) {
        if (signatureHeader == null) {
            return false;
        }
        byte[] expected = sign(body).getBytes(StandardCharsets.UTF_8);
        byte[] received = signatureHeader.getBytes(StandardCharsets.UTF_8);
        // Not String.equals: it stops at the first different character, so the response time
        // reveals how many leading characters were right, and an attacker could guess the
        // signature piece by piece. MessageDigest.isEqual always takes the same time.
        return MessageDigest.isEqual(expected, received);
    }
}
