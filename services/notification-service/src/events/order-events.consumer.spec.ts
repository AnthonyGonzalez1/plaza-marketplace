import { Logger } from '@nestjs/common';
import type { ConsumeMessage, Options } from 'amqplib';
import type { AppConfig } from '../config';
import type { HandleResult, NotificationService } from '../notifications/notification.service';
import type { OrderEvent } from './order-event';
import {
  ATTEMPT_HEADER,
  DEAD_LETTER_QUEUE,
  type MessageChannel,
  OrderEventsConsumer,
  RETRY_QUEUE,
} from './order-events.consumer';

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

const validBody = JSON.stringify({
  eventId: '0193a1e6-7c1d-7a3b-9f2e-4b5c6d7e8f90',
  type: 'OrderPaid',
  occurredAt: '2026-11-17T12:00:00Z',
  order: {
    id: '0193a1e5-2b3c-7d4e-8f5a-6b7c8d9e0f12',
    email: 'ana@example.com',
    status: 'PAID',
    total: 64000.0,
    currency: 'COP',
    items: [
      { productId: 1, name: 'Café molido', unitPrice: 32000.0, quantity: 2, lineTotal: 64000.0 },
    ],
  },
});

// A message as amqplib delivers it: the body as bytes, plus its properties and headers.
function message(body: string, headers?: Record<string, unknown>): ConsumeMessage {
  return {
    content: Buffer.from(body),
    fields: { routingKey: 'order.paid' },
    properties: {
      contentType: 'application/json',
      messageId: '0193a1e6-7c1d-7a3b-9f2e-4b5c6d7e8f90',
      type: 'OrderPaid',
      headers,
    },
  } as unknown as ConsumeMessage;
}

// The decisions of the consumer (ack, retry, dead-letter) with a fake channel and a fake
// NotificationService: no RabbitMQ is needed, handleMessage is called directly.
describe('OrderEventsConsumer.handleMessage', () => {
  let handle: jest.Mock<Promise<HandleResult>, [OrderEvent]>;
  let ack: jest.Mock;
  let sendToQueue: jest.Mock<boolean, [string, Buffer, Options.Publish?]>;
  let channel: MessageChannel;
  let consumer: OrderEventsConsumer;

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(() => {
    handle = jest.fn<Promise<HandleResult>, [OrderEvent]>().mockResolvedValue('sent');
    ack = jest.fn();
    sendToQueue = jest.fn<boolean, [string, Buffer, Options.Publish?]>().mockReturnValue(true);
    channel = { ack, sendToQueue };
    consumer = new OrderEventsConsumer(config, { handle } as unknown as NotificationService);
  });

  // The queue, body and options of the only copy that was published.
  function publishedCopy(): { queue: string; body: string; options: Options.Publish } {
    expect(sendToQueue).toHaveBeenCalledTimes(1);
    const [queue, content, options] = sendToQueue.mock.calls[0]!;
    return { queue, body: content.toString('utf8'), options: options! };
  }

  it('acks the message when the event is handled', async () => {
    const delivery = message(validBody);

    await consumer.handleMessage(channel, delivery);

    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle.mock.calls[0]![0].eventId).toBe('0193a1e6-7c1d-7a3b-9f2e-4b5c6d7e8f90');
    expect(ack).toHaveBeenCalledTimes(1);
    expect(ack).toHaveBeenCalledWith(delivery);
    expect(sendToQueue).not.toHaveBeenCalled();
  });

  it.each<HandleResult>(['duplicate', 'ignored'])(
    'acks without publishing anything when the event is %s',
    async (result) => {
      handle.mockResolvedValue(result);

      await consumer.handleMessage(channel, message(validBody));

      expect(ack).toHaveBeenCalledTimes(1);
      expect(sendToQueue).not.toHaveBeenCalled();
    },
  );

  it('publishes a copy to the retry queue as attempt 2 and acks when attempt 1 fails', async () => {
    handle.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const delivery = message(validBody);

    await consumer.handleMessage(channel, delivery);

    const copy = publishedCopy();
    expect(copy.queue).toBe(RETRY_QUEUE);
    expect(copy.body).toBe(validBody);
    expect(copy.options).toMatchObject({
      persistent: true,
      contentType: 'application/json',
      messageId: '0193a1e6-7c1d-7a3b-9f2e-4b5c6d7e8f90',
      type: 'OrderPaid',
    });
    expect(copy.options.headers).toMatchObject({
      [ATTEMPT_HEADER]: 2,
      'x-last-error': 'connect ECONNREFUSED',
      'x-original-routing-key': 'order.paid',
    });
    expect(ack).toHaveBeenCalledTimes(1);
    expect(ack).toHaveBeenCalledWith(delivery);
  });

  it('publishes a copy to the retry queue as attempt 3 when attempt 2 fails', async () => {
    handle.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await consumer.handleMessage(channel, message(validBody, { [ATTEMPT_HEADER]: 2 }));

    const copy = publishedCopy();
    expect(copy.queue).toBe(RETRY_QUEUE);
    expect(copy.options.headers).toMatchObject({ [ATTEMPT_HEADER]: 3 });
    expect(ack).toHaveBeenCalledTimes(1);
  });

  it('publishes to the dead-letter queue and acks when the last attempt fails', async () => {
    handle.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const delivery = message(validBody, { [ATTEMPT_HEADER]: 3 });

    await consumer.handleMessage(channel, delivery);

    const copy = publishedCopy();
    expect(copy.queue).toBe(DEAD_LETTER_QUEUE);
    expect(copy.body).toBe(validBody);
    expect(copy.options.headers).toMatchObject({
      [ATTEMPT_HEADER]: 3,
      'x-last-error': 'connect ECONNREFUSED',
    });
    expect(ack).toHaveBeenCalledTimes(1);
    expect(ack).toHaveBeenCalledWith(delivery);
  });

  it('sends a message that is not JSON to the dead-letter queue without retrying', async () => {
    const delivery = message('{"eventId":');

    await consumer.handleMessage(channel, delivery);

    expect(handle).not.toHaveBeenCalled();
    const copy = publishedCopy();
    expect(copy.queue).toBe(DEAD_LETTER_QUEUE);
    expect(copy.body).toBe('{"eventId":');
    expect(copy.options.headers).toMatchObject({
      [ATTEMPT_HEADER]: 1,
      'x-last-error': 'the body is not valid JSON',
    });
    expect(ack).toHaveBeenCalledTimes(1);
    expect(ack).toHaveBeenCalledWith(delivery);
  });

  it('sends an event with missing fields to the dead-letter queue without retrying', async () => {
    await consumer.handleMessage(channel, message('{"eventId":"1","type":"OrderPaid"}'));

    expect(handle).not.toHaveBeenCalled();
    expect(publishedCopy().queue).toBe(DEAD_LETTER_QUEUE);
    expect(ack).toHaveBeenCalledTimes(1);
  });

  it('does not ack when the copy cannot be published, so RabbitMQ redelivers', async () => {
    handle.mockRejectedValue(new Error('connect ECONNREFUSED'));
    sendToQueue.mockImplementation(() => {
      throw new Error('Channel closed');
    });

    await expect(consumer.handleMessage(channel, message(validBody))).rejects.toThrow(
      'Channel closed',
    );
    expect(ack).not.toHaveBeenCalled();
  });
});
