import { Link } from 'react-router';
import { es } from '../i18n/es';
import { StatusMessage } from './StatusMessage';

/** Empty state shared by the cart and checkout pages. */
export function EmptyCart() {
  return (
    <StatusMessage title={es.cart.emptyTitle} hint={es.cart.emptyHint} heading="h1">
      <Link className="button button--primary" to="/">
        {es.notFound.goHome}
      </Link>
    </StatusMessage>
  );
}
