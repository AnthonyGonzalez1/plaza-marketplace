import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './app.module';
import { OrderEventsConsumer } from './events/order-events.consumer';
import { Mailer } from './notifications/mailer';
import { SentEventsStore } from './notifications/sent-events.store';

// The real app with the three classes that open connections replaced by fakes, so the test
// needs no RabbitMQ, no Redis and no SMTP server.
describe('GET /health', () => {
  let app: INestApplication<App>;
  let connected: boolean;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OrderEventsConsumer)
      .useValue({ isConnected: () => connected })
      .overrideProvider(SentEventsStore)
      .useValue({})
      .overrideProvider(Mailer)
      .useValue({})
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('answers 200 UP while the consumer is connected to RabbitMQ', async () => {
    connected = true;

    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'UP' });
  });

  it('answers 503 DOWN while the consumer is not connected to RabbitMQ', async () => {
    connected = false;

    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'DOWN' });
  });
});
