import { Link, useLocation } from 'react-router';
import type { ProductSummary } from '../api/catalog';
import { formatPrice } from '../lib/format';
import { ProductImage } from './ProductImage';
import { StockBadge } from './StockBadge';

/** One product in the catalog grid. The whole card is a link to the product page. */
export function ProductCard({ product }: { product: ProductSummary }) {
  // Remember the current catalog query so the product page can link back to the same results.
  const catalogSearch = useLocation().search;
  const soldOut = product.available === 0;

  return (
    <li className={soldOut ? 'card card--sold-out' : 'card'}>
      <Link className="card__link" to={`/products/${product.id}`} state={{ catalogSearch }}>
        <ProductImage imageUrl={product.imageUrl} name={product.name} />
        <div className="card__body">
          <p className="card__store">{product.store.name}</p>
          <h2 className="card__name">{product.name}</h2>
          <p className="card__footer">
            <span className="price">{formatPrice(product.price)}</span>
            <StockBadge available={product.available} />
          </p>
        </div>
      </Link>
    </li>
  );
}
