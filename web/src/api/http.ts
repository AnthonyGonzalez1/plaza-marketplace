// A very small wrapper around fetch: builds the query string, parses JSON and turns every
// failed response into an ApiError that carries the RFC 9457 problem details sent by the API.

/** Body of an error response (`application/problem+json`, RFC 9457). Every field is optional. */
export interface Problem {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  /** Extra field the API adds to stock errors (409): the product that ran out. */
  productId?: number;
}

export class ApiError extends Error {
  readonly status: number;
  readonly problem: Problem | null;

  constructor(status: number, problem: Problem | null) {
    super(problem?.detail ?? problem?.title ?? `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.problem = problem;
  }
}

export type QueryParams = Record<string, string | number | null | undefined>;

/**
 * Builds a query string such as `?q=cafe&page=2`. Empty values (undefined, null, '') are
 * skipped, so callers can pass optional filters without checking each one.
 */
export function buildQueryString(params: QueryParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text === '' ? '' : `?${text}`;
}

export async function getJson<T>(
  path: string,
  params: QueryParams = {},
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path + buildQueryString(params), {
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new ApiError(response.status, await readProblem(response));
  }
  return (await response.json()) as T;
}

/**
 * Sends a request that changes something on the server (POST, PUT, DELETE) and returns the
 * JSON answer. When a body is given it is sent as JSON.
 */
export async function sendJson<T>(
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) {
    // Tells the server how to read the body. Without it the API answers 415.
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    throw new ApiError(response.status, await readProblem(response));
  }
  return (await response.json()) as T;
}

/** Reads the problem body, or returns null when the error is not JSON (e.g. a proxy 502 page). */
async function readProblem(response: Response): Promise<Problem | null> {
  const contentType = response.headers.get('Content-Type') ?? '';
  if (!contentType.includes('json')) {
    return null;
  }
  try {
    return (await response.json()) as Problem;
  } catch {
    return null;
  }
}
