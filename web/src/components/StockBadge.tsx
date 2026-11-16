import { es } from '../i18n/es';

/** Small label for the two stock situations worth highlighting; renders nothing otherwise. */
export function StockBadge({ available }: { available: number }) {
  if (available === 0) {
    return <span className="badge badge--muted">{es.product.soldOut}</span>;
  }
  if (available === 1) {
    return <span className="badge badge--accent">{es.product.lastUnit}</span>;
  }
  return null;
}
