import { describe, expect, it } from 'vitest';
import { formatAmount, formatCents } from './currency';

describe('formatCents', () => {
  it('formats whole quetzales with two decimals when cents is a round amount', () => {
    expect(formatCents(10_000)).toBe('Q100.00');
  });

  it('formats fractional quetzales when cents is not a multiple of 100', () => {
    expect(formatCents(5_030)).toBe('Q50.30');
  });

  it('formats zero as Q0.00', () => {
    expect(formatCents(0)).toBe('Q0.00');
  });
});

describe('formatAmount', () => {
  it('formats an already-converted quetzales amount with two decimals', () => {
    expect(formatAmount(1900)).toBe('Q1900.00');
  });
});
