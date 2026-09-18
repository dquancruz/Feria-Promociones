import { describe, expect, it } from 'vitest';
import { formatAmount, formatCents } from './currency';

describe('formatCents', () => {
  it('formats a round amount with two decimals', () => {
    expect(formatCents(10_000)).toBe('Q100.00');
  });

  it('formats fractional quetzales', () => {
    expect(formatCents(5_030)).toBe('Q50.30');
  });

  it('formats zero', () => {
    expect(formatCents(0)).toBe('Q0.00');
  });

  it('separates thousands, without a space after the symbol', () => {
    expect(formatCents(150_000)).toBe('Q1,500.00');
    expect(formatCents(30_001)).toBe('Q300.01');
  });
});

describe('formatAmount', () => {
  it('formats an amount already in quetzales', () => {
    expect(formatAmount(1900)).toBe('Q1,900.00');
    expect(formatAmount(1234567.5)).toBe('Q1,234,567.50');
  });
});
