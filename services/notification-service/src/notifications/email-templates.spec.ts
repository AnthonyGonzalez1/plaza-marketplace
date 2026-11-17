import type { OrderEvent } from '../events/order-event';
import {
  escapeHtml,
  formatPesos,
  orderCancelledEmail,
  orderPaidEmail,
  shortId,
} from './email-templates';

const WEB = 'http://localhost:3000';
const ORDER_ID = '0193a1e5-2b3c-7d4e-8f5a-6b7c8d9e0f12';

function event(overrides: Partial<OrderEvent> = {}): OrderEvent {
  return {
    eventId: '0193a1e6-7c1d-7a3b-9f2e-4b5c6d7e8f90',
    type: 'OrderPaid',
    occurredAt: '2026-11-17T12:00:00Z',
    order: {
      id: ORDER_ID,
      email: 'ana@example.com',
      total: 69000,
      items: [
        { name: 'Café molido Quindío 500 g', unitPrice: 32000, quantity: 2, lineTotal: 64000 },
        { name: 'Panela orgánica', unitPrice: 5000, quantity: 1, lineTotal: 5000 },
      ],
    },
    ...overrides,
  };
}

describe('orderPaidEmail', () => {
  it('has the short order id in the subject', () => {
    expect(orderPaidEmail(event(), WEB).subject).toBe('Pago recibido: pedido 8d9e0f12');
  });

  it('lists the items, the formatted total and the link to the order, in text and in HTML', () => {
    const email = orderPaidEmail(event(), WEB);

    for (const body of [email.text, email.html]) {
      expect(body).toContain('2 x Café molido Quindío 500 g ($ 32.000 c/u): $ 64.000');
      expect(body).toContain('1 x Panela orgánica ($ 5.000 c/u): $ 5.000');
      expect(body).toContain('Total: $ 69.000');
      expect(body).toContain(`http://localhost:3000/orders/${ORDER_ID}`);
      expect(body).toContain('Recibimos tu pago');
    }
    expect(email.html).toContain(`<a href="http://localhost:3000/orders/${ORDER_ID}">`);
  });

  it('escapes product names in the HTML and leaves them as they are in the text', () => {
    const paid = event();
    paid.order.items = [
      {
        name: '<script>alert("x")</script> & más',
        unitPrice: 1000,
        quantity: 1,
        lineTotal: 1000,
      },
    ];

    const email = orderPaidEmail(paid, WEB);

    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; más');
    expect(email.text).toContain('<script>alert("x")</script> & más');
  });
});

describe('orderCancelledEmail', () => {
  it('has the short order id in the subject', () => {
    const email = orderCancelledEmail(event({ type: 'OrderCancelled', reason: 'EXPIRED' }), WEB);

    expect(email.subject).toBe('Pedido cancelado: 8d9e0f12');
  });

  it('explains a declined payment', () => {
    const email = orderCancelledEmail(
      event({ type: 'OrderCancelled', reason: 'PAYMENT_DECLINED' }),
      WEB,
    );

    for (const body of [email.text, email.html]) {
      expect(body).toContain('el pago fue rechazado');
      expect(body).not.toContain('a tiempo');
    }
  });

  it('explains an order that was not paid in time', () => {
    const email = orderCancelledEmail(event({ type: 'OrderCancelled', reason: 'EXPIRED' }), WEB);

    for (const body of [email.text, email.html]) {
      expect(body).toContain('no recibimos el pago a tiempo');
      expect(body).not.toContain('rechazado');
    }
  });

  it('says that the reserved units were released and links to the order', () => {
    const email = orderCancelledEmail(event({ type: 'OrderCancelled', reason: 'EXPIRED' }), WEB);

    for (const body of [email.text, email.html]) {
      expect(body).toContain('quedaron liberadas');
      expect(body).toContain('Total: $ 69.000');
      expect(body).toContain(`http://localhost:3000/orders/${ORDER_ID}`);
    }
  });

  it('still says that the order was cancelled when the reason is unknown', () => {
    const email = orderCancelledEmail(event({ type: 'OrderCancelled', reason: 'FRAUD' }), WEB);

    expect(email.text).toContain('Tu pedido fue cancelado.');
  });
});

describe('formatPesos', () => {
  it.each([
    [64000, '$ 64.000'],
    [5000, '$ 5.000'],
    [1250000, '$ 1.250.000'],
    [900, '$ 900'],
    [0, '$ 0'],
    // Pesos have no cents in practice: decimals are rounded away.
    [64000.4, '$ 64.000'],
  ])('formats %d as "%s"', (amount, expected) => {
    expect(formatPesos(amount)).toBe(expected);
  });
});

describe('shortId', () => {
  it('keeps the last 8 characters of the order id', () => {
    expect(shortId(ORDER_ID)).toBe('8d9e0f12');
  });
});

describe('escapeHtml', () => {
  it('replaces the five special characters of HTML', () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;',
    );
  });
});
