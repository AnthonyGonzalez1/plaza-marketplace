import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { ApiError } from '../api/http';
import { getOrder } from '../api/orders';
import { OrderSummary } from '../components/OrderSummary';
import { StatusMessage } from '../components/StatusMessage';
import { es } from '../i18n/es';
import { errorMessage } from '../lib/errorMessage';
import { formatDateTime } from '../lib/format';

export function OrderPage() {
  // The route is "orders/:orderId", so the parameter is always present on this page.
  const { orderId = '' } = useParams();

  const order = useQuery({
    queryKey: ['order', orderId],
    queryFn: ({ signal }) => getOrder(orderId, signal),
  });

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

  const { id, status, email, createdAt, expiresAt, items, total } = order.data;

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
                {es.order.status[status]}
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
          <p className="order__notice">
            {es.order.reservedUntil(formatDateTime(expiresAt))} {es.order.paymentComingSoon}
          </p>
        )}

        <OrderSummary title={es.order.itemsTitle} items={items} total={total} />

        {goToCatalog}
      </div>
    </>
  );
}
