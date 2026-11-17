// Types and functions for the cart endpoints of store-api (base path /api/v1/carts).
import { getJson, sendJson } from './http';

const BASE_PATH = '/api/v1/carts';

/** The API accepts between 1 and this many units of one product in a cart. */
export const MAX_QUANTITY = 99;

export interface CartItem {
  productId: number;
  name: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  /** Units in stock right now. It can be lower than `quantity` if someone else bought first. */
  available: number;
  /** unitPrice x quantity, calculated by the server. */
  lineTotal: number;
}

export interface Cart {
  id: string;
  items: CartItem[];
  /** Sum of the quantities of every line (what the header badge shows). */
  totalItems: number;
  total: number;
  currency: 'COP';
}

/** Creates a new empty cart. */
export function createCart(): Promise<Cart> {
  return sendJson('POST', BASE_PATH);
}

/** Fails with a 404 ApiError when the cart expired or never existed. */
export function getCart(cartId: string, signal?: AbortSignal): Promise<Cart> {
  return getJson(`${BASE_PATH}/${cartId}`, {}, signal);
}

/**
 * Sets how many units of a product the cart has. The quantity REPLACES the current one (it
 * is not added to it), and the product is added to the cart if it was not there yet.
 */
export function setCartItemQuantity(
  cartId: string,
  productId: number,
  quantity: number,
): Promise<Cart> {
  return sendJson('PUT', `${BASE_PATH}/${cartId}/items/${productId}`, { quantity });
}

export function removeCartItem(cartId: string, productId: number): Promise<Cart> {
  return sendJson('DELETE', `${BASE_PATH}/${cartId}/items/${productId}`);
}
