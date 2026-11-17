// Types and functions for the order endpoints of store-api (base path /api/v1/orders).
import { getJson, sendJson } from './http';

const BASE_PATH = '/api/v1/orders';

export type OrderStatus = 'PENDING_PAYMENT' | 'PAID' | 'CANCELLED';

export interface OrderItem {
  productId: number;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  status: OrderStatus;
  email: string;
  total: number;
  currency: 'COP';
  /** ISO 8601 dates in UTC, e.g. "2026-11-16T20:00:00Z". */
  createdAt: string;
  /** Until when the stock is reserved while the order waits for payment. */
  expiresAt: string;
  items: OrderItem[];
}

/** What the checkout form sends: the cart to buy and the e-mail of the guest. */
export interface NewOrder {
  cartId: string;
  email: string;
}

/** What the simulated payment gateway should answer. A real gateway decides this itself. */
export type PaymentOutcome = 'APPROVED' | 'DECLINED';

/**
 * Turns a cart into an order. Fails with 400 (invalid e-mail, unknown or empty cart) or with
 * 409 when a product no longer has enough stock.
 *
 * A POST that is sent twice (double click, or a retry after a network error whose first
 * attempt did reach the server) would create two orders. The `Idempotency-Key` header avoids
 * that: when the server sees a key it already processed, it answers with the order it created
 * the first time instead of creating another one.
 */
export function createOrder(newOrder: NewOrder, idempotencyKey: string): Promise<Order> {
  return sendJson('POST', BASE_PATH, newOrder, { 'Idempotency-Key': idempotencyKey });
}

export function getOrder(orderId: string, signal?: AbortSignal): Promise<Order> {
  return getJson(`${BASE_PATH}/${orderId}`, {}, signal);
}

/**
 * Asks the server to charge the order. The answer is 202 Accepted with no body: the payment
 * was only SENT to the payment gateway. The result arrives later and shows up as a new
 * `status` when the order is read again.
 * Fails with 404 (unknown order), 409 (the order is not waiting for payment any more) or
 * 502 (the payment gateway could not be reached).
 */
export function payOrder(orderId: string, simulateOutcome: PaymentOutcome): Promise<void> {
  return sendJson('POST', `${BASE_PATH}/${orderId}/payments`, { simulateOutcome });
}
