import { screen, waitFor, within } from '@testing-library/react';
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

const stores = [
  { id: 1, name: 'Tostadores del Sur', slug: 'tostadores-del-sur', description: 'Café' },
  { id: 2, name: 'Tejidos Wayuu', slug: 'tejidos-wayuu', description: 'Mochilas' },
];
const categories = [{ id: 2, name: 'Despensa', slug: 'despensa' }];

const coffee = makeProduct({ id: 1, name: 'Café de origen Huila', price: 32000 });
const bag = makeProduct({
  id: 2,
  name: 'Mochila tejida',
  price: 180000,
  available: 0,
  store: { id: 2, name: 'Tejidos Wayuu', slug: 'tejidos-wayuu' },
});

/** Fake API: answers stores and categories, and delegates /products to the given function. */
function mockCatalogApi(products: (url: URL) => unknown) {
  return mockFetch((url) => {
    if (url.pathname === '/api/v1/stores') return stores;
    if (url.pathname === '/api/v1/categories') return categories;
    if (url.pathname === '/api/v1/products') return products(url);
    throw new Error(`Unexpected request: ${url.pathname}`);
  });
}

/** The /products requests among everything that was fetched. */
function productRequests(requests: URL[]): URL[] {
  return requests.filter((url) => url.pathname === '/api/v1/products');
}

describe('CatalogPage', () => {
  it('renders the products returned by the API', async () => {
    mockCatalogApi(() => makePage([coffee, bag]));
    renderApp('/');

    const coffeeCard = await screen.findByRole('link', { name: /Café de origen Huila/ });
    expect(coffeeCard).toHaveAttribute('href', '/products/1');
    expect(within(coffeeCard).getByText('Tostadores del Sur')).toBeInTheDocument();
    expect(within(coffeeCard).getByText(/32\.000/)).toBeInTheDocument();

    const bagCard = screen.getByRole('link', { name: /Mochila tejida/ });
    expect(within(bagCard).getByText('Agotado')).toBeInTheDocument();

    expect(screen.getByText('2 productos')).toBeInTheDocument();
  });

  it('asks the API for the first page with the page size', async () => {
    const requests = mockCatalogApi(() => makePage([coffee]));
    renderApp('/');
    await screen.findByText('Café de origen Huila');

    const [request] = productRequests(requests);
    expect(request?.searchParams.get('page')).toBe('0');
    expect(request?.searchParams.get('size')).toBe('12');
    expect(request?.searchParams.has('q')).toBe(false);
  });

  it('typing a search updates the URL and requests with q', async () => {
    const user = userEvent.setup();
    const requests = mockCatalogApi(() => makePage([coffee]));
    renderApp('/');
    await screen.findByText('Café de origen Huila');

    await user.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'mochila');

    // No Enter pressed: the debounce applies the search after a short pause.
    await waitFor(() => expect(currentUrl()).toBe('/?q=mochila'));
    await waitFor(() => {
      expect(productRequests(requests).at(-1)?.searchParams.get('q')).toBe('mochila');
    });
    // One request for the initial load and one for the finished word, not one per letter.
    expect(productRequests(requests)).toHaveLength(2);
  });

  it('pressing Enter applies the search immediately', async () => {
    const user = userEvent.setup();
    mockCatalogApi(() => makePage([coffee]));
    renderApp('/');
    await screen.findByText('Café de origen Huila');

    await user.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'panela{Enter}');

    expect(currentUrl()).toBe('/?q=panela');
  });

  it('changing a filter resets the page to the first one', async () => {
    const user = userEvent.setup();
    const requests = mockCatalogApi(() => makePage([coffee], { page: 2, totalPages: 5 }));
    renderApp('/?q=cafe&page=2');
    await screen.findByText('Café de origen Huila');
    // Wait for the store list, otherwise there is no option to select yet.
    await screen.findByRole('option', { name: 'Tejidos Wayuu' });

    await user.selectOptions(screen.getByLabelText('Tienda'), 'Tejidos Wayuu');

    expect(currentUrl()).toBe('/?q=cafe&storeId=2');
    await waitFor(() => {
      const last = productRequests(requests).at(-1);
      expect(last?.searchParams.get('storeId')).toBe('2');
      expect(last?.searchParams.get('page')).toBe('0');
    });
  });

  it('changing the sort order is written to the URL and sent to the API', async () => {
    const user = userEvent.setup();
    const requests = mockCatalogApi(() => makePage([coffee]));
    renderApp('/');
    await screen.findByText('Café de origen Huila');

    await user.selectOptions(screen.getByLabelText('Ordenar por'), 'Precio: menor a mayor');

    expect(currentUrl()).toBe('/?sort=price_asc');
    await waitFor(() => {
      expect(productRequests(requests).at(-1)?.searchParams.get('sort')).toBe('price_asc');
    });
  });

  it('paginates with links that keep the current filters', async () => {
    const user = userEvent.setup();
    const requests = mockCatalogApi((url) => {
      const page = Number(url.searchParams.get('page'));
      return makePage([page === 0 ? coffee : bag], { page, totalItems: 13, totalPages: 2 });
    });
    renderApp('/?q=a');

    await screen.findByText('Café de origen Huila');
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
    // On the first page "Anterior" is not a link.
    expect(screen.queryByRole('link', { name: 'Anterior' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Siguiente' }));

    await screen.findByText('Mochila tejida');
    expect(currentUrl()).toBe('/?q=a&page=1');
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();
    expect(productRequests(requests).at(-1)?.searchParams.get('page')).toBe('1');
    expect(screen.queryByRole('link', { name: 'Siguiente' })).not.toBeInTheDocument();
  });

  it('shows the empty state when nothing matches', async () => {
    mockCatalogApi(() => makePage([]));
    renderApp('/?q=zzz');

    expect(await screen.findByText('No encontramos productos')).toBeInTheDocument();
    expect(screen.getByText('0 productos')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Limpiar filtros' })).toHaveAttribute('href', '/');
  });

  it('shows the problem detail when the API fails, and retries on demand', async () => {
    const user = userEvent.setup();
    let failing = true;
    mockCatalogApi(() =>
      failing
        ? problemResponse(400, 'minPrice must not be greater than maxPrice')
        : makePage([coffee]),
    );
    renderApp('/?minPrice=500&maxPrice=100');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('minPrice must not be greater than maxPrice');

    failing = false;
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Café de origen Huila')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a generic message when the error has no problem detail', async () => {
    mockCatalogApi(() => new Response('Bad Gateway', { status: 502 }));
    renderApp('/');

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar la información');
  });
});
