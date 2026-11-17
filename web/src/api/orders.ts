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

/**
 * Turns a cart into an order. Fails with 400 (invalid e-mail, unknown or empty cart) or with
 * 409 when a product no longer has enough stock.
 */
export function createOrder(newOrder: NewOrder): Promise<Order> {
  return sendJson('POST', BASE_PATH, newOrder);
}

export function getOrder(orderId: string, signal?: AbortSignal): Promise<Order> {
  return getJson(`${BASE_PATH}/${orderId}`, {}, signal);
}
