const copFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

/** Formats an amount in Colombian pesos, e.g. 45900 -> "$ 45.900". */
export function formatPrice(amount: number): string {
  return copFormatter.format(amount);
}

/**
 * Formats an ISO 8601 date from the API, e.g. "2026-11-16T20:15:00Z" ->
 * "16 de noviembre de 2026 a las 3:15 p. m.".
 *
 * The API sends dates in UTC and the browser converts them to the time zone of the user.
 * `timeZone` is only passed by tests, so the result is the same on every machine.
 */
export function formatDateTime(isoDate: string, timeZone?: string): string {
  const formatter = new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone,
  });
  return formatter.format(new Date(isoDate));
}
