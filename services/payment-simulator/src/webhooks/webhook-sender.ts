import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig, type Outcome } from '../config';
import { sign } from './signature';

// The body of a webhook: "this is what happened to that payment".
export interface PaymentEvent {
  // Identifies the event. Retries and duplicates carry the same eventId, so the receiver can
  // recognise "I already processed this one" and ignore the copy.
  eventId: string;
  paymentId: string;
  orderId: string;
  status: Outcome;
  amount: number;
  currency: string;
  occurredAt: string;
}

// How long one attempt may take before it counts as failed. Without a limit, a receiver that
// accepts the connection and never answers would block the delivery forever.
const ATTEMPT_TIMEOUT_MS = 5000;

// A webhook is an HTTP call in the opposite direction: instead of the store asking "is it paid
// yet?" again and again, the gateway calls the store when there is news.
@Injectable()
export class WebhookSender {
  private readonly logger = new Logger(WebhookSender.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async send(event: PaymentEvent): Promise<void> {
    // Serialize ONCE and reuse the same string for the signature and for the request. The
    // signature covers the exact bytes on the wire; serializing twice could give two different
    // strings (key order, spaces) and a signature that does not match.
    const body = JSON.stringify(event);
    const signature = sign(body, this.config.webhookSecret);

    // Delivery is "at-least-once": we retry until the receiver confirms, so the receiver may
    // get the same event more than once (for example when its 200 answer is lost on the way).
    // DUPLICATE_WEBHOOKS forces that situation to show that the receiver handles it.
    const copies = this.config.duplicateWebhooks ? 2 : 1;
    for (let copy = 1; copy <= copies; copy++) {
      await this.deliver(event, body, signature);
    }
  }

  // One delivery = up to WEBHOOK_MAX_ATTEMPTS attempts, stopping at the first 2xx answer.
  private async deliver(event: PaymentEvent, body: string, signature: string): Promise<void> {
    const maxAttempts = this.config.webhookMaxAttempts;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) {
        // Exponential backoff: wait 1x, 2x, 4x... the base delay. A receiver that is down or
        // overloaded gets more time to recover on each retry instead of being hammered.
        await sleep(this.config.webhookRetryDelayMs * 2 ** (attempt - 2));
      }

      const result = await this.attempt(body, signature);
      const line =
        `eventId=${event.eventId} orderId=${event.orderId} ` +
        `attempt=${attempt}/${maxAttempts} result=${result.description}`;

      if (result.delivered) {
        this.logger.log(`Webhook delivered: ${line}`);
        return;
      }
      this.logger.warn(`Webhook attempt failed: ${line}`);
    }

    // A real gateway would keep the event and retry for hours or days; the simulator gives up.
    this.logger.error(
      `Webhook given up after ${maxAttempts} attempts: ` +
        `eventId=${event.eventId} orderId=${event.orderId}`,
    );
  }

  // One HTTP request. Never throws: a network error is reported as "not delivered".
  private async attempt(
    body: string,
    signature: string,
  ): Promise<{ delivered: boolean; description: string }> {
    try {
      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Plaza-Signature': signature,
        },
        body,
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });
      // Only a 2xx status means "received". Anything else (4xx, 5xx, a redirect) is retried.
      return { delivered: response.ok, description: `HTTP ${response.status}` };
    } catch (error) {
      // fetch rejects when there is no answer at all: connection refused, DNS error, timeout.
      const reason = error instanceof Error ? error.message : String(error);
      return { delivered: false, description: `network error (${reason})` };
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
