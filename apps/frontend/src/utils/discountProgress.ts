import {
  PRODUCT_MIN_COUNT_FOR_3PCT,
  PRODUCT_MIN_COUNT_FOR_5PCT,
  SERVICE_MIN_COUNT_FOR_DISCOUNT,
  SERVICE_SUM_THRESHOLD_CENTS,
} from '@feria/shared';
import { formatCents } from './currency';
import type { PreviewTotals } from './discountPreview';

export interface TierProgress {
  count: number;
  trackMax: number;
  ticks: number[];
  atMaxTier: boolean;
  hint: string | null;
}

export function serviceProgress(preview: PreviewTotals): TierProgress {
  const count = preview.servicesCount;
  const atMaxTier = preview.serviceDiscountPct === 5;
  let hint: string | null = null;

  if (count > 0 && count < SERVICE_MIN_COUNT_FOR_DISCOUNT) {
    hint = `${SERVICE_MIN_COUNT_FOR_DISCOUNT - count} más para 3% de descuento en Servicios.`;
  } else if (preview.serviceDiscountPct === 3) {
    const remainingCents = SERVICE_SUM_THRESHOLD_CENTS - preview.servicesSubtotalCents + 1;
    hint = `${formatCents(remainingCents)} más en total para 5% de descuento en Servicios.`;
  }

  return { count, trackMax: SERVICE_MIN_COUNT_FOR_DISCOUNT, ticks: [SERVICE_MIN_COUNT_FOR_DISCOUNT], atMaxTier, hint };
}

export function productProgress(preview: PreviewTotals): TierProgress {
  const count = preview.productsCount;
  const atMaxTier = preview.productDiscountPct === 5;
  let hint: string | null = null;

  if (count > 0 && count < PRODUCT_MIN_COUNT_FOR_3PCT) {
    hint = `${PRODUCT_MIN_COUNT_FOR_3PCT - count} más para 3% de descuento en Productos.`;
  } else if (preview.productDiscountPct === 3) {
    hint = `${PRODUCT_MIN_COUNT_FOR_5PCT - count} más para 5% de descuento en Productos.`;
  }

  return {
    count,
    trackMax: PRODUCT_MIN_COUNT_FOR_5PCT,
    ticks: [PRODUCT_MIN_COUNT_FOR_3PCT, PRODUCT_MIN_COUNT_FOR_5PCT],
    atMaxTier,
    hint,
  };
}
