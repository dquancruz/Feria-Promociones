import {
  PRODUCT_MIN_COUNT_FOR_3PCT,
  PRODUCT_MIN_COUNT_FOR_5PCT,
  SERVICE_MIN_COUNT_FOR_DISCOUNT,
  SERVICE_SUM_THRESHOLD_CENTS,
} from '@feria/shared';
import { formatCents } from './currency';
import type { PreviewTotals } from './discountPreview';

export interface RuleTier {
  label: string;
  pct: 3 | 5;
}

export const SERVICE_TIERS: RuleTier[] = [
  { label: `${SERVICE_MIN_COUNT_FOR_DISCOUNT} o más servicios`, pct: 3 },
  { label: `${SERVICE_MIN_COUNT_FOR_DISCOUNT} o más por más de ${formatCents(SERVICE_SUM_THRESHOLD_CENTS)}`, pct: 5 },
];

export const PRODUCT_TIERS: RuleTier[] = [
  { label: `${PRODUCT_MIN_COUNT_FOR_3PCT} o más productos`, pct: 3 },
  { label: `${PRODUCT_MIN_COUNT_FOR_5PCT} o más productos`, pct: 5 },
];

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** What is still missing for the next tier, or that the best one is reached. */
export function serviceHint(preview: PreviewTotals): string {
  const { servicesCount: count, serviceDiscountPct: pct } = preview;
  if (pct === 5) return 'Ya tienes el descuento máximo en servicios.';
  if (count === 0) return `Elige ${SERVICE_MIN_COUNT_FOR_DISCOUNT} servicios para obtener 3%.`;
  if (count < SERVICE_MIN_COUNT_FOR_DISCOUNT) {
    const missing = SERVICE_MIN_COUNT_FOR_DISCOUNT - count;
    return `Agrega ${missing} ${plural(missing, 'servicio más', 'servicios más')} para obtener 3%.`;
  }
  // The 5% tier needs the sum to be strictly above the threshold, hence the extra cent.
  const missingCents = SERVICE_SUM_THRESHOLD_CENTS - preview.servicesSubtotalCents + 1;
  return `Te faltan ${formatCents(missingCents)} en servicios para subir a 5%.`;
}

export function productHint(preview: PreviewTotals): string {
  const { productsCount: count } = preview;
  if (count >= PRODUCT_MIN_COUNT_FOR_5PCT) return 'Ya tienes el descuento máximo en productos.';
  if (count >= PRODUCT_MIN_COUNT_FOR_3PCT) {
    const missing = PRODUCT_MIN_COUNT_FOR_5PCT - count;
    return `Agrega ${missing} ${plural(missing, 'producto más', 'productos más')} para obtener 5%.`;
  }
  if (count === 0) return `Elige ${PRODUCT_MIN_COUNT_FOR_3PCT} productos para obtener 3%.`;
  const missing = PRODUCT_MIN_COUNT_FOR_3PCT - count;
  return `Agrega ${missing} ${plural(missing, 'producto más', 'productos más')} para obtener 3%.`;
}
