import type { CatalogItem } from '@feria/shared';
import { describe, expect, it } from 'vitest';
import { computePreview } from './discountPreview';

function item(id: string, type: CatalogItem['type'], priceCents: number): CatalogItem {
  return { id, type, name: id, priceCents, active: true };
}

const catalog = new Map<string, CatalogItem>([
  ['s1', item('s1', 'service', 100_000)],
  ['s2', item('s2', 'service', 60_000)],
  ['p1', item('p1', 'product', 5_000)],
  ['p2', item('p2', 'product', 5_000)],
  ['p3', item('p3', 'product', 5_000)],
]);

describe('computePreview', () => {
  it('returns all zeros when nothing is selected', () => {
    const preview = computePreview(catalog, new Set());
    expect(preview.serviceDiscountPct).toBe(0);
    expect(preview.productDiscountPct).toBe(0);
    expect(preview.grandTotalCents).toBe(0);
  });

  it('applies the 5% service discount once two services push the subtotal over Q1,500', () => {
    const preview = computePreview(catalog, new Set(['s1', 's2']));
    expect(preview.servicesCount).toBe(2);
    expect(preview.serviceDiscountPct).toBe(5);
  });

  it('applies the 3% product discount at exactly three selected products', () => {
    const preview = computePreview(catalog, new Set(['p1', 'p2', 'p3']));
    expect(preview.productsCount).toBe(3);
    expect(preview.productDiscountPct).toBe(3);
  });

  it('ignores selected ids that are not in the catalog lookup', () => {
    const preview = computePreview(catalog, new Set(['does-not-exist']));
    expect(preview.servicesCount).toBe(0);
    expect(preview.productsCount).toBe(0);
  });
});
