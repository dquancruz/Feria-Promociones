import { calculateDiscounts, type CatalogItem, type DiscountCalculationResult } from '@feria/shared';

export interface PreviewTotals extends DiscountCalculationResult {
  servicesCount: number;
  productsCount: number;
}

const EMPTY_PREVIEW: PreviewTotals = {
  serviceDiscountPct: 0,
  productDiscountPct: 0,
  servicesSubtotalCents: 0,
  productsSubtotalCents: 0,
  servicesTotalCents: 0,
  productsTotalCents: 0,
  grandTotalCents: 0,
  servicesCount: 0,
  productsCount: 0,
};

/** Computes the same discount math the backend authoritatively re-runs on confirm,
 * so the client gets an instant preview without waiting on a round trip. */
export function computePreview(catalogById: Map<string, CatalogItem>, selectedItemIds: Set<string>): PreviewTotals {
  if (selectedItemIds.size === 0) return EMPTY_PREVIEW;

  const selectedServices: { id: string; priceCents: number }[] = [];
  const selectedProducts: { id: string; priceCents: number }[] = [];

  for (const id of selectedItemIds) {
    const item = catalogById.get(id);
    if (!item) continue;
    const line = { id: item.id, priceCents: item.priceCents };
    if (item.type === 'service') selectedServices.push(line);
    else selectedProducts.push(line);
  }

  const totals = calculateDiscounts({ selectedServices, selectedProducts });
  return { ...totals, servicesCount: selectedServices.length, productsCount: selectedProducts.length };
}
