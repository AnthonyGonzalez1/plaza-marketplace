import { es } from '../i18n/es';
import { formatPrice } from '../lib/format';

/** The fields this list needs. Cart lines and order lines both have them. */
interface SummaryLine {
  productId: number;
  name: string;
  quantity: number;
  lineTotal: number;
}

interface OrderSummaryProps {
  title: string;
  items: SummaryLine[];
  total: number;
}

/** Read-only list of products with quantities and the total (checkout and order pages). */
export function OrderSummary({ title, items, total }: OrderSummaryProps) {
  return (
    <section className="summary" aria-labelledby="summary-title">
      <h2 id="summary-title">{title}</h2>
      <ul className="summary__lines">
        {items.map((item) => (
          <li key={item.productId} className="summary__line">
            <span>
              {item.name}{' '}
              <span className="summary__quantity">{es.checkout.lineQuantity(item.quantity)}</span>
            </span>
            <span className="price">{formatPrice(item.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <p className="summary__total">
        <span>{es.cart.total}</span>
        <span className="price price--large">{formatPrice(total)}</span>
      </p>
    </section>
  );
}
