import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError } from '../api/http';
import { getOrder, payOrder, type PaymentOutcome } from '../api/orders';
import { OrderSummary } from '../components/OrderSummary';
import { StatusMessage } from '../components/StatusMessage';
import { es } from '../i18n/es';
import { errorMessage } from '../lib/errorMessage';
import { formatDateTime } from '../lib/format';

/** How often the order is read again while the result of a payment is awaited. */
const POLL_INTERVAL_MS = 2_000;
/** How long to keep asking before giving up and letting the user check by hand. */
const POLL_TIMEOUT_MS = 30_000;

/**
 * Where this page is with a payment it sent:
 * - "none": no payment was sent from this page yet;
 * - "waiting": the API accepted a payment and the page is polling for the result;
 * - "timedOut": the result did not arrive in time and the page stopped polling.
 */
type PaymentWait = 'none' | 'waiting' | 'timedOut';

/** Text to show when the pay request itself fails. */
function payErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) {
    return es.order.payment.notPending;
  }
  if (error instanceof ApiError && error.status === 502) {
    return es.order.payment.unavailable;
  }
  return errorMessage(error);
}

export function OrderPage() {
  // The route is "orders/:orderId", so the parameter is always present on this page.
  const { orderId = '' } = useParams();
  const queryClient = useQueryClient();

  const [paymentWait, setPaymentWait] = useState<PaymentWait>('none');

  const order = useQuery({
    queryKey: ['order', orderId],
    queryFn: ({ signal }) => getOrder(orderId, signal),
    // The payment is asynchronous: the API only answers "accepted" and the gateway reports
    // the result to the server a moment later. Nobody tells the browser, so it has to ask
    // again (polling). TanStack Query calls this function after every answer: a number means
    // "read the order again in that many milliseconds" and `false` means "stop". Polling
    // therefore stops by itself as soon as the order is PAID or CANCELLED.
    refetchInterval: (query) =>
      paymentWait === 'waiting' && query.state.data?.status === 'PENDING_PAYMENT'
        ? POLL_INTERVAL_MS
        : false,
  });

  const pay = useMutation({
    mutationFn: (outcome: PaymentOutcome) => payOrder(orderId, outcome),
    // 202 Accepted: the payment is on its way to the gateway. Start polling for the result.
    onSuccess: () => setPaymentWait('waiting'),
    onError: (payError) => {
      // 409 = the order is not waiting for payment any more (it was paid or cancelled in the
      // meantime). Read it again so the page shows its real state.
      if (payError instanceof ApiError && payError.status === 409) {
        return queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      }
    },
  });

  const status = order.data?.status;
  // True while the page polls. It turns false when the status changes or the wait times out.
  const isWaitingForResult = paymentWait === 'waiting' && status === 'PENDING_PAYMENT';

  // Stops the polling when the result takes too long. The timer starts when the wait starts,
  // and the function returned by the effect cancels it if the result arrives first (or the
  // user leaves the page), so it never fires late.
  useEffect(() => {
    if (!isWaitingForResult) {
      return;
    }
    const timer = setTimeout(() => setPaymentWait('timedOut'), POLL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isWaitingForResult]);

  const goToCatalog = (
    <Link className="link" to="/">
      {es.notFound.goHome}
    </Link>
  );

  if (order.error instanceof ApiError && order.error.status === 404) {
    return (
      <StatusMessage title={es.order.notFoundTitle} hint={es.order.notFoundHint} heading="h1">
        {goToCatalog}
      </StatusMessage>
    );
  }

  if (order.isPending) {
    return (
      <p className="loading-text" role="status">
        {es.order.loading}
      </p>
    );
  }

  if (order.isError) {
    return (
      <StatusMessage
        title={es.errors.title}
        hint={errorMessage(order.error)}
        heading="h1"
        role="alert"
      >
        <button className="button button--primary" type="button" onClick={() => order.refetch()}>
          {es.errors.retry}
        </button>
        {goToCatalog}
      </StatusMessage>
    );
  }

  const { id, email, createdAt, expiresAt, items, total } = order.data;
  // No second payment while one is being sent or its result is still awaited.
  const payDisabled = pay.isPending || isWaitingForResult;
  const timedOut = paymentWait === 'timedOut';

  return (
    <>
      <title>{`${es.order.title} · ${es.brand}`}</title>
      <header className="page-header">
        <h1>{es.order.title}</h1>
      </header>

      <div className="order">
        {/* A description list (dl) pairs each label (dt) with its value (dd). */}
        <dl className="order__details">
          <div>
            <dt>{es.order.numberLabel}</dt>
            <dd className="order__id">{id}</dd>
          </div>
          <div>
            <dt>{es.order.statusLabel}</dt>
            <dd>
              <span
                className={status === 'CANCELLED' ? 'badge badge--muted' : 'badge badge--accent'}
              >
                {es.order.status[order.data.status]}
              </span>
            </dd>
          </div>
          <div>
            <dt>{es.order.emailLabel}</dt>
            <dd>{email}</dd>
          </div>
          <div>
            <dt>{es.order.createdAtLabel}</dt>
            <dd>{formatDateTime(createdAt)}</dd>
          </div>
        </dl>

        {status === 'PENDING_PAYMENT' && (
          <section className="payment" aria-labelledby="payment-title">
            <h2 id="payment-title">{es.order.payment.title}</h2>
            <p>{es.order.reservedUntil(formatDateTime(expiresAt))}</p>

            <div className="payment__actions">
              <button
                className="button button--primary"
                type="button"
                disabled={payDisabled}
                onClick={() => pay.mutate('APPROVED')}
              >
                {es.order.payment.payNow}
              </button>
              <button
                className="button"
                type="button"
                disabled={payDisabled}
                onClick={() => pay.mutate('DECLINED')}
              >
                {es.order.payment.simulateDeclined}
              </button>
            </div>
            <p className="payment__note">{es.order.payment.simulatedNote}</p>

            {/* Always in the page (empty at first) so screen readers announce the text when
                it appears. role="status" waits for the reader to finish its sentence. */}
            <p className="payment__status" role="status">
              {isWaitingForResult && es.order.payment.processing}
              {timedOut && es.order.payment.stillWaiting}
            </p>
            {timedOut && (
              <button
                className="button"
                type="button"
                disabled={order.isFetching}
                onClick={() => order.refetch()}
              >
                {es.order.payment.checkAgain}
              </button>
            )}

            {pay.isError && (
              <p className="form-error" role="alert">
                {payErrorMessage(pay.error)}
              </p>
            )}
          </section>
        )}

        {status === 'PAID' && (
          <div className="order__result" role="status">
            <p className="order__result-title">{es.order.payment.paidTitle}</p>
            <p>{es.order.payment.paidHint(email)}</p>
          </div>
        )}

        {status === 'CANCELLED' && (
          <div className="order__result order__result--cancelled" role="status">
            <p className="order__result-title">{es.order.payment.cancelledTitle}</p>
            <p>{es.order.payment.cancelledHint}</p>
            <Link className="link" to="/">
              {es.product.backToCatalog}
            </Link>
          </div>
        )}

        <OrderSummary title={es.order.itemsTitle} items={items} total={total} />

        {goToCatalog}
      </div>
    </>
  );
}
