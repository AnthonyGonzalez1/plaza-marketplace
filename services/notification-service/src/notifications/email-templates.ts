import type { OrderEvent } from '../events/order-event';

// The emails, as pure functions: the same event always gives the same email, and nothing here
// talks to the network. That makes them easy to test and to change.
//
// The texts are in Spanish because the customers of the shop are Colombian.

export interface Email {
  subject: string;
  // Every email goes out in two versions: plain text and HTML. The mail program of the
  // customer shows the HTML one when it can and the text one otherwise.
  text: string;
  html: string;
}

export function orderPaidEmail(event: OrderEvent, webBaseUrl: string): Email {
  return buildEmail(event, webBaseUrl, {
    subject: `Pago recibido: pedido ${shortId(event.order.id)}`,
    paragraphs: ['Recibimos tu pago. Ya estamos preparando tu pedido.'],
    linkLabel: 'Puedes ver tu pedido aquí:',
  });
}

export function orderCancelledEmail(event: OrderEvent, webBaseUrl: string): Email {
  return buildEmail(event, webBaseUrl, {
    subject: `Pedido cancelado: ${shortId(event.order.id)}`,
    paragraphs: [
      cancellationReason(event.reason),
      'Las unidades que habíamos reservado para ti quedaron liberadas.',
    ],
    linkLabel: 'Puedes ver el detalle del pedido aquí:',
  });
}

// Exercise S7 (docs/exercises/s7.md): handle OrderPlaced. Add an orderPlacedEmail(event,
// webBaseUrl) function here (the order was received and is waiting for the payment), built
// with buildEmail like the two above.

function cancellationReason(reason: string | undefined): string {
  if (reason === 'PAYMENT_DECLINED') {
    return 'Tu pedido fue cancelado porque el pago fue rechazado.';
  }
  if (reason === 'EXPIRED') {
    return 'Tu pedido fue cancelado porque no recibimos el pago a tiempo.';
  }
  // A reason this version does not know (the publisher may add more later): the customer is
  // still told that the order was cancelled.
  return 'Tu pedido fue cancelado.';
}

// What changes from one email to another. The greeting, the items, the total and the link are
// the same in all of them.
interface EmailParts {
  subject: string;
  paragraphs: string[];
  linkLabel: string;
}

function buildEmail(event: OrderEvent, webBaseUrl: string, parts: EmailParts): Email {
  const order = event.order;
  const link = `${webBaseUrl}/orders/${encodeURIComponent(order.id)}`;

  const textLines = [
    'Hola,',
    '',
    ...parts.paragraphs,
    '',
    `Pedido ${shortId(order.id)}:`,
    ...order.items.map(
      (item) =>
        `- ${item.quantity} x ${item.name} (${formatPesos(item.unitPrice)} c/u): ` +
        formatPesos(item.lineTotal),
    ),
    '',
    `Total: ${formatPesos(order.total)}`,
    '',
    parts.linkLabel,
    link,
    '',
    'Gracias por comprar en Plaza Marketplace.',
  ];

  // Everything that comes from the event goes through escapeHtml before it is placed inside
  // the HTML. A product called "<b>Oferta</b>" must be shown as text, not interpreted as HTML.
  const htmlLines = [
    '<p>Hola,</p>',
    ...parts.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`),
    `<p>Pedido ${escapeHtml(shortId(order.id))}:</p>`,
    '<ul>',
    ...order.items.map(
      (item) =>
        `<li>${item.quantity} x ${escapeHtml(item.name)} (${formatPesos(item.unitPrice)} c/u): ` +
        `${formatPesos(item.lineTotal)}</li>`,
    ),
    '</ul>',
    `<p><strong>Total: ${formatPesos(order.total)}</strong></p>`,
    `<p>${escapeHtml(parts.linkLabel)} <a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`,
    '<p>Gracias por comprar en Plaza Marketplace.</p>',
  ];

  return {
    subject: parts.subject,
    text: textLines.join('\n'),
    html: htmlLines.join('\n'),
  };
}

// 64000 -> "$ 64.000". Colombian pesos are written without cents and with a dot every three
// digits; the "es-CO" locale of Intl.NumberFormat knows that rule.
export function formatPesos(amount: number): string {
  const digits = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(amount);
  return `$ ${digits}`;
}

// A whole UUID is too long for a subject line, so emails show only its last 8 characters. The
// last ones, not the first: order ids are time-ordered UUIDs (uuidv7), whose first characters
// are a timestamp and are therefore the same for orders created around the same minute.
export function shortId(orderId: string): string {
  return orderId.slice(-8);
}

// Replaces the five characters that have a special meaning in HTML. "&" must be replaced
// first: otherwise the "&" of "&lt;" would be escaped a second time.
export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
