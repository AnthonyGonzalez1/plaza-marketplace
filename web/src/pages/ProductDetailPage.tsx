import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'react-router';
import { getProduct } from '../api/catalog';
import { ApiError } from '../api/http';
import { AddToCartForm } from '../components/AddToCartForm';
import { ProductImage } from '../components/ProductImage';
import { StatusMessage } from '../components/StatusMessage';
import { StockBadge } from '../components/StockBadge';
import { es } from '../i18n/es';
import { readWholeNumber } from '../lib/catalogParams';
import { errorMessage } from '../lib/errorMessage';
import { formatPrice } from '../lib/format';

export function ProductDetailPage() {
  const { id } = useParams();
  const productId = readWholeNumber(id ?? null);

  // The catalog card stores its query string in the navigation state, so "back" returns to
  // the same search and page. Opening the product URL directly has no state: go to "/".
  const location = useLocation();
  const state = location.state as { catalogSearch?: string } | null;
  const backLink = (
    <Link className="link" to={{ pathname: '/', search: state?.catalogSearch ?? '' }}>
      ← {es.product.backToCatalog}
    </Link>
  );

  const product = useQuery({
    queryKey: ['product', productId],
    queryFn: ({ signal }) => getProduct(productId as number, signal),
    // An id that is not a number can never exist, so do not even ask the API.
    enabled: productId !== undefined,
  });

  const notFound =
    productId === undefined || (product.error instanceof ApiError && product.error.status === 404);

  if (notFound) {
    return (
      <StatusMessage title={es.product.notFoundTitle} hint={es.product.notFoundHint} heading="h1">
        {backLink}
      </StatusMessage>
    );
  }

  if (product.isPending) {
    return (
      <>
        {backLink}
        <div className="product-detail" role="status" aria-label={es.product.loading}>
          <div className="product-image skeleton" />
          <div className="product-detail__info">
            <div className="skeleton skeleton--text skeleton--short" />
            <div className="skeleton skeleton--title" />
            <div className="skeleton skeleton--text" />
            <div className="skeleton skeleton--text" />
          </div>
        </div>
      </>
    );
  }

  if (product.isError) {
    return (
      <StatusMessage
        title={es.errors.title}
        hint={errorMessage(product.error)}
        heading="h1"
        role="alert"
      >
        <button className="button button--primary" type="button" onClick={() => product.refetch()}>
          {es.errors.retry}
        </button>
        {backLink}
      </StatusMessage>
    );
  }

  const { name, store, category, price, available, description, imageUrl } = product.data;

  return (
    <>
      <title>{`${name} · ${es.brand}`}</title>
      {backLink}

      <article className="product-detail">
        <ProductImage imageUrl={imageUrl} name={name} alt={name} />

        <div className="product-detail__info">
          {category && <p className="product-detail__category">{category.name}</p>}
          <h1>{name}</h1>
          <p className="product-detail__store">
            {es.product.soldBy} <strong>{store.name}</strong>
          </p>

          <p className="product-detail__price">
            <span className="price price--large">{formatPrice(price)}</span>
            <StockBadge available={available} />
            {available > 1 && (
              <span className="product-detail__stock">{es.product.inStock(available)}</span>
            )}
          </p>

          {/* key: a different product starts with a fresh form (quantity 1, no message). */}
          <AddToCartForm key={product.data.id} productId={product.data.id} available={available} />

          <section className="product-detail__description">
            <h2>{es.product.description}</h2>
            <p>{description}</p>
          </section>
        </div>
      </article>
    </>
  );
}
