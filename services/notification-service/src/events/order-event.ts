// The events that store-api publishes to RabbitMQ when something happens to an order, and the
// function that checks that a message really has that shape.
//
// Example body:
//   {"eventId":"0193a1e6-...","type":"OrderPaid","occurredAt":"2026-11-17T12:00:00Z",
//    "order":{"id":"0193a1e5-...","email":"ana@example.com","status":"PAID","total":64000.00,
//             "currency":"COP","items":[{"productId":1,"name":"Café molido Quindío 500 g",
//             "unitPrice":32000.00,"quantity":2,"lineTotal":64000.00}]},
//    "reason":"PAYMENT_DECLINED"}
//
// The interfaces below declare only the fields this service reads. The message carries a few
// more (order.status, order.currency, items[].productId): they are ignored, so the publisher
// can add fields without breaking this consumer.

export interface OrderItem {
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderEvent {
  // Identifies the event. A redelivered copy carries the same eventId: it is what lets this
  // service recognise "I already sent the email for this one".
  eventId: string;
  // 'OrderPlaced', 'OrderPaid' or 'OrderCancelled' today. Kept as a plain string because an
  // unknown type is not an error: the service ignores the types it has no email for.
  type: string;
  occurredAt: string;
  order: {
    id: string;
    email: string;
    total: number;
    items: OrderItem[];
  };
  // Only in OrderCancelled: 'PAYMENT_DECLINED' or 'EXPIRED'.
  reason?: string;
}

// The result of reading a message: either the event, or why it is not one.
export type ParseResult = { ok: true; event: OrderEvent } | { ok: false; error: string };

// Turns the text of a message into an OrderEvent. It never throws: a message that is not a
// valid event is a normal situation here (the consumer sends it to the dead-letter queue).
//
// The checks are written by hand, one "if" per rule, instead of using a validation library:
// there are few rules and this way each one is visible.
export function parseOrderEvent(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return invalid('the body is not valid JSON');
  }

  if (!isObject(data)) {
    return invalid('the body is not a JSON object');
  }
  if (!isText(data.eventId)) {
    return invalid('eventId is missing');
  }
  if (!isText(data.type)) {
    return invalid('type is missing');
  }
  if (!isText(data.occurredAt)) {
    return invalid('occurredAt is missing');
  }
  // null is accepted as "no reason": some JSON serializers write absent fields that way.
  if (data.reason !== undefined && data.reason !== null && typeof data.reason !== 'string') {
    return invalid('reason must be a string');
  }

  const order = data.order;
  if (!isObject(order)) {
    return invalid('order is missing');
  }
  if (!isText(order.id)) {
    return invalid('order.id is missing');
  }
  if (!isText(order.email)) {
    return invalid('order.email is missing');
  }
  if (!isAmount(order.total)) {
    return invalid('order.total must be a number');
  }
  if (!Array.isArray(order.items)) {
    return invalid('order.items must be a list');
  }

  const items: OrderItem[] = [];
  for (const item of order.items as unknown[]) {
    if (!isObject(item)) {
      return invalid('order.items contains something that is not an object');
    }
    if (!isText(item.name)) {
      return invalid('an item has no name');
    }
    if (!isAmount(item.unitPrice) || !isAmount(item.quantity) || !isAmount(item.lineTotal)) {
      return invalid(`unitPrice, quantity and lineTotal of "${item.name}" must be numbers`);
    }
    items.push({
      name: item.name,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    });
  }

  return {
    ok: true,
    event: {
      eventId: data.eventId,
      type: data.type,
      occurredAt: data.occurredAt,
      order: { id: order.id, email: order.email, total: order.total, items },
      reason: typeof data.reason === 'string' ? data.reason : undefined,
    },
  };
}

function invalid(error: string): ParseResult {
  return { ok: false, error };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

// JSON has a single kind of number, so 64000, 64000.0 and 64000.00 arrive as the same value.
function isAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
