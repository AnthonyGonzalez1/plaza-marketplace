// Types and functions for the catalog endpoints of store-api (base path /api/v1).
import { getJson } from './http';

const BASE_PATH = '/api/v1';

export interface StoreRef {
  id: number;
  name: string;
  slug: string;
}

export interface CategoryRef {
  id: number;
  name: string;
  slug: string;
}

export interface Store extends StoreRef {
  description: string;
}

export type Category = CategoryRef;

export interface ProductSummary {
  id: number;
  name: string;
  slug: string;
  price: number;
  currency: 'COP';
  imageUrl: string | null;
  /** Units in stock. 0 means sold out. */
  available: number;
  store: StoreRef;
  category: CategoryRef | null;
}

export interface ProductDetail extends ProductSummary {
  description: string;
}

/** One page of results plus the metadata needed to draw the pagination. */
export interface Page<T> {
  items: T[];
  /** 0-based page index. */
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
}

export const SORT_OPTIONS = ['relevance', 'price_asc', 'price_desc', 'newest'] as const;
export type ProductSort = (typeof SORT_OPTIONS)[number];

/** Query parameters accepted by GET /products. All of them are optional. */
export interface ProductQuery {
  q?: string;
  storeId?: number;
  categoryId?: number;
  minPrice?: number;
  maxPrice?: number;
  sort?: ProductSort;
  page?: number;
  size?: number;
}

export function listProducts(
  query: ProductQuery,
  signal?: AbortSignal,
): Promise<Page<ProductSummary>> {
  return getJson(`${BASE_PATH}/products`, { ...query }, signal);
}

export function getProduct(id: number, signal?: AbortSignal): Promise<ProductDetail> {
  return getJson(`${BASE_PATH}/products/${id}`, {}, signal);
}

export function listStores(signal?: AbortSignal): Promise<Store[]> {
  return getJson(`${BASE_PATH}/stores`, {}, signal);
}

export function listCategories(signal?: AbortSignal): Promise<Category[]> {
  return getJson(`${BASE_PATH}/categories`, {}, signal);
}
