import { Logger } from '@nestjs/common';
import type { AppConfig } from '../config';
import { sign } from './signature';
import { type PaymentEvent, WebhookSender } from './webhook-sender';

const config: AppConfig = {
  port: 0,
  webhookUrl: 'http://store.test/api/v1/webhooks/payments',
  webhookSecret: 'test-secret',
  paymentDelayMs: 0,
  defaultOutcome: 'APPROVED',
  duplicateWebhooks: false,
  webhookMaxAttempts: 3,
  // 1 ms instead of 1 s keeps the retry tests fast.
  webhookRetryDelayMs: 1,
};

const event: PaymentEvent = {
  eventId: '0b0e7a52-6f5c-4c3e-9d57-0d6e0c3a1f11',
  paymentId: '5d1f0f4e-1c1a-4f0e-8a55-3d0b8a2e7c22',
  orderId: '9a6f3c1e-7b2d-4e8f-b1a0-2c4d6e8f0a33',
  status: 'APPROVED',
  amount: 37000,
  currency: 'COP',
  occurredAt: '2026-11-16T20:00:02Z',
};

describe('WebhookSender', () => {
  // The global fetch is replaced in every test, so nothing reaches the network.
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  function answer(status: number): Response {
    return new Response(null, { status });
  }

  // The body and headers of the request number "index" that the sender made.
  function sentRequest(index: number): { url: unknown; body: string; headers: Headers } {
    const [url, init] = fetchMock.mock.calls[index]!;
    return { url, body: String(init?.body), headers: new Headers(init?.headers) };
  }

  it('posts the event as JSON, signed with the shared secret', async () => {
    fetchMock.mockResolvedValue(answer(200));

    await new WebhookSender(config).send(event);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = sentRequest(0);
    expect(request.url).toBe(config.webhookUrl);
    expect(JSON.parse(request.body)).toEqual(event);
    expect(request.headers.get('Content-Type')).toBe('application/json');
    // The signature is the HMAC of exactly the string that was sent.
    expect(request.headers.get('X-Plaza-Signature')).toBe(sign(request.body, 'test-secret'));
  });

  it('retries after a 500 and stops at the first success', async () => {
    fetchMock.mockResolvedValueOnce(answer(500)).mockResolvedValueOnce(answer(204));

    await new WebhookSender(config).send(event);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentRequest(1).body).toBe(sentRequest(0).body);
  });

  it('retries after a network error', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(answer(200));

    await new WebhookSender(config).send(event);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up after the maximum number of attempts', async () => {
    fetchMock.mockImplementation(async () => answer(503));

    await new WebhookSender(config).send(event);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('sends the same event twice when duplicates are on', async () => {
    fetchMock.mockImplementation(async () => answer(200));

    await new WebhookSender({ ...config, duplicateWebhooks: true }).send(event);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentRequest(1).body).toBe(sentRequest(0).body);
    expect(JSON.parse(sentRequest(1).body).eventId).toBe(event.eventId);
    expect(sentRequest(1).headers.get('X-Plaza-Signature')).toBe(
      sentRequest(0).headers.get('X-Plaza-Signature'),
    );
  });
});
