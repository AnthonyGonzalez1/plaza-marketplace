import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  currentUrl,
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

  it('shows the cart button disabled with a "coming soon" hint', async () => {
    mockFetch(() => makeProduct());
    renderApp('/products/1');

    const button = await screen.findByRole('button', { name: 'Agregar al carrito' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/Próximamente/);
  });

  it('marks a sold-out product', async () => {
    mockFetch(() => makeProduct({ available: 0 }));
    renderApp('/products/1');

    expect(await screen.findByText('Agotado')).toBeInTheDocument();
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
