const copFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

/** Formats an amount in Colombian pesos, e.g. 45900 -> "$ 45.900". */
export function formatPrice(amount: number): string {
  return copFormatter.format(amount);
}
