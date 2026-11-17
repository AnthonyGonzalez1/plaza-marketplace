import { Logger } from '@nestjs/common';
import type { AppConfig } from '../config';
import type { OrderEvent } from '../events/order-event';
import type { Email } from './email-templates';
import type { Mailer } from './mailer';
import { NotificationService } from './notification.service';
import type { SentEventsStore } from './sent-events.store';

const config: AppConfig = {
  port: 0,
  rabbitmqUrl: 'amqp://rabbitmq.test',
  redisUrl: 'redis://redis.test',
  smtpHost: 'smtp.test',
  smtpPort: 1025,
  mailFrom: 'Plaza Marketplace <no-reply@plaza.test>',
  webBaseUrl: 'http://web.test',
  maxAttempts: 3,
  retryDelayMs: 1,
};

function event(overrides: Partial<OrderEvent> = {}): OrderEvent {
  return {
    eventId: '0193a1e6-7c1d-7a3b-9f2e-4b5c6d7e8f90',
    type: 'OrderPaid',
    occurredAt: '2026-11-17T12:00:00Z',
    order: {
      id: '0193a1e5-2b3c-7d4e-8f5a-6b7c8d9e0f12',
      email: 'ana@example.com',
      total: 64000,
      items: [
        { name: 'Café molido Quindío 500 g', unitPrice: 32000, quantity: 2, lineTotal: 64000 },
      ],
    },
    ...overrides,
  };
}

// The real service with a fake mailer and a fake store: no SMTP server and no Redis.
describe('NotificationService', () => {
  let send: jest.Mock<Promise<void>, [string, Email]>;
  // The fake store keeps the claimed event ids in a Set, which is all that Redis does here.
  let claimed: Set<string>;
  let service: NotificationService;

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(() => {
    send = jest.fn<Promise<void>, [string, Email]>().mockResolvedValue(undefined);
    claimed = new Set<string>();

    const mailer = { send } as unknown as Mailer;
    const store = {
      claim: async (eventId: string) => {
        if (claimed.has(eventId)) {
          return false;
        }
        claimed.add(eventId);
        return true;
      },
      release: async (eventId: string) => {
        claimed.delete(eventId);
      },
    } as unknown as SentEventsStore;

    service = new NotificationService(config, mailer, store);
  });

  it('sends the "payment received" email to the email of the order for OrderPaid', async () => {
    const result = await service.handle(event());

    expect(result).toBe('sent');
    expect(send).toHaveBeenCalledTimes(1);
    const [to, email] = send.mock.calls[0]!;
    expect(to).toBe('ana@example.com');
    expect(email.subject).toBe('Pago recibido: pedido 8d9e0f12');
    expect(email.text).toContain('http://web.test/orders/0193a1e5-2b3c-7d4e-8f5a-6b7c8d9e0f12');
  });

  it('sends the "order cancelled" email for OrderCancelled', async () => {
    const result = await service.handle(event({ type: 'OrderCancelled', reason: 'EXPIRED' }));

    expect(result).toBe('sent');
    const [to, email] = send.mock.calls[0]!;
    expect(to).toBe('ana@example.com');
    expect(email.subject).toBe('Pedido cancelado: 8d9e0f12');
    expect(email.text).toContain('no recibimos el pago a tiempo');
  });

  it('sends one email when the same event arrives twice', async () => {
    const first = await service.handle(event());
    const second = await service.handle(event());

    expect(first).toBe('sent');
    expect(second).toBe('duplicate');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('sends one email per event when two different events arrive', async () => {
    await service.handle(event());
    await service.handle(event({ eventId: '0193a1e7-0000-7000-8000-000000000002' }));

    expect(send).toHaveBeenCalledTimes(2);
  });

  it.each(['OrderPlaced', 'OrderShipped'])('sends nothing for %s', async (type) => {
    const result = await service.handle(event({ type }));

    expect(result).toBe('ignored');
    expect(send).not.toHaveBeenCalled();
    // Nothing was claimed either: an ignored event leaves no trace in Redis.
    expect(claimed.size).toBe(0);
  });

  // Exercise S7 (docs/exercises/s7.md). Remove ".skip" once OrderPlaced is handled.
  // It should assert that handle(event({ type: 'OrderPlaced' })) returns 'sent' and sends one
  // email to the email of the order, whose subject contains the short order id. The test
  // above must then stop listing 'OrderPlaced' among the ignored types.
  it.skip('sends the "order received" email for OrderPlaced', async () => {
    await service.handle(event({ type: 'OrderPlaced' }));

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('releases the claim and lets the error through when the email cannot be sent', async () => {
    send.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

    await expect(service.handle(event())).rejects.toThrow('connect ECONNREFUSED');
    expect(claimed.size).toBe(0);

    // Because the claim was released, the retry of the same event does send the email.
    const retry = await service.handle(event());

    expect(retry).toBe('sent');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('lets the error through and sends nothing when the store fails', async () => {
    const mailer = { send } as unknown as Mailer;
    const brokenStore = {
      claim: async () => {
        throw new Error('The client is offline');
      },
    } as unknown as SentEventsStore;

    const broken = new NotificationService(config, mailer, brokenStore);

    await expect(broken.handle(event())).rejects.toThrow('The client is offline');
    expect(send).not.toHaveBeenCalled();
  });
});
