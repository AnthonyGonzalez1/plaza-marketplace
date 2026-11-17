import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../app.module';
import { APP_CONFIG, type AppConfig } from '../config';
import { type PaymentEvent, WebhookSender } from '../webhooks/webhook-sender';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const config: AppConfig = {
  port: 0,
  webhookUrl: 'http://store.test/api/v1/webhooks/payments',
  webhookSecret: 'test-secret',
  // The webhook is scheduled 1 ms after the request instead of 2 s.
  paymentDelayMs: 1,
  defaultOutcome: 'APPROVED',
  duplicateWebhooks: false,
  webhookMaxAttempts: 3,
  webhookRetryDelayMs: 1,
};

const validBody = {
  orderId: '9a6f3c1e-7b2d-4e8f-b1a0-2c4d6e8f0a33',
  amount: 37000.5,
  currency: 'COP',
};

// The real app (controllers, validation, error format) with a fake WebhookSender, so the tests
// see which event would be sent without calling the network.
describe('HTTP API', () => {
  let app: INestApplication<App>;
  let send: jest.Mock<Promise<void>, [PaymentEvent]>;

  beforeEach(async () => {
    send = jest.fn<Promise<void>, [PaymentEvent]>().mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CONFIG)
      .useValue(config)
      .overrideProvider(WebhookSender)
      .useValue({ send })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  // Resolves with the event as soon as the service hands it to the sender.
  function nextEvent(): Promise<PaymentEvent> {
    return new Promise((resolve) => {
      send.mockImplementation(async (event) => resolve(event));
    });
  }

  it('GET /health answers UP', async () => {
    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'UP' });
  });

  it('POST /payments answers 202 PENDING and later sends a webhook with the default outcome', async () => {
    const event = nextEvent();

    const response = await request(app.getHttpServer()).post('/payments').send(validBody);

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ paymentId: expect.stringMatching(UUID), status: 'PENDING' });

    expect(await event).toEqual({
      eventId: expect.stringMatching(UUID),
      paymentId: response.body.paymentId,
      orderId: validBody.orderId,
      status: 'APPROVED',
      amount: 37000.5,
      currency: 'COP',
      occurredAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('POST /payments uses simulateOutcome instead of the default outcome', async () => {
    const event = nextEvent();

    const response = await request(app.getHttpServer())
      .post('/payments')
      .send({ ...validBody, simulateOutcome: 'DECLINED' });

    expect(response.status).toBe(202);
    expect((await event).status).toBe('DECLINED');
  });

  it.each([
    ['orderId is not a UUID', { ...validBody, orderId: 'order-1' }, 'orderId'],
    ['orderId is missing', { amount: 100, currency: 'COP' }, 'orderId'],
    ['amount is zero', { ...validBody, amount: 0 }, 'amount'],
    ['amount is negative', { ...validBody, amount: -5 }, 'amount'],
    ['amount is a string', { ...validBody, amount: '37000.00' }, 'amount'],
    ['currency has four letters', { ...validBody, currency: 'PESO' }, 'currency'],
    ['currency is missing', { orderId: validBody.orderId, amount: 100 }, 'currency'],
    ['simulateOutcome is unknown', { ...validBody, simulateOutcome: 'MAYBE' }, 'simulateOutcome'],
  ])('POST /payments answers 400 problem+json when %s', async (_case, body, field) => {
    const response = await request(app.getHttpServer()).post('/payments').send(body);

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.body).toEqual({
      status: 400,
      title: 'Bad Request',
      detail: expect.stringContaining(field),
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('POST /payments answers 400 problem+json when the body is not valid JSON', async () => {
    const response = await request(app.getHttpServer())
      .post('/payments')
      .set('Content-Type', 'application/json')
      .send('{"orderId":');

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.body).toMatchObject({ status: 400, title: 'Bad Request' });
  });
});
