import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Cart } from '../api/cart';
import { makeCart, makeCartItem, mockFetch, problemResponse, renderApp } from '../test/helpers';

const CART_ID_KEY = 'plaza.cartId';

const coffee = makeCartItem({ productId: 1, name: 'Café de origen Huila', quantity: 2 });
const bag = makeCartItem({
  productId: 2,
  name: 'Mochila tejida',
  unitPrice: 180000,
  quantity: 1,
  available: 3,
});

/**
 * Fake cart API for a browser that already has the cart "cart-1" stored. GET answers the
 * given cart; PUT and DELETE answer what `change` returns and that becomes the new cart.
 * Returns the changes that were sent, e.g. "PUT /api/v1/carts/cart-1/items/1 {"quantity":3}".
 */
function mockCartApi(initialCart: Cart, change: () => Cart = () => initialCart): string[] {
  window.localStorage.setItem(CART_ID_KEY, initialCart.id);
  let cart = initialCart;
  const changes: string[] = [];

  mockFetch((url, request) => {
    if (!url.pathname.startsWith('/api/v1/carts/cart-1')) {
      throw new Error(`Unexpected request: ${request.method} ${url.pathname}`);
    }
    if (request.method !== 'GET') {
      const body = request.body === undefined ? '' : ` ${JSON.stringify(request.body)}`;
      changes.push(`${request.method} ${url.pathname}${body}`);
      cart = change();
    }
    return cart;
  });
  return changes;
}

describe('CartPage', () => {
  it('renders the lines, the total and the header count', async () => {
    mockCartApi(makeCart([coffee, bag]));
    renderApp('/cart');

    const lines = within(await screen.findByRole('list', { name: 'Productos en el carrito' }));
    expect(lines.getByRole('link', { name: 'Café de origen Huila' })).toHaveAttribute(
      'href',
      '/products/1',
    );
    expect(lines.getByText(/32\.000 c\/u/)).toBeInTheDocument();
    expect(lines.getByText(/64\.000/)).toBeInTheDocument(); // 2 x 32.000
    expect(lines.getByRole('link', { name: 'Mochila tejida' })).toBeInTheDocument();

    expect(screen.getByText(/244\.000/)).toBeInTheDocument(); // 64.000 + 180.000
    expect(screen.getByRole('link', { name: 'Carrito, 3 unidades' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continuar con la compra' })).toHaveAttribute(
      'href',
      '/checkout',
    );
  });

  it('changes the quantity of a line with a PUT', async () => {
    const user = userEvent.setup();
    const changes = mockCartApi(makeCart([coffee, bag]), () =>
      makeCart([{ ...coffee, quantity: 3, lineTotal: 96000 }, bag]),
    );
    renderApp('/cart');

    await user.click(
      await screen.findByRole('button', { name: 'Agregar una unidad de Café de origen Huila' }),
    );

    expect(await screen.findByText(/96\.000/)).toBeInTheDocument();
    expect(screen.getByText(/276\.000/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Carrito, 4 unidades' })).toBeInTheDocument();
    expect(changes).toEqual(['PUT /api/v1/carts/cart-1/items/1 {"quantity":3}']);
  });

  it('does not let the quantity go below 1 or above the stock', async () => {
    mockCartApi(makeCart([{ ...bag, quantity: 1, available: 1 }]));
    renderApp('/cart');

    expect(
      await screen.findByRole('button', { name: 'Quitar una unidad de Mochila tejida' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Agregar una unidad de Mochila tejida' }),
    ).toBeDisabled();
  });

  it('removes a line with a DELETE', async () => {
    const user = userEvent.setup();
    const changes = mockCartApi(makeCart([coffee, bag]), () => makeCart([coffee]));
    renderApp('/cart');

    await user.click(
      await screen.findByRole('button', { name: 'Eliminar Mochila tejida del carrito' }),
    );

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Mochila tejida' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Café de origen Huila' })).toBeInTheDocument();
    expect(changes).toEqual(['DELETE /api/v1/carts/cart-1/items/2']);
  });

  it('shows the empty state after removing the last line', async () => {
    const user = userEvent.setup();
    mockCartApi(makeCart([coffee]), () => makeCart([]));
    renderApp('/cart');

    await user.click(
      await screen.findByRole('button', { name: 'Eliminar Café de origen Huila del carrito' }),
    );

    expect(await screen.findByRole('heading', { name: 'Tu carrito está vacío' })).toBeVisible();
  });

  it('warns about a line that asks for more units than the stock and blocks the checkout', async () => {
    mockCartApi(makeCart([{ ...coffee, quantity: 5, available: 2 }]));
    renderApp('/cart');

    expect(await screen.findByText(/Solo quedan 2 unidades/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar con la compra' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Continuar con la compra' })).not.toBeInTheDocument();
  });

  it('shows the empty state without calling the API when there is no stored cart', async () => {
    const requests = mockFetch(() => {
      throw new Error('No request expected');
    });
    renderApp('/cart');

    expect(
      await screen.findByRole('heading', { name: 'Tu carrito está vacío' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir al catálogo' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Carrito, 0 unidades' })).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('treats an expired cart (404) as empty and forgets its ID', async () => {
    window.localStorage.setItem(CART_ID_KEY, 'cart-old');
    const requests = mockFetch(() => problemResponse(404, 'Cart cart-old was not found'));
    renderApp('/cart');

    expect(
      await screen.findByRole('heading', { name: 'Tu carrito está vacío' }),
    ).toBeInTheDocument();
    expect(requests[0]?.pathname).toBe('/api/v1/carts/cart-old');
    expect(window.localStorage.getItem(CART_ID_KEY)).toBeNull();
  });

  it('shows the problem detail when the cart cannot be loaded', async () => {
    window.localStorage.setItem(CART_ID_KEY, 'cart-1');
    mockFetch(() => problemResponse(500, 'The cart service is unavailable'));
    renderApp('/cart');

    expect(await screen.findByRole('alert')).toHaveTextContent('The cart service is unavailable');
    // A server error is not "expired": the cart ID must survive it.
    expect(window.localStorage.getItem(CART_ID_KEY)).toBe('cart-1');
  });
});
