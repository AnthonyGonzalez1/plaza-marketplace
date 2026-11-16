import { describe, expect, it } from 'vitest';
import { readCatalogParams, writeCatalogParams } from './catalogParams';

describe('readCatalogParams', () => {
  it('reads every filter from the query string', () => {
    const search = new URLSearchParams(
      'q=cafe&storeId=2&categoryId=5&minPrice=1000&maxPrice=90000&sort=price_asc&page=3',
    );

    expect(readCatalogParams(search)).toEqual({
      q: 'cafe',
      storeId: 2,
      categoryId: 5,
      minPrice: 1000,
      maxPrice: 90000,
      sort: 'price_asc',
      page: 3,
    });
  });

  it('ignores values that are not valid', () => {
    const search = new URLSearchParams('storeId=abc&minPrice=-5&sort=cheapest&page=1.5');
    const params = readCatalogParams(search);

    expect(params.storeId).toBeUndefined();
    expect(params.minPrice).toBeUndefined();
    expect(params.sort).toBeUndefined();
    expect(params.page).toBeUndefined();
  });
});

describe('writeCatalogParams', () => {
  it('leaves out the defaults so the plain catalog URL stays clean', () => {
    expect(writeCatalogParams({ sort: 'relevance', page: 0 })).toBe('');
  });

  it('writes only the filters that are set', () => {
    expect(writeCatalogParams({ q: 'ruana', storeId: 3, sort: 'newest', page: 2 })).toBe(
      '?q=ruana&storeId=3&sort=newest&page=2',
    );
  });
});
