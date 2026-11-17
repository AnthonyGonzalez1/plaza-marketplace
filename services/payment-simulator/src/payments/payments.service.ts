import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig, type Outcome } from '../config';
import { type PaymentEvent, WebhookSender } from '../webhooks/webhook-sender';
import { CreatePaymentDto } from './create-payment.dto';

export interface Payment {
  paymentId: string;
  orderId: string;
  amount: number;
  currency: string;
  status: 'PENDING' | Outcome;
  // What the payment will become once the delay has passed.
  outcome: Outcome;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  // Payments live only in memory: they are lost when the process restarts, together with the
  // webhooks that were still waiting, and the map is never emptied. That is fine for a
  // simulator; a real gateway would persist them in a database.
  private readonly payments = new Map<string, Payment>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly webhookSender: WebhookSender,
  ) {}

  create(dto: CreatePaymentDto): Payment {
    const payment: Payment = {
      paymentId: randomUUID(),
      orderId: dto.orderId,
      amount: dto.amount,
      currency: dto.currency,
      status: 'PENDING',
      outcome: dto.simulateOutcome ?? this.config.defaultOutcome,
    };
    this.payments.set(payment.paymentId, payment);
    this.logger.log(
      `Payment accepted: paymentId=${payment.paymentId} orderId=${payment.orderId} ` +
        `outcome in ${this.config.paymentDelayMs} ms: ${payment.outcome}`,
    );

    // Do NOT wait here: the caller gets its answer now and the result travels later in a
    // webhook. The timer imitates the time a bank takes to approve or decline.
    setTimeout(() => {
      void this.resolve(payment);
    }, this.config.paymentDelayMs);

    return payment;
  }

  private async resolve(payment: Payment): Promise<void> {
    payment.status = payment.outcome;

    const event: PaymentEvent = {
      eventId: randomUUID(),
      paymentId: payment.paymentId,
      orderId: payment.orderId,
      status: payment.outcome,
      amount: payment.amount,
      currency: payment.currency,
      // ISO 8601 in UTC without milliseconds, for example 2026-11-16T20:00:02Z.
      occurredAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    };

    try {
      await this.webhookSender.send(event);
    } catch (error) {
      // Nobody awaits this method (it runs from a timer), so an error that escaped would be an
      // unhandled promise rejection, which stops the Node process.
      this.logger.error(`Unexpected error sending the webhook of order ${payment.orderId}`, error);
    }
  }
}
