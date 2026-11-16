import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router';
import { listCategories, listProducts, listStores } from '../api/catalog';
import { CatalogFilters } from '../components/CatalogFilters';
import { Pagination } from '../components/Pagination';
import { ProductCard } from '../components/ProductCard';
import { StatusMessage } from '../components/StatusMessage';
import { es } from '../i18n/es';
import {
  PAGE_SIZE,
  readCatalogParams,
  writeCatalogParams,
  type CatalogParams,
} from '../lib/catalogParams';
import { errorMessage } from '../lib/errorMessage';

/** Stores and categories rarely change: reuse them for five minutes before asking again. */
const REFERENCE_DATA_STALE_MS = 5 * 60 * 1000;

export function CatalogPage() {
  // The URL query string is the single source of truth for search, filters, sort and page.
  // That makes every view shareable as a link and makes back/forward work for free.
  const [searchParams, setSearchParams] = useSearchParams();
  const params = readCatalogParams(searchParams);
  const page = params.page ?? 0;

  const products = useQuery({
    queryKey: ['products', params],
    queryFn: ({ signal }) => listProducts({ ...params, page, size: PAGE_SIZE }, signal),
    // While the next page or filter loads, keep showing the previous results (dimmed)
    // instead of flashing the skeleton again.
    placeholderData: keepPreviousData,
  });
  const stores = useQuery({
    queryKey: ['stores'],
    queryFn: ({ signal }) => listStores(signal),
    staleTime: REFERENCE_DATA_STALE_MS,
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: ({ signal }) => listCategories(signal),
    staleTime: REFERENCE_DATA_STALE_MS,
  });

  // Start at the top of the list when the page changes.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);

  /** Applies filter changes to the URL. Any real change goes back to the first page. */
  function changeFilters(changes: Partial<CatalogParams>) {
    const currentFilters = writeCatalogParams({ ...params, page: 0 });
    const nextFilters = writeCatalogParams({ ...params, ...changes, page: 0 });
    if (nextFilters !== currentFilters) {
      setSearchParams(nextFilters);
    }
  }

  function renderResults() {
    if (products.isPending) {
      return <SkeletonGrid />;
    }
    if (products.isError) {
      return (
        <StatusMessage title={es.errors.title} hint={errorMessage(products.error)} role="alert">
          <button
            className="button button--primary"
            type="button"
            onClick={() => products.refetch()}
          >
            {es.errors.retry}
          </button>
        </StatusMessage>
      );
    }
    if (products.data.items.length === 0) {
      return <StatusMessage title={es.catalog.emptyTitle} hint={es.catalog.emptyHint} />;
    }
    return (
      <>
        <ul
          className={
            products.isPlaceholderData ? 'product-grid product-grid--stale' : 'product-grid'
          }
        >
          {products.data.items.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </ul>
        <Pagination
          page={page}
          totalPages={products.data.totalPages}
          searchForPage={(target) => writeCatalogParams({ ...params, page: target })}
        />
      </>
    );
  }

  const hasFilters = writeCatalogParams({ ...params, page: 0 }) !== '';

  return (
    <>
      <title>{`${es.catalog.title} · ${es.brand}`}</title>

      <header className="page-header">
        <h1>{es.catalog.title}</h1>
        <p>{es.catalog.intro}</p>
      </header>

      <CatalogFilters
        params={params}
        stores={stores.data ?? []}
        categories={categories.data ?? []}
        onChange={changeFilters}
      />

      <div className="results-bar">
        <p role="status">
          {products.isPending && es.catalog.loading}
          {products.isSuccess && es.catalog.resultCount(products.data.totalItems)}
        </p>
        {hasFilters && (
          <Link className="link" to="/">
            {es.catalog.clearFilters}
          </Link>
        )}
      </div>

      {renderResults()}
    </>
  );
}

/** Grey blocks with the shape of the product cards, shown while the first page loads. */
function SkeletonGrid() {
  return (
    <ul className="product-grid" aria-hidden="true">
      {Array.from({ length: PAGE_SIZE }, (_, index) => (
        <li key={index} className="card card--skeleton">
          <div className="product-image skeleton" />
          <div className="card__body">
            <div className="skeleton skeleton--text skeleton--short" />
            <div className="skeleton skeleton--text" />
            <div className="skeleton skeleton--text skeleton--short" />
          </div>
        </li>
      ))}
    </ul>
  );
}
