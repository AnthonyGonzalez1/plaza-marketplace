import { Link } from 'react-router';
import { es } from '../i18n/es';

interface PaginationProps {
  /** Current page, 0-based like the API. */
  page: number;
  totalPages: number;
  /** Query string (e.g. "?q=cafe&page=2") that shows the given page. */
  searchForPage: (page: number) => string;
}

/**
 * Previous / next navigation. The controls are real links, so each page has its own URL and
 * the browser's back button and "open in new tab" work as expected.
 */
export function Pagination({ page, totalPages, searchForPage }: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }
  const hasPrevious = page > 0;
  const hasNext = page < totalPages - 1;

  return (
    <nav className="pagination" aria-label={es.pagination.label}>
      {hasPrevious ? (
        <Link className="button" to={{ search: searchForPage(page - 1) }} rel="prev">
          {es.pagination.previous}
        </Link>
      ) : (
        <span className="button button--disabled">{es.pagination.previous}</span>
      )}

      <span className="pagination__status">{es.pagination.status(page + 1, totalPages)}</span>

      {hasNext ? (
        <Link className="button" to={{ search: searchForPage(page + 1) }} rel="next">
          {es.pagination.next}
        </Link>
      ) : (
        <span className="button button--disabled">{es.pagination.next}</span>
      )}
    </nav>
  );
}
