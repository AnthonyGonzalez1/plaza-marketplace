import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Order } from '../api/orders';
import { formatDateTime } from '../lib/format';
import {
  acceptedResponse,
  makeOrder,
  mockFetch,
  problemResponse,
  renderApp,
} from '../test/helpers';

const pending = makeOrder();
const paid = makeOrder({ status: 'PAID' });
const cancelled = makeOrder({ status: 'CANCELLED' });

/**
 * Fake API for the order "order-1". Every GET answers the next order of `orderAnswers` (the
 * last one is repeated), which is how a test makes the status change "by itself".
 * `payAnswer` decides the answer of POST /payments. Returns the bodies sent to POST /payments
 * and a function that tells how many times the order was read.
 */
function mockOrderApi(orderAnswers: Order[], payAnswer: () => Response = acceptedResponse) {
  const payments: unknown[] = [];
  let orderReads = 0;

  mockFetch((url, request) => {
    if (url.pathname === '/api/v1/orders/order-1' && request.method === 'GET') {
      const answer = orderAnswers[Math.min(orderReads, orderAnswers.length - 1)];
      orderReads += 1;
      return answer;
    }
    if (url.pathname === '/api/v1/orders/order-1/payments' && request.method === 'POST') {
      payments.push(request.body);
      return payAnswer();
    }
    throw new Error(`Unexpected request: ${request.method} ${url.pathname}`);
  });
  return { payments, countOrderReads: () => orderReads };
}

