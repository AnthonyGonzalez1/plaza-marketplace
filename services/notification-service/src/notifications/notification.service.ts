import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config';
import { describeError } from '../describe-error';
import type { OrderEvent } from '../events/order-event';
import { type Email, orderCancelledEmail, orderPaidEmail } from './email-templates';
import { Mailer } from './mailer';
import { SentEventsStore } from './sent-events.store';

// What handle() did with an event, so the caller can log it.
export type HandleResult = 'sent' | 'duplicate' | 'ignored';

// Decides what to do with one event: which email it deserves (if any) and whether that email
// was already sent. It knows nothing about RabbitMQ: it receives an event and either finishes
// or throws, and the consumer turns "throws" into a retry.
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly mailer: Mailer,
    private readonly sentEvents: SentEventsStore,
  ) {}

  async handle(event: OrderEvent): Promise<HandleResult> {
    const email = this.emailFor(event);
    if (email === undefined) {
      return 'ignored';
    }

    // Idempotency. RabbitMQ and the publisher promise "at-least-once" delivery: an event is
    // never lost, but the same event can arrive twice (for example when the acknowledgement
    // of the first copy is lost). Without a check, the customer would get two emails.
    //
    // So, before sending, the event is claimed in Redis ("SET key NX", see SentEventsStore).
    // The first copy creates the key and sends the email; a later copy finds the key and is
    // skipped. At-least-once delivery + a consumer that ignores repeats = the email goes out
    // once in practice ("effectively once").
    //
    // The limits, because Redis, the mail server and RabbitMQ cannot be updated in one atomic
    // step:
    // - Crash after the email is sent but before the ack: RabbitMQ redelivers the message,
    //   the key is still there and the copy is skipped. No duplicate in this case.
    // - The mail server accepts the email but its answer is lost (a timeout): it looks like a
    //   failure, the claim is released and the retry sends a second email. Duplicate.
    // - Crash right after the claim, before the email is sent: the redelivered copy finds
    //   the key and is skipped, so that email is never sent. Lost email.
    // - Redis is down: claim() throws, nothing is sent and the message is retried later.
    // The two bad windows last milliseconds; closing them completely would need the mail
    // provider to deduplicate by id, which Mailpit and plain SMTP do not offer.
    const claimed = await this.sentEvents.claim(event.eventId);
    if (!claimed) {
      return 'duplicate';
    }

    try {
      await this.mailer.send(event.order.email, email);
    } catch (error) {
      // The email did not go out: give the claim back, otherwise the retry would be skipped
      // as a "duplicate" and the customer would never be notified.
      await this.releaseClaim(event);
      throw error;
    }
    return 'sent';
  }

  // The email for an event, or undefined when this service has nothing to send for its type.
  private emailFor(event: OrderEvent): Email | undefined {
    switch (event.type) {
      case 'OrderPaid':
        return orderPaidEmail(event, this.config.webBaseUrl);
      case 'OrderCancelled':
        return orderCancelledEmail(event, this.config.webBaseUrl);
      // Exercise S7 (docs/exercises/s7.md): handle OrderPlaced. Add a case here that returns
      // the new orderPlacedEmail template; the idempotency and the retries then work for it
      // without further changes.
      default:
        // OrderPlaced (for now) and any type added to the publisher later: not an error. The
        // consumer logs the ignored event at debug level.
        return undefined;
    }
  }

  private async releaseClaim(event: OrderEvent): Promise<void> {
    try {
      await this.sentEvents.release(event.eventId);
    } catch (error) {
      // Redis failed too. The original error (the email) is the one that must reach the
      // caller, so this one is only logged. The claim stays, and the retries of this event
      // will be skipped as duplicates: the log line is the only trace of the missing email.
      this.logger.error(
        `Could not release the claim, the email of eventId=${event.eventId} ` +
          `type=${event.type} will not be retried: ${describeError(error)}`,
      );
    }
  }
}
