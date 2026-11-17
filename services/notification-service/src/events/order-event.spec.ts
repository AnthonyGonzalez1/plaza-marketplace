import { parseOrderEvent } from './order-event';

// The example of the contract with store-api, as a plain object that each test can modify.
function validMessage() {
  return {
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
        {
          productId: 1,
          name: 'Café molido Quindío 500 g',
          unitPrice: 32000.0,
          quantity: 2,
          lineTotal: 64000.0,
        },
      ],
    },
  };
}

describe('parseOrderEvent', () => {
  it('accepts a valid OrderPaid event and keeps the fields the service uses', () => {
    const result = parseOrderEvent(JSON.stringify(validMessage()));

    expect(result).toEqual({
      ok: true,
      event: {
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
        reason: undefined,
      },
    });
  });

  it('accepts a valid OrderCancelled event with its reason', () => {
    const message = { ...validMessage(), type: 'OrderCancelled', reason: 'EXPIRED' };

    const result = parseOrderEvent(JSON.stringify(message));

    expect(result).toMatchObject({
      ok: true,
      event: { type: 'OrderCancelled', reason: 'EXPIRED' },
    });
  });

  it('reads amounts written with or without decimals as the same number', () => {
    // Raw text on purpose: JSON.stringify would never write "64000.00".
    const text = JSON.stringify(validMessage()).replace('"total":64000', '"total":64000.00');

    const result = parseOrderEvent(text);

    expect(result).toMatchObject({ ok: true, event: { order: { total: 64000 } } });
  });

  it('accepts a type it does not know: ignoring it is decided later, it is not invalid', () => {
    const result = parseOrderEvent(JSON.stringify({ ...validMessage(), type: 'OrderShipped' }));

    expect(result.ok).toBe(true);
  });

  it.each([
    ['is not JSON', '{"eventId":'],
    ['is empty', ''],
    ['is a JSON list', '[]'],
    ['is JSON null', 'null'],
  ])('rejects a body that %s', (_case, text) => {
    expect(parseOrderEvent(text).ok).toBe(false);
  });

  it.each([
    ['eventId is missing', { ...validMessage(), eventId: undefined }, 'eventId'],
    ['eventId is empty', { ...validMessage(), eventId: '' }, 'eventId'],
    ['type is missing', { ...validMessage(), type: undefined }, 'type'],
    ['occurredAt is missing', { ...validMessage(), occurredAt: undefined }, 'occurredAt'],
    ['order is missing', { ...validMessage(), order: undefined }, 'order'],
    ['reason is not text', { ...validMessage(), reason: 7 }, 'reason'],
    [
      'order.id is missing',
      { ...validMessage(), order: { ...validMessage().order, id: undefined } },
      'order.id',
    ],
    [
      'order.email is missing',
      { ...validMessage(), order: { ...validMessage().order, email: undefined } },
      'order.email',
    ],
    [
      'order.total is a string',
      { ...validMessage(), order: { ...validMessage().order, total: '64000.00' } },
      'order.total',
    ],
    [
      'order.items is missing',
      { ...validMessage(), order: { ...validMessage().order, items: undefined } },
      'order.items',
    ],
    [
      'an item has no name',
      { ...validMessage(), order: { ...validMessage().order, items: [{ quantity: 1 }] } },
      'name',
    ],
    [
      'an item has no quantity',
      {
        ...validMessage(),
        order: {
          ...validMessage().order,
          items: [{ name: 'Panela', unitPrice: 5000, lineTotal: 5000 }],
        },
      },
      'quantity',
    ],
  ])('rejects an event when %s', (_case, message, field) => {
    const result = parseOrderEvent(JSON.stringify(message));

    expect(result).toEqual({ ok: false, error: expect.stringContaining(field) });
  });
});
