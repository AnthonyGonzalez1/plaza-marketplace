import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatDateTime } from '../lib/format';
import { makeOrder, mockFetch, problemResponse, renderApp } from '../test/helpers';

describe('OrderPage', () => {
  it('renders an order that is waiting for payment', async () => {
    const order = makeOrder();
    const requests = mockFetch(() => order);
    renderApp('/orders/order-1');

    expect(await screen.findByRole('heading', { level: 1, name: 'Tu pedido' })).toBeInTheDocument();
    expect(requests[0]?.pathname).toBe('/api/v1/orders/order-1');

    expect(screen.getByText('order-1')).toBeInTheDocument();
    expect(screen.getByText('Pendiente de pago')).toBeInTheDocument();
    expect(screen.getByText('ana@correo.co')).toBeInTheDocument();
    expect(screen.getByText(/Café de origen Huila/)).toBeInTheDocument();
    expect(screen.getByText('× 2')).toBeInTheDocument();
    expect(screen.getAllByText(/64\.000/)).toHaveLength(2); // the line and the total

    // The exact text depends on the time zone of the machine, so build it the same way.
    const notice = screen.getByText(/reservados hasta/);
    expect(notice).toHaveTextContent(formatDateTime(order.expiresAt));
    expect(notice).toHaveTextContent('El pago en línea llegará en una próxima versión.');
  });

  it('shows the other statuses in Spanish, without the reservation note', async () => {
    mockFetch(() => makeOrder({ status: 'PAID' }));
    renderApp('/orders/order-1');

    expect(await screen.findByText('Pagado')).toBeInTheDocument();
    expect(screen.queryByText(/reservados hasta/)).not.toBeInTheDocument();
  });

  it('shows the not-found state when the API answers 404', async () => {
    mockFetch(() => problemResponse(404, 'Order nope was not found'));
    renderApp('/orders/nope');

    expect(
      await screen.findByRole('heading', { name: 'Este pedido no existe' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir al catálogo' })).toHaveAttribute('href', '/');
  });

  it('shows the problem detail for other errors', async () => {
    mockFetch(() => problemResponse(500, 'Orders are temporarily unavailable'));
    renderApp('/orders/order-1');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Orders are temporarily unavailable',
    );
  });
});
