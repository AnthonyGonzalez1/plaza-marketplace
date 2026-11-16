// The catalog keeps all of its state (search, filters, sort, page) in the URL query string.
// These two functions are the only place that knows how that state is read and written.
import { SORT_OPTIONS, type ProductQuery, type ProductSort } from '../api/catalog';
import { buildQueryString } from '../api/http';

export const PAGE_SIZE = 12;
export const DEFAULT_SORT: ProductSort = 'relevance';

/** The catalog state as stored in the URL. Same names as the API parameters, minus `size`. */
export type CatalogParams = Omit<ProductQuery, 'size'>;

/** Reads the catalog state from the URL, ignoring anything that is not a valid value. */
export function readCatalogParams(search: URLSearchParams): CatalogParams {
  const sort = search.get('sort');
  return {
    q: search.get('q')?.trim() || undefined,
    storeId: readWholeNumber(search.get('storeId')),
    categoryId: readWholeNumber(search.get('categoryId')),
    minPrice: readWholeNumber(search.get('minPrice')),
    maxPrice: readWholeNumber(search.get('maxPrice')),
    sort: SORT_OPTIONS.find((option) => option === sort),
    page: readWholeNumber(search.get('page')),
  };
}

/** Writes the catalog state as a query string, leaving out defaults to keep links short. */
export function writeCatalogParams(params: CatalogParams): string {
  return buildQueryString({
    ...params,
    sort: params.sort === DEFAULT_SORT ? undefined : params.sort,
    page: params.page === 0 ? undefined : params.page,
  });
}

/** Parses a non-negative whole number ("12" -> 12). Anything else gives undefined. */
export function readWholeNumber(text: string | null): number | undefined {
  if (text === null || !/^\d+$/.test(text)) {
    return undefined;
  }
  return Number(text);
}
