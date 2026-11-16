import { ApiError } from '../api/http';
import { es } from '../i18n/es';

/** Text to show for a failed request: the API's problem `detail`, or a generic message. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.problem?.detail) {
    return error.problem.detail;
  }
  return es.errors.generic;
}
