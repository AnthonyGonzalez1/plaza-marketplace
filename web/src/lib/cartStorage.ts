// Remembers which cart belongs to this browser. Only the cart ID is stored (in localStorage);
// the content of the cart always comes from the API.
import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'plaza.cartId';

// localStorage can throw (blocked by the browser settings, storage full...). In that case the
// ID is kept in this variable, so the cart still works until the page is reloaded.
let fallbackCartId: string | null = null;

// Functions to call when the ID changes, so the components that show the cart draw again.
const listeners = new Set<() => void>();

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

/** The stored cart ID, or null when this browser has no cart yet. */
export function readCartId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return fallbackCartId;
  }
}

export function saveCartId(cartId: string): void {
  fallbackCartId = cartId;
  try {
    window.localStorage.setItem(STORAGE_KEY, cartId);
  } catch {
    // Nothing else to do: the fallback variable already has the ID.
  }
  notifyListeners();
}

/** Called when the cart expired on the server or was turned into an order. */
export function forgetCartId(): void {
  fallbackCartId = null;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Same as above.
  }
  notifyListeners();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // The browser fires "storage" when ANOTHER tab changes localStorage: keeps tabs in sync.
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

/**
 * The cart ID as React state. localStorage lives outside React, so React does not know when
 * it changes. `useSyncExternalStore` is the hook made for that: it reads the value with
 * `readCartId` and reads it again every time `subscribe` reports a change. This way the
 * header and the pages always agree on the cart ID without a context or a state library.
 */
export function useCartId(): string | null {
  return useSyncExternalStore(subscribe, readCartId);
}
