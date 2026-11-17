// Helpers shared by the page tests: a fake `fetch`, sample data and a render function.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { vi } from 'vitest';
import type { Cart, CartItem } from '../api/cart';
import type { Page, ProductDetail, ProductSummary } from '../api/catalog';
import { App } from '../App';

/** Method and JSON body of a request, for the tests that check what was sent. */
export interface SentRequest {
  method: string;
  body: unknown;
}

/**
 * Replaces the global `fetch`. The handler receives the requested URL (and, as a second
 * argument, the method and body) and returns either the JSON body of a 200 response or a
 * full Response (see `problemResponse`).
 * Returns the list of requested URLs so tests can assert on what was asked.
 */
export function mockFetch(handler: (url: URL, request: SentRequest) => unknown): URL[] {
  const requests: URL[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input, 'http://localhost');
      requests.push(url);
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      const result = handler(url, { method, body });
      return result instanceof Response ? result : Response.json(result);
    }),
  );
  return requests;
}

/** An error response in the RFC 9457 format the API uses. */
export function problemResponse(status: number, detail: string): Response {
  const body = { type: 'about:blank', title: 'Error', status, detail, instance: '/api/v1' };
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}

export function makeProduct(overrides: Partial<ProductDetail> = {}): ProductDetail {
  return {
    id: 1,
    name: 'Café de origen Huila',
    slug: 'cafe-de-origen-huila',
    price: 32000,
    currency: 'COP',
    imageUrl: null,
    available: 12,
    store: { id: 1, name: 'Tostadores del Sur', slug: 'tostadores-del-sur' },
    category: { id: 2, name: 'Despensa', slug: 'despensa' },
    description: 'Café arábica de tueste medio.',
    ...overrides,
  };
}

export function makePage(
  items: ProductSummary[],
  overrides: Partial<Page<ProductSummary>> = {},
): Page<ProductSummary> {
  return { items, page: 0, size: 12, totalItems: items.length, totalPages: 1, ...overrides };
}

export function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
  const item: CartItem = {
    productId: 1,
    name: 'Café de origen Huila',
    imageUrl: null,
    unitPrice: 32000,
    quantity: 1,
    available: 12,
    lineTotal: 0,
    ...overrides,
  };
  // Unless the test fixes it, the line total follows the price and the quantity.
  item.lineTotal = overrides.lineTotal ?? item.unitPrice * item.quantity;
  return item;
}

/** A cart with the given lines; the totals are calculated like the API does. */
export function makeCart(items: CartItem[] = [], id = 'cart-1'): Cart {
  return {
    id,
    items,
    totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
    total: items.reduce((sum, item) => sum + item.lineTotal, 0),
    currency: 'COP',
  };
}

/**
 * Renders the whole app at the given URL, with an in-memory router and a fresh query cache.
 * The current URL is printed in a hidden element so tests can read it with `currentUrl()`.
 */
export function renderApp(initialUrl: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <App />
        <UrlProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function UrlProbe() {
  const location = useLocation();
  return <output data-testid="url">{location.pathname + location.search}</output>;
}

export function currentUrl(): string {
  return document.querySelector('[data-testid="url"]')?.textContent ?? '';
}
