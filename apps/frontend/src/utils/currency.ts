const formatter = new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' });

// Some ICU builds put a space after the symbol ("Q 1,500.00"); prices here read "Q1,500.00".
export function formatAmount(amount: number): string {
  return formatter
    .formatToParts(amount)
    .filter((part) => part.type !== 'literal')
    .map((part) => part.value)
    .join('');
}

export function formatCents(cents: number): string {
  return formatAmount(cents / 100);
}