/** Moves the fake clock forward and lets React process what happened meanwhile. */
async function advanceTime(milliseconds: number) {
  await act(() => vi.advanceTimersByTimeAsync(milliseconds));
}

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
  });

  it('offers to pay an order that is waiting for payment', async () => {
    const { payments } = mockOrderApi([pending]);
    renderApp('/orders/order-1');

    const payment = within(await screen.findByRole('region', { name: 'Pago' }));
    expect(payment.getByRole('button', { name: 'Pagar ahora' })).toBeEnabled();
    expect(payment.getByRole('button', { name: 'Simular pago rechazado' })).toBeEnabled();
    expect(payment.getByText(/pasarela de pagos simulada/)).toBeInTheDocument();
    // Nothing is being processed yet, and nothing was sent.
    expect(payment.getByRole('status')).toBeEmptyDOMElement();
    expect(payments).toHaveLength(0);
  });

  it('treats an order id that is not valid as an order that does not exist', async () => {
    mockFetch(() => problemResponse(400, "Failed to convert 'orderId' with value: 'nope'"));
    renderApp('/orders/order-1');

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'Este pedido no existe',
    );
    // The technical message of the API is not shown to the buyer.
    expect(screen.queryByText(/Failed to convert/)).not.toBeInTheDocument();
  });

  it('shows the other statuses in Spanish, without the reservation note', async () => {
    mockFetch(() => makeOrder({ status: 'PAID' }));
    renderApp('/orders/order-1');

    expect(await screen.findByText('Pagado')).toBeInTheDocument();
    expect(screen.queryByText(/reservados hasta/)).not.toBeInTheDocument();
  });

  it('confirms a paid order and offers no payment', async () => {
    mockOrderApi([paid]);
    renderApp('/orders/order-1');

    // The message is announced to screen readers: its box has role="status".
    const result = (await screen.findByText('Pago aprobado')).parentElement!;
    expect(result).toHaveAttribute('role', 'status');
    expect(result).toHaveTextContent('Enviaremos la confirmación del pedido a ana@correo.co.');
    expect(screen.queryByRole('button', { name: 'Pagar ahora' })).not.toBeInTheDocument();
  });

  it('explains a cancelled order and links back to the catalog', async () => {
    mockOrderApi([cancelled]);
    renderApp('/orders/order-1');

    const result = (await screen.findByText('Pedido cancelado')).parentElement!;
    expect(result).toHaveAttribute('role', 'status');
    expect(screen.getByText('Cancelado')).toBeInTheDocument();
    expect(result).toHaveTextContent('El pago fue rechazado o se venció el tiempo para pagar.');
    expect(result).toHaveTextContent('Las unidades reservadas quedaron disponibles de nuevo.');
    expect(within(result).getByRole('link', { name: 'Volver al catálogo' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.queryByRole('button', { name: 'Pagar ahora' })).not.toBeInTheDocument();
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

  describe('paying', () => {
    // The page waits 2 seconds between two reads of the order. With a fake clock the tests
    // jump over those waits instead of sitting through them. `shouldAdvanceTime` keeps the
    // fake clock ticking with the real one, which `findBy...` and `waitFor` need to retry.
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /** user-event waits between its steps: tell it how to move the fake clock. */
    function setupUser() {
      return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    }

    it('sends the payment, polls the order and shows it paid', async () => {
      const user = setupUser();
      // Read 1 opens the page; reads 2 and 3 are the polling.
      const { payments, countOrderReads } = mockOrderApi([pending, pending, paid]);
      renderApp('/orders/order-1');

      await user.click(await screen.findByRole('button', { name: 'Pagar ahora' }));

      expect(await screen.findByText('Procesando el pago…')).toHaveAttribute('role', 'status');
      expect(payments).toEqual([{ simulateOutcome: 'APPROVED' }]);
      expect(screen.getByRole('button', { name: 'Pagar ahora' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Simular pago rechazado' })).toBeDisabled();
      // Accepting the payment does not read the order: the first poll is 2 seconds later.
      expect(countOrderReads()).toBe(1);

      await advanceTime(2_000);
      expect(countOrderReads()).toBe(2);
      expect(screen.getByText('Procesando el pago…')).toBeInTheDocument(); // still pending

      await advanceTime(2_000);
      expect(countOrderReads()).toBe(3);
      expect(await screen.findByText('Pago aprobado')).toBeInTheDocument();
      expect(screen.getByText('Pagado')).toBeInTheDocument();
      expect(screen.getByText(/confirmación del pedido a ana@correo.co/)).toBeInTheDocument();
      expect(screen.queryByText('Procesando el pago…')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Pagar ahora' })).not.toBeInTheDocument();
    });

    it('stops polling once the status changes', async () => {
      const user = setupUser();
      const { countOrderReads } = mockOrderApi([pending, paid]);
      renderApp('/orders/order-1');

      await user.click(await screen.findByRole('button', { name: 'Pagar ahora' }));
      await screen.findByText('Procesando el pago…');
      await advanceTime(2_000);
      expect(await screen.findByText('Pago aprobado')).toBeInTheDocument();
      expect(countOrderReads()).toBe(2);

      // A whole minute later the order was not read again.
      await advanceTime(60_000);
      expect(countOrderReads()).toBe(2);
    });

    it('sends a declined payment and shows the order cancelled', async () => {
      const user = setupUser();
      const { payments } = mockOrderApi([pending, cancelled]);
      renderApp('/orders/order-1');

      await user.click(await screen.findByRole('button', { name: 'Simular pago rechazado' }));

      expect(await screen.findByText('Procesando el pago…')).toBeInTheDocument();
      expect(payments).toEqual([{ simulateOutcome: 'DECLINED' }]);

      await advanceTime(2_000);
      expect(await screen.findByText('Pedido cancelado')).toBeInTheDocument();
      expect(screen.getByText('Cancelado')).toBeInTheDocument();
      expect(screen.getByText(/Las unidades reservadas quedaron disponibles/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Volver al catálogo' })).toHaveAttribute('href', '/');
      expect(
        screen.queryByRole('button', { name: 'Simular pago rechazado' }),
      ).not.toBeInTheDocument();
    });

    it('reads the order again on 409 and shows its real state', async () => {
      const user = setupUser();
      // The page opened while the order was pending; someone paid it in the meantime.
      const { countOrderReads } = mockOrderApi([pending, paid], () =>
        problemResponse(409, 'Order order-1 is not awaiting payment'),
      );
      renderApp('/orders/order-1');

      await user.click(await screen.findByRole('button', { name: 'Pagar ahora' }));

      expect(await screen.findByText('Pago aprobado')).toBeInTheDocument();
      expect(screen.getByText('Pagado')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Pagar ahora' })).not.toBeInTheDocument();
      expect(countOrderReads()).toBe(2);

      // The payment was not accepted, so there is nothing to poll for.
      await advanceTime(10_000);
      expect(countOrderReads()).toBe(2);
    });

    it('explains a 502 and lets the user try again', async () => {
      const user = setupUser();
      const { payments, countOrderReads } = mockOrderApi([pending], () =>
        problemResponse(502, 'Payment gateway unreachable'),
      );
      renderApp('/orders/order-1');

      await user.click(await screen.findByRole('button', { name: 'Pagar ahora' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'El servicio de pagos no está disponible. Inténtalo de nuevo en un momento.',
      );
      expect(screen.getByRole('button', { name: 'Pagar ahora' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Simular pago rechazado' })).toBeEnabled();
      expect(screen.queryByText('Procesando el pago…')).not.toBeInTheDocument();

      // Nothing was accepted, so the page does not poll.
      await advanceTime(10_000);
      expect(countOrderReads()).toBe(1);

      // The button really works again.
      await user.click(screen.getByRole('button', { name: 'Pagar ahora' }));
      await waitFor(() => expect(payments).toHaveLength(2));
    });

    it('shows the problem detail for other errors of the pay request', async () => {
      const user = setupUser();
      mockOrderApi([pending], () => problemResponse(500, 'Payments are temporarily unavailable'));
      renderApp('/orders/order-1');

      await user.click(await screen.findByRole('button', { name: 'Pagar ahora' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Payments are temporarily unavailable',
      );
      expect(screen.getByRole('button', { name: 'Pagar ahora' })).toBeEnabled();
    });

    it('stops polling after 30 seconds and offers to check again', async () => {
      const user = setupUser();
      // The result never arrives while polling; it is there when the user checks by hand.
      const answers = [pending];
      const { countOrderReads } = mockOrderApi(answers);
      renderApp('/orders/order-1');

      await user.click(await screen.findByRole('button', { name: 'Pagar ahora' }));
      await screen.findByText('Procesando el pago…');

      await advanceTime(30_000);
      expect(
        await screen.findByText('El resultado está tardando más de lo normal.'),
      ).toHaveAttribute('role', 'status');
      expect(screen.queryByText('Procesando el pago…')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Pagar ahora' })).toBeEnabled();

      // Polling stopped: no more reads, however long the page stays open.
      const readsWhenStopped = countOrderReads();
      expect(readsWhenStopped).toBeGreaterThan(10); // one read every 2 seconds
      await advanceTime(60_000);
      expect(countOrderReads()).toBe(readsWhenStopped);

      answers.push(paid);
      await user.click(screen.getByRole('button', { name: 'Consultar de nuevo' }));

      expect(await screen.findByText('Pago aprobado')).toBeInTheDocument();
      expect(countOrderReads()).toBe(readsWhenStopped + 1);
    });
  });
});
