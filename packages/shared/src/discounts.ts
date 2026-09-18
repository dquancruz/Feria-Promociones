// Discount rules (exact spec):
//   Services: >=2 selected -> 3%; >=2 selected AND sum > Q.1,500 -> 5% instead.
//   Products: >=3 selected -> 3%; >=5 selected -> 5%.
// Money is handled in integer cents throughout to avoid floating point drift.

export const SERVICE_MIN_COUNT_FOR_DISCOUNT = 2;
export const SERVICE_SUM_THRESHOLD_CENTS = 150_000; // Q.1,500
export const PRODUCT_MIN_COUNT_FOR_3PCT = 3;
export const PRODUCT_MIN_COUNT_FOR_5PCT = 5;

export type DiscountPct = 0 | 3 | 5;

export interface DiscountLineInput {
  id: string;
  priceCents: number;
}

export interface DiscountCalculationInput {
  selectedServices: DiscountLineInput[];
  selectedProducts: DiscountLineInput[];
}

export interface DiscountCalculationResult {
  serviceDiscountPct: DiscountPct;
  productDiscountPct: DiscountPct;
  servicesSubtotalCents: number;
  productsSubtotalCents: number;
  servicesTotalCents: number;
  productsTotalCents: number;
  grandTotalCents: number;
}

function sumCents(items: DiscountLineInput[]): number {
  return items.reduce((total, item) => total + item.priceCents, 0);
}

function applyDiscountPct(subtotalCents: number, pct: DiscountPct): number {
  return Math.round(subtotalCents * (1 - pct / 100));
}

function serviceDiscountFor(services: DiscountLineInput[], subtotalCents: number): DiscountPct {
  if (services.length < SERVICE_MIN_COUNT_FOR_DISCOUNT) return 0;
  return subtotalCents > SERVICE_SUM_THRESHOLD_CENTS ? 5 : 3;
}

function productDiscountFor(products: DiscountLineInput[]): DiscountPct {
  if (products.length >= PRODUCT_MIN_COUNT_FOR_5PCT) return 5;
  if (products.length >= PRODUCT_MIN_COUNT_FOR_3PCT) return 3;
  return 0;
}

export function calculateDiscounts(input: DiscountCalculationInput): DiscountCalculationResult {
  const servicesSubtotalCents = sumCents(input.selectedServices);
  const productsSubtotalCents = sumCents(input.selectedProducts);

  const serviceDiscountPct = serviceDiscountFor(input.selectedServices, servicesSubtotalCents);
  const productDiscountPct = productDiscountFor(input.selectedProducts);

  const servicesTotalCents = applyDiscountPct(servicesSubtotalCents, serviceDiscountPct);
  const productsTotalCents = applyDiscountPct(productsSubtotalCents, productDiscountPct);

  return {
    serviceDiscountPct,
    productDiscountPct,
    servicesSubtotalCents,
    productsSubtotalCents,
    servicesTotalCents,
    productsTotalCents,
    grandTotalCents: servicesTotalCents + productsTotalCents,
  };
}
