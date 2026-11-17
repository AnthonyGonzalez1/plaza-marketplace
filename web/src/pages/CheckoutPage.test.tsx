import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  currentUrl,
  makeCart,
  makeCartItem,
  makeOrder,
  mockFetch,
  problemResponse,
  renderApp,
  type SentRequest,
} from '../test/helpers';

const CART_ID_KEY = 'plaza.cartId';
const cart = makeCart([makeCartItem({ quantity: 2 })]);

/**
 * Fake API for a browser with the cart "cart-1" stored. `createOrder` decides the answer of
 * POST /orders. Returns the bodies sent to POST /orders and every requested URL.
 */
function mockCheckoutApi(createOrder: (request: SentRequest) => unknown) {
  window.localStorage.setItem(CART_ID_KEY, cart.id);
  const orderBodies: unknown[] = [];

  const requests = mockFetch((url, request) => {
    if (url.pathname === '/api/v1/carts/cart-1') return cart;
    if (url.pathname === '/api/v1/orders' && request.method === 'POST') {
      orderBodies.push(request.body);
      return createOrder(request);
    }
    if (url.pathname === '/api/v1/orders/order-1') return makeOrder();
    throw new Error(`Unexpected request: ${request.method} ${url.pathname}`);
  });
  return { orderBodies, requests };
}

describe('CheckoutPage', () => {
  it('shows the order summary', async () => {
    mockCheckoutApi(() => makeOrder());
    renderApp('/checkout');

    const summary = within(await screen.findByRole('region', { name: 'Resumen del pedido' }));
    expect(summary.getByText(/Café de origen Huila/)).toBeInTheDocument();
    expect(summary.getByText('× 2')).toBeInTheDocument();
    expect(summary.getAllByText(/64\.000/)).toHaveLength(2); // the line and the total
  });

  it('asks for the e-mail before sending anything', async () => {
    const user = userEvent.setup();
    const { orderBodies } = mockCheckoutApi(() => makeOrder());
    renderApp('/checkout');

    await user.click(await screen.findByRole('button', { name: 'Crear pedido' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Escribe tu correo electrónico.');
    expect(screen.getByRole('textbox', { name: 'Correo electrónico' })).toBeInvalid();
    expect(orderBodies).toHaveLength(0);
  });

  it('rejects text that does not look like an e-mail', async () => {
    const user = userEvent.setup();
    const { orderBodies } = mockCheckoutApi(() => makeOrder());
    renderApp('/checkout');

    await user.type(await screen.findByRole('textbox', { name: 'Correo electrónico' }), 'ana@');
    await user.click(screen.getByRole('button', { name: 'Crear pedido' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Escribe un correo válido');
    expect(orderBodies).toHaveLength(0);
  });

  it('creates the order, forgets the cart and opens the order page', async () => {
    const user = userEvent.setup();
    const { orderBodies } = mockCheckoutApi(() => makeOrder());
    renderApp('/checkout');

    await user.type(
      await screen.findByRole('textbox', { name: 'Correo electrónico' }),
      ' ana@correo.co ',
    );
    await user.click(screen.getByRole('button', { name: 'Crear pedido' }));

    await waitFor(() => expect(currentUrl()).toBe('/orders/order-1'));
    expect(await screen.findByRole('heading', { name: 'Tu pedido' })).toBeInTheDocument();
    // The e-mail is sent without the spaces around it.
    expect(orderBodies).toEqual([{ cartId: 'cart-1', email: 'ana@correo.co' }]);
    expect(window.localStorage.getItem(CART_ID_KEY)).toBeNull();
    expect(screen.getByRole('link', { name: 'Carrito, 0 unidades' })).toBeInTheDocument();
  });

  it('explains a stock problem (409) and reads the cart again', async () => {
    const user = userEvent.setup();
    const { requests } = mockCheckoutApi(() =>
      problemResponse(409, 'Not enough stock for product 1'),
    );
    renderApp('/checkout');

    await user.type(
      await screen.findByRole('textbox', { name: 'Correo electrónico' }),
      'ana@correo.co',
    );
    await user.click(screen.getByRole('button', { name: 'Crear pedido' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('ya no tiene suficientes unidades');
    expect(within(alert).getByRole('link', { name: 'Volver al carrito' })).toHaveAttribute(
      'href',
      '/cart',
    );
    // Still on the checkout page, with the cart kept.
    expect(currentUrl()).toBe('/checkout');
    expect(window.localStorage.getItem(CART_ID_KEY)).toBe('cart-1');
    // Once when the page opened and once more after the 409, to get the current stock.
    await waitFor(() => {
      const cartReads = requests.filter((url) => url.pathname === '/api/v1/carts/cart-1');
      expect(cartReads).toHaveLength(2);
    });
  });

  it('shows the problem detail for other errors', async () => {
    const user = userEvent.setup();
    mockCheckoutApi(() => problemResponse(400, 'The email address is not valid'));
    renderApp('/checkout');

    await user.type(
      await screen.findByRole('textbox', { name: 'Correo electrónico' }),
      'ana@correo.co',
    );
    await user.click(screen.getByRole('button', { name: 'Crear pedido' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The email address is not valid');
  });

  it('shows the empty state when there is no cart', async () => {
    const requests = mockFetch(() => {
      throw new Error('No request expected');
    });
    renderApp('/checkout');

    expect(
      await screen.findByRole('heading', { name: 'Tu carrito está vacío' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear pedido' })).not.toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });
});
