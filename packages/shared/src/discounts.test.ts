import { describe, expect, it } from 'vitest';
import { calculateDiscounts, type DiscountLineInput } from './discounts.js';

function items(count: number, priceCentsEach: number): DiscountLineInput[] {
  return Array.from({ length: count }, (_, i) => ({ id: `item-${i}`, priceCents: priceCentsEach }));
}

describe('calculateDiscounts - services', () => {
  it('0 services -> 0%', () => {
    const result = calculateDiscounts({ selectedServices: [], selectedProducts: [] });
    expect(result.serviceDiscountPct).toBe(0);
  });

  it('1 service, any price -> 0%', () => {
    const result = calculateDiscounts({
      selectedServices: [{ id: 's1', priceCents: 999_999 }],
      selectedProducts: [],
    });
    expect(result.serviceDiscountPct).toBe(0);
  });

  it('2 services, sum = 1500 -> 3% (not > 1500)', () => {
    const result = calculateDiscounts({
      selectedServices: [
        { id: 's1', priceCents: 75_000 },
        { id: 's2', priceCents: 75_000 },
      ],
      selectedProducts: [],
    });
    expect(result.serviceDiscountPct).toBe(3);
  });

  it('2 services, sum = 1500.01 -> 5%', () => {
    const result = calculateDiscounts({
      selectedServices: [
        { id: 's1', priceCents: 75_000 },
        { id: 's2', priceCents: 75_001 },
      ],
      selectedProducts: [],
    });
    expect(result.serviceDiscountPct).toBe(5);
  });

  it('5 services, sum = 100 -> 3% (count met, sum threshold not met)', () => {
    const result = calculateDiscounts({
      selectedServices: items(5, 2_000),
      selectedProducts: [],
    });
    expect(result.serviceDiscountPct).toBe(3);
  });
});

describe('calculateDiscounts - products', () => {
  it('0-2 products -> 0%', () => {
    for (const count of [0, 1, 2]) {
      const result = calculateDiscounts({ selectedServices: [], selectedProducts: items(count, 10_000) });
      expect(result.productDiscountPct).toBe(0);
    }
  });

  it('3-4 products -> 3%', () => {
    for (const count of [3, 4]) {
      const result = calculateDiscounts({ selectedServices: [], selectedProducts: items(count, 10_000) });
      expect(result.productDiscountPct).toBe(3);
    }
  });

  it('5+ products -> 5%', () => {
    for (const count of [5, 6]) {
      const result = calculateDiscounts({ selectedServices: [], selectedProducts: items(count, 10_000) });
      expect(result.productDiscountPct).toBe(5);
    }
  });
});

describe('calculateDiscounts - independence and totals', () => {
  it('service and product discounts apply independently', () => {
    const result = calculateDiscounts({
      selectedServices: items(2, 100_000), // sum 2000 > 1500 -> 5%
      selectedProducts: items(3, 10_000), // count 3 -> 3%
    });
    expect(result.serviceDiscountPct).toBe(5);
    expect(result.productDiscountPct).toBe(3);
  });

  it('computes subtotals, discounted totals, and grand total in cents', () => {
    const result = calculateDiscounts({
      selectedServices: items(2, 100_000), // subtotal 200000, 5% off -> 190000
      selectedProducts: items(3, 10_000), // subtotal 30000, 3% off -> 29100
    });
    expect(result.servicesSubtotalCents).toBe(200_000);
    expect(result.servicesTotalCents).toBe(190_000);
    expect(result.productsSubtotalCents).toBe(30_000);
    expect(result.productsTotalCents).toBe(29_100);
    expect(result.grandTotalCents).toBe(219_100);
  });

  it('applies no discount when neither threshold is met', () => {
    const result = calculateDiscounts({
      selectedServices: [{ id: 's1', priceCents: 50_000 }],
      selectedProducts: items(2, 10_000),
    });
    expect(result.serviceDiscountPct).toBe(0);
    expect(result.productDiscountPct).toBe(0);
    expect(result.grandTotalCents).toBe(70_000);
  });
});
