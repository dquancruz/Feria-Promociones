export function formatCents(cents: number): string {
  return formatAmount(cents / 100);
}

export function formatAmount(amount: number): string {
  return `Q${amount.toFixed(2)}`;
}
