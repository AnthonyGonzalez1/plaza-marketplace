import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  currentUrl,
  makeCart,
  makeCartItem,
  makePage,
  makeProduct,
  mockFetch,
  problemResponse,
  renderApp,
} from '../test/helpers';

describe('ProductDetailPage', () => {
  it('renders the product returned by the API', async () => {
    const requests = mockFetch(() => makeProduct({ id: 7, available: 12 }));
    renderApp('/products/7');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Café de origen Huila' }),
    ).toBeInTheDocument();
    expect(requests[0]?.pathname).toBe('/api/v1/products/7');
    expect(screen.getByText('Tostadores del Sur')).toBeInTheDocument();
    expect(screen.getByText('Despensa')).toBeInTheDocument();
    expect(screen.getByText(/32\.000/)).toBeInTheDocument();
    expect(screen.getByText('12 disponibles')).toBeInTheDocument();
    expect(screen.getByText('Café arábica de tueste medio.')).toBeInTheDocument();
  });

  it('shows the quantity field and the cart button for a product in stock', async () => {
    mockFetch(() => makeProduct({ available: 12 }));
    renderApp('/products/1');

    const button = await screen.findByRole('button', { name: 'Agregar al carrito' });
    expect(button).toBeEnabled();
    const quantity = screen.getByRole('spinbutton', { name: 'Cantidad' });
    expect(quantity).toHaveValue(1);
    expect(quantity).toHaveAttribute('min', '1');
    expect(quantity).toHaveAttribute('max', '12');
  });

  it('marks a sold-out product and disables the cart button with a hint', async () => {
    mockFetch(() => makeProduct({ available: 0 }));
    renderApp('/products/1');

    expect(await screen.findByText('Agotado')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Agregar al carrito' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/agotado/);
    expect(screen.getByRole('spinbutton', { name: 'Cantidad' })).toBeDisabled();
  });

  it('shows the not-found state when the API answers 404', async () => {
    mockFetch(() => problemResponse(404, 'Product 999 was not found'));
    renderApp('/products/999');

    expect(
      await screen.findByRole('heading', { name: 'Este producto no existe' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Volver al catálogo/ })).toHaveAttribute('href', '/');
  });

  it('shows the not-found state without calling the API when the id is not a number', async () => {
    const requests = mockFetch(() => makeProduct());
    renderApp('/products/abc');

    expect(
      await screen.findByRole('heading', { name: 'Este producto no existe' }),
    ).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('shows the problem detail for other errors', async () => {
    mockFetch(() => problemResponse(500, 'The catalog is temporarily unavailable'));
    renderApp('/products/1');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The catalog is temporarily unavailable',
    );
  });

  it('links back to the catalog query the user came from', async () => {
    const user = userEvent.setup();
    mockFetch((url) => {
      if (url.pathname === '/api/v1/products') return makePage([makeProduct()]);
      if (url.pathname === '/api/v1/products/1') return makeProduct();
      return [];
    });
    renderApp('/?q=cafe&sort=newest');

    await user.click(await screen.findByRole('link', { name: /Café de origen Huila/ }));
    await screen.findByRole('heading', { level: 1, name: 'Café de origen Huila' });
    expect(currentUrl()).toBe('/products/1');

    await user.click(screen.getByRole('link', { name: /Volver al catálogo/ }));

    expect(currentUrl()).toBe('/?q=cafe&sort=newest');
  });
});

describe('add to cart', () => {
  const CART_ID_KEY = 'plaza.cartId';

  /**
   * Fake API with one product (id 1) and a cart that remembers the quantity it was given.
   * `initialQuantity` is what the cart "cart-1" already has; pass null for "no cart yet".
   * Returns the changes that were sent, e.g. "PUT /api/v1/carts/cart-1/items/1 {"quantity":2}".
   */
  function mockShopApi(initialQuantity: number | null, available = 12): string[] {
    let cart =
      initialQuantity === null ? null : makeCart([makeCartItem({ quantity: initialQuantity })]);
    if (cart !== null) {
      window.localStorage.setItem(CART_ID_KEY, cart.id);
    }
    const changes: string[] = [];

    mockFetch((url, request) => {
      if (url.pathname === '/api/v1/products/1') return makeProduct({ id: 1, available });

      if (request.method !== 'GET') {
        const body = request.body === undefined ? '' : ` ${JSON.stringify(request.body)}`;
        changes.push(`${request.method} ${url.pathname}${body}`);
      }
      if (request.method === 'POST' && url.pathname === '/api/v1/carts') {
        cart = makeCart([]);
        return cart;
      }
      if (request.method === 'PUT' && url.pathname === '/api/v1/carts/cart-1/items/1') {
        const { quantity } = request.body as { quantity: number };
        cart = makeCart([makeCartItem({ quantity })]);
        return cart;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/carts/cart-1' && cart !== null) {
        return cart;
      }
      throw new Error(`Unexpected request: ${request.method} ${url.pathname}`);
    });
    return changes;
  }

  it('creates a cart when there is none, then sets the quantity', async () => {
    const user = userEvent.setup();
    const changes = mockShopApi(null);
    renderApp('/products/1');

    const quantity = await screen.findByRole('spinbutton', { name: 'Cantidad' });
    await user.clear(quantity);
    await user.type(quantity, '2');
    await user.click(screen.getByRole('button', { name: 'Agregar al carrito' }));

    expect(await screen.findByText(/Tienes 2 unidades de este producto/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver carrito' })).toHaveAttribute('href', '/cart');
    expect(changes).toEqual([
      'POST /api/v1/carts',
      'PUT /api/v1/carts/cart-1/items/1 {"quantity":2}',
    ]);
    expect(window.localStorage.getItem(CART_ID_KEY)).toBe('cart-1');
    expect(await screen.findByRole('link', { name: 'Carrito, 2 unidades' })).toBeInTheDocument();
  });

  it('adds the chosen quantity to what the cart already has', async () => {
    const user = userEvent.setup();
    const changes = mockShopApi(2);
    renderApp('/products/1');

    // The header shows the stored cart once it has loaded.
    await screen.findByRole('link', { name: 'Carrito, 2 unidades' });
    const quantity = await screen.findByRole('spinbutton', { name: 'Cantidad' });
    await user.clear(quantity);
    await user.type(quantity, '3');
    await user.click(screen.getByRole('button', { name: 'Agregar al carrito' }));

    expect(await screen.findByText(/Tienes 5 unidades de este producto/)).toBeInTheDocument();
    // No new cart: only the PUT, with the absolute quantity (2 + 3).
    expect(changes).toEqual(['PUT /api/v1/carts/cart-1/items/1 {"quantity":5}']);
  });

  it('never asks for more units than the stock', async () => {
    const user = userEvent.setup();
    const changes = mockShopApi(2, 4);
    renderApp('/products/1');

    await screen.findByRole('link', { name: 'Carrito, 2 unidades' });
    const quantity = await screen.findByRole('spinbutton', { name: 'Cantidad' });
    await user.clear(quantity);
    await user.type(quantity, '9');
    await user.click(screen.getByRole('button', { name: 'Agregar al carrito' }));

    expect(await screen.findByText(/Tienes 4 unidades de este producto/)).toBeInTheDocument();
    expect(changes).toEqual(['PUT /api/v1/carts/cart-1/items/1 {"quantity":4}']);
    // The cart now has every unit in stock, so there is nothing more to add.
    const button = screen.getByRole('button', { name: 'Agregar al carrito' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/todas las unidades/);
  });

  it('shows the problem detail when the product cannot be added', async () => {
    const user = userEvent.setup();
    mockFetch((url, request) => {
      if (url.pathname === '/api/v1/products/1') return makeProduct();
      if (request.method === 'POST') return makeCart([]);
      return problemResponse(404, 'Product 1 was not found');
    });
    renderApp('/products/1');

    await user.click(await screen.findByRole('button', { name: 'Agregar al carrito' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Product 1 was not found');
  });
});

describe('unknown routes', () => {
  it('shows the not-found page', async () => {
    mockFetch(() => []);
    renderApp('/does-not-exist');

    expect(
      await screen.findByRole('heading', { name: 'Página no encontrada' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir al catálogo' })).toHaveAttribute('href', '/');
  });
});
