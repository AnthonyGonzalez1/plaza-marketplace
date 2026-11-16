import { describe, expect, it } from 'vitest';
import { mockFetch, problemResponse } from '../test/helpers';
import { ApiError, buildQueryString, getJson } from './http';

describe('buildQueryString', () => {
  it('returns an empty string when there are no parameters', () => {
    expect(buildQueryString({})).toBe('');
  });

  it('joins parameters and converts numbers to text', () => {
    expect(buildQueryString({ q: 'mochila', page: 2 })).toBe('?q=mochila&page=2');
  });

  it('skips undefined, null and empty values but keeps zero', () => {
    expect(buildQueryString({ q: '', storeId: undefined, categoryId: null, page: 0 })).toBe(
      '?page=0',
    );
  });

  it('encodes spaces and accents', () => {
    expect(buildQueryString({ q: 'café molido' })).toBe('?q=caf%C3%A9+molido');
  });
});

describe('getJson', () => {
  it('returns the parsed body of a successful response', async () => {
    const requests = mockFetch(() => ({ hello: 'world' }));

    await expect(getJson('/api/v1/things', { page: 1 })).resolves.toEqual({ hello: 'world' });
    expect(requests[0]?.pathname + requests[0]!.search).toBe('/api/v1/things?page=1');
  });

  it('throws an ApiError with the problem details on an error response', async () => {
    mockFetch(() => problemResponse(404, 'Product 99 was not found'));

    const error = await getJson('/api/v1/products/99').catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
    expect((error as ApiError).problem?.detail).toBe('Product 99 was not found');
  });

  it('throws an ApiError without problem details when the error body is not JSON', async () => {
    mockFetch(() => new Response('<html>Bad Gateway</html>', { status: 502 }));

    const error = await getJson('/api/v1/products').catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).problem).toBeNull();
  });
});
